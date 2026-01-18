const http = require('http');
const url = require('url');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const HLS_BASE_DIR = path.join(os.tmpdir(), 'iptv_hls_cache');

/**
 * Deferred deletion to handle Windows file locks
 */
function deferredDelete(itemPath, attempts = 5) {
    if (!fs.existsSync(itemPath)) return;

    try {
        if (fs.lstatSync(itemPath).isDirectory()) {
            const files = fs.readdirSync(itemPath);
            files.forEach(f => deferredDelete(path.join(itemPath, f), attempts));
            try { fs.rmdirSync(itemPath); } catch(e) {}
        } else {
            fs.unlinkSync(itemPath);
        }
    } catch (e) {
        if (attempts > 0) {
            setTimeout(() => deferredDelete(itemPath, attempts - 1), 2000);
        }
    }
}

/**
 * Aggressive cleanup of HLS cache
 */
function purgeHlsCache() {
    console.log('[HLS Cleanup] Triggering HLS cache purge...');
    if (fs.existsSync(HLS_BASE_DIR)) {
        try {
            const files = fs.readdirSync(HLS_BASE_DIR);
            for (const file of files) {
                deferredDelete(path.join(HLS_BASE_DIR, file));
            }
        } catch (e) {
            console.error('[HLS Cleanup] Error reading cache directory:', e.message);
        }
    } else {
        fs.mkdirSync(HLS_BASE_DIR, { recursive: true });
    }
}

/**
 * Creates the HLS static server for serving transcoded segments
 */
function createHlsServer(port, getCurrentStreamCallback) {
    const server = http.createServer(async (req, res) => {
        const parsedUrl = url.parse(req.url, true);
        const parts = parsedUrl.pathname.split('/').filter(Boolean);
        console.log(`[HTTP Request] HLS Server: ${req.url}`);

        if (parts[0] === 'hls' && parts.length >= 3) {
            const requestId = parts[1];
            const relativePath = parts.slice(2).join(path.sep);
            const filePath = path.join(HLS_BASE_DIR, requestId, relativePath);

            if (fs.existsSync(filePath)) {
                if (relativePath.endsWith('.m3u8')) res.setHeader('Content-Type', 'application/x-mpegURL');
                else if (relativePath.endsWith('.ts')) res.setHeader('Content-Type', 'video/mp2t');
                
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Cache-Control', 'no-cache');
                
                const currentStream = getCurrentStreamCallback();
                if (currentStream && currentStream.killTimeout) {
                    console.log(`[FFmpeg Lifecycle] Activity detected, cancelling kill timeout`);
                    clearTimeout(currentStream.killTimeout);
                    currentStream.killTimeout = null;
                }

                fs.createReadStream(filePath).pipe(res);
                return;
            } else {
                res.statusCode = 404;
                return res.end();
            }
        }
        res.statusCode = 404;
        res.end();
    });

    server.listen(port, '0.0.0.0', () => {
        console.log(`[Init] HLS server listening on port ${port}`);
    });

    return server;
}

/**
 * Probes a stream using ffprobe to retrieve both video and audio details
 */
async function probeStream(streamUrl, getConfigFunc) {
    console.log(`[Source Detection] Probing stream: ${streamUrl}`);
    
    let ffprobePath = 'ffprobe';
    try {
        const config = getConfigFunc();
        if (config && config.ffmpegPath) {
            const binary = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';
            const p = path.join(config.ffmpegPath, binary);
            if (fs.existsSync(p)) ffprobePath = p;
            else if (fs.existsSync(path.join(config.ffmpegPath, 'bin', binary))) ffprobePath = path.join(config.ffmpegPath, 'bin', binary);
        }
    } catch (e) {}

    const args = [
        '-v', 'error',
        '-show_streams',
        '-show_format',
        '-of', 'json',
        streamUrl
    ];
    console.log(`[Source Detection] Executing ffprobe: ${ffprobePath} ${args.join(' ')}`);

    return new Promise((resolve) => {
        const probe = spawn(ffprobePath, args);
        let output = '';
        probe.stdout.on('data', d => output += d);
        probe.on('close', (code) => {
            if (code !== 0) return resolve(null);
            try {
                const data = JSON.parse(output);
                if (!data.streams) return resolve(null);

                const video = data.streams.find(s => s.codec_type === 'video');
                const audio = data.streams.find(s => s.codec_type === 'audio');

                resolve({ 
                    video, 
                    audio,
                    format: data.format 
                });
            } catch (e) { resolve(null); }
        });
    });
}

/**
 * Strict Intelligent Mode decision logic
 */
