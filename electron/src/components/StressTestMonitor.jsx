import React, { useEffect, useState } from 'react';
import { X, Thermometer, Activity, Gauge, Zap } from 'lucide-react';

const StressTestMonitor = ({ isOpen, onClose, streamUrl, settings }) => {
    const [stats, setStats] = useState({ fps: 0, speed: 0, bitrate: 0, frame: 0 });
    const [active, setActive] = useState(false);
    const [history, setHistory] = useState([]);

    useEffect(() => {
        if (isOpen && streamUrl) {
            console.log("Starting Stress Test for:", streamUrl);
            window.api.stressTestStart(streamUrl, settings);
            setActive(true);
            setStats({ fps: 0, speed: 0, bitrate: 0, frame: 0 });
            setHistory([]);
        } else if (!isOpen && active) {
            window.api.stressTestStop();
            setActive(false);
        }

        return () => {
            if (active) window.api.stressTestStop();
        };
    }, [isOpen, streamUrl]);

    useEffect(() => {
        const handleStats = (newStats) => {
            setStats(newStats);
            setHistory(prev => [...prev.slice(-49), newStats.speed]); // Keep last 50 points
        };

        const handleStop = (code) => {
            setActive(false);
            console.log("Stress test stopped with code:", code);
        };

        if (isOpen) {
            window.api.onStressTestStats(handleStats);
            window.api.onStressTestStopped(handleStop);
        }

        return () => {
            window.api.removeStressTestListeners();
        };
    }, [isOpen]);

    if (!isOpen) return null;

    const handleClose = () => {
        window.api.stressTestStop();
        onClose();
    };

    // Calculate stability score based on speed history
    const avgSpeed = history.length > 0 ? history.reduce((a, b) => a + b, 0) / history.length : 0;
    const stabilityColor = avgSpeed > 1.2 ? '#40c057' : avgSpeed > 0.95 ? '#ffd43b' : '#ff6b6b';
    const stabilityText = avgSpeed > 1.2 ? 'Excellent' : avgSpeed > 0.95 ? 'Good' : 'Critical';

    return (
        <div className="modal-overlay">
            <div className="transcoder-modal" style={{ width: '500px' }}>
                <div className="transcoder-header" style={{ background: '#e03131' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Thermometer size={24} color="#fff" />
                        <div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#fff' }}>Stress Test Active</div>
                            <div style={{ fontSize: '0.65rem', color: '#fff', opacity: 0.8, textTransform: 'uppercase' }}>Intercepted Playback Stream</div>
                        </div>
                    </div>
                    <button className="close-modal-btn" onClick={handleClose}><X size={20} /></button>
                </div>

                <div className="transcoder-body">
                    <div style={{ marginBottom: '20px', padding: '10px', background: '#25262b', borderRadius: '6px' }}>
                        <div style={{ fontSize: '0.75rem', color: '#909296', marginBottom: '4px' }}>Target Stream</div>
                        <div style={{ fontSize: '0.8rem', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {streamUrl}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
                        <div className="stat-card" style={{ background: '#1a1b1e', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
                            <Activity size={20} color="#339af0" style={{ marginBottom: '8px' }} />
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#fff' }}>{stats.fps}</div>
                            <div style={{ fontSize: '0.7rem', color: '#909296' }}>FPS</div>
                        </div>
                        <div className="stat-card" style={{ background: '#1a1b1e', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
                            <Gauge size={20} color={stabilityColor} style={{ marginBottom: '8px' }} />
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: stabilityColor }}>{stats.speed}x</div>
                            <div style={{ fontSize: '0.7rem', color: '#909296' }}>Transcode Speed</div>
                        </div>
                        <div className="stat-card" style={{ background: '#1a1b1e', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
                            <Zap size={20} color="#ffd43b" style={{ marginBottom: '8px' }} />
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#fff' }}>{(stats.bitrate / 1000).toFixed(1)}</div>
                            <div style={{ fontSize: '0.7rem', color: '#909296' }}>Mbps Output</div>
                        </div>
                        <div className="stat-card" style={{ background: '#1a1b1e', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: stabilityColor, marginTop: '28px' }}>{stabilityText}</div>
                            <div style={{ fontSize: '0.7rem', color: '#909296' }}>Stability Score</div>
                        </div>
                    </div>

                    {/* Simple Graph Visualization */}
                    <div style={{ height: '60px', display: 'flex', alignItems: 'flex-end', gap: '2px', background: '#1a1b1e', padding: '5px', borderRadius: '4px' }}>
                        {history.map((val, i) => (
                            <div key={i} style={{ 
                                width: '100%', 
                                background: val > 1 ? '#40c057' : '#ff6b6b', 
                                height: `${Math.min(val * 30, 100)}%`,
                                opacity: 0.7 
                            }} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StressTestMonitor;
