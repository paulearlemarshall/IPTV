# Chromecast Implementation

This document details the Chromecast integration within the Electron IPTV Player. The implementation relies on the `chromecast-api` library for device discovery and control, and a custom local HTTP proxy to ensure stream compatibility and header management.

## Architecture Overview

The system operates across the **Main Process** (backend) and the **Renderer Process** (frontend), connected via IPC (Inter-Process Communication).

1.  **Main Process (`electron/main.js`)**:
    *   Manages the `ChromecastAPI` client.
    *   Runs a local HTTP proxy server to relay streams to the Chromecast.
    *   Handles IPC events for scanning, playing, and stopping media.
2.  **Renderer Process**:
    *   Initiates device scans.
    *   Selects a target device.
    *   Triggers playback by sending the stream URL to the main process.

## Dependencies

*   **`chromecast-api`**: `^0.4.2`
    *   A Node.js wrapper around `castv2-client` for simplified discovery and media control.
    *   Uses mDNS (Multicast DNS) to find devices on the local network.

## Core Components

### 1. Device Discovery

The application initializes the client and listens for new devices. It also supports manual re-scanning.

**File:** `electron/main.js`

```javascript
const ChromecastAPI = require('chromecast-api');
const castClient = new ChromecastAPI();
let castDevices = {};

// Listen for devices continuously
castClient.on('device', function (device) {
    const name = device.friendlyName || device.name;
    if (!castDevices[name]) {
        console.log(`[Chromecast] Found device: ${name} at ${device.host}`);
        castDevices[name] = device;
        // Notify frontend
        if (mainWindow) mainWindow.webContents.send('cast-device-found', name);
    }
});

// Manual scan trigger via IPC
ipcMain.handle('cast-scan', async () => { 
    console.log("[Chromecast] Starting network scan...");
    castClient.update(); // Triggers a browser update (mDNS query)
    return Object.keys(castDevices); 
});
```

### 2. Local Stream Proxy

A critical component is the local proxy server. Direct streaming from IPTV providers to Chromecast often fails due to:
*   Missing or specific `User-Agent` headers required by the provider.
*   CORS issues.
*   Chromecast's limited support for certain direct stream protocols or authentication parameters.

The proxy runs on the local machine's IP address, acts as a middleman, and pipes the stream data.

**File:** `electron/main.js`

```javascript
const http = require('http');
const axios = require('axios');
const PROXY_PORT = 5181;

const proxyServer = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    
    // Endpoint: /stream?url=<ENCODED_STREAM_URL>
    if (parsedUrl.pathname === '/stream' && parsedUrl.query.url) {
        const streamUrl = parsedUrl.query.url;
        
        // Define headers required by the IPTV provider
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)...'
        };

        try {
            // Fetch the stream from the provider
            const response = await axios({
                method: 'get',
                url: streamUrl,
                responseType: 'stream',
                headers: headers,
                timeout: 30000
            });

            res.statusCode = response.status;
            
            // Set appropriate Content-Type (default to MPEG-TS for IPTV)
            res.setHeader('Content-Type', response.headers['content-type'] || 'video/mp2t');
            res.setHeader('Access-Control-Allow-Origin', '*');
            
            // Pipe the data to the response (Chromecast)
            response.data.pipe(res);

        } catch (e) {
            console.error("Proxy error:", e.message);
            res.statusCode = 500;
            res.end();
        }
    }
});

// Listen on all interfaces (0.0.0.0) so the Chromecast on the network can connect
proxyServer.listen(PROXY_PORT, '0.0.0.0', () => {
    console.log(`Stream proxy listening on http://${getLocalIP()}:${PROXY_PORT}`);
});
```

### 3. Playback Logic

When the user requests playback, the main process:
1.  Retrieves the target device object.
2.  Constructs a URL pointing to the **local proxy** (e.g., `http://192.168.1.5:5181/stream?url=...`).
3.  Instructs the Chromecast to play that local URL.

**File:** `electron/main.js`