function needsTranscoding(probeData) {
    if (!probeData || !probeData.video) {
        console.warn(`[Decision Engine] TRANSCODE FORCED: Missing or invalid probe metadata.`);
        return true;
    }

    const v = probeData.video;
    const a = probeData.audio;
    const reasons = [];

    // Explicitly parse and normalize types
    const v_codec = (v.codec_name || '').toLowerCase();
    const v_width = parseInt(v.width || 0);
    const v_height = parseInt(v.height || 0);
    const v_profile = v.profile || 'Unknown';
    const v_level = parseInt(v.level || 0);
    const v_pix_fmt = v.pix_fmt || 'Unknown';

    console.log(`[Decision Engine] Evaluating Intelligent Mode Rules...`);
    console.log(`  - Source Video: ${v_codec} (${v_width}x${v_height}), ${v_pix_fmt}, Profile: ${v_profile}, Level: ${v_level}`);
    
    if (a) {
        const a_codec = (a.codec_name || '').toLowerCase();
        const a_channels = parseInt(a.channels || 0);
        const a_sample_rate = parseInt(a.sample_rate || 0);
        console.log(`  - Source Audio: ${a_codec}, ${a_channels} ch, ${a_sample_rate} Hz`);
    } else {
        console.log(`  - Source Audio: NONE (Allowed for Direct Play)`);
    }

    // 1. Video Codec Check
    if (v_codec !== 'h264') {
        reasons.push(`Video codec is '${v_codec}', not H.264`);
    }

    // 2. Resolution Check
    if (v_width > 1920 || v_height > 1080) {
        reasons.push(`Resolution ${v_width}x${v_height} exceeds 1080p limit`);
    }

    // 3. Even Dimensions Check
    if (v_width % 2 !== 0 || v_height % 2 !== 0) {
        reasons.push(`Odd dimensions detected (${v_width}x${v_height}); even values required`);
    }

    // 4. Profile Check
    const incompatibleProfiles = ['High 10', 'High 4:2:2', 'High 4:4:4'];
    if (incompatibleProfiles.includes(v_profile)) {
        reasons.push(`Incompatible H.264 profile: '${v_profile}'`);
    }

    // 5. Level Check (Integer representation, e.g., 40 = 4.0)
    if (v_level > 40) {
        reasons.push(`H.264 Level ${v_level / 10} exceeds stable threshold (4.0)`);
    }

    // 6. Pixel Format Check
    if (v_pix_fmt !== 'yuv420p' && v_pix_fmt !== 'nv12') {
        reasons.push(`Pixel format is '${v_pix_fmt}', not 'yuv420p' or 'nv12'`);
    }

    // 7. Audio Compatibility Check (Only if audio exists)
    if (a) {
        const a_codec = (a.codec_name || '').toLowerCase();
        const a_channels = parseInt(a.channels || 0);

        if (a_codec !== 'aac' && a_codec !== 'mp3') {
            reasons.push(`Audio codec is '${a_codec}', not AAC/MP3`);
        }
        if (a_channels > 2) {
            reasons.push(`Audio has ${a_channels} channels; stereo (2) required for direct play bypass`);
        }
    }

    if (reasons.length > 0) {
        console.log(`[Decision Engine] RESULT: TRANSCODE REQUIRED`);
        reasons.forEach(r => console.log(`  => FAIL: ${r}`));
        return true;
    }

    console.log(`[Decision Engine] RESULT: DIRECT PLAY (Compatible)`);
    return false;
}

/**
 * Parses the r_frame_rate string (e.g. "30/1" or "30000/1001") into a number
 */
