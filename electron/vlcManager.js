const { spawn } = require('child_process');
const fs = require('fs');

function initVLCHandlers(ipcMain, configManager) {
    let vlcProcess = null;

    ipcMain.handle('launch-vlc', async (event, streamUrl, customVlcPath, title) => {
        try {
            let vlcPath = customVlcPath;
            if (!vlcPath) {
                if (fs.existsSync(configManager.CONFIG_FILE)) {
                    const config = configManager.parseINI(fs.readFileSync(configManager.CONFIG_FILE, 'utf-8'));
                    vlcPath = config.vlcPath;
                }
            }

            if (!vlcPath) {
                vlcPath = process.platform === 'win32' 
                    ? 'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe' 
                    : (process.platform === 'darwin' ? '/Applications/VLC.app/Contents/MacOS/VLC' : 'vlc');
            }

            // Close existing VLC process if running to enforce single instance / reuse window
            if (vlcProcess && !vlcProcess.killed) {
                console.log(`Closing existing VLC process...`);
                vlcProcess.kill();
                vlcProcess = null;
                // Wait a bit for VLC to release resources
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            console.log(`Launching VLC: ${vlcPath} -> ${streamUrl}`);

            const args = [streamUrl, '--one-instance', '--playlist-enqueue'];
            if (title) args.push(`--meta-title=${title}`);
            
            vlcProcess = spawn(vlcPath, args, { stdio: 'ignore' });

            vlcProcess.on('exit', () => {
                console.log(`VLC process exited`);
                vlcProcess = null;
            });

            return { success: true };
        } catch (error) {
            console.error('VLC Launch Error:', error.message);
            return { success: false, error: error.message };
        }
    });

    return { 
        getVlcProcess: () => vlcProcess,
        killVlc: () => {
            if (vlcProcess) vlcProcess.kill();
        }
    };
}

module.exports = { initVLCHandlers };
