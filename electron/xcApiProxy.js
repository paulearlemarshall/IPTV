const axios = require('axios');

function initXCHandlers(ipcMain) {
    const apiCache = new Map();
    const CACHE_TTL = 86400000; // 24 hours (24 * 60 * 60 * 1000)

    ipcMain.handle('xc-api', async (event, { server, username, password, action, extraParams = {}, bypassCache = false }) => {
        const cacheKey = JSON.stringify({ server, username, action, extraParams });
        const now = Date.now();
        const paramsDesc = Object.entries(extraParams).map(([k, v]) => `${k}=${v}`).join(', ') || 'no params';

        if (bypassCache) console.log(`[Cache] Manual bypass for ${action} (${paramsDesc})`);

        if (!bypassCache && apiCache.has(cacheKey)) {
            const entry = apiCache.get(cacheKey);
            const age = now - entry.timestamp;
            if (age < CACHE_TTL) {
                console.log(`[Cache] HIT: ${action} (${paramsDesc}) (Age: ${(age/1000).toFixed(1)}s)`);
                return { success: true, data: entry.data, fromCache: true };
            } else {
                console.log(`[Cache] EXPIRED: ${action} (${paramsDesc}) (Age: ${(age/1000).toFixed(1)}s)`);
            }
        } else if (!bypassCache) {
            console.log(`[Cache] MISS: ${action} (${paramsDesc})`);
        }

        const startTime = performance.now();
        try {
            const base = server.replace(/\/$/, "");
            const url = new URL(`${base}/player_api.php`);
            url.searchParams.append('username', username);
            url.searchParams.append('password', password);
            url.searchParams.append('action', action);
            
            Object.entries(extraParams).forEach(([key, val]) => {
                url.searchParams.append(key, val);
            });

            console.log(`[API Proxy] Fetching: ${url.toString().replace(password, '******')}`);

            const response = await axios.get(url.toString(), { 
                timeout: 20000,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            });

            const duration = (performance.now() - startTime).toFixed(1);
            console.log(`[API Proxy] ${action} Success - Time: ${duration}ms`);

            apiCache.set(cacheKey, { data: response.data, timestamp: now });

            return { success: true, data: response.data, fromCache: false };
        } catch (error) {
            const duration = (performance.now() - startTime).toFixed(1);
            console.error(`[API Proxy] ${action} Error after ${duration}ms:`, error.message);
            return { success: false, error: error.message };
        }
    });
}

module.exports = { initXCHandlers };