function parseFPS(fpsString) {
    if (!fpsString) return 30; // Default fallback
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

/**
 * Spawns the FFmpeg adaptive HLS process with a dynamic ladder
 */
function startTranscoding(streamUrl, hlsDir, getConfigFunc, settings, probeData = null) {
    // Resolved and clamped ladder based on adaptive setting
    const fullLadder = settings.ladder || [
        { id: 'v0', res: '1920:1080', bitrate: '6000k', level: '4.0' },
        { id: 'v1', res: '1280:720', bitrate: '3000k', level: '3.1' }
    ];

    // If adaptive is off, only use the first rung
    const ladder = settings.adaptive !== false ? fullLadder : [fullLadder[0]];

    const hlsTime = settings.hls_time || 4;
    
    // Dynamic GOP Calculation: Align I-frames with HLS segments
    let gop = settings.gop_size || 48;
    let keyint = settings.keyint_min || 48;

    // Only auto-calculate if enabled (default: true) AND probe data exists
    if (settings.auto_calc_gop !== false && probeData && probeData.video && probeData.video.r_frame_rate) {
        const fps = parseFPS(probeData.video.r_frame_rate);
        const calculatedGop = Math.round(fps * hlsTime);
        console.log(`[FFmpeg Lifecycle] Dynamic GOP Alignment: FPS(${fps.toFixed(2)}) * HLS_Time(${hlsTime}s) = ${calculatedGop}`);
        gop = calculatedGop;
        keyint = calculatedGop; // Force keyint to match gop for strict segment alignment
    }

    const sc = settings.sc_threshold !== undefined ? settings.sc_threshold : 0;

    console.log(`[FFmpeg Lifecycle] Resolved Transcoding Configuration:`);
    console.log(`  - Enabled: ${settings.enabled}`);
    console.log(`  - Intelligent: ${settings.intelligent}`);
    console.log(`  - Adaptive Ladder: ${settings.adaptive}`);
    console.log(`  - Preset: ${settings.preset || 'ultrafast'}`);
    console.log(`  - Tune: ${settings.tune || 'zerolatency'}`);
    console.log(`  - Hardware Accel: ${settings.hardware_accel || 'auto'}`);
    console.log(`  - Reconnect: ${settings.reconnect !== false}`);
    console.log(`  - GOP/Keyint/Sc: ${gop} / ${keyint} / ${sc}`);
    console.log(`  - HLS Segment Time: ${hlsTime}s`);
    console.log(`  - HLS Playlist Size: ${settings.hls_list_size || 6} segments`);
    console.log(`  - Audio: ${settings.audio_codec || 'aac'} @ ${settings.audio_bitrate || '128k'} (${settings.audio_sample_rate || 48000}Hz)`);
    console.log(`  - Rungs: ${ladder.length}`);
    ladder.forEach((r, i) => console.log(`    [${i}] ID: ${r.id}, Res: ${r.res}, Bitrate: ${r.bitrate}, Level: ${r.level}`));

    if (!fs.existsSync(hlsDir)) fs.mkdirSync(hlsDir, { recursive: true });
    
    // Prepare variant directories
    ladder.forEach(rung => {
        const rungDir = path.join(hlsDir, rung.id);
        if (!fs.existsSync(rungDir)) fs.mkdirSync(rungDir, { recursive: true });
    });

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
    const varStreamMap = [];

    ladder.forEach((rung, i) => {
        mappingArgs.push('-map', `[v${i}_out]`, '-map', '0:a:0?');
        
        encodingArgs.push(
            `-c:v:${i}`, 'libx264',
            `-profile:v:${i}`, 'main',
            `-level:v:${i}`, rung.level || '4.0',
            `-b:v:${i}`, rung.bitrate || '4000k'
        );

        varStreamMap.push(`v:${i},a:${i}`);
    });

    let ffmpegPath = 'ffmpeg';
    try {
        const config = getConfigFunc();
        if (config?.ffmpegPath) {
            const binary = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
            const p = path.join(config.ffmpegPath, binary);
            if (fs.existsSync(p)) ffmpegPath = p;
            else if (fs.existsSync(path.join(config.ffmpegPath, 'bin', binary))) ffmpegPath = path.join(config.ffmpegPath, 'bin', binary);
        }
    } catch (e) {}

    const ffmpegArgs = [
        '-hide_banner', '-loglevel', 'warning',
    ];

    // Hardware Acceleration
    if (settings.hardware_accel === 'on' || (settings.hardware_accel === 'auto' && process.platform === 'win32')) {
        ffmpegArgs.push('-hwaccel', 'auto');
    }

    // Reconnect behavior
    if (settings.reconnect !== false) {
        ffmpegArgs.push('-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5');
    }

    ffmpegArgs.push('-i', streamUrl);
    ffmpegArgs.push('-filter_complex', filterComplex);
    ffmpegArgs.push(...mappingArgs);
    ffmpegArgs.push(...encodingArgs);

    // Stability & Video Global Params
    ffmpegArgs.push(
        '-pix_fmt', settings.pixel_format || 'yuv420p',
        '-preset', settings.preset || 'ultrafast',
        '-tune', settings.tune && settings.tune !== 'none' ? settings.tune : 'zerolatency',
        '-g', String(gop),
        '-keyint_min', String(keyint),
        '-sc_threshold', String(sc)
    );

    // Audio Params
    ffmpegArgs.push(
        '-c:a', settings.audio_codec || 'aac',
        '-ac', String(settings.audio_channels || 2),
        '-ar', String(settings.audio_sample_rate || 48000),
        '-b:a', settings.audio_bitrate || '128k'
    );

    // Ensure delete_segments is always present for rolling window
    const baseFlags = settings.hls_flags || ['delete_segments', 'append_list', 'independent_segments'];
    const hlsFlags = [...new Set([...baseFlags, 'delete_segments'])];

    // HLS Output Params
    ffmpegArgs.push(
        '-f', 'hls',
        '-hls_time', String(hlsTime),
        '-hls_list_size', String(settings.hls_list_size || 6),
        '-hls_flags', hlsFlags.join('+'),
        '-hls_segment_type', settings.segment_type || 'mpegts',
        '-var_stream_map', varStreamMap.join(' '),
        '-master_pl_name', 'master.m3u8',
        '-hls_segment_filename', 'v%v/seg_%03d.ts',
        'v%v/index.m3u8'
    );

    console.log(`[FFmpeg Lifecycle] Executing: ${ffmpegPath} ${ffmpegArgs.join(' ')}`);
    
    return spawn(ffmpegPath, ffmpegArgs, { cwd: hlsDir });
}

module.exports = {
    HLS_BASE_DIR,
    deferredDelete,
    purgeHlsCache,
    createHlsServer,
    probeStream,
    needsTranscoding,
    startTranscoding
};
