import React, { useState } from 'react';
import { X, Settings2, Plus, MinusCircle, RotateCcw, Zap, Brain, ShieldAlert, Cpu } from 'lucide-react';

const DEFAULTS = {
    enabled: false,
    intelligent: true,
    adaptive: true,
    preset: 'ultrafast',
    tune: 'zerolatency',
    hls_time: 4,
    hls_list_size: 6,
    ladder: [
        { id: 'v0', res: '1920:1080', bitrate: '6000k', level: '4.0' },
        { id: 'v1', res: '1280:720', bitrate: '3000k', level: '3.1' }
    ],
    // Advanced Stability
    gop_size: 48,
    keyint_min: 48,
    sc_threshold: 0,
    pixel_format: 'yuv420p',
    audio_codec: 'aac',
    audio_channels: 2,
    audio_sample_rate: 48000,
    audio_bitrate: '128k',
    hls_flags: ['delete_segments', 'append_list', 'independent_segments'],
    segment_type: 'mpegts',
    reconnect: true,
    hardware_accel: 'auto'
};

const PRESETS = ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium'];
const TUNES = ['zerolatency', 'film', 'animation'];
const RESOLUTIONS = [
    { label: '1920×1080', val: '1920:1080', height: 1080 },
    { label: '1280×720', val: '1280:720', height: 720 },
    { label: '854×480', val: '854:480', height: 480 },
    { label: '640×360', val: '640:360', height: 360 }
];

// Constraints Mapping
const LEVEL_CONSTRAINTS = {
    '4.1': { min_br: 4000, max_br: 8000, label: 'L4.1 (High Def)' },
    '4.0': { min_br: 3000, max_br: 8000, label: 'L4.0 (High Def)' },
    '3.1': { min_br: 1500, max_br: 4000, label: 'L3.1 (Standard)' },
    '3.0': { min_br: 500,  max_br: 2000, label: 'L3.0 (Low Def)' }
};

const RES_TO_LEVELS = {
    '1920:1080': ['4.0', '4.1'],
    '1280:720':  ['3.1', '4.0'],
    '854:480':   ['3.0', '3.1'],
    '640:360':   ['3.0']
};

const LEVELS = ['3.0', '3.1', '4.0', '4.1'];
const AUDIO_RATES = [44100, 48000];
const AUDIO_BITRATES = ['96k', '128k', '160k', '192k'];
const HW_ACCEL = ['auto', 'on', 'off'];

