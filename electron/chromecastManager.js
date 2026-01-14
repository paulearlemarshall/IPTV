const http = require('http');
const url = require('url');
const axios = require('axios');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');
const ChromecastAPI = require('chromecast-api');

// --- HLS Configuration ---
const HLS_BASE_DIR = path.join(os.tmpdir(), 'iptv_hls_cache');

/**
 * Deferred deletion to handle Windows file locks (retries after killing FFmpeg)
 */
function deferredDelete(itemPath, attempts = 5) {
    if (!fs.existsSync(itemPath)) return;

    try {
        if (fs.lstatSync(itemPath).isDirectory()) {
            const files = fs.readdirSync(itemPath);
            files.forEach(f => deferredDelete(path.join(itemPath, f), attempts));
            try { fs.rmdirSync(itemPath); } catch(e) {}
        } else {
            fs.unlinkSync(itemPath);
        }
    } catch (e) {
        if (attempts > 0) {
            // Wait 2s and retry (FFmpeg usually releases locks within 1s of being killed)
            setTimeout(() => deferredDelete(itemPath, attempts - 1), 2000);
        }
    }
}

/**
 * Aggressive cleanup: Kills all FFmpeg processes and wipes the HLS directory
 */
function purgeHlsCache() {
    console.log('[HLS Cleanup] Triggering HLS cache purge...');
    if (fs.existsSync(HLS_BASE_DIR)) {
        try {
            const files = fs.readdirSync(HLS_BASE_DIR);
            for (const file of files) {
                deferredDelete(path.join(HLS_BASE_DIR, file));
            }
        } catch (e) {
            console.error('[HLS Cleanup] Error reading cache directory:', e.message);
        }
    } else {
        fs.mkdirSync(HLS_BASE_DIR, { recursive: true });
    }
}