```javascript
ipcMain.handle('cast-play', async (event, deviceName, streamUrl) => {
    const device = castDevices[deviceName];
    if (!device) return { success: false, error: 'Device not found' };

    // Construct the proxy URL
    const proxyUrl = `http://${getLocalIP()}:${PROXY_PORT}/stream?url=${encodeURIComponent(streamUrl)}`;
    
    console.log(`[Cast] Sending stream to ${deviceName}...`);

    return new Promise((resolve) => { 
        // Use the chromecast-api 'play' method
        device.play(proxyUrl, (err) => {
            if (err) {
                console.error(`[Cast] Error:`, err.message);
                resolve({ success: false, error: err.message });
            } else {
                console.log(`[Cast] Playback started`);
                resolve({ success: true });
            }
        }); 
    });
});
```

## Helper Functions

**`getLocalIP()`**: Essential for the proxy URL. It iterates through network interfaces to find the machine's local IPv4 address (e.g., `192.168.1.X`).

```javascript
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
```

## Usage in Frontend

The frontend (React) communicates via the `window.api` bridge defined in `preload.js`.

1.  **Scan:** `window.api.castScan()`
2.  **Listen:** `window.api.onCastDeviceFound((name) => { ... })`
3.  **Play:** `window.api.castPlay(selectedDeviceName, streamUrl)`

## Key Considerations for Reproduction

1.  **Network Access:** The machine running the Electron app and the Chromecast **must** be on the same local network.
2.  **Firewall:** The operating system's firewall must allow incoming connections on the proxy port (5181) and allow the application to accept mDNS packets (UDP 5353).
3.  **Content-Type:** The proxy attempts to sniff the content type. If the stream is an `.m3u8` (HLS), the Chromecast generally handles it natively if the headers are correct. If it's a raw MPEG-TS stream (common in IPTV), it works well with `video/mp2t`.

## Frequently Asked Questions (Implementation Details)

### 1. Stream Compatibility (Codecs)
**Does the proxy transcode HEVC (H.265) to H.264?**
No. The current proxy implementation in `electron/main.js` is a **pass-through** only. It pipes the incoming data stream directly to the response (`response.data.pipe(res)`).
*   **Impact:** If the IPTV provider streams in HEVC (H.265) and the user has an older Chromecast (Gen 1, 2, or 3) that lacks native HEVC hardware decoding, the playback will fail (black screen or error), even if the proxy is working correctly.
*   **Solution:** Transcoding would require integrating `ffmpeg` into the proxy pipeline (similar to how the download handler uses it), but this would significantly increase CPU usage.

### 2. Header Handling & "Spoofing"
**Does the proxy forward specific headers like Referer or Origin?**
Currently, the proxy **only** explicitly forwards the `Range` header (essential for seeking and partial content loading).
*   **User-Agent:** It uses a hardcoded modern Chrome User-Agent string: `'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36...'`.
*   **Other Headers:** It does *not* automatically forward `Referer`, `Origin`, or `Accept-Encoding` from the Chromecast's request to the IPTV provider.
*   **Impact:** Strict providers requiring a specific `Referer` to verify the request origin might return a 403 Forbidden. This is a potential cause for connection errors if the provider is strict.

### 3. mDNS & Discovery Stability
**Why does the device list sometimes stay empty?**
The app uses `chromecast-api` which relies on Multicast DNS (mDNS).
*   **Windows Issues:** mDNS on Windows can be inconsistent, especially if multiple network interfaces (VPNs, VirtualBox adapters) are present. The discovery packets may be sent out the wrong interface.
*   **Refresh Mechanism:** The app exposes a manual scan via `ipcMain.handle('cast-scan')` which calls `client.update()`. This triggers a new browser query on the network. There is no background "heartbeat" or auto-refresh mechanism beyond the initial scan and manual updates.

### 4. Firewall Detection
**Does the app check if Port 5181 is blocked?**
No. The application listens on `0.0.0.0` (all interfaces) but does not perform any self-diagnostics to verify reachability.
*   **Detection:** Node.js cannot trivially check Windows Firewall rules to see if *incoming* traffic is allowed on a specific port.
*   **User Feedback:** If the firewall blocks port 5181, the Chromecast will simply fail to connect to the proxy URL, likely timing out. The app currently has no way to alert the user specifically about firewall blocking other than generic connection timeout errors.
