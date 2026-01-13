const axios = require('axios');

function initXCHandlers(ipcMain) {
    const apiCache = new Map();
    const CACHE_TTL = 86400000; // 24 hours (24 * 60 * 60 * 1000)

    ipcMain.handle('xc-api', async (event, { server, username, password, action, extraParams = {}, bypassCache = false }) => {
        const cacheKey = JSON.stringify({ server, username, action, extraParams });
        const now = Date.now();

        if (bypassCache) console.log(`[Cache] Manual bypass for ${action}`);

        if (!bypassCache && apiCache.has(cacheKey)) {
            const entry = apiCache.get(cacheKey);
            const age = now - entry.timestamp;
            if (age < CACHE_TTL) {
                console.log(`[Cache] HIT: ${action} (Age: ${(age/1000).toFixed(1)}s)`);
                return { success: true, data: entry.data, fromCache: true };
            } else {
                console.log(`[Cache] EXPIRED: ${action} (Age: ${(age/1000).toFixed(1)}s)`);
            }
        } else if (!bypassCache) {
            console.log(`[Cache] MISS: ${action}`);
        }

        try {
            const base = server.replace(/\/$/, "");
            const url = new URL(`${base}/player_api.php`);
            url.searchParams.append('username', username);
            url.searchParams.append('password', password);
            url.searchParams.append('action', action);
            
            Object.entries(extraParams).forEach(([key, val]) => {
                url.searchParams.append(key, val);
            });

            const response = await axios.get(url.toString(), { 
                timeout: 20000,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            });

            apiCache.set(cacheKey, { data: response.data, timestamp: now });

            return { success: true, data: response.data, fromCache: false };
        } catch (error) {
            console.error(`XC API Error (${action}):`, error.message);
            return { success: false, error: error.message };
        }
    });
}

module.exports = { initXCHandlers };
