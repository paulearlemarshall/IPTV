const os = require('os');
const path = require('path');
const fs = require('fs');
const ChromecastAPI = require('chromecast-api');

// Split modules
const { createProxyServer } = require('./chromecastProxy');
const { 
    HLS_BASE_DIR, 
    deferredDelete, 
    purgeHlsCache, 
    createHlsServer, 
    probeStream, 
    needsTranscoding,
    startTranscoding
} = require('./chromecastTranscoder');

/**
 * Helper: find local IPv4 addresses
 */
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) return iface.address;
        }
    }
    return '127.0.0.1';
}

function getLocalIPs() {
    const interfaces = os.networkInterfaces();
    const ips = [];
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) ips.push(iface.address);
        }
    }
    return ips.length > 0 ? ips : ['127.0.0.1'];
}

function initChromecastHandlers(ipcMain, mainWindow, getConfigFunc) {
    const PROXY_PORT = 5181;
    const FFMPEG_PROXY_PORT = 5182;
    const castClient = new ChromecastAPI();

    let castDevices = {};
    let activeCastDeviceName = null;
    let currentStream = { ff: null, url: null, hlsDir: null, killTimeout: null };

    // Initialize servers
    createProxyServer(PROXY_PORT);
    createHlsServer(FFMPEG_PROXY_PORT, () => currentStream);
    purgeHlsCache();

    function stopActiveTranscode() {
        if (currentStream.ff) {
            console.log(`[FFmpeg Lifecycle] Terminating process for: ${currentStream.url}`);
            currentStream.ff.kill('SIGKILL');
            currentStream.ff = null;
        }
        if (currentStream.killTimeout) {
            clearTimeout(currentStream.killTimeout);
            currentStream.killTimeout = null;
        }
        if (currentStream.hlsDir) deferredDelete(currentStream.hlsDir);
        currentStream.url = null;
        currentStream.hlsDir = null;
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

    /**
     * Unified internal play helper with safety stop/wait and unambiguous metadata
     */
    async function performCastPlay(deviceName, url, options) {
        const device = castDevices[deviceName];
        if (!device) return { success: false, error: 'Device not found' };
        activeCastDeviceName = deviceName;

        return new Promise((resolve) => {
            const proceedToPlay = () => {
                // Mandatory 500ms wait for Chromecast state to settle
                setTimeout(() => {
                    console.log(`[Cast] Loading new stream with explicit metadata...`);
                    
                    // Construct unambiguous Load Request options
                    const loadOptions = {
                        autoplay: true,
                        activeTrackIds: [],
                        playbackRate: 1,
                        streamType: options.streamType || 'BUFFERED',
                        contentType: options.contentType || 'video/mp2t',
                        metadata: {
                            metadataType: options.type ?? 0, // 0: Generic, 1: Movie, 2: TVShow
                            title: options.title || 'IPTV Stream',
                            subtitle: options.subtitle || '',
                            images: options.images || []
                        }
                    };

                    console.log(`[Cast] Unambiguous Metadata:`, JSON.stringify(loadOptions.metadata));

                    try {
                        device.play(url, loadOptions, (err) => {
                            if (err) {
                                console.error(`[Cast] Playback error:`, err.message);
                                resolve({ success: false, error: err.message });
                            } else {
                                console.log(`[Cast] Playback started successfully.`);
                                resolve({ success: true });
                            }
                        });
                    } catch (e) {
                        console.error(`[Cast] Critical device.play crash:`, e.message);
                        resolve({ success: false, error: e.message });
                    }
                }, 500);
            };

            console.log(`[Cast] Safety check: Querying media session on ${deviceName}...`);
            if (device._media && device._media.mediaSessionId) {
                console.log(`[Cast] Active media session detected. Stopping...`);
                try {
                    device.stop(() => proceedToPlay());
                } catch (e) {
                    console.warn(`[Cast] device.stop threw error:`, e.message);
                    proceedToPlay();
                }
            } else {
                console.log(`[Cast] No active media session, skip stop.`);
                proceedToPlay();
            }
        });
    }

    async function playOnChromecastSmart(deviceName, streamUrl, metadata = {}, proxyIp = null, settings = {}) {
        let transcodeNeeded = settings.enabled;
        
        // Always probe for visibility, even if transcode is forced
        const probeData = await probeStream(streamUrl, getConfigFunc);

        // If system is ON and Intelligent is ON, decide based on probe
        if (settings.enabled && settings.intelligent) {
            transcodeNeeded = needsTranscoding(probeData);
            console.log(`[Decision Engine] Intelligent Mode: ${transcodeNeeded ? 'TRANSCODE' : 'DIRECT'}`);
        } else if (settings.enabled) {
            console.log(`[Decision Engine] Always Transcode Mode: FORCED`);
            // Still run the check just for the log output side-effect
            needsTranscoding(probeData);
        }

        if (!transcodeNeeded) {
            stopActiveTranscode();
            const proxyUrl = buildProxyUrl(streamUrl, proxyIp);
            console.log(`[Chromecast Load] Sending DIRECT stream: ${proxyUrl}`);
            return performCastPlay(deviceName, proxyUrl, {
                ...metadata,
                contentType: 'video/mp2t',
                streamType: 'BUFFERED'
            });
        }

        stopActiveTranscode();
        const requestId = Buffer.from(streamUrl).toString('hex').slice(0, 16);
        const hlsDir = path.join(HLS_BASE_DIR, requestId);
        const hlsUrl = buildHlsUrl(streamUrl, proxyIp);

        const ff = startTranscoding(streamUrl, hlsDir, getConfigFunc, settings, probeData);
        currentStream = { ff, url: streamUrl, hlsDir, killTimeout: null };

        return new Promise((resolve) => {
            const startTime = Date.now();
            const ladder = settings.ladder || [];
            const readyRungs = new Set();
            
            const checkFiles = setInterval(() => {
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                if (currentStream.ff?.killed) { 
                    clearInterval(checkFiles); 
                    return resolve({ success: false, error: 'FFmpeg killed' }); 
                }

                // Check readiness for each rung in the ladder
                ladder.forEach(rung => {
                    if (!readyRungs.has(rung.id)) {
                        const segPath = path.join(hlsDir, rung.id, 'seg_000.ts');
                        if (fs.existsSync(segPath)) {
                            console.log(`[FFmpeg] Rung ${rung.res} (${rung.bitrate}) Ready (${elapsed}s)`);
                            readyRungs.add(rung.id);
                        }
                    }
                });

                // Start playback when master is ready AND at least one rung has buffered
                if (fs.existsSync(path.join(hlsDir, 'master.m3u8')) && readyRungs.size > 0) {
                    clearInterval(checkFiles);
                    console.log(`[Cast] Loading Master HLS (${readyRungs.size}/${ladder.length} rungs ready): ${hlsUrl}`);
                    resolve(performCastPlay(deviceName, hlsUrl, {
                        ...metadata,
                        contentType: 'application/x-mpegURL',
                        streamType: 'LIVE'
                    }));
                } else if (Date.now() - startTime > 90000) { 
                    clearInterval(checkFiles); 
                    console.log(`[Cast] Timeout waiting for HLS ladder.`);
                    resolve({ success: false, error: 'Timeout' }); 
                }
            }, 500);
        });
    }

    castClient.on('device', d => {
        const name = d.friendlyName || d.name;
        if (name && !castDevices[name]) { 
            castDevices[name] = d; 
            mainWindow.webContents.send('cast-device-found', name); 
        }
    });
    castClient.update();
    setInterval(() => castClient.update(), 30000);

    ipcMain.handle('cast-scan', async () => {
        try {
            return Object.keys(castDevices);
        } catch (error) {
            console.error('[Cast Scan Error]', error);
            return [];
        }
    });

    ipcMain.handle('get-available-ips', async () => {
        try {
            return getLocalIPs();
        } catch (error) {
            console.error('[Get IPs Error]', error);
            return ['127.0.0.1'];
        }
    });
    
    // Handler for "Transcoder OFF" -> Direct Play only
    ipcMain.handle('cast-play', async (e, name, url, meta, ip, streamType, contentType) => { 
        try {
            console.log(`[Cast] UI Request: DIRECT (Transcoder Global Off)`);
            
            // Log probe data for visibility even in direct mode
            const probeData = await probeStream(url, getConfigFunc);
            if (probeData && probeData.video) {
                const v = probeData.video;
                const a = probeData.audio;
                console.log(`[Source Probe] Direct Play Metadata:`);
                console.log(`  - Video: ${v.codec_name} (${v.width}x${v.height}), ${v.pix_fmt}, L${v.level/10}`);
                console.log(`  - Audio: ${a ? `${a.codec_name}, ${a.channels} ch` : 'NONE'}`);
            }

            stopActiveTranscode(); 
            return await performCastPlay(name, buildProxyUrl(url, ip), {
                ...meta,
                contentType: contentType || 'video/mp2t',
                streamType: streamType || 'BUFFERED'
            });
        } catch (error) {
            console.error('[Cast Play Error]', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('cast-stop', async (e, name) => {
        try {
            const device = name ? castDevices[name] : castDevices[activeCastDeviceName];
            if (!device) { stopActiveTranscode(); return { success: true }; }

            return new Promise(r => {
                if (device._media && device._media.mediaSessionId) {
                    console.log(`[Cast] Stopping active media session...`);
                    try {
                        device.stop(() => { 
                            stopActiveTranscode(); 
                            r({ success: true }); 
                        });
                    } catch (stopErr) {
                        console.error('[Cast Stop Device Error]', stopErr);
                        stopActiveTranscode();
                        r({ success: true });
                    }
                } else {
                    console.log(`[Cast] No active media to stop.`);
                    stopActiveTranscode();
                    r({ success: true });
                }
            });
        } catch (error) {
            console.error('[Cast Stop Error]', error);
            stopActiveTranscode();
            return { success: true };
        }
    });

    ipcMain.handle('cast-play-ffmpeg', async (e, name, url, meta, ip, settings) => {
        try {
            return await playOnChromecastSmart(name, url, meta, ip, settings);
        } catch (error) {
            console.error('[Cast Play FFmpeg Error]', error);
            return { success: false, error: error.message };
        }
    });

    return { 
        scanForDevices: () => Object.keys(castDevices), 
        stopChromecast: (name) => { 
            const device = name ? castDevices[name] : castDevices[activeCastDeviceName];
            if (device && device._media && device._media.mediaSessionId) {
                device.stop(() => stopActiveTranscode());
            } else {
                stopActiveTranscode();
            }
        } 
    };
}

module.exports = { initChromecastHandlers };