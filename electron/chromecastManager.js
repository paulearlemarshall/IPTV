const http = require('http');
const url = require('url');
const axios = require('axios');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ChromecastAPI = require('chromecast-api');

// --- HLS Configuration ---
const HLS_BASE_DIR = path.join(os.tmpdir(), 'iptv_hls_cache');

// Cleanup HLS cache on startup
if (fs.existsSync(HLS_BASE_DIR)) {
    try {
        const deleteFolderRecursive = function(folderPath) {
            if (fs.existsSync(folderPath)) {
                fs.readdirSync(folderPath).forEach((file) => {
                    const curPath = path.join(folderPath, file);
                    if (fs.lstatSync(curPath).isDirectory()) {
                        deleteFolderRecursive(curPath);
                    } else {
                        fs.unlinkSync(curPath);
                    }
                });
                fs.rmdirSync(folderPath);
            }
        };
        deleteFolderRecursive(HLS_BASE_DIR);
    } catch (e) {
        console.error('[HLS] Startup cleanup failed:', e.message);
    }
}
if (!fs.existsSync(HLS_BASE_DIR)) fs.mkdirSync(HLS_BASE_DIR, { recursive: true });

/**
 * Helper: find a local non-internal IPv4 address
 */
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

function getLocalIPs() {
    const interfaces = os.networkInterfaces();
    const ips = [];
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                ips.push(iface.address);
            }
        }
    }
    return ips.length > 0 ? ips : ['127.0.0.1'];
}

