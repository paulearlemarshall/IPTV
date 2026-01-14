const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  launchVLC: (url, path, title) => ipcRenderer.invoke('launch-vlc', url, path, title),
  selectVlcPath: () => ipcRenderer.invoke('select-vlc-path'),
  selectFfmpegPath: () => ipcRenderer.invoke('select-ffmpeg-path'),
  castScan: () => ipcRenderer.invoke('cast-scan'),
  getAvailableIps: () => ipcRenderer.invoke('get-available-ips'),
  castPlay: (device, url, metadata, proxyIp, streamType, contentType) => ipcRenderer.invoke('cast-play', device, url, metadata, proxyIp, streamType, contentType),
  castPlayFfmpeg: (device, url, metadata, proxyIp) => ipcRenderer.invoke('cast-play-ffmpeg', device, url, metadata, proxyIp),
  castStop: (device) => ipcRenderer.invoke('cast-stop', device),
  xcApi: (data) => ipcRenderer.invoke('xc-api', data),
  checkImageCache: (data) => ipcRenderer.invoke('check-image-cache', data),
  checkImageCacheBatch: (data) => ipcRenderer.invoke('check-image-cache-batch', data),
  cacheImage: (data) => ipcRenderer.invoke('cache-image', data),
  cleanupProfileImages: (data) => ipcRenderer.invoke('cleanup-profile-images', data),
  onCastDeviceFound: (callback) => ipcRenderer.on('cast-device-found', (event, name) => callback(name)),
  onDownloadLog: (callback) => ipcRenderer.on('download-log', (event, msg) => callback(msg)),
  config: {
      load: () => ipcRenderer.invoke('get-config'),
      save: (data) => ipcRenderer.invoke('save-config', data)
  },
  platform: process.platform,
  startDownload: (data) => ipcRenderer.invoke('start-download', data),
  cancelDownload: (data) => ipcRenderer.invoke('cancel-download', data),
  onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (event, data) => callback(data)),
  removeDownloadProgressListeners: () => ipcRenderer.removeAllListeners('download-progress')
});
