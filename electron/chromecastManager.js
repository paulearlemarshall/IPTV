const http = require('http');
const url = require('url');
const axios = require('axios');
const os = require('os');
const ChromecastAPI = require('chromecast-api');

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

function initChromecastHandlers(ipcMain, mainWindow) {
    const PROXY_PORT = 5181;
    const castClient = new ChromecastAPI();
    let castDevices = {};
    let activeCastDeviceName = null;

    // --- Local Proxy Server for Chromecast ---
    const proxyServer = http.createServer(async (req, res) => {
        const parsedUrl = url.parse(req.url, true);
        if (parsedUrl.pathname === '/stream' && parsedUrl.query.url) {
            const streamUrl = parsedUrl.query.url;
            console.log(`Proxying stream for Chromecast: ${streamUrl}`);
            
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
        } else {
            res.statusCode = 404;
            res.end();
        }
    });

    proxyServer.listen(PROXY_PORT, '0.0.0.0', () => {
        console.log(`Stream proxy for Chromecast listening on http://${getLocalIP()}:${PROXY_PORT}`);
    });

    // --- Discovery ---
    castClient.on('device', function (device) {
        const name = device.friendlyName || device.name;
        if (!castDevices[name]) {
            console.log(`[Chromecast] Found device: ${name} at ${device.host}`);
            castDevices[name] = device;
            if (mainWindow) mainWindow.webContents.send('cast-device-found', name);
        }
    });

    // Periodically scan for Chromecast devices to keep the list fresh
    const scanInterval = setInterval(() => {
        if (castClient) {
            castClient.update();
        }
    }, 30000);

    // --- IPC Handlers ---
    ipcMain.handle('cast-scan', async () => { 
        console.log("[Chromecast] Starting network scan...");
        castClient.update(); 
        return Object.keys(castDevices); 
    });

    ipcMain.handle('cast-play', async (event, deviceName, streamUrl, metadata = {}) => {
        const device = castDevices[deviceName];
        if (!device) {
            console.error(`[Cast] Playback failed: Device "${deviceName}" not found in cache.`);
            return { success: false, error: 'Device not found' };
        }
        activeCastDeviceName = deviceName;
        const proxyUrl = `http://${getLocalIP()}:${PROXY_PORT}/stream?url=${encodeURIComponent(streamUrl)}`;
        
        console.log(`[Cast] Sending stream to ${deviceName}...`);
        console.log(`[Cast] Original URL: ${streamUrl}`);
        console.log(`[Cast] Proxy URL: ${proxyUrl}`);

        const options = {
            title: metadata.title || 'IPTV Stream',
            images: metadata.images || []
        };

        return new Promise((resolve) => { 
            device.play(proxyUrl, options, (err) => {
                if (err) {
                    console.error(`[Cast] Playback Error on ${deviceName}:`, err.message);
                    resolve({ success: false, error: err.message });
                } else {
                    console.log(`[Cast] Playback started successfully on ${deviceName}`);
                    resolve({ success: true });
                }
            }); 
        });
    });

    ipcMain.handle('cast-stop', async (event, deviceName) => {
        const name = deviceName || activeCastDeviceName;
        const device = castDevices[name];
        if (!device) return { success: false };
        return new Promise((resolve) => { 
            device.stop(() => { 
                if (name === activeCastDeviceName) activeCastDeviceName = null; 
                resolve({ success: true }); 
            }); 
        });
    });

    return { proxyServer, scanInterval };
}

module.exports = { initChromecastHandlers };
