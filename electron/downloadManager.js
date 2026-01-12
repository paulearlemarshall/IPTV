const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');
const axios = require('axios');

const activeDownloads = {};
const downloadQueue = [];
let currentDownload = null;
let mainWindowRef = null;
let getProfileCachePathsRef = null;

function formatSpeed(bytesPerSecond) {
    if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(0)} B/s`;
    if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
}

function finishTask(id) {
    if (currentDownload && currentDownload.id === id) {
        console.log(`[Queue] Task ${id} finished (natural or error). Clearing currentDownload.`);
        currentDownload = null;
        setImmediate(() => processDownloadQueue());
    } else {
        console.log(`[Queue] finishTask called for ${id}, but currentDownload is ${currentDownload ? currentDownload.id : 'null'}. Skipping.`);
    }
}

async function processDownloadQueue() {
    console.log(`[Queue] processDownloadQueue called. Current: ${currentDownload ? currentDownload.id : 'none'}, Queue size: ${downloadQueue.length}`);

    if (currentDownload) {
        return;
    }

    if (downloadQueue.length === 0) {
        console.log(`[Queue] Queue is empty.`);
        return;
    }

    const downloadTask = downloadQueue.shift();
    currentDownload = downloadTask;
    const { id, url, name, profileId } = downloadTask;

    console.log(`\n========== DOWNLOAD START: ${name} (${id}) ==========`);

    try {
        if (!mainWindowRef || mainWindowRef.isDestroyed()) {
            throw new Error('Main window not available');
        }
        const event = { sender: mainWindowRef.webContents };

        activeDownloads[id] = { cancelled: false };

        if (!profileId) {
            throw new Error('Profile ID is missing');
        }

        const paths = getProfileCachePathsRef(profileId);
        const downloadsDir = path.join(paths.profile, 'downloads');

        if (!fs.existsSync(downloadsDir)) {
            fs.mkdirSync(downloadsDir, { recursive: true });
        }

        const sanitizedName = name.replace(/[^a-z0-9\s\-_.()]/gi, '_');
        const ext = url.includes('.m3u8') ? '.mp4' : path.extname(url) || '.mp4';
        const filePath = path.join(downloadsDir, `${sanitizedName}${ext}`);

        event.sender.send('download-progress', {
            id,
            progress: 0,
            speed: '0 KB/s',
            status: 'downloading'
        });

        const strategies = [];
        if (url.includes('.m3u8')) {
            strategies.push({ name: 'HLS (ffmpeg)', fn: () => downloadHLS(event, id, url, filePath) });
            strategies.push({ name: 'Stream Recording', fn: () => downloadStream(event, id, url, filePath) });
        } else if (url.includes('/live/')) {
            strategies.push({ name: 'Stream Recording', fn: () => downloadStream(event, id, url, filePath) });
            strategies.push({ name: 'Direct Download', fn: () => downloadDirect(event, id, url, filePath) });
        } else {
            strategies.push({ name: 'Direct Download', fn: () => downloadDirect(event, id, url, filePath) });
            strategies.push({ name: 'Stream Recording', fn: () => downloadStream(event, id, url, filePath) });
        }
        strategies.push({ name: 'Electron Native', fn: () => downloadElectron(event, id, url, filePath) });

        let success = false;
        let lastError = null;

        for (let i = 0; i < strategies.length; i++) {
            const strategy = strategies[i];

            if (activeDownloads[id]?.cancelled) {
                console.log(`[Download ${id}] Cancelled before strategy ${strategy.name}`);
                throw new Error('Download cancelled');
            }

            console.log(`[Download ${id}] Trying Strategy: ${strategy.name}`);
            try {
                await strategy.fn();
                success = true;
                console.log(`[Download ${id}] ✓ ${strategy.name} Success`);
                break;
            } catch (err) {
                lastError = err;
                console.log(`[Download ${id}] ✗ ${strategy.name} Failed: ${err.message}`);
                if (err.message === 'Download cancelled' || activeDownloads[id]?.cancelled) {
                    throw new Error('Download cancelled');
                }
            }
        }

        if (!success) {
            throw lastError || new Error('All download strategies failed');
        }

        console.log(`========== DOWNLOAD COMPLETE: ${id} ==========`);

    } catch (error) {
        console.error(`========== DOWNLOAD ERROR: ${id} ==========`, error.message);
        const isCancel = error.message === 'Download cancelled' || activeDownloads[id]?.cancelled;

        if (mainWindowRef && !mainWindowRef.isDestroyed()) {
            mainWindowRef.webContents.send('download-progress', {
                id,
                progress: 0,
                speed: '0 KB/s',
                status: isCancel ? 'cancelled' : 'error',
                error: isCancel ? null : error.message
            });
        }
    } finally {
        delete activeDownloads[id];
        finishTask(id);
    }
}

async function downloadDirect(event, id, url, filePath) {
    return new Promise(async (resolve, reject) => {
        console.log(`[Download ${id}] Direct download: Initiating axios GET request...`);
        try {
            const response = await axios({
                method: 'GET',
                url: url,
                responseType: 'stream',
                timeout: 30000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                onDownloadProgress: (progressEvent) => {
                    if (activeDownloads[id]?.cancelled) {
                        response.data.destroy();
                        reject(new Error('Download cancelled'));
                        return;
                    }

                    const total = progressEvent.total;
                    const current = progressEvent.loaded;
                    const progress = total ? (current / total) * 100 : 0;

                    const now = Date.now();
                    const elapsed = (now - (activeDownloads[id]?.lastTime || now)) / 1000;
                    const bytes = current - (activeDownloads[id]?.lastLoaded || 0);
                    const speed = elapsed > 0 ? bytes / elapsed : 0;

                    activeDownloads[id] = {
                        ...activeDownloads[id],
                        lastTime: now,
                        lastLoaded: current
                    };

                    const speedText = formatSpeed(speed);

                    event.sender.send('download-progress', {
                        id,
                        progress,
                        speed: speedText,
                        status: 'downloading'
                    });
                }
            });

            console.log(`[Download ${id}] Direct download: Response received, status ${response.status}`);
            console.log(`[Download ${id}] Direct download: Creating write stream and piping data...`);

            const writer = fs.createWriteStream(filePath);
            response.data.pipe(writer);

            writer.on('finish', () => {
                console.log(`[Download ${id}] Direct download: Write stream finished`);
                delete activeDownloads[id];
                event.sender.send('download-progress', {
                    id,
                    progress: 100,
                    speed: '0 KB/s',
                    status: 'completed'
                });
                resolve();
            });

            writer.on('error', (error) => {
                console.error(`[Download ${id}] Direct download: Write stream error:`, error.message);
                delete activeDownloads[id];
                reject(error);
            });

        } catch (error) {
            console.error(`[Download ${id}] Direct download: Axios error:`, error.message);
            if (error.response) {
                console.error(`[Download ${id}] Direct download: HTTP status ${error.response.status}`);
            }
            delete activeDownloads[id];
            reject(error);
        }
    });
}

async function downloadHLS(event, id, url, filePath) {
    return new Promise((resolve, reject) => {
        const ffmpegPath = 'ffmpeg';

        const args = [
            '-i', url,
            '-c', 'copy',
            '-bsf:a', 'aac_adtstoasc',
            '-y',
            filePath
        ];

        console.log(`[Download] ffmpeg command: ${ffmpegPath} ${args.join(' ')}`);

        const ffmpeg = spawn(ffmpegPath, args);
        if (activeDownloads[id]) activeDownloads[id].process = ffmpeg;

        let duration = 0;
        let progress = 0;

        ffmpeg.stderr.on('data', (data) => {
            const output = data.toString();

            const durationMatch = output.match(/Duration: (\d{2}):(\d{2}):(\d{2})/);
            if (durationMatch) {
                duration = parseInt(durationMatch[1]) * 3600 + parseInt(durationMatch[2]) * 60 + parseInt(durationMatch[3]);
            }

            const timeMatch = output.match(/time=(\d{2}):(\d{2}):(\d{2})/);
            if (timeMatch && duration > 0) {
                const currentTime = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]);
                progress = (currentTime / duration) * 100;

                event.sender.send('download-progress', {
                    id,
                    progress: Math.min(progress, 99),
                    speed: 'Processing...',
                    status: 'downloading'
                });
            }
        });

        ffmpeg.on('close', (code) => {
            delete activeDownloads[id];
            if (code === 0) {
                event.sender.send('download-progress', {
                    id,
                    progress: 100,
                    speed: '0 KB/s',
                    status: 'completed'
                });
                resolve();
            } else {
                reject(new Error(`ffmpeg exited with code ${code}`));
            }
        });

        ffmpeg.on('error', (error) => {
            delete activeDownloads[id];
            reject(error);
        });
    });
}

async function downloadStream(event, id, url, filePath) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        let bytesDownloaded = 0;

        const request = http.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`HTTP ${response.statusCode}`));
                return;
            }

            const writer = fs.createWriteStream(filePath);
            response.pipe(writer);

            response.on('data', (chunk) => {
                if (activeDownloads[id]?.cancelled) {
                    response.destroy();
                    writer.close();
                    reject(new Error('Download cancelled'));
                    return;
                }

                bytesDownloaded += chunk.length;
                const elapsed = (Date.now() - startTime) / 1000;
                const speed = bytesDownloaded / elapsed;

                event.sender.send('download-progress', {
                    id,
                    progress: 50,
                    speed: formatSpeed(speed),
                    status: 'downloading'
                });
            });

            writer.on('finish', () => {
                delete activeDownloads[id];
                event.sender.send('download-progress', {
                    id,
                    progress: 100,
                    speed: '0 KB/s',
                    status: 'completed'
                });
                resolve();
            });

            writer.on('error', (error) => {
                delete activeDownloads[id];
                reject(error);
            });
        });

        request.on('error', (error) => {
            delete activeDownloads[id];
            reject(error);
        });

        if (activeDownloads[id]) activeDownloads[id].request = request;
    });
}

async function downloadElectron(event, id, url, filePath) {
    return new Promise((resolve, reject) => {
        console.log(`[Download ${id}] Using Electron native download API`);

        if (!mainWindowRef) {
            reject(new Error('Main window not available'));
            return;
        }

        if (activeDownloads[id]?.cancelled) {
            reject(new Error('Download cancelled'));
            return;
        }

        mainWindowRef.webContents.downloadURL(url);

        const onDownloadStarted = (downloadEvent, item, webContents) => {
            const itemUrl = item.getURL();
            console.log(`[Download ${id}] Download item received for URL: ${itemUrl.substring(0, 60)}...`);

            if (itemUrl !== url) {
                console.log(`[Download ${id}] URL mismatch, ignoring this download item`);
                return;
            }

            mainWindowRef.webContents.session.removeListener('will-download', onDownloadStarted);

            item.setSavePath(filePath);
            console.log(`[Download ${id}] Native download started, saving to: ${filePath}`);

            if (activeDownloads[id]) activeDownloads[id].item = item;

            item.on('updated', (updateEvent, state) => {
                if (activeDownloads[id]?.cancelled) {
                    item.cancel();
                    return;
                }
                if (state === 'interrupted') {
                    console.log(`[Download ${id}] Interrupted but may be resumable`);
                } else if (state === 'progressing') {
                    if (item.isPaused()) {
                        console.log(`[Download ${id}] Paused`);
                    } else {
                        const total = item.getTotalBytes();
                        const received = item.getReceivedBytes();
                        const progress = total > 0 ? (received / total) * 100 : 0;

                        event.sender.send('download-progress', {
                            id,
                            progress: Math.min(progress, 99),
                            speed: 'Downloading...',
                            status: 'downloading'
                        });
                    }
                }
            });

            item.once('done', (doneEvent, state) => {
                delete activeDownloads[id];

                if (state === 'completed') {
                    console.log(`[Download ${id}] Native download completed successfully`);
                    event.sender.send('download-progress', {
                        id,
                        progress: 100,
                        speed: '0 KB/s',
                        status: 'completed'
                    });
                    resolve();
                } else {
                    console.error(`[Download ${id}] Native download failed with state: ${state}`);
                    reject(new Error(`Download ${state}`));
                }
            });
        };

        mainWindowRef.webContents.session.on('will-download', onDownloadStarted);

        const timeout = setTimeout(() => {
            mainWindowRef.webContents.session.removeListener('will-download', onDownloadStarted);
            reject(new Error('Download timeout - no download started within 30 seconds'));
        }, 30000);

        const originalListener = onDownloadStarted;
        const wrappedListener = (...args) => {
            clearTimeout(timeout);
            originalListener(...args);
        };
        mainWindowRef.webContents.session.on('will-download', wrappedListener);
    });
}

function initDownloadHandlers(ipcMain, getMainWindow, getProfileCachePaths) {
    mainWindowRef = null;
    getProfileCachePathsRef = getProfileCachePaths;

    const getWindow = () => {
        if (typeof getMainWindow === 'function') {
            return getMainWindow();
        }
        return getMainWindow;
    };

    ipcMain.handle('start-download', async (event, { id, url, name, profileId }) => {
        mainWindowRef = getWindow();
        downloadQueue.push({ id, url, name, profileId });
        console.log(`[Queue] ➕ Added "${name}" (${id}) to queue. Total in queue: ${downloadQueue.length}. Current active: ${currentDownload ? currentDownload.id : 'none'}`);
        processDownloadQueue();
        return { success: true, queued: true };
    });

    ipcMain.handle('cancel-download', async (event, { id }) => {
        console.log(`\n[Cancel] ⛔ Request to cancel: ${id}`);

        if (currentDownload && currentDownload.id === id) {
            console.log(`[Cancel] ⛔ This is the ACTIVE download. Queue size before cancel: ${downloadQueue.length}`);

            if (activeDownloads[id]) {
                activeDownloads[id].cancelled = true;

                if (activeDownloads[id].process) {
                    activeDownloads[id].process.kill();
                    console.log(`[Cancel] ✓ Killed ffmpeg process`);
                }
                if (activeDownloads[id].request) {
                    activeDownloads[id].request.destroy();
                    console.log(`[Cancel] ✓ Destroyed HTTP request`);
                }
                if (activeDownloads[id].item) {
                    activeDownloads[id].item.cancel();
                    console.log(`[Cancel] ✓ Cancelled Electron download`);
                }
            }

            event.sender.send('download-progress', {
                id,
                progress: 0,
                speed: '0 KB/s',
                status: 'cancelled'
            });

            setTimeout(() => {
                if (currentDownload && currentDownload.id === id) {
                    console.log(`[Cancel] ⚡ Forcing stop of ${id} (cleanup was slow).`);
                    delete activeDownloads[id];
                    finishTask(id);
                }
            }, 1000);
        } else {
            const queueIndex = downloadQueue.findIndex(item => item.id === id);
            if (queueIndex !== -1) {
                const removedItem = downloadQueue.splice(queueIndex, 1)[0];
                console.log(`[Queue] ➖ Removed "${removedItem.name}" from queue. Queue size: ${downloadQueue.length + 1} → ${downloadQueue.length}`);

                event.sender.send('download-progress', {
                    id,
                    progress: 0,
                    speed: '0 KB/s',
                    status: 'cancelled'
                });
            } else {
                console.log(`[Queue] ⚠️  Could not find ${id} in queue (size: ${downloadQueue.length}). Current active: ${currentDownload ? currentDownload.id : 'none'}`);
            }
        }

        return { success: true };
    });
}

module.exports = { initDownloadHandlers };