const TranscoderSettingsModal = ({ isOpen, onClose, settings, onSave }) => {
    // Ensure localSettings always has defaults even if settings is an empty object
    const [localSettings, setLocalSettings] = useState(() => ({
        ...DEFAULTS,
        ...(settings || {})
    }));
    const [errors, setErrors] = useState([]);

    // Sync local state when modal opens or settings change from parent
    React.useEffect(() => {
        if (isOpen && settings) {
            setLocalSettings({ ...DEFAULTS, ...settings });
        }
    }, [isOpen, settings]);

    if (!isOpen) return null;

    const updateField = (field, value) => {
        setLocalSettings(prev => ({ ...prev, [field]: value }));
    };

    const updateLadderEntry = (index, field, value) => {
        const newLadder = [...(localSettings.ladder || [])];
        if (!newLadder[index]) return;

        let entry = { ...newLadder[index], [field]: value };

        // Dependency: If resolution changed, update level if current is invalid
        if (field === 'res') {
            const allowedLevels = RES_TO_LEVELS[value];
            if (!allowedLevels.includes(entry.level)) {
                entry.level = allowedLevels[0];
            }
        }

        // Dependency: If level changed, clamp bitrate
        const bounds = LEVEL_CONSTRAINTS[entry.level];
        let brNum = parseInt(entry.bitrate);
        if (brNum < bounds.min_br) entry.bitrate = bounds.min_br + 'k';
        if (brNum > bounds.max_br) entry.bitrate = bounds.max_br + 'k';

        newLadder[index] = entry;
        updateField('ladder', newLadder);
    };

    const validateLadder = () => {
        const ladder = localSettings.ladder || [];
        const errs = [];
        const seenCombinations = new Set();

        for (let i = 0; i < ladder.length; i++) {
            const current = ladder[i];
            const currentHeight = RESOLUTIONS.find(r => r.val === current.res)?.height || 0;
            const currentBr = parseInt(current.bitrate);
            const combo = `${current.res}-${current.level}`;

            // 1. Duplicate check
            if (seenCombinations.has(combo)) {
                errs.push(`Duplicate configuration at Rung ${current.id} (${current.res} @ L${current.level})`);
            }
            seenCombinations.add(combo);

            // 2. Descending check
            if (i > 0) {
                const prev = ladder[i - 1];
                const prevHeight = RESOLUTIONS.find(r => r.val === prev.res)?.height || 0;
                const prevBr = parseInt(prev.bitrate);

                if (currentHeight > prevHeight) {
                    errs.push(`Resolution conflict: Rung ${current.id} is higher than Rung ${prev.id}`);
                }
                if (currentBr > prevBr) {
                    errs.push(`Bitrate conflict: Rung ${current.id} (${currentBr}k) is higher than Rung ${prev.id} (${prevBr}k)`);
                }
            }
        }

        setErrors(errs);
        return errs.length === 0;
    };

    const addLadderEntry = () => {
        const currentLadder = localSettings.ladder || [];
        if (currentLadder.length >= 5) return;
        
        const last = currentLadder[currentLadder.length - 1];
        const nextId = `v${currentLadder.length}`;
        // Smart default: lower or equal to last rung
        const nextEntry = last 
            ? { ...last, id: nextId, bitrate: Math.max(1000, parseInt(last.bitrate) - 1000) + 'k' }
            : { id: nextId, res: '1280:720', bitrate: '3000k', level: '3.1' };
            
        updateField('ladder', [...currentLadder, nextEntry]);
    };

    const removeLadderEntry = (index) => {
        const currentLadder = localSettings.ladder || [];
        if (currentLadder.length <= 1) return;
        const newLadder = currentLadder.filter((_, i) => i !== index);
        const reindexed = newLadder.map((rung, i) => ({ ...rung, id: `v${i}` }));
        updateField('ladder', reindexed);
    };

    const toggleHlsFlag = (flag) => {
        const current = localSettings.hls_flags || [];
        const next = current.includes(flag) ? current.filter(f => f !== flag) : [...current, flag];
        updateField('hls_flags', next);
    };

    const handleSave = () => {
        if (validateLadder()) {
            onSave(localSettings);
            onClose();
        }
    };

    const generatePreviewCommand = () => {
        const s = localSettings;
        const currentLadder = s.ladder || DEFAULTS.ladder;
        const ladder = s.adaptive ? currentLadder : [currentLadder[0]];
        
        if (!ladder || !ladder[0]) return 'FFmpeg command unavailable: No rungs defined.';

        // 1. Filter Complex
        let filterComplex = '';
        if (ladder.length > 1) {
            filterComplex = `[0:v]split=${ladder.length}`;
            ladder.forEach((_, i) => filterComplex += `[v${i}_in]`);
            filterComplex += '; ';
            ladder.forEach((rung, i) => {
                const [w, h] = (rung.res || '1280:720').split(':');
                filterComplex += `[v${i}_in]scale=${w}:${h}:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2[v${i}_out]${i < ladder.length - 1 ? '; ' : ''}`;
            });
        } else {
            const [w, h] = (ladder[0].res || '1280:720').split(':');
            filterComplex = `[0:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2[v0_out]`;
        }

        // 2. Mapping & Encoding
        let maps = '';
        let encoding = '';
        let varMap = [];
        ladder.forEach((rung, i) => {
            maps += `-map "[v${i}_out]" -map 0:a:0? `;
            encoding += `-c:v:${i} libx264 -profile:v:${i} main -level:v:${i} ${rung.level || '4.0'} -b:v:${i} ${rung.bitrate || '3000k'} `;
            varMap.push(`v:${i},a:${i}`);
        });

        const hw = s.hardware_accel === 'on' ? '-hwaccel auto ' : '';
        const reconnect = s.reconnect ? '-reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5 ' : '';

        return `ffmpeg ${hw}${reconnect}-i <INPUT_URL> \\
  -filter_complex "${filterComplex}" \\
  ${maps.trim()} \\
  ${encoding.trim()} \\
  -pix_fmt ${s.pixel_format || 'yuv420p'} -preset ${s.preset || 'ultrafast'} -tune ${s.tune || 'zerolatency'} \\
  -g ${s.gop_size || 48} -keyint_min ${s.keyint_min || 48} -sc_threshold ${s.sc_threshold || 0} \\
  -c:a ${s.audio_codec || 'aac'} -ac ${s.audio_channels || 2} -ar ${s.audio_sample_rate || 48000} -b:a ${s.audio_bitrate || '128k'} \\
  -f hls -hls_time ${s.hls_time || 4} -hls_list_size ${s.hls_list_size || 6} \\
  -hls_flags ${(s.hls_flags || []).join('+')} \\
  -var_stream_map "${varMap.join(' ')}" \\
  -master_pl_name master.m3u8 -hls_segment_filename "v%v/seg_%03d.ts" v%v/index.m3u8`;
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="transcoder-modal" onClick={e => e.stopPropagation()}>
                <div className="transcoder-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Settings2 size={24} color="#ffd43b" />
                        <div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#fff' }}>Transcoder Engine</div>
                            <div style={{ fontSize: '0.65rem', color: '#5c5f66', textTransform: 'uppercase', letterSpacing: '1px' }}>Validated Ladder Architecture</div>
                        </div>
                    </div>
                    <button className="close-modal-btn" onClick={onClose}><X size={20} /></button>
                </div>

                <div className="transcoder-body">
                    {/* --- ERROR DISPLAY --- */}
                    {errors.length > 0 && (
                        <div style={{ background: 'rgba(255, 107, 107, 0.15)', border: '1px solid #ff6b6b', borderRadius: '6px', padding: '12px', marginBottom: '20px' }}>
                            <div style={{ color: '#ff6b6b', fontSize: '0.8rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                <ShieldAlert size={16} /> Ladder Validation Failed
                            </div>
                            <ul style={{ margin: 0, paddingLeft: '20px', color: '#ff8787', fontSize: '0.75rem', lineHeight: '1.5' }}>
                                {errors.map((e, idx) => <li key={idx}>{e}</li>)}
                            </ul>
                        </div>
                    )}

                    {/* --- PREVIEW SECTION --- */}
                    <div className="setting-group" style={{ marginBottom: '20px' }}>
                        <h3 style={{ color: '#ffd43b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Cpu size={14} /> Generated FFmpeg Command Preview
                        </h3>
                        <div style={{ 
                            background: '#000', 
                            padding: '12px', 
                            borderRadius: '6px', 
                            fontSize: '0.7rem', 
                            fontFamily: 'monospace', 
                            color: '#40c057',
                            whiteSpace: 'pre-wrap',
                            border: '1px solid #25262b',
                            lineHeight: '1.4',
                            maxHeight: '150px',
                            overflowY: 'auto'
                        }}>
                            {generatePreviewCommand()}
                        </div>
                    </div>

                    {/* --- COMMON TUNING --- */}
                    <div className="setting-group">
                        <h3>Common Tuning & Logic</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                            <div className={`toggle-card ${localSettings.enabled ? 'active' : ''}`}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <Zap size={18} color={localSettings.enabled ? '#ffd43b' : '#5c5f66'} />
                                    <div><div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#fff' }}>Force Transcode</div><div style={{ fontSize: '0.6rem', color: '#5c5f66' }}>Global System Toggle</div></div>
                                </div>
                                <label className="switch">
                                    <input type="checkbox" checked={localSettings.enabled} onChange={() => updateField('enabled', !localSettings.enabled)} />
                                    <span className="slider"></span>
                                </label>
                            </div>
                            <div className={`toggle-card intelligent ${localSettings.intelligent ? 'active' : ''}`}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <Brain size={18} color={localSettings.intelligent ? '#339af0' : '#5c5f66'} />
                                    <div><div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#fff' }}>Intelligent Mode</div><div style={{ fontSize: '0.6rem', color: '#5c5f66' }}>Smart Probe Source</div></div>
                                </div>
                                <label className="switch">
                                    <input type="checkbox" checked={localSettings.intelligent} onChange={() => updateField('intelligent', !localSettings.intelligent)} />
                                    <span className="slider blue"></span>
                                </label>
                            </div>
                            <div className={`toggle-card ${localSettings.adaptive ? 'active' : ''}`} style={{ gridColumn: 'span 2' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <Cpu size={18} color={localSettings.adaptive ? '#ffd43b' : '#5c5f66'} />
                                    <div><div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#fff' }}>Adaptive Ladder Enable</div><div style={{ fontSize: '0.6rem', color: '#5c5f66' }}>Multi-rung simultaneous streams</div></div>
                                </div>
                                <label className="switch">
                                    <input type="checkbox" checked={localSettings.adaptive} onChange={() => updateField('adaptive', !localSettings.adaptive)} />
                                    <span className="slider"></span>
                                </label>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                            <div className="input-field">
                                <label>Encoding Preset</label>
                                <select value={localSettings.preset} onChange={(e) => updateField('preset', e.target.value)}>
                                    {PRESETS.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>
                            <div className="input-field">
                                <label>Tuning Mode</label>
                                <select value={localSettings.tune} onChange={(e) => updateField('tune', e.target.value)}>
                                    {TUNES.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div className="input-field">
                                <label>Segment Duration: {localSettings.hls_time}s</label>
                                <input type="range" min="2" max="10" step="1" value={localSettings.hls_time} onChange={(e) => updateField('hls_time', parseInt(e.target.value))} />
                            </div>
                            <div className="input-field">
                                <label>HLS Segment Retention: {localSettings.hls_list_size} segments</label>
                                <div style={{ fontSize: '0.65rem', color: '#909296', marginBottom: '4px', lineHeight: '1.2' }}>Defines the rolling number of segments kept</div>
                                <input type="range" min="3" max="12" step="1" value={localSettings.hls_list_size} onChange={(e) => updateField('hls_list_size', parseInt(e.target.value))} />
                            </div>
                        </div>
                    </div>

                    {/* --- TRANSCODING RUNGS --- */}
                    <div className="setting-group">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                            <h3 style={{ margin: 0, border: 'none' }}>Transcoding Rungs (Max 5)</h3>
                            <button className="btn-add" onClick={addLadderEntry} disabled={(!localSettings.adaptive && localSettings.ladder.length >= 1) || localSettings.ladder.length >= 5}>
                                <Plus size={12} /> Add Rung
                            </button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {localSettings.ladder.map((rung, index) => (
                                (!localSettings.adaptive && index > 0) ? null : (
                                <div key={index} className="ladder-rung">
                                    <div className="rung-id">{rung.id}</div>
                                    <div className="rung-inputs">
                                        <div className="input-field">
                                            <label>Resolution</label>
                                            <select value={rung.res} onChange={(e) => updateLadderEntry(index, 'res', e.target.value)}>
                                                {RESOLUTIONS.map(r => <option key={r.val} value={r.val}>{r.label}</option>)}
                                            </select>
                                        </div>
                                        <div className="input-field">
                                            <label>Bitrate: {rung.bitrate}</label>
                                            <input 
                                                type="range" 
                                                min={LEVEL_CONSTRAINTS[rung.level].min_br} 
                                                max={LEVEL_CONSTRAINTS[rung.level].max_br} 
                                                step="100" 
                                                value={parseInt(rung.bitrate)} 
                                                onChange={(e) => updateLadderEntry(index, 'bitrate', e.target.value + 'k')} 
                                            />
                                        </div>
                                        <div className="input-field">
                                            <label>H.264 Level</label>
                                            <select value={rung.level} onChange={(e) => updateLadderEntry(index, 'level', e.target.value)}>
                                                {RES_TO_LEVELS[rung.res].map(l => (
                                                    <option key={l} value={l}>{l} - {LEVEL_CONSTRAINTS[l].label}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    {localSettings.adaptive && <button className="btn-remove" onClick={() => removeLadderEntry(index)}><MinusCircle size={18} /></button>}
                                </div>
                                )
                            ))}
                        </div>
                    </div>

                    {/* --- STABILITY PARAMETERS (ADVANCED) --- */}
                    <div className="setting-group">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <h3 style={{ color: '#ff6b6b', margin: 0, border: 'none' }}><ShieldAlert size={14} style={{ marginRight: '6px' }} /> Stability Parameters (Advanced)</h3>
                            <label className="checkbox-item" style={{ fontSize: '0.75rem', color: localSettings.auto_calc_gop ? '#ffd43b' : '#909296' }}>
                                <input type="checkbox" checked={localSettings.auto_calc_gop !== false} onChange={() => updateField('auto_calc_gop', !localSettings.auto_calc_gop)} /> 
                                Auto-Align GOP (Rec.)
                            </label>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px' }}>
                            <div className="input-field" style={{ opacity: localSettings.auto_calc_gop ? 0.5 : 1 }}>
                                <label>GOP Size {localSettings.auto_calc_gop && '(Auto)'}</label>
                                <input type="number" min="24" max="240" disabled={localSettings.auto_calc_gop} value={localSettings.gop_size} onChange={e => updateField('gop_size', parseInt(e.target.value))} />
                            </div>
                            <div className="input-field" style={{ opacity: localSettings.auto_calc_gop ? 0.5 : 1 }}>
                                <label>Min Keyint {localSettings.auto_calc_gop && '(Auto)'}</label>
                                <input type="number" min="24" max="240" disabled={localSettings.auto_calc_gop} value={localSettings.keyint_min} onChange={e => updateField('keyint_min', parseInt(e.target.value))} />
                            </div>
                            <div className="input-field"><label>Sc-Threshold (0-100)</label><input type="number" min="0" max="100" value={localSettings.sc_threshold} onChange={e => updateField('sc_threshold', parseInt(e.target.value))} /></div>
                            <div className="input-field"><label>Audio Rate</label><select value={localSettings.audio_sample_rate} onChange={e => updateField('audio_sample_rate', parseInt(e.target.value))}>{AUDIO_RATES.map(r => <option key={r} value={r}>{r} Hz</option>)}</select></div>
                            <div className="input-field"><label>Audio Bitrate</label><select value={localSettings.audio_bitrate} onChange={e => updateField('audio_bitrate', e.target.value)}>{AUDIO_BITRATES.map(b => <option key={b} value={b}>{b}</option>)}</select></div>
                            <div className="input-field"><label>Hardware Accel</label><select value={localSettings.hardware_accel} onChange={e => updateField('hardware_accel', e.target.value)}>{HW_ACCEL.map(h => <option key={h} value={h}>{h.toUpperCase()}</option>)}</select></div>
                        </div>
                        <div className="checkbox-group">
                            {['append_list', 'independent_segments'].map(f => (
                                <label key={f} className="checkbox-item"><input type="checkbox" checked={localSettings.hls_flags?.includes(f)} onChange={() => toggleHlsFlag(f)} /> {f.replace('_', ' ')}</label>
                            ))}
                            <label className="checkbox-item"><input type="checkbox" checked={localSettings.reconnect} onChange={() => updateField('reconnect', !localSettings.reconnect)} /> Stream Reconnect</label>
                        </div>
                    </div>
                </div>

                <div className="transcoder-footer">
                    <button className="btn" onClick={() => setLocalSettings(DEFAULTS)} style={{ color: '#909296' }}><RotateCcw size={14} /> Reset Defaults</button>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button className="btn" onClick={onClose}>Cancel</button>
                        <button className="btn btn-primary" onClick={handleSave} style={{ backgroundColor: (errors.length > 0) ? '#5c5f66' : '#ffd43b', color: (errors.length > 0) ? '#909296' : 'black', fontWeight: 'bold', cursor: (errors.length > 0) ? 'not-allowed' : 'pointer' }}>Apply Settings</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TranscoderSettingsModal;
