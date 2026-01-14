const http = require('http');
const url = require('url');
const axios = require('axios');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const ChromecastAPI = require('chromecast-api');

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
    let activeFfmpegProcesses = new Map(); // track active ffmpeg processes

    // Pending device names to send to renderer when ready
    const pendingDeviceNames = new Set();
    let flushHookAttached = false;

    // Polling handle
    let pollIntervalHandle = null;

    // --- Local Proxy Server for Chromecast ---
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

    // --- FFmpeg Transcoding Proxy Server for Chromecast ---
    const ffmpegProxyServer = http.createServer(async (req, res) => {
        const parsedUrl = url.parse(req.url, true);
        
        console.log(`[FFmpeg Proxy] Incoming ${req.method} request: ${req.url} from ${req.socket.remoteAddress}`);
        console.log(`[FFmpeg Proxy] Headers:`, JSON.stringify(req.headers, null, 2));

        // Handle CORS preflight
        if (req.method === 'OPTIONS') {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', '*');
            res.statusCode = 200;
            return res.end();
        }

        // Handle HEAD requests (Chromecast probing)
        if (req.method === 'HEAD') {
            console.log(`[FFmpeg Proxy] HEAD request - returning headers only`);
            res.setHeader('Content-Type', 'video/mp2t');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Accept-Ranges', 'bytes');
            res.statusCode = 200;
            return res.end();
        }

        if (parsedUrl.pathname !== '/transcode' || !parsedUrl.query.url) {
            console.log(`[FFmpeg Proxy] Invalid request path or missing URL parameter`);
            res.statusCode = 404;
            return res.end();
        }

        const streamUrl = parsedUrl.query.url;
        const requestId = Date.now().toString();
        console.log(`[FFmpeg Proxy] Starting transcode for: ${streamUrl}`);

        // Get ffmpeg path from config
        let ffmpegPath = 'ffmpeg'; // default to PATH
        try {
            if (getConfigFunc) {
                const config = await getConfigFunc();
                if (config && config.ffmpegPath) {
                    const fs = require('fs');
                    const platform = process.platform;
                    const ffmpegBinary = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
                    
                    // Check common locations: direct path, bin subdirectory
                    const possiblePaths = [
                        path.join(config.ffmpegPath, ffmpegBinary),
                        path.join(config.ffmpegPath, 'bin', ffmpegBinary)
                    ];
                    
                    for (const p of possiblePaths) {
                        if (fs.existsSync(p)) {
                            ffmpegPath = p;
                            console.log(`[FFmpeg Proxy] Found ffmpeg at: ${ffmpegPath}`);
                            break;
                        }
                    }
                    
                    if (ffmpegPath === 'ffmpeg') {
                        console.log(`[FFmpeg Proxy] ffmpeg not found in ${config.ffmpegPath}, falling back to PATH`);
                    }
                }
            }
        } catch (e) {
            console.log(`[FFmpeg Proxy] Could not get config, using default ffmpeg: ${e.message}`);
        }

        // FFmpeg arguments for Chromecast-compatible transcoding
        // Output: H.264 video, AAC audio in MPEG-TS container (Chromecast compatible)
        const ffmpegArgs = [
            '-hide_banner',
            '-loglevel', 'warning',
            '-reconnect', '1',
            '-reconnect_at_eof', '1',
            '-reconnect_streamed', '1',
            '-reconnect_delay_max', '5',
            '-probesize', '10000000',
            '-analyzeduration', '10000000',
            '-i', streamUrl,
            '-map', '0:v:0',
            '-map', '0:a:0?',
            '-vf', 'scale=1920:-2:force_original_aspect_ratio=decrease,format=yuv420p',
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '23',
            '-tune', 'zerolatency',
            '-profile:v', 'high',
            '-level', '4.1',
            '-bsf:v', 'h264_mp4toannexb',
            '-g', '50',
            '-c:a', 'aac',
            '-ac', '2',
            '-ar', '48000',
            '-b:a', '192k',
            '-f', 'mpegts',
            '-muxdelay', '0.1',
            'pipe:1'
        ];

        console.log(`[FFmpeg Proxy] Command: ${ffmpegPath} ${ffmpegArgs.join(' ')}`);

        res.setHeader('Content-Type', 'video/mp2t');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        // DLNA headers for better compatibility
        res.setHeader('transferMode.dlna.org', 'Streaming');
        res.setHeader('contentFeatures.dlna.org', 'DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000');

        try {
            const ffmpeg = spawn(ffmpegPath, ffmpegArgs);
            activeFfmpegProcesses.set(requestId, ffmpeg);

            ffmpeg.stdout.pipe(res);

            ffmpeg.stderr.on('data', (data) => {
                console.error(`[FFmpeg Proxy] stderr: ${data.toString()}`);
            });

            ffmpeg.on('error', (err) => {
                console.error(`[FFmpeg Proxy] Process error: ${err.message}`);
                activeFfmpegProcesses.delete(requestId);
                if (!res.headersSent) {
                    res.statusCode = 500;
                    res.end(`FFmpeg Error: ${err.message}`);
                }
            });

            ffmpeg.on('close', (code) => {
                console.log(`[FFmpeg Proxy] Process closed with code: ${code}`);
                activeFfmpegProcesses.delete(requestId);
            });

            req.on('close', () => {
                console.log(`[FFmpeg Proxy] Client disconnected, killing ffmpeg`);
                ffmpeg.kill('SIGKILL');
                activeFfmpegProcesses.delete(requestId);
            });

        } catch (e) {
            console.error(`[FFmpeg Proxy] Spawn error: ${e.message}`);
            res.statusCode = 500;
            res.end(`FFmpeg Spawn Error: ${e.message}`);
        }
    });

    ffmpegProxyServer.listen(FFMPEG_PROXY_PORT, '0.0.0.0', () => {
        console.log(`FFmpeg transcoding proxy for Chromecast listening on http://${getLocalIP()}:${FFMPEG_PROXY_PORT}`);
    });

    // -----------------------
    // Internal helper APIs
    // -----------------------

    function notifyRendererDeviceFound(name) {
        if (!name) return;
        try {
            const win = mainWindow;
            if (!win || win.isDestroyed()) {
                // queue it
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

            // ready to send
            wc.send('cast-device-found', name);
        } catch (e) {
            // On any unexpected error, queue for later
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
        // remove previous listeners to avoid duplicates
        try {
            castClient.removeAllListeners('device');
        } catch (e) {
            // ignore
        }
        castClient.on('device', handleDeviceFound);

        // ensure we have an initial discovery kick-off
        try {
            castClient.update();
        } catch (e) {
            console.error('[Chromecast] initializeChromecast update failed:', e && e.message);
        }
    }

    function startDevicePolling(intervalMs = 30000) {
        // immediate kick-off
        try {
            castClient.update();
        } catch (e) {
            console.error('[Chromecast] startDevicePolling immediate update failed:', e && e.message);
        }

        // avoid multiple intervals
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
        return `http://${ip}:${FFMPEG_PROXY_PORT}/transcode?url=${encodeURIComponent(streamUrl)}`;
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

        console.log(`[Cast] Sending stream to ${deviceName}...`);
        console.log(`[Cast] Proxy URL (via ${proxyIp || getLocalIP()}): ${proxyUrl}`);
        console.log(`[Cast] Type: ${streamType}, Mime: ${contentType}`);

        const options = {
            title: metadata.title || 'IPTV Stream',
            images: metadata.images || [],
            streamType: streamType,
            contentType: contentType,
            metadata: {
                type: metadata.type || 0, // 0: Generic, 1: Movie, 2: TV Show
                metadata: {
                    title: metadata.title,
                    subtitle: metadata.subtitle,
                    images: metadata.images
                }
            }
        };

        console.log(`[Cast] Final play options:`, JSON.stringify(options, null, 2));

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
            console.error(`[Cast FFmpeg] Playback failed: ${msg}`);
            return Promise.resolve({ success: false, error: msg });
        }
        activeCastDeviceName = deviceName;
        const proxyUrl = buildFfmpegProxyUrl(streamUrl, proxyIp);

        console.log(`[Cast FFmpeg] Sending transcoded stream to ${deviceName}...`);
        console.log(`[Cast FFmpeg] FFmpeg Proxy URL (via ${proxyIp || getLocalIP()}): ${proxyUrl}`);

        const options = {
            title: metadata.title || 'IPTV Stream',
            images: metadata.images || [],
            streamType: 'BUFFERED',
            contentType: 'video/mp2t',
            metadata: {
                type: metadata.type || 0,
                metadata: {
                    title: metadata.title,
                    subtitle: metadata.subtitle,
                    images: metadata.images
                }
            }
        };

        console.log(`[Cast FFmpeg] Final play options:`, JSON.stringify(options, null, 2));

        return new Promise((resolve) => {
            device.play(proxyUrl, options, (err) => {
                if (err) {
                    console.error(`[Cast FFmpeg] Playback Error on ${deviceName}:`, err && err.message);
                    resolve({ success: false, error: err && err.message });
                } else {
                    console.log(`[Cast FFmpeg] Playback started successfully on ${deviceName}`);
                    resolve({ success: true });
                }
            });
        });
    }

    function stopChromecast(deviceName) {
        const name = deviceName || activeCastDeviceName;
        const device = castDevices[name];
        if (!device) return Promise.resolve({ success: false });

        return new Promise((resolve) => {
            device.stop(() => {
                if (name === activeCastDeviceName) activeCastDeviceName = null;
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

    // -----------------------
    // Start initial discovery
    // -----------------------
    initializeChromecast();
    // keep the legacy periodic scanning behavior running by default (30s)
    const scanInterval = startDevicePolling(30000);

    // --- IPC Handlers (kept for compatibility with renderer calls) ---
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

    // Return useful handles and functions for external control/testing if needed
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
        // exposed for testing/debugging:
        _internal: {
            castClient,
            castDevices,
            pendingDeviceNames,
            activeFfmpegProcesses
        }
    };
}

module.exports = { initChromecastHandlers };