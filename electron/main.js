const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// --- Import Managers ---
const { initConfigHandlers } = require('./configManager');
const { initChromecastHandlers } = require('./chromecastManager');
const { initImageHandlers } = require('./imageManager');
const { initXCHandlers } = require('./xcApiProxy');
const { initDownloadHandlers } = require('./downloadManager');
const { initVLCHandlers } = require('./vlcManager');
const { initErrorHandlers } = require('./errorLogger');

// --- Initialize Error Handling ---
initErrorHandlers();

// --- Constants & Global Paths ---
const USER_DATA_PATH = app.getPath('userData');
const TRENDY_ID = "1704700000000";

const getProfileCachePaths = (profileId) => {
    const profileDir = path.join(USER_DATA_PATH, 'profiles', profileId);
    if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });

    const imageDir = path.join(profileDir, 'images');
    if (!fs.existsSync(imageDir)) fs.mkdirSync(imageDir, { recursive: true });

    return {
        profile: profileDir,
        m3u: path.join(profileDir, 'playlist.m3u'),
        images: imageDir
    };
};

// --- Window Management ---
let mainWindow;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false 
    },
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5180');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  // --- Initialize Modular Handlers ---
  const configManager = initConfigHandlers(ipcMain, dialog, mainWindow, USER_DATA_PATH, TRENDY_ID);
  initChromecastHandlers(ipcMain, mainWindow, configManager.getConfig);
  initImageHandlers(ipcMain, getProfileCachePaths);
  initXCHandlers(ipcMain);
  initDownloadHandlers(ipcMain, () => mainWindow, getProfileCachePaths);
  initVLCHandlers(ipcMain, configManager);
};

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

if (require('electron-squirrel-startup')) {
  app.quit();
}

app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport');
app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors');
app.commandLine.appendSwitch('disable-autofill');