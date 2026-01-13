const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function initImageHandlers(ipcMain, getProfileCachePaths) {
    const imageQueue = [];
    let activeImageDownloads = 0;
    const MAX_CONCURRENT_DOWNLOADS = 5;

    const processImageQueue = async () => {
        if (activeImageDownloads >= MAX_CONCURRENT_DOWNLOADS || imageQueue.length === 0) return;

        activeImageDownloads++;
        const { url, profileId, resolve } = imageQueue.shift();

        try {
            const paths = getProfileCachePaths(profileId);
            const filePath = path.join(paths.images, crypto.createHash('md5').update(url).digest('hex'));
            
            if (!fs.existsSync(filePath)) {
                const res = await axios({ 
                    url, 
                    method: 'GET', 
                    responseType: 'stream', 
                    timeout: 10000,
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                });
                
                const writer = fs.createWriteStream(filePath);
                res.data.pipe(writer);
                await new Promise((resW, rejW) => {
                    writer.on('finish', resW);
                    writer.on('error', rejW);
                });
            }
            resolve(true);
        } catch (e) {
            console.error(`Failed to cache image: ${url}`, e.message);
            resolve(false);
        } finally {
            activeImageDownloads--;
            processImageQueue(); // Pick up next task
        }
    };

    ipcMain.handle('check-image-cache', async (event, { url, profileId }) => {
        if (!url || !profileId) return null;
        const paths = getProfileCachePaths(profileId);
        const filePath = path.join(paths.images, crypto.createHash('md5').update(url).digest('hex'));
        return fs.existsSync(filePath) ? `file://${filePath}` : null;
    });

    ipcMain.handle('check-image-cache-batch', async (event, { urls, profileId }) => {
        if (!urls || !profileId) return {};
        const paths = getProfileCachePaths(profileId);
        const results = {};
        
        urls.forEach(url => {
            if (!url) return;
            const filename = crypto.createHash('md5').update(url).digest('hex');
            const filePath = path.join(paths.images, filename);
            if (fs.existsSync(filePath)) {
                results[url] = `file://${filePath}`;
            }
        });
        
        return results;
    });

    ipcMain.handle('cache-image', async (event, { url, profileId }) => {
        if (!url || !profileId) return;
        
        const paths = getProfileCachePaths(profileId);
        const filePath = path.join(paths.images, crypto.createHash('md5').update(url).digest('hex'));
        if (fs.existsSync(filePath)) return;

        return new Promise((resolve) => {
            imageQueue.push({ url, profileId, resolve });
            processImageQueue();
        });
    });

    ipcMain.handle('cleanup-profile-images', async (event, { profileId, validUrls }) => {
        try {
            const paths = getProfileCachePaths(profileId);
            if (!fs.existsSync(paths.images)) return { success: true, deletedCount: 0 };

            const validHashes = new Set(validUrls.filter(u => !!u).map(u => crypto.createHash('md5').update(u).digest('hex')));
            
            const files = fs.readdirSync(paths.images);
            let deletedCount = 0;

            files.forEach(file => {
                if (file.match(/^[a-f0-9]{32}$/i) && !validHashes.has(file)) {
                    try {
                        fs.unlinkSync(path.join(paths.images, file));
                        deletedCount++;
                    } catch (e) {
                        console.error(`Failed to delete orphaned image ${file}:`, e);
                    }
                }
            });

            return { success: true, deletedCount };
        } catch (error) {
            console.error('IPC ERROR: cleanup-profile-images:', error);
            return { success: false, error: error.message };
        }
    });
}

module.exports = { initImageHandlers };
