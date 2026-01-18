const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * Parses a "30/1" or "30000/1001" style FPS string
 */
function parseFPS(fpsString) {
    if (!fpsString) return 30; 
    try {
        if (fpsString.includes('/')) {
            const [num, den] = fpsString.split('/').map(Number);
            return num / den;
        }
        return parseFloat(fpsString);
    } catch (e) {
        return 30;
    }
}

function initStressTestHandlers(ipcMain, mainWindow, getConfigFunc) {
    let currentProcess = null;

    ipcMain.handle('stress-test-start', async (event, streamUrl, settings) => {
        if (currentProcess) {
            try { currentProcess.kill('SIGKILL'); } catch(e) {}
            currentProcess = null;
        }

        console.log(`[StressTest] Starting stress test for: ${streamUrl}`);
        
        let ffmpegPath = 'ffmpeg';
        try {
            const config = getConfigFunc();
            if (config?.ffmpegPath) {
                const binary = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
                const p = path.join(config.ffmpegPath, binary);
                if (fs.existsSync(p)) ffmpegPath = p;
                else if (fs.existsSync(path.join(config.ffmpegPath, 'bin', binary))) ffmpegPath = path.join(config.ffmpegPath, 'bin', binary);
            }
        } catch (e) {
            console.error('[StressTest] Config error:', e);
        }

        // --- Build Argument List (similar to chromecastTranscoder but for NUL output) ---
        // We want to mimic the transcoding load exactly, just discarding the bytes.

        const fullLadder = settings.ladder || [
            { id: 'v0', res: '1920:1080', bitrate: '6000k', level: '4.0' }
        ];
        const ladder = settings.adaptive !== false ? fullLadder : [fullLadder[0]];

        // 1. Build Filter Complex
        const splitCount = ladder.length;
        let filterComplex = '';
        if (splitCount > 1) {
            filterComplex = `[0:v]split=${splitCount}`;
            ladder.forEach((_, i) => filterComplex += `[v${i}_in]`);
            filterComplex += '; ';
            ladder.forEach((rung, i) => {
                const [w, h] = rung.res.split(':');
                filterComplex += `[v${i}_in]scale=${w}:${h}:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2[v${i}_out]${i < splitCount - 1 ? '; ' : ''}`;
            });
        } else {
            const [w, h] = ladder[0].res.split(':');
            filterComplex = `[0:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2[v0_out]`;
        }

        // 2. Build Mapping and Encoding Args
        const mappingArgs = [];
        const encodingArgs = [];
        
        ladder.forEach((rung, i) => {
            mappingArgs.push('-map', `[v${i}_out]`, '-map', '0:a:0?');
            encodingArgs.push(
                `-c:v:${i}`, 'libx264',
                `-profile:v:${i}`, 'main',
                `-level:v:${i}`, rung.level || '4.0',
                `-b:v:${i}`, rung.bitrate || '4000k'
            );
        });

        const args = [
            '-hide_banner', '-loglevel', 'info', // info needed to see speed/fps stats
        ];

        if (settings.hardware_accel === 'on' || (settings.hardware_accel === 'auto' && process.platform === 'win32')) {
            args.push('-hwaccel', 'auto');
        }

        if (settings.reconnect !== false) {
            args.push('-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5');
        }

        args.push('-i', streamUrl);
        args.push('-filter_complex', filterComplex);
        args.push(...mappingArgs);
        args.push(...encodingArgs);

        // Global params
        args.push(
            '-pix_fmt', settings.pixel_format || 'yuv420p',
            '-preset', settings.preset || 'ultrafast',
            '-tune', settings.tune || 'zerolatency'
        );
        
        // Honor UI Stability Settings
        args.push(
            '-g', String(settings.gop_size || 48),
            '-keyint_min', String(settings.keyint_min || 48),
            '-sc_threshold', String(settings.sc_threshold !== undefined ? settings.sc_threshold : 0)
        );

        // Audio - fully honor UI settings
        args.push(
            '-c:a', settings.audio_codec || 'aac',
            '-ac', String(settings.audio_channels || 2),
            '-ar', String(settings.audio_sample_rate || 48000),
            '-b:a', settings.audio_bitrate || '128k'
        );

        // Output to NULL
        // On Windows: NUL, Linux/Mac: /dev/null
        const nullOutput = process.platform === 'win32' ? 'NUL' : '/dev/null';
        
        // Use mpegts container format for the null output to simulate the overhead of packetizing
        args.push('-f', 'mpegts', nullOutput);

        console.log(`[StressTest] Executing: ${ffmpegPath} ${args.join(' ')}`);

        currentProcess = spawn(ffmpegPath, args);

        currentProcess.stderr.on('data', (data) => {
            const text = data.toString();
            // Parse real-time stats
            // frame=  234 fps= 30 q=28.0 size=    1234kB time=00:00:10.55 bitrate= 958.4kbits/s speed=1.02x
            const fpsMatch = text.match(/fps=\s*([\d.]+)/);
            const speedMatch = text.match(/speed=\s*([\d.]+)x/);
            const bitrateMatch = text.match(/bitrate=\s*([\d.]+)kbits\/s/);
            const frameMatch = text.match(/frame=\s*(\d+)/);

            if (fpsMatch || speedMatch) {
                const stats = {
                    fps: fpsMatch ? parseFloat(fpsMatch[1]) : 0,
                    speed: speedMatch ? parseFloat(speedMatch[1]) : 0,
                    bitrate: bitrateMatch ? parseFloat(bitrateMatch[1]) : 0,
                    frame: frameMatch ? parseInt(frameMatch[1]) : 0
                };
                mainWindow.webContents.send('stress-test-stats', stats);
                // Also echo to console as requested
                // console.log(`[StressTest Stats] FPS: ${stats.fps}, Speed: ${stats.speed}x`);
            }
        });

        currentProcess.on('close', (code) => {
            console.log(`[StressTest] Process exited with code ${code}`);
            mainWindow.webContents.send('stress-test-stopped', code);
            currentProcess = null;
        });

        return { success: true };
    });

    ipcMain.handle('stress-test-stop', () => {
        if (currentProcess) {
            console.log(`[StressTest] Stopping manually...`);
            currentProcess.kill('SIGKILL');
            currentProcess = null;
        }
        return { success: true };
    });
}

module.exports = { initStressTestHandlers };
