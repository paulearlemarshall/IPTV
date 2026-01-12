import { useState, useCallback } from 'react';

export function useXCApi({ apiDebug = false } = {}) {
  const [allCategories, setAllCategories] = useState({ live: [], vod: [], series: [] });
  const [streams, setStreams] = useState([]);
  const [seriesInfo, setSeriesInfo] = useState(null);
  const [accountInfo, setAccountInfo] = useState(null);
  const [metadataCache, setMetadataCache] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('Ready');
  const [isRendering, setIsRendering] = useState(false);
  const [displayCount, setDisplayCount] = useState(100);
  const [viewMode, setViewMode] = useState('list');
  const [activeSeason, setActiveSeason] = useState(null);

  const fetchCategories = useCallback(async ({ section, server, profile, bypassCache = false, setImageCacheMap }) => {
    if (!profile || !server) return;
    setIsLoading(true);
    setStatus(`Loading ${section} categories...`);

    const actionMap = {
      live: 'get_live_categories',
      vod: 'get_vod_categories',
      series: 'get_series_categories'
    };

    const params = {
      server,
      username: profile.username,
      password: profile.password,
      action: actionMap[section],
      bypassCache
    };

    if (apiDebug) console.log(`[API DEBUG] Calling ${actionMap[section]} ${bypassCache ? '(Bypassing Cache)' : ''}`, params);

    try {
      const result = await window.api.xcApi(params);

      if (result.success) {
        if (apiDebug) console.log(`[API DEBUG] ${actionMap[section]} Result ${result.fromCache ? '(FROM CACHE)' : '(FRESH)'}:`, result.data);
        let cats = Array.isArray(result.data) ? result.data : [];

        if (section === 'vod') {
          const enCategories = cats.filter(cat => cat.category_name?.startsWith('|EN|'));
          if (enCategories.length > 0) {
            const syntheticCategory = {
              category_id: 'synthetic_en_all',
              category_name: '|EN| All',
              parent_id: 0
            };
            cats = [syntheticCategory, ...cats];
          }
        }

        setAllCategories(prev => ({ ...prev, [section]: cats }));
        setStatus(`Loaded ${cats.length || 0} ${section} categories.`);
      } else {
        if (apiDebug) console.error(`[API DEBUG] ${actionMap[section]} Error:`, result.error);
        setStatus(`Error: ${result.error}`);
      }
    } catch (e) {
      if (apiDebug) console.error(`[API DEBUG] ${actionMap[section]} Exception:`, e);
      setStatus(`Exception: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [apiDebug]);

  const fetchStreams = useCallback(async ({ 
    catId, 
    section, 
    server, 
    profile, 
    bypassCache = false, 
    favorites = [],
    setImageCacheMap 
  }) => {
    if (!profile || !server || !catId) return;
    setIsLoading(true);
    setStatus(`Loading streams...`);

    const t0 = performance.now();

    // Handle Favorites category
    if (catId === 'favorites') {
      const actionMap = {
        live: 'get_live_streams',
        vod: 'get_vod_streams',
        series: 'get_series'
      };

      try {
        const params = {
          server,
          username: profile.username,
          password: profile.password,
          action: actionMap[section],
          bypassCache
        };

        const result = await window.api.xcApi(params);
        if (result.success) {
          const data = Array.isArray(result.data) ? result.data : [];
          const favIdsSet = new Set(favorites);
          const favStreams = data.filter(s => favIdsSet.has((s.stream_id || s.series_id || s.id)?.toString()));

          setStreams(favStreams);
          setDisplayCount(100);
          setStatus(`Loaded ${favStreams.length} favorites. ${bypassCache ? '(FORCED REFRESH)' : ''}`);
        }
      } catch (e) {
        console.error("Failed to fetch favorites", e);
      } finally {
        setIsLoading(false);
        return;
      }
    }

    // Handle synthetic "|EN| All" category
    if (catId === 'synthetic_en_all' && section === 'vod') {
      if (apiDebug) console.log(`[API DEBUG] Fetching aggregated |EN| streams... ${bypassCache ? '(FORCED REFRESH)' : ''}`);

      try {
        const enCategories = allCategories.vod.filter(cat =>
          cat.category_name?.startsWith('|EN|') &&
          cat.category_id !== 'synthetic_en_all'
        );

        if (apiDebug) console.log(`[API DEBUG] Found ${enCategories.length} |EN| categories to aggregate`);

        let allStreamsData = [];
        for (const cat of enCategories) {
          const params = {
            server,
            username: profile.username,
            password: profile.password,
            action: 'get_vod_streams',
            extraParams: { category_id: cat.category_id },
            bypassCache
          };

          if (apiDebug) console.log(`[API DEBUG] Fetching streams from ${cat.category_name}...`);

          const result = await window.api.xcApi(params);
          if (result.success) {
            const streamsList = Array.isArray(result.data) ? result.data : [];
            if (apiDebug) console.log(`[API DEBUG] Got ${streamsList.length} streams from ${cat.category_name}`);
            allStreamsData = [...allStreamsData, ...streamsList];
          }
        }

        const t1 = performance.now();
        if (apiDebug) console.log(`[API DEBUG] Aggregated ${allStreamsData.length} total streams from ${enCategories.length} categories (${(t1 - t0).toFixed(1)}ms)`);

        const uniqueStreams = Array.from(
          new Map(allStreamsData.map(s => [s.stream_id, s])).values()
        );

        if (apiDebug) console.log(`[API DEBUG] After deduplication: ${uniqueStreams.length} unique streams`);

        const urls = uniqueStreams.map(s => s.stream_icon || s.cover || s.info?.movie_image).filter(u => !!u);
        let cacheResults = {};
        if (urls.length > 0 && setImageCacheMap) {
          const t2 = performance.now();
          if (apiDebug) console.log(`[IMG CACHE] Batch checking ${urls.length} images...`);
          try {
            cacheResults = await window.api.checkImageCacheBatch({ urls, profileId: profile.id });
            const t3 = performance.now();
            const hitCount = Object.keys(cacheResults).length;
            if (apiDebug) console.log(`[IMG CACHE] Batch check complete: ${hitCount}/${urls.length} cached (${(t3 - t2).toFixed(1)}ms)`);
          } catch (e) {
            console.error("Batch cache check failed", e);
          }
        }

        const t4 = performance.now();
        if (apiDebug) console.log(`[RENDER] Setting state... (${(t4 - t0).toFixed(1)}ms)`);

        setIsRendering(true);

        setTimeout(() => {
          const t5 = performance.now();
          if (apiDebug) console.log(`[RENDER] Applying state update (${(t5 - t0).toFixed(1)}ms)`);

          if (setImageCacheMap) setImageCacheMap(prev => ({ ...prev, ...cacheResults }));
          setStreams(uniqueStreams);
          setDisplayCount(100);

          requestAnimationFrame(() => {
            const t6 = performance.now();
            if (apiDebug) console.log(`[RENDER] Initial 100 tiles rendered (${(t6 - t0).toFixed(1)}ms)`);
            setIsRendering(false);

            if (uniqueStreams.length > 100) {
              const remaining = uniqueStreams.length - 100;
              if (apiDebug) console.log(`[RENDER] Scheduling ${remaining} more tiles to load progressively...`);
            }
          });

          setStatus(`Loaded ${uniqueStreams.length} aggregated |EN| streams. ${bypassCache ? '(FORCED REFRESH)' : ''}`);
        }, 0);

        setIsLoading(false);
        return;
      } catch (e) {
        if (apiDebug) console.error(`[API DEBUG] Aggregated fetch Exception:`, e);
        setStatus(`Exception: ${e.message}`);
        setIsLoading(false);
        return;
      }
    }

    // Normal category fetch
    const actionMap = {
      live: 'get_live_streams',
      vod: 'get_vod_streams',
      series: 'get_series'
    };

    const params = {
      server,
      username: profile.username,
      password: profile.password,
      action: actionMap[section],
      extraParams: { category_id: catId },
      bypassCache
    };

    if (apiDebug) console.log(`[API DEBUG] Calling ${actionMap[section]} for category ${catId} ${bypassCache ? '(Bypassing Cache)' : ''}`, params);

    try {
      const result = await window.api.xcApi(params);
      const t1 = performance.now();

      if (result.success) {
        if (apiDebug) console.log(`[API DEBUG] ${actionMap[section]} Result ${result.fromCache ? '(FROM CACHE)' : '(FRESH)'}: ${result.data?.length || 0} items (${(t1 - t0).toFixed(1)}ms)`, result.data);
        const data = Array.isArray(result.data) ? result.data : [];

        const urls = data.map(s => s.stream_icon || s.cover || s.info?.movie_image).filter(u => !!u);
        let cacheResults = {};
        if (urls.length > 0 && setImageCacheMap) {
          const t2 = performance.now();
          if (apiDebug) console.log(`[IMG CACHE] Batch checking ${urls.length} images...`);
          try {
            cacheResults = await window.api.checkImageCacheBatch({ urls, profileId: profile.id });
            const t3 = performance.now();
            const hitCount = Object.keys(cacheResults).length;
            if (apiDebug) console.log(`[IMG CACHE] Batch check complete: ${hitCount}/${urls.length} cached (${(t3 - t2).toFixed(1)}ms)`);
          } catch (e) {
            console.error("Batch cache check failed", e);
          }
        }

        const t4 = performance.now();
        if (apiDebug) console.log(`[RENDER] Setting state... (${(t4 - t0).toFixed(1)}ms)`);

        setIsRendering(true);

        setTimeout(() => {
          const t5 = performance.now();
          if (apiDebug) console.log(`[RENDER] Applying state update (${(t5 - t0).toFixed(1)}ms)`);

          if (setImageCacheMap) setImageCacheMap(prev => ({ ...prev, ...cacheResults }));
          setStreams(data);
          setDisplayCount(100);

          requestAnimationFrame(() => {
            const t6 = performance.now();
            if (apiDebug) console.log(`[RENDER] Initial 100 tiles rendered (${(t6 - t0).toFixed(1)}ms)`);
            setIsRendering(false);

            if (data.length > 100) {
              const remaining = data.length - 100;
              if (apiDebug) console.log(`[RENDER] Scheduling ${remaining} more tiles to load progressively...`);
            }
          });

          setStatus(`Loaded ${data.length || 0} streams. ${bypassCache ? '(FORCED REFRESH)' : ''}`);
        }, 0);
      } else {
        if (apiDebug) console.error(`[API DEBUG] ${actionMap[section]} Error:`, result.error);
        setStatus(`Error: ${result.error}`);
      }
    } catch (e) {
      if (apiDebug) console.error(`[API DEBUG] ${actionMap[section]} Exception:`, e);
      setStatus(`Exception: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [apiDebug, allCategories.vod]);

  const fetchSeriesInfo = useCallback(async ({ seriesId, server, profile, setImageCacheMap }) => {
    if (!profile || !server || !seriesId) return;
    setIsLoading(true);
    setStatus(`Fetching episodes...`);

    const params = {
      server,
      username: profile.username,
      password: profile.password,
      action: 'get_series_info',
      extraParams: { series_id: seriesId }
    };

    if (apiDebug) console.log(`[API DEBUG] Calling get_series_info for ID ${seriesId}`, params);

    try {
      const result = await window.api.xcApi(params);

      if (result.success) {
        if (apiDebug) console.log(`[API DEBUG] get_series_info Result ${result.fromCache ? '(FROM CACHE)' : '(FRESH)'}:`, result.data);

        const allEpisodes = [];
        Object.values(result.data.episodes || {}).forEach(season => {
          allEpisodes.push(...season);
        });

        const urls = allEpisodes.map(ep => ep.info?.movie_image).filter(u => !!u);
        if (result.data.info?.cover) urls.push(result.data.info.cover);

        let cacheResults = {};
        if (urls.length > 0 && setImageCacheMap) {
          try {
            cacheResults = await window.api.checkImageCacheBatch({ urls, profileId: profile.id });
          } catch (e) {
            console.error("Batch cache check failed", e);
          }
        }

        if (setImageCacheMap) setImageCacheMap(prev => ({ ...prev, ...cacheResults }));
        setSeriesInfo(result.data);
        setViewMode('details');

        const seasonKeys = Object.keys(result.data.episodes || {}).sort((a, b) => parseInt(a) - parseInt(b));
        if (seasonKeys.length > 0) setActiveSeason(seasonKeys[0]);
        setStatus(`Loaded series: ${result.data.info?.name}`);
      } else {
        if (apiDebug) console.error(`[API DEBUG] get_series_info Error:`, result.error);
        setStatus(`Error: ${result.error}`);
      }
    } catch (e) {
      if (apiDebug) console.error(`[API DEBUG] get_series_info Exception:`, e);
      setStatus(`Exception: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [apiDebug]);

  const fetchAccountInfo = useCallback(async ({ server, profile }) => {
    if (!profile || !server) return;
    setStatus('Fetching account info...');

    const params = {
      server,
      username: profile.username,
      password: profile.password,
      action: ''
    };

    if (apiDebug) console.log(`[API DEBUG] Calling Account Info (action: '')`, params);

    try {
      const result = await window.api.xcApi(params);
      if (result.success) {
        if (apiDebug) console.log(`[API DEBUG] Account Info Result ${result.fromCache ? '(FROM CACHE)' : '(FRESH)'}:`, result.data);
        setAccountInfo(result.data);
        setStatus('Account info loaded.');
      } else {
        if (apiDebug) console.error(`[API DEBUG] Account Info Error:`, result.error);
        setStatus(`Error: ${result.error}`);
      }
    } catch (e) {
      if (apiDebug) console.error(`[API DEBUG] Account Info Exception:`, e);
      setStatus(`Exception: ${e.message}`);
    }
  }, [apiDebug]);

  const fetchStreamMetadata = useCallback(async ({ stream, section, server, profile }) => {
    const id = stream.stream_id || stream.series_id;
    const cacheKey = `${section}_${id}`;

    if (metadataCache[cacheKey]) {
      return metadataCache[cacheKey];
    }

    const action = section === 'vod' ? 'get_vod_info' : 'get_series_info';
    const paramKey = section === 'vod' ? 'vod_id' : 'series_id';

    const params = {
      server,
      username: profile.username,
      password: profile.password,
      action,
      extraParams: { [paramKey]: id }
    };

    if (apiDebug) console.log(`[METADATA] Lazy loading ${action} for ID ${id}`, params);

    try {
      const t0 = performance.now();
      const result = await window.api.xcApi(params);
      const t1 = performance.now();

      if (result.success) {
        if (apiDebug) console.log(`[METADATA] ${action} Result ${result.fromCache ? '(FROM CACHE)' : '(FRESH)'} for ID ${id} (${(t1 - t0).toFixed(1)}ms)`);
        const metadata = result.data.info || result.data;
        setMetadataCache(prev => ({ ...prev, [cacheKey]: metadata }));
        return metadata;
      } else {
        if (apiDebug) console.error(`[METADATA] ${action} Error for ID ${id}:`, result.error);
      }
    } catch (err) {
      if (apiDebug) console.error(`[METADATA] ${action} Exception for ID ${id}:`, err);
    }
    return null;
  }, [apiDebug, metadataCache]);

  const backToList = useCallback(() => {
    setSeriesInfo(null);
    setViewMode('list');
    setStatus('Ready');
  }, []);

  const clearAccountInfo = useCallback(() => {
    setAccountInfo(null);
  }, []);

  return {
    // State
    allCategories,
    streams,
    seriesInfo,
    accountInfo,
    metadataCache,
    isLoading,
    status,
    isRendering,
    displayCount,
    viewMode,
    activeSeason,

    // Setters
    setAllCategories,
    setStreams,
    setDisplayCount,
    setStatus,

    // Actions
    fetchCategories,
    fetchStreams,
    fetchSeriesInfo,
    fetchAccountInfo,
    fetchStreamMetadata,
    backToList,
    clearAccountInfo
  };
}
