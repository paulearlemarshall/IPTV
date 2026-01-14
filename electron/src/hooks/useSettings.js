import { useState, useCallback } from 'react';

export function useSettings({ setStatus }) {
    const [ffmpegPath, setFfmpegPath] = useState(null);
    const [useTranscodeProxy, setUseTranscodeProxy] = useState(false);

    const loadSettings = useCallback(async () => {
        const config = await window.api.config.load();
        if (config.ffmpegPath) {
            setFfmpegPath(config.ffmpegPath);
        }
        return config;
    }, []);

    const handleVlcPathChange = useCallback(async () => {
        if (window.api && window.api.selectVlcPath) {
            const newPath = await window.api.selectVlcPath();
            if (newPath) {
                const config = await window.api.config.load();
                config.vlcPath = newPath;
                await window.api.config.save(config);
                setStatus(`VLC path updated: ${newPath}`);
            }
        }
    }, [setStatus]);

    const handleFfmpegPathChange = useCallback(async () => {
        if (window.api && window.api.selectFfmpegPath) {
            const newPath = await window.api.selectFfmpegPath();
            if (newPath) {
                const config = await window.api.config.load();
                config.ffmpegPath = newPath;
                await window.api.config.save(config);
                setFfmpegPath(newPath);
                setStatus(`FFmpeg path updated: ${newPath}`);
            }
        }
    }, [setStatus]);

    return {
        ffmpegPath,
        useTranscodeProxy,
        setUseTranscodeProxy,
        loadSettings,
        handleVlcPathChange,
        handleFfmpegPathChange
    };
}