// Initial cleanup
purgeHlsCache();

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
    
    // We only allow ONE active stream at a time now
    let currentStream = {
        ff: null,
        url: null,
        hlsDir: null,
        killTimeout: null
    };

    const pendingDeviceNames = new Set();
    let flushHookAttached = false;
    let pollIntervalHandle = null;

    /**
     * Stop and cleanup the single active FFmpeg process
     */
    function stopActiveTranscode() {
        if (currentStream.ff) {
            console.log(`[FFmpeg Lifecycle] Terminating existing process for: ${currentStream.url}`);
            currentStream.ff.kill('SIGKILL');
            currentStream.ff = null;
        }
        if (currentStream.killTimeout) {
            clearTimeout(currentStream.killTimeout);
            currentStream.killTimeout = null;
        }
        
        // Defer directory cleanup to allow FFmpeg to release file handles
        if (currentStream.hlsDir) {
            deferredDelete(currentStream.hlsDir);
        }

        currentStream.url = null;
        currentStream.hlsDir = null;
    }

    /**
     * Probe stream using ffprobe to detect resolution, codec, etc.
     */
    async function probeStream(streamUrl) {
        console.log(`[Source Detection] Probing stream: ${streamUrl}`);
        
        let ffprobePath = 'ffprobe';
        try {
            if (getConfigFunc) {
                const config = getConfigFunc();
                if (config && config.ffmpegPath) {
                    const binary = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';
                    const p1 = path.join(config.ffmpegPath, binary);
                    const p2 = path.join(config.ffmpegPath, 'bin', binary);
                    if (fs.existsSync(p1)) ffprobePath = p1;
                    else if (fs.existsSync(p2)) ffprobePath = p2;
                }
            }
        } catch (e) {}

        const args = [
            '-v', 'error',
            '-select_streams', 'v:0',
            '-show_entries', 'stream=width,height,codec_name,profile,level,bit_rate',
            '-of', 'json',
            streamUrl
        ];

        return new Promise((resolve) => {
            const probe = spawn(ffprobePath, args);
            let output = '';
            probe.stdout.on('data', d => output += d);
            probe.on('close', (code) => {
                if (code !== 0) {
                    console.error(`[Source Detection] ffprobe failed with code ${code}`);
                    return resolve(null);
                }
                try {
                    const data = JSON.parse(output);
                    if (data.streams && data.streams[0]) {
                        console.log(`[Source Detection] Probe result:`, JSON.stringify(data.streams[0]));
                        resolve(data.streams[0]);
                    } else {
                        console.warn(`[Source Detection] No video stream found`);
                        resolve(null);
                    }
                } catch (e) {
                    console.error(`[Source Detection] Parse error:`, e.message);
                    resolve(null);
                }
            });
        });
    }

    /**
     * Decides if transcoding is required based on Chromecast compatibility
     */
    function needsTranscoding(meta) {
        if (!meta) return true; // Fail safe to transcode if probe fails

        const reasons = [];
        if (meta.width > 1920) reasons.push(`Resolution ${meta.width}x${meta.height} > 1080p`);
        if (meta.codec_name !== 'h264') reasons.push(`Codec '${meta.codec_name}' is not H.264`);
        if (meta.profile === 'High' && meta.level > 41) reasons.push(`Level ${meta.level/10} exceeds Chromecast 1080p limits`);
        
        const bitRate = parseInt(meta.bit_rate);
        if (bitRate > 8000000) reasons.push(`Bitrate ${Math.round(bitRate/1000)}k exceeds stable 8Mbps threshold`);

        if (reasons.length > 0) {
            console.log(`[Decision Engine] TRANSCODE REQUIRED: ${reasons.join(', ')}`);
            return true;
        }

        console.log(`[Decision Engine] DIRECT PLAY: Stream appears compatible.`);
        return false;
    }

    // --- Local Proxy Server for Chromecast (Direct Proxy) ---
    const proxyServer = http.createServer(async (req, res) => {
        const parsedUrl = url.parse(req.url, true);
        console.log(`[HTTP Request] Direct Proxy: ${req.method} ${req.url}`);

        if (parsedUrl.pathname !== '/stream' || !parsedUrl.query.url) {
            res.statusCode = 404;
            return res.end();
        }

        const streamUrl = parsedUrl.query.url;
        const headers = { 'User-Agent': 'Mozilla/5.0' };
        if (req.headers.range) headers['Range'] = req.headers.range;

        try {
            const response = await axios({
                method: 'get',
                url: streamUrl,
                responseType: 'stream',
                headers: headers,
                timeout: 30000,
                maxRedirects: 5
            });

            res.statusCode = response.status;
            res.setHeader('Content-Type', response.headers['content-type'] || 'video/mp2t');
            res.setHeader('Access-Control-Allow-Origin', '*');
            if (response.headers['content-length']) res.setHeader('Content-Length', response.headers['content-length']);
            if (response.headers['accept-ranges']) res.setHeader('Accept-Ranges', response.headers['accept-ranges']);
            if (response.headers['content-range']) res.setHeader('Content-Range', response.headers['content-range']);
            
            response.data.pipe(res);
            req.on('close', () => { if (response.data.destroy) response.data.destroy(); });
        } catch (e) {
            console.error("[HTTP Error] Proxy error:", e.message);
            res.statusCode = 500;
            res.end();
        }
    });

    proxyServer.listen(PROXY_PORT, '0.0.0.0', () => {
        console.log(`[Init] Direct proxy listening on port ${PROXY_PORT}`);
    });

    // --- HLS Static Server for Chromecast ---
    const ffmpegProxyServer = http.createServer(async (req, res) => {
        const parsedUrl = url.parse(req.url, true);
        const parts = parsedUrl.pathname.split('/').filter(Boolean); // Expected: [hls, requestId, variant, filename] or [hls, requestId, master.m3u8]
        console.log(`[HTTP Request] HLS Server: ${req.url}`);

        if (parts[0] === 'hls' && parts.length >= 3) {
            const requestId = parts[1];
            const relativePath = parts.slice(2).join(path.sep);
            const filePath = path.join(HLS_BASE_DIR, requestId, relativePath);

            if (fs.existsSync(filePath)) {
                if (relativePath.endsWith('.m3u8')) res.setHeader('Content-Type', 'application/x-mpegURL');
                else if (relativePath.endsWith('.ts')) res.setHeader('Content-Type', 'video/mp2t');
                
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Cache-Control', 'no-cache');
                
                // Clear any pending kill timeout when activity is detected
                if (currentStream.killTimeout) {
                    console.log(`[FFmpeg Lifecycle] Activity detected, cancelling kill timeout`);
                    clearTimeout(currentStream.killTimeout);
                    currentStream.killTimeout = null;
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
        console.log(`[Init] HLS server listening on port ${FFMPEG_PROXY_PORT}`);
    });

    // -----------------------
    // Internal helper APIs
    // -----------------------

    function handleDeviceFound(device) {
        const name = device.friendlyName || device.name;
        if (!name) return;
        if (!castDevices[name]) {
            console.log(`[Chromecast Discovery] Found device: ${name} at ${device.host}`);
            castDevices[name] = device;
            try { mainWindow.webContents.send('cast-device-found', name); } catch(e){}
        }
    }

    function initializeChromecast() {
        castClient.on('device', handleDeviceFound);
        castClient.update();
    }

    function startDevicePolling(intervalMs = 30000) {
        if (pollIntervalHandle) clearInterval(pollIntervalHandle);
        pollIntervalHandle = setInterval(() => castClient.update(), intervalMs);
        return pollIntervalHandle;
    }

    function buildProxyUrl(streamUrl, proxyIp = null) {
        const ip = proxyIp || getLocalIP();
        return `http://${ip}:${PROXY_PORT}/stream?url=${encodeURIComponent(streamUrl)}`;
    }

    function buildHlsUrl(streamUrl, proxyIp = null) {
        const ip = proxyIp || getLocalIP();
        const requestId = Buffer.from(streamUrl).toString('hex').slice(0, 16);
        return `http://${ip}:${FFMPEG_PROXY_PORT}/hls/${requestId}/master.m3u8`;
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

        console.log(`[Cast] Sending DIRECT stream to ${deviceName}...`);
        console.log(`[Cast] Proxy URL: ${proxyUrl}`);

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

    async function playOnChromecastSmart(deviceName, streamUrl, metadata = {}, proxyIp = null) {
        const device = castDevices[deviceName];
        if (!device) return { success: false, error: 'Device not found' };
        activeCastDeviceName = deviceName;

        // 1. Auto-Detection
        const streamMeta = await probeStream(streamUrl);
        const transcodeNeeded = needsTranscoding(streamMeta);

        if (!transcodeNeeded) {
            // Direct Proxy
            stopActiveTranscode();
            const proxyUrl = buildProxyUrl(streamUrl, proxyIp);
            console.log(`[Chromecast Load] Sending DIRECT stream to ${deviceName}: ${proxyUrl}`);
            
            return new Promise((resolve) => {
                device.play(proxyUrl, {
                    title: metadata.title || 'IPTV Stream',
                    images: metadata.images || [],
                    contentType: 'video/mp2t',
                    streamType: 'BUFFERED'
                }, (err) => {
                    if (err) resolve({ success: false, error: err.message });
                    else resolve({ success: true });
                });
            });
        }

        // 2. Aggressive HLS Transcode (Adaptive Ladder: 1080p + 720p)
        stopActiveTranscode();
        
        const requestId = Buffer.from(streamUrl).toString('hex').slice(0, 16);
        const hlsDir = path.join(HLS_BASE_DIR, requestId);
        const playlistPath = path.join(hlsDir, 'master.m3u8');
        const hlsUrl = buildHlsUrl(streamUrl, proxyIp);

        console.log(`[FFmpeg Lifecycle] Spawning NEW Adaptive HLS process for: ${streamUrl}`);
        if (!fs.existsSync(hlsDir)) fs.mkdirSync(hlsDir, { recursive: true });
        
        // Ensure variant directories exist
        const v0Dir = path.join(hlsDir, 'v0');
        const v1Dir = path.join(hlsDir, 'v1');
        if (!fs.existsSync(v0Dir)) fs.mkdirSync(v0Dir, { recursive: true });
        if (!fs.existsSync(v1Dir)) fs.mkdirSync(v1Dir, { recursive: true });

        let ffmpegPath = 'ffmpeg';
        try {
            const config = getConfigFunc();
            if (config && config.ffmpegPath) {
                const binary = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
                const p1 = path.join(config.ffmpegPath, binary);
                const p2 = path.join(config.ffmpegPath, 'bin', binary);
                if (fs.existsSync(p1)) ffmpegPath = p1;
                else if (fs.existsSync(p2)) ffmpegPath = p2;
            }
        } catch (e) {}

        const ffmpegArgs = [
            '-hide_banner', '-loglevel', 'warning',
            '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5',
            '-i', streamUrl,
            '-filter_complex', '[0:v]split=2[v1080][v720];[v1080]scale=1920:1080:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2[v1080o];[v720]scale=1280:720:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2[v720o]',
            '-map', '[v1080o]', '-map', '0:a:0?',
            '-map', '[v720o]', '-map', '0:a:0?',
            '-c:v:0', 'libx264', '-profile:v:0', 'main', '-level:v:0', '4.0', '-b:v:0', '6000k',
            '-c:v:1', 'libx264', '-profile:v:1', 'main', '-level:v:1', '3.1', '-b:v:1', '3000k',
            '-pix_fmt', 'yuv420p', '-preset', 'ultrafast', '-tune', 'zerolatency',
            '-c:a', 'aac', '-ac', '2', '-ar', '48000', '-b:a', '160k',
            '-f', 'hls', '-hls_time', '4', '-hls_list_size', '6',
            '-hls_flags', 'delete_segments+append_list+independent_segments',
            '-hls_segment_type', 'mpegts',
            '-var_stream_map', 'v:0,a:0 v:1,a:1',
            '-master_pl_name', 'master.m3u8',
            '-hls_segment_filename', 'v%v/seg_%03d.ts',
            'v%v/index.m3u8'
        ];

        const ff = spawn(ffmpegPath, ffmpegArgs, { cwd: hlsDir });
        console.log(`[FFmpeg Lifecycle] FFmpeg started with PID: ${ff.pid}`);
        currentStream = { ff, url: streamUrl, hlsDir, killTimeout: null };

        ff.on('close', (code) => {
            console.log(`[FFmpeg Lifecycle] Process closed with code ${code}`);
            if (currentStream.url === streamUrl) currentStream.ff = null;
        });

        ff.stderr.on('data', (d) => {
            const msg = d.toString();
            if (msg.includes('Error')) console.error(`[FFmpeg Stderr] ${msg.trim()}`);
        });

        // 3. Chromecast Load with Verbose Polling
        return new Promise((resolve) => {
            let attempts = 0;
            const startTime = Date.now();
            const logged = {
                v0_pl: false, v1_pl: false,
                v0_seg: false, v1_seg: false,
                master: false
            };

            const checkFiles = setInterval(() => {
                attempts++;
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                
                if (currentStream.ff && currentStream.ff.killed) {
                    clearInterval(checkFiles);
                    console.error(`[Chromecast Load] ABORTED: FFmpeg process was killed at ${elapsed}s`);
                    return resolve({ success: false, error: 'FFmpeg process terminated' });
                }

                // Verbose Progress Logging
                if (!logged.v0_pl && fs.existsSync(path.join(v0Dir, 'index.m3u8'))) {
                    console.log(`[FFmpeg Progress] Variant 1080p playlist appeared (${elapsed}s)`);
                    logged.v0_pl = true;
                }
                if (!logged.v1_pl && fs.existsSync(path.join(v1Dir, 'index.m3u8'))) {
                    console.log(`[FFmpeg Progress] Variant 720p playlist appeared (${elapsed}s)`);
                    logged.v1_pl = true;
                }
                if (!logged.v0_seg && fs.existsSync(path.join(v0Dir, 'seg_000.ts'))) {
                    console.log(`[FFmpeg Progress] Variant 1080p first segment ready (${elapsed}s)`);
                    logged.v0_seg = true;
                }
                if (!logged.v1_seg && fs.existsSync(path.join(v1Dir, 'seg_000.ts'))) {
                    console.log(`[FFmpeg Progress] Variant 720p first segment ready (${elapsed}s)`);
                    logged.v1_seg = true;
                }

                if (fs.existsSync(playlistPath)) {
                    if (!logged.master) {
                        console.log(`[FFmpeg Progress] Master playlist READY at ${elapsed}s`);
                        logged.master = true;
                    }

                    // Wait until at least one segment exists before sending to Chromecast to ensure buffer
                    if (logged.v0_seg || logged.v1_seg) {
                        clearInterval(checkFiles);
                        console.log(`[Chromecast Load] Sending Master HLS URL to ${deviceName}: ${hlsUrl}`);
                        device.play(hlsUrl, {
                            title: metadata.title || 'IPTV Stream',
                            images: metadata.images || [],
                            contentType: 'application/x-mpegURL',
                            streamType: 'LIVE'
                        }, (err) => {
                            if (err) {
                                console.error(`[Chromecast Load] Playback Error on ${deviceName}:`, err.message);
                                resolve({ success: false, error: err.message });
                            } else {
                                console.log(`[Chromecast Load] Playback command sent successfully.`);
                                resolve({ success: true });
                            }
                        });
                    }
                } else {
                    if (attempts % 20 === 0) {
                        console.log(`[Chromecast Load] Still waiting for HLS ladder... (${elapsed}s)`);
                    }
                    
                    if (Date.now() - startTime > 90000) { // Increased to 90s for ladder generation
                        clearInterval(checkFiles);
                        console.error(`[Chromecast Load] Adaptive HLS generation timed out after ${elapsed}s`);
                        resolve({ success: false, error: 'HLS generation timeout (90s)' });
                    }
                }
            }, 500);
        });
    }

    function stopChromecast(deviceName) {
        const name = deviceName || activeCastDeviceName;
        const device = castDevices[name];
        if (!device) return Promise.resolve({ success: false });

        return new Promise((resolve) => {
            console.log(`[Chromecast Activity] Stopping all activity on ${name}...`);
            device.stop(() => {
                if (name === activeCastDeviceName) activeCastDeviceName = null;
                // Immediate aggressive cleanup
                stopActiveTranscode();
                console.log(`[Chromecast Activity] All streams stopped and cache cleared.`);
                resolve({ success: true });
            });
        });
    }

    async function scanForDevices() {
        try {
            castClient.update();
        } catch (e) {
            console.error('[Chromecast] scanForDevices update failed:', e && e.message);
        }
        return Object.keys(castDevices);
    }

    initializeChromecast();
    startDevicePolling(30000);

    ipcMain.handle('cast-scan', async () => scanForDevices());
    ipcMain.handle('get-available-ips', async () => getLocalIPs());
    
    // Smart play handler replaces individual play/transcode calls
    ipcMain.handle('cast-play', async (event, deviceName, streamUrl, metadata = {}, proxyIp = null, streamType = 'BUFFERED', contentType = 'video/mp2t') => {
        console.log(`[Chromecast Load] Force DIRECT play (Transcode toggle is OFF)`);
        stopActiveTranscode(); // Kill any existing transcode process
        return playOnChromecast(deviceName, streamUrl, metadata, proxyIp, streamType, contentType);
    });

    ipcMain.handle('cast-stop', async (event, deviceName) => stopChromecast(deviceName));

    // Compatibility shim / Transcode force
    ipcMain.handle('cast-play-ffmpeg', async (event, deviceName, streamUrl, metadata = {}, proxyIp = null) => {
        console.log(`[Chromecast Load] SMART play (Transcode toggle is ON)`);
        return playOnChromecastSmart(deviceName, streamUrl, metadata, proxyIp);
    });

    return {
        proxyServer,
        ffmpegProxyServer,
        scanForDevices,
        playOnChromecastSmart,
        stopChromecast,
        _internal: { castClient, castDevices, currentStream }
    };
}

module.exports = { initChromecastHandlers };