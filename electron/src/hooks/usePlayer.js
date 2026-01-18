import { useState, useCallback } from 'react';
import { getXcUrl, getXcLogoUrl } from '../utils/xc';

export function usePlayer({
    playerMode,
    selectedCastDevice,
    selectedSection,
    currentProfile,
    selectedServer,
    selectedProxyIp,
    transcoderSettings,
    ffmpegPath,
    fetchSeriesInfo
}) {
    const [currentStream, setCurrentStream] = useState(null);

    const playStream = useCallback(async (stream, type = selectedSection) => {
        if (type === 'series') {
            fetchSeriesInfo(stream.series_id);
            return;
        }
        
        const finalUrl = getXcUrl(stream, type, currentProfile, selectedServer);
        if (!finalUrl) return;
        
        if (playerMode === 'internal') {
            setCurrentStream({ ...stream, url: finalUrl });
        } else if (playerMode === 'cast') {
            const device = selectedCastDevice?.trim();
            if (!device || device === 'None' || device === '') {
                alert("No Chromecast selected. Please select a device from the dropdown.");
                return;
            }

            const isLive = type === 'live';
            const streamType = isLive ? 'LIVE' : 'BUFFERED';
            const ext = stream.container_extension || (isLive ? 'ts' : 'mp4');
            const mimeTypes = {
                'ts': 'video/mp2t',
                'm3u8': 'application/x-mpegURL',
                'mp4': 'video/mp4',
                'mkv': 'video/x-matroska'
            };
            const contentType = mimeTypes[ext] || 'video/mp2t';

            let metaType = 0;
            if (type === 'vod') metaType = 1;
            if (type === 'series' || type === 'episode') metaType = 2;

            const castMetadata = {
                title: stream.name || stream.title,
                subtitle: isLive ? 'Live TV' : (stream.release_date || stream.year || ''),
                images: [{ url: getXcLogoUrl(stream, selectedServer) }],
                type: metaType
            };

            if (transcoderSettings.enabled && ffmpegPath) {
                window.api.castPlayFfmpeg(device, finalUrl, castMetadata, selectedProxyIp, transcoderSettings);
            } else {
                window.api.castPlay(device, finalUrl, castMetadata, selectedProxyIp, streamType, contentType);
            }
        } else {
            window.api.launchVLC(finalUrl, null, stream.name || stream.title);
        }
    }, [playerMode, selectedCastDevice, selectedSection, currentProfile, selectedServer, fetchSeriesInfo, selectedProxyIp, transcoderSettings, ffmpegPath]);

    const closePlayer = useCallback(() => {
        setCurrentStream(null);
    }, []);

    return {
        currentStream,
        setCurrentStream,
        playStream,
        closePlayer
    };
}
