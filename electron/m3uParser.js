const fs = require('fs');
const axios = require('axios');
const readline = require('readline');

async function parseM3UProgressive(filePath, profileId, mainWindow) {
    if (!fs.existsSync(filePath)) return;

    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let streamsBatch = [];
    let categories = new Set();
    let currentStream = null;
    let totalProcessed = 0;

    for await (const line of rl) {
        const l = line.trim();
        if (!l) continue;

        if (l.startsWith('#EXTINF:')) {
            currentStream = { raw: l };
            const groupMatch = l.match(/group-title="([^"]*)"/i);
            const groupTitle = groupMatch ? groupMatch[1].trim() : "Uncategorized";
            currentStream.group_title = groupTitle || "Uncategorized";
            categories.add(currentStream.group_title);

            const logoMatch = l.match(/tvg-logo="([^"]*)"/i);
            if (logoMatch) currentStream.tvg_logo = logoMatch[1].trim();

            const parts = l.split(',');
            currentStream.name = parts.length > 1 ? parts[parts.length - 1].trim() : "Unknown";
        } else if (l.startsWith('#EXTGRP:') && currentStream) {
            const groupName = l.replace('#EXTGRP:', '').trim();
            if (groupName) {
                currentStream.group_title = groupName;
                categories.add(groupName);
            }
        } else if (!l.startsWith('#') && currentStream) {
            currentStream.url = l;
            streamsBatch.push(currentStream);
            currentStream = null;
            totalProcessed++;

            if (streamsBatch.length >= 5000) {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('m3u-batch', {
                        profileId,
                        streams: streamsBatch,
                        categories: Array.from(categories),
                        isFinal: false
                    });
                }
                streamsBatch = [];
            }
        }
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('m3u-batch', {
            profileId,
            streams: streamsBatch,
            categories: Array.from(categories),
            isFinal: true,
            total: totalProcessed
        });
    }
}

function initM3UHandlers(ipcMain, mainWindow, getProfileCachePaths) {
    ipcMain.handle('load-local-m3u', async (event, profileId) => {
        try {
            const paths = getProfileCachePaths(profileId);
            if (fs.existsSync(paths.m3u)) {
                parseM3UProgressive(paths.m3u, profileId, mainWindow);
                return { success: true, started: true };
            }
            return { success: false, error: 'No cache file found' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('fetch-m3u', async (event, { url, profileId }) => {
        try {
            const paths = getProfileCachePaths(profileId);
            const response = await axios({
                method: 'get',
                url: url,
                responseType: 'stream',
                headers: { 'User-Agent': 'IPTVApp/1.0 ElectronFetcher' }
            });

            const writer = fs.createWriteStream(paths.m3u);
            response.data.pipe(writer);

            return new Promise((resolve, reject) => {
                writer.on('finish', () => {
                    parseM3UProgressive(paths.m3u, profileId, mainWindow);
                    resolve({ success: true, started: true });
                });
                writer.on('error', reject);
            });
        } catch (error) {
            return { success: false, error: error.message };
        }
    });
}

module.exports = { initM3UHandlers };
