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

// --- CRITICAL ERROR LOGGING ---
const LOG_FILE = path.join(__dirname, 'startup_error.log');

function logToFile(msg) {
    const timestamp = new Date().toISOString();
    const logMsg = `[${timestamp}] ${msg}\n`;
    try {
        fs.appendFileSync(LOG_FILE, logMsg);
    } catch (e) {}
}

process.on('uncaughtException', (error) => {
    const msg = `UNCAUGHT EXCEPTION: ${error.message}\n${error.stack}`;
    console.error(msg);
    logToFile(msg);
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    const msg = `UNHANDLED REJECTION: ${reason}`;
    console.error(msg);
    logToFile(msg);
});

logToFile("App starting...");

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

// --- Migration Logic ---
const migrateLegacyFiles = () => {
    const legacyM3U = path.join(USER_DATA_PATH, 'playlist.m3u');
    const legacyImageDir = path.join(USER_DATA_PATH, 'images');
    const targetPaths = getProfileCachePaths(TRENDY_ID);

    try {
        if (fs.existsSync(legacyM3U) && !fs.existsSync(targetPaths.m3u)) {
            console.log("Migrating legacy M3U file...");
            fs.renameSync(legacyM3U, targetPaths.m3u);
        }

        if (fs.existsSync(legacyImageDir)) {
            const files = fs.readdirSync(legacyImageDir);
            if (files.length > 0) {
                console.log(`Migrating ${files.length} legacy images...`);
                files.forEach(file => {
                    const oldPath = path.join(legacyImageDir, file);
                    const newPath = path.join(targetPaths.images, file);
                    if (!fs.existsSync(newPath)) {
                        fs.renameSync(oldPath, newPath);
                    } else {
                        fs.unlinkSync(oldPath);
                    }
                });
            }
            try { fs.rmdirSync(legacyImageDir); } catch(e) {}
        }
    } catch (err) {
        console.error("Migration failed:", err);
    }
};

migrateLegacyFiles();

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
  initChromecastHandlers(ipcMain, mainWindow);
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