const { fs, path } = require('electron');
const fsExtra = require('fs'); // Using standard fs for simpler path operations if needed

function initConfigHandlers(ipcMain, dialog, mainWindow, USER_DATA_PATH, TRENDY_ID) {
    const CONFIG_FILE = require('path').join(USER_DATA_PATH, 'config.ini');

    const stringifyINI = (config) => {
        let output = "[Settings]\n";
        output += "activeProfileId=" + (config.activeProfileId || "") + "\n";
        output += "vlcPath=" + (config.vlcPath || "") + "\n";
        output += "ffmpegPath=" + (config.ffmpegPath || "") + "\n\n";
        (config.profiles || []).forEach(p => {
            output += `[Profile_${p.id}]\nid=${p.id}\nname=${p.name}\nusername=${p.username}\npassword=${p.password}\nservers=${(p.servers || []).join(',')}\nfavorites=${(p.favorites || []).join(',')}\n\n`;
        });
        return output;
    };

    const parseINI = (data) => {
        const lines = data.split(/\r?\n/);
        const config = { profiles: [], activeProfileId: null, vlcPath: null, ffmpegPath: null };
        let currentProfile = null;
        let currentSection = null;

        lines.forEach(line => {
            line = line.trim();
            if (!line || line.startsWith(';')) return;
            const sectionMatch = line.match(/^\s*\[(.+?)\]\s*$/);
            if (sectionMatch) {
                currentSection = sectionMatch[1];
                if (currentSection.startsWith('Profile_')) {
                    currentProfile = {};
                    config.profiles.push(currentProfile);
                } else {
                    currentProfile = null;
                }
                return;
            }
            const [key, ...valParts] = line.split('=');
            const value = valParts.join('=').trim();
            if (currentSection === 'Settings') {
                if (key === 'activeProfileId') config.activeProfileId = value || null;
                if (key === 'vlcPath') config.vlcPath = value || null;
                if (key === 'ffmpegPath') config.ffmpegPath = value || null;
            } else if (currentProfile) {
                if (key === 'servers' || key === 'favorites') {
                    currentProfile[key] = value ? value.split(',') : [];
                } else {
                    currentProfile[key] = value;
                }
            }
        });
        return config;
    };

    ipcMain.handle('get-config', async () => {
        const fs = require('fs');
        if (!fs.existsSync(CONFIG_FILE)) {
            const initial = { 
                activeProfileId: TRENDY_ID, 
                vlcPath: process.platform === 'win32' ? 'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe' : '', 
                profiles: [{
                    id: TRENDY_ID, 
                    name: "Trendystream", 
                    username: "c91392c3e194", 
                    password: "7657840f7676", 
                    servers: ["http://vpn.tsclean.cc","http://line.tsclean.cc","http://line.protv.cc:8000","http://line.beetx.cc"]
                }] 
            };
            fs.writeFileSync(CONFIG_FILE, stringifyINI(initial));
            return initial;
        }

        return parseINI(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    });

    ipcMain.handle('select-vlc-path', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Select VLC Executable',
            properties: ['openFile'],
            filters: [
                { name: 'Executables', extensions: ['exe', 'app', 'bin'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });

        if (!result.canceled && result.filePaths.length > 0) {
            return result.filePaths[0];
        }
        return null;
    });

    ipcMain.handle('select-ffmpeg-path', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Select FFmpeg Folder (containing ffmpeg binaries)',
            properties: ['openDirectory']
        });

        if (!result.canceled && result.filePaths.length > 0) {
            return result.filePaths[0];
        }
        return null;
    });

    ipcMain.handle('save-config', async (event, config) => {
        const fs = require('fs');
        try {
            fs.writeFileSync(CONFIG_FILE, stringifyINI(config));
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    // Helper function to get config (for use by other modules)
    const getConfig = () => {
        const fs = require('fs');
        if (!fs.existsSync(CONFIG_FILE)) {
            return { activeProfileId: null, vlcPath: null, ffmpegPath: null, profiles: [] };
        }
        return parseINI(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    };

    // Also export parseINI for use in other modules (like launch-vlc)
    return { parseINI, CONFIG_FILE, getConfig };
}

module.exports = { initConfigHandlers };
