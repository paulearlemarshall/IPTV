import { useState, useEffect, useCallback } from 'react';
import { getXcUrl } from '../utils/xc';

export function useDownloadManager({ currentProfile, selectedSection, selectedServer, setShowDownloadManager }) {
  const [downloads, setDownloads] = useState([]);

  const startDownload = useCallback(async (stream) => {
    const streamUrl = getXcUrl(stream, selectedSection, currentProfile, selectedServer);
    const streamName = stream.name || stream.title || 'Unknown';

    const downloadId = `dl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const newDownload = {
      id: downloadId,
      name: streamName,
      url: streamUrl,
      progress: 0,
      speed: '0 KB/s',
      status: 'queued',
      error: null
    };

    setDownloads(prev => [...prev, newDownload]);
    if (setShowDownloadManager) setShowDownloadManager(true);

    if (window.api && window.api.startDownload) {
      try {
        await window.api.startDownload({
          id: downloadId,
          url: streamUrl,
          name: streamName,
          profileId: currentProfile?.id
        });
      } catch (err) {
        console.error('Download failed:', err);
        setDownloads(prev => prev.map(d =>
          d.id === downloadId
            ? { ...d, status: 'error', error: err.message }
            : d
        ));
      }
    }
  }, [currentProfile, selectedSection, selectedServer, setShowDownloadManager]);

  const cancelDownload = useCallback(async (downloadId) => {
    if (window.api && window.api.cancelDownload) {
      await window.api.cancelDownload({ id: downloadId });
    }
    setDownloads(prev => prev.map(d =>
      d.id === downloadId ? { ...d, status: 'cancelled' } : d
    ));
  }, []);

  const removeDownload = useCallback(async (downloadId) => {
    const dl = downloads.find(d => d.id === downloadId);
    
    if (dl && dl.status !== 'completed' && dl.status !== 'cancelled') {
      if (window.api && window.api.cancelDownload) {
        await window.api.cancelDownload({ id: downloadId });
      }
    }
    
    setDownloads(prev => prev.filter(d => d.id !== downloadId));
  }, [downloads]);

  const moveDownload = useCallback((downloadId, direction) => {
    setDownloads(prev => {
      const index = prev.findIndex(d => d.id === downloadId);
      if (index === -1) return prev;

      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= prev.length) return prev;

      const newDownloads = [...prev];
      [newDownloads[index], newDownloads[newIndex]] = [newDownloads[newIndex], newDownloads[index]];
      return newDownloads;
    });
  }, []);

  useEffect(() => {
    if (!window.api || !window.api.onDownloadProgress) return;

    const handleProgress = (data) => {
      setDownloads(prev => prev.map(d =>
        d.id === data.id
          ? { ...d, progress: data.progress, speed: data.speed, status: data.status, error: data.error }
          : d
      ));

      if (data.status === 'cancelled') {
        setTimeout(() => {
          setDownloads(prev => prev.filter(d => d.id !== data.id));
        }, 2000);
      }
    };

    window.api.onDownloadProgress(handleProgress);

    return () => {
      if (window.api.removeDownloadProgressListeners) {
        window.api.removeDownloadProgressListeners();
      }
    };
  }, []);

  return {
    downloads,
    setDownloads,
    startDownload,
    cancelDownload,
    removeDownload,
    moveDownload
  };
}