function initChromecastHandlers(ipcMain, mainWindow, getConfigFunc) {
    const PROXY_PORT = 5181;
    const FFMPEG_PROXY_PORT = 5182;
    const castClient = new ChromecastAPI();

    // Internal state
    let castDevices = {}; // name -> device
    let activeCastDeviceName = null;
    let activeStreams = new Map(); // url -> { ff, hlsDir, killTimeout: Timer }

    // Pending device names to send to renderer when ready
    const pendingDeviceNames = new Set();
    let flushHookAttached = false;

    // Polling handle
    let pollIntervalHandle = null;

    // --- Local Proxy Server for Chromecast (Direct Proxy) ---
    const proxyServer = http.createServer(async (req, res) => {
        const parsedUrl = url.parse(req.url, true);
        
        console.log(`[Proxy] Incoming request: ${req.url} from ${req.socket.remoteAddress}`);

        // Early exit for invalid paths
        if (parsedUrl.pathname !== '/stream' || !parsedUrl.query.url) {
            console.log(`[Proxy] Invalid request path or missing URL parameter`);
            res.statusCode = 404;
            return res.end();
        }

        const streamUrl = parsedUrl.query.url;
        console.log(`[Proxy] Proxying to: ${streamUrl}`);
        
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        };

        if (req.headers.range) {
            headers['Range'] = req.headers.range;
        }

        // Forward additional headers for better compatibility with strict providers
        if (req.headers['accept']) headers['Accept'] = req.headers['accept'];
        if (req.headers['accept-language']) headers['Accept-Language'] = req.headers['accept-language'];

        try {
            const response = await axios({
                method: 'get',
                url: streamUrl,
                responseType: 'stream',
                headers: headers,
                timeout: 30000,
                maxRedirects: 5 // Handle server-side redirects common in IPTV
            });

            res.statusCode = response.status;
            
            const contentTypes = {
                'ts': 'video/mp2t',
                'm3u8': 'application/x-mpegURL',
                'mp4': 'video/mp4',
                'mkv': 'video/x-matroska'
            };

            let contentType = response.headers['content-type'];
            if (!contentType || contentType === 'application/octet-stream') {
                const ext = streamUrl.split('.').pop().split('?')[0];
                contentType = contentTypes[ext] || 'video/mp2t';
            }

            res.setHeader('Content-Type', contentType);
            res.setHeader('Access-Control-Allow-Origin', '*');
            
            if (response.headers['content-length']) res.setHeader('Content-Length', response.headers['content-length']);
            if (response.headers['accept-ranges']) res.setHeader('Accept-Ranges', response.headers['accept-ranges']);
            if (response.headers['content-range']) res.setHeader('Content-Range', response.headers['content-range']);
            
            response.data.pipe(res);

            req.on('close', () => {
                if (response.data.destroy) response.data.destroy();
            });
        } catch (e) {
            console.error("Proxy error:", e.message);
            res.statusCode = 500;
            res.end(`Proxy Error: ${e.message}`);
        }
    });

    proxyServer.listen(PROXY_PORT, '0.0.0.0', () => {
        console.log(`Stream proxy for Chromecast listening on http://${getLocalIP()}:${PROXY_PORT}`);
    });

    // --- HLS Static Server for Chromecast ---
    const ffmpegProxyServer = http.createServer(async (req, res) => {
        const parsedUrl = url.parse(req.url, true);
        const parts = parsedUrl.pathname.split('/').filter(Boolean); // Expected: [hls, requestId, filename]
        
        console.log(`[HLS Server] Request: ${req.url}`);

        if (parts[0] === 'hls' && parts.length === 3) {
            const requestId = parts[1];
            const filename = parts[2];
            const filePath = path.join(HLS_BASE_DIR, requestId, filename);

            if (fs.existsSync(filePath)) {
                if (filename.endsWith('.m3u8')) res.setHeader('Content-Type', 'application/x-mpegURL');
                else if (filename.endsWith('.ts')) res.setHeader('Content-Type', 'video/mp2t');
                
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Cache-Control', 'no-cache');
                
                // Track activity to prevent premature cleanup
                for (const [url, state] of activeStreams.entries()) {
                    if (state.hlsDir.includes(requestId)) {
                        if (state.killTimeout) {
                            clearTimeout(state.killTimeout);
                            state.killTimeout = null;
                            console.log(`[HLS Server] Activity detected, cancelled timeout for: ${requestId}`);
                        }
                        break;
                    }
                }

                fs.createReadStream(filePath).pipe(res);
                return;
            } else {
                res.statusCode = 404;
                return res.end();
            }
        }

        res.statusCode = 404;
        res.end();
    });

    ffmpegProxyServer.listen(FFMPEG_PROXY_PORT, '0.0.0.0', () => {
        console.log(`HLS proxy for Chromecast listening on http://${getLocalIP()}:${FFMPEG_PROXY_PORT}`);
    });

    // -----------------------
    // Internal helper APIs
    // -----------------------

    function notifyRendererDeviceFound(name) {
        if (!name) return;
        try {
            const win = mainWindow;
            if (!win || win.isDestroyed()) {
                pendingDeviceNames.add(name);
                attachFlushOnLoad(win);
                return;
            }

            const wc = win.webContents;
            if (!wc || wc.isLoading()) {
                pendingDeviceNames.add(name);
                attachFlushOnLoad(win);
                return;
            }

            wc.send('cast-device-found', name);
        } catch (e) {
            pendingDeviceNames.add(name);
            attachFlushOnLoad(mainWindow);
        }
    }

    function attachFlushOnLoad(win) {
        if (flushHookAttached || !win) return;
        const wc = win.webContents;
        if (!wc) return;
        flushHookAttached = true;
        wc.once('did-finish-load', () => {
            flushHookAttached = false;
            flushPendingDeviceNames();
        });
    }

    function flushPendingDeviceNames() {
        const win = mainWindow;
        if (!win || win.isDestroyed()) return;
        const wc = win.webContents;
        if (!wc || wc.isLoading()) {
            attachFlushOnLoad(win);
            return;
        }

        for (const name of pendingDeviceNames) {
            try {
                wc.send('cast-device-found', name);
            } catch (e) {
                console.error('[Chromecast] Failed to send queued device name to renderer:', e && e.message);
            }
        }
        pendingDeviceNames.clear();
    }

    function handleDeviceFound(device) {
        const name = device.friendlyName || device.name;
        if (!name) return;
        if (!castDevices[name]) {
            console.log(`[Chromecast] Found device: ${name} at ${device.host}`);
            castDevices[name] = device;
            notifyRendererDeviceFound(name);
        }
    }

    function initializeChromecast() {
        try {
            castClient.removeAllListeners('device');
        } catch (e) {}
        castClient.on('device', handleDeviceFound);
        try {
            castClient.update();
        } catch (e) {
            console.error('[Chromecast] initializeChromecast update failed:', e && e.message);
        }
    }

    function startDevicePolling(intervalMs = 30000) {
        try {
            castClient.update();
        } catch (e) {
            console.error('[Chromecast] startDevicePolling immediate update failed:', e && e.message);
        }
        if (pollIntervalHandle) clearInterval(pollIntervalHandle);
        pollIntervalHandle = setInterval(() => {
            try {
                castClient.update();
            } catch (e) {
                console.error('[Chromecast] Polling update failed:', e && e.message);
            }
        }, intervalMs);
        return pollIntervalHandle;
    }

    function stopDevicePolling() {
        if (pollIntervalHandle) {
            clearInterval(pollIntervalHandle);
            pollIntervalHandle = null;
        }
    }

    async function scanForDevices() {
        try {
            castClient.update();
        } catch (e) {
            console.error('[Chromecast] scanForDevices update failed:', e && e.message);
        }
        return Object.keys(castDevices);
    }

    function clearDeviceCache() {
        castDevices = {};
        activeCastDeviceName = null;
        pendingDeviceNames.clear();
    }

    function buildProxyUrl(streamUrl, proxyIp = null) {
        const ip = proxyIp || getLocalIP();
        return `http://${ip}:${PROXY_PORT}/stream?url=${encodeURIComponent(streamUrl)}`;
    }

    function buildFfmpegProxyUrl(streamUrl, proxyIp = null) {
        const ip = proxyIp || getLocalIP();
        const requestId = Buffer.from(streamUrl).toString('hex').slice(0, 16);
        return `http://${ip}:${FFMPEG_PROXY_PORT}/hls/${requestId}/index.m3u8`;
    }

    function playOnChromecast(deviceName, streamUrl, metadata = {}, proxyIp = null, streamType = 'BUFFERED', contentType = 'video/mp2t') {
        const device = castDevices[deviceName];
        if (!device) {
            const msg = `Device "${deviceName}" not found`;
            console.error(`[Cast] Playback failed: ${msg}`);
            return Promise.resolve({ success: false, error: msg });
        }
        activeCastDeviceName = deviceName;
        const proxyUrl = buildProxyUrl(streamUrl, proxyIp);

        const options = {
            title: metadata.title || 'IPTV Stream',
            images: metadata.images || [],
            streamType: streamType,
            contentType: contentType,
            metadata: {
                type: metadata.type || 0,
                metadata: {
                    title: metadata.title,
                    subtitle: metadata.subtitle,
                    images: metadata.images
                }
            }
        };

        return new Promise((resolve) => {
            device.play(proxyUrl, options, (err) => {
                if (err) {
                    console.error(`[Cast] Playback Error on ${deviceName}:`, err && err.message);
                    resolve({ success: false, error: err && err.message });
                } else {
                    console.log(`[Cast] Playback started successfully on ${deviceName}`);
                    resolve({ success: true });
                }
            });
        });
    }

    function playOnChromecastWithFfmpeg(deviceName, streamUrl, metadata = {}, proxyIp = null) {
        const device = castDevices[deviceName];
        if (!device) {
            const msg = `Device "${deviceName}" not found`;
            console.error(`[Cast HLS] Playback failed: ${msg}`);
            return Promise.resolve({ success: false, error: msg });
        }
        activeCastDeviceName = deviceName;
        
        const requestId = Buffer.from(streamUrl).toString('hex').slice(0, 16);
        const hlsDir = path.join(HLS_BASE_DIR, requestId);
        const playlistPath = path.join(hlsDir, 'index.m3u8');
        const proxyUrl = buildFfmpegProxyUrl(streamUrl, proxyIp);

        let s = activeStreams.get(streamUrl);

        if (!s) {
            console.log(`[Cast HLS] Starting NEW HLS transcode process for: ${streamUrl}`);
            if (!fs.existsSync(hlsDir)) fs.mkdirSync(hlsDir, { recursive: true });

            let ffmpegPath = 'ffmpeg';
            try {
                if (getConfigFunc) {
                    const config = getConfigFunc();
                    if (config && config.ffmpegPath) {
                        const ffmpegBinary = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
                        const p1 = path.join(config.ffmpegPath, ffmpegBinary);
                        const p2 = path.join(config.ffmpegPath, 'bin', ffmpegBinary);
                        if (fs.existsSync(p1)) ffmpegPath = p1;
                        else if (fs.existsSync(p2)) ffmpegPath = p2;
                    }
                }
            } catch (e) {}

            const ffmpegArgs = [
                '-hide_banner', '-loglevel', 'warning',
                '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5',
                '-i', streamUrl,
                '-map', '0:v:0', '-map', '0:a:0?',
                '-vf', 'scale=1920:-2:force_original_aspect_ratio=decrease',
                '-c:v', 'libx264',
                '-profile:v', 'main',
                '-level', '4.0',
                '-pix_fmt', 'yuv420p',
                '-preset', 'ultrafast',
                '-tune', 'zerolatency',
                '-b:v', '6000k',
                '-maxrate', '6500k',
                '-bufsize', '12000k',
                '-g', '48',
                '-keyint_min', '48',
                '-sc_threshold', '0',
                '-c:a', 'aac',
                '-ac', '2',
                '-ar', '48000',
                '-b:a', '160k',
                '-f', 'hls',
                '-hls_time', '2',
                '-hls_list_size', '6',
                '-hls_flags', 'delete_segments+append_list+independent_segments',
                '-hls_segment_type', 'mpegts',
                '-hls_segment_filename', path.join(hlsDir, 'seg_%03d.ts'),
                playlistPath
            ];

            const ff = spawn(ffmpegPath, ffmpegArgs);
            s = { ff, hlsDir, killTimeout: null };
            activeStreams.set(streamUrl, s);

            ff.on('close', () => {
                console.log(`[Cast HLS] FFmpeg process closed`);
                activeStreams.delete(streamUrl);
                try {
                    if (fs.existsSync(hlsDir)) {
                        fs.readdirSync(hlsDir).forEach(f => fs.unlinkSync(path.join(hlsDir, f)));
                        fs.rmdirSync(hlsDir);
                    }
                } catch (e) {}
            });
        } else if (s.killTimeout) {
            clearTimeout(s.killTimeout);
            s.killTimeout = null;
        }

        const options = {
            title: metadata.title || 'IPTV Stream',
            images: metadata.images || [],
            streamType: 'LIVE',
            contentType: 'application/x-mpegURL',
            metadata: {
                type: metadata.type || 0,
                metadata: {
                    title: metadata.title,
                    subtitle: metadata.subtitle,
                    images: metadata.images
                }
            }
        };

        return new Promise((resolve) => {
            let attempts = 0;
            const checkFile = setInterval(() => {
                attempts++;
                if (fs.existsSync(playlistPath)) {
                    clearInterval(checkFile);
                    console.log(`[Cast HLS] Playlist ready, sending to device...`);
                    device.play(proxyUrl, options, (err) => {
                        if (err) {
                            console.error(`[Cast HLS] Playback Error on ${deviceName}:`, err.message);
                            resolve({ success: false, error: err.message });
                        } else {
                            console.log(`[Cast HLS] Playback started successfully`);
                            resolve({ success: true });
                        }
                    });
                } else if (attempts > 100) {
                    clearInterval(checkFile);
                    resolve({ success: false, error: 'HLS generation timeout' });
                }
            }, 100);
        });
    }

    function stopChromecast(deviceName) {
        const name = deviceName || activeCastDeviceName;
        const device = castDevices[name];
        if (!device) return Promise.resolve({ success: false });

        return new Promise((resolve) => {
            device.stop(() => {
                if (name === activeCastDeviceName) activeCastDeviceName = null;
                for (const [url, state] of activeStreams.entries()) {
                    if (!state.killTimeout) {
                        state.killTimeout = setTimeout(() => {
                            console.log(`[Cast HLS] Kill timeout reached, stopping ffmpeg`);
                            state.ff.kill('SIGKILL');
                        }, 30000);
                    }
                }
                resolve({ success: true });
            });
        });
    }

    function getActiveCastDevice() {
        return activeCastDeviceName;
    }

    function getAllDevices() {
        return Object.keys(castDevices);
    }

    initializeChromecast();
    const scanInterval = startDevicePolling(30000);

    ipcMain.handle('cast-scan', async () => { 
        console.log("[Chromecast] Starting network scan...");
        return scanForDevices();
    });

    ipcMain.handle('get-available-ips', async () => {
        return getLocalIPs();
    });

    ipcMain.handle('cast-play', async (event, deviceName, streamUrl, metadata = {}, proxyIp = null, streamType = 'BUFFERED', contentType = 'video/mp2t') => {
        return playOnChromecast(deviceName, streamUrl, metadata, proxyIp, streamType, contentType);
    });

    ipcMain.handle('cast-stop', async (event, deviceName) => {
        return stopChromecast(deviceName);
    });

    ipcMain.handle('cast-play-ffmpeg', async (event, deviceName, streamUrl, metadata = {}, proxyIp = null) => {
        return playOnChromecastWithFfmpeg(deviceName, streamUrl, metadata, proxyIp);
    });

    return {
        proxyServer,
        ffmpegProxyServer,
        scanInterval,
        initializeChromecast,
        startDevicePolling,
        stopDevicePolling,
        scanForDevices,
        clearDeviceCache,
        buildProxyUrl,
        buildFfmpegProxyUrl,
        playOnChromecast,
        playOnChromecastWithFfmpeg,
        stopChromecast,
        getActiveCastDevice,
        getAllDevices,
        _internal: {
            castClient,
            castDevices,
            pendingDeviceNames,
            activeStreams
        }
    };
}

module.exports = { initChromecastHandlers };