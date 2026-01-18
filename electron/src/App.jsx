import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { RefreshCw, X } from 'lucide-react';
import VideoPlayer from './components/VideoPlayer';
import CachedImage from './components/CachedImage';
import ProfileManager from './components/ProfileManager';
import FlipBookView from './components/FlipBookView';
import StreamCard from './components/StreamCard';
import AccountModal from './components/AccountModal';
import DownloadManagerUI from './components/DownloadManagerUI';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import ContextMenu from './components/ContextMenu';
import TranscoderSettingsModal from './components/TranscoderSettingsModal';
import StressTestMonitor from './components/StressTestMonitor';
import { useXCApi } from './hooks/useXCApi';
import { useDownloadManager } from './hooks/useDownloadManager';
import { useFavorites } from './hooks/useFavorites';
import { useFilteredStreams } from './hooks/useFilteredStreams';
import { useGroupedCategories } from './hooks/useGroupedCategories';
import { useChromecast } from './hooks/useChromecast';
import { useSettings } from './hooks/useSettings';
import { usePlayer } from './hooks/usePlayer';
import { getXcUrl, getXcLogoUrl } from './utils/xc';

function App() {
  const [currentProfile, setCurrentProfile] = useState(null);
  const [selectedServer, setSelectedServer] = useState('');
  const [showProfiles, setShowProfiles] = useState(false);
  const [apiDebug, setApiDebug] = useState(true);

  const [selectedSection, setSelectedSection] = useState('live');
  const [selectedCategory, setSelectedCategory] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [englishOnly, setEnglishOnly] = useState(false);
  const [playerMode, setPlayerMode] = useState('vlc');

  const [expandedGroups, setExpandedGroups] = useState({});
  const [tileSize, setTileSize] = useState(200);
  const [contextMenu, setContextMenu] = useState(null);
  const [imageCacheMap, setImageCacheMap] = useState({});
  const [showPlot, setShowPlot] = useState(false);
  const [yearFilter, setYearFilter] = useState('none');
  const [sortByYear, setSortByYear] = useState(false);
  const [showDownloadManager, setShowDownloadManager] = useState(false);
  const [lastCategoryClick, setLastCategoryClick] = useState({ id: null, timestamp: 0 });
  const [flipBookMode, setFlipBookMode] = useState(false);
  const [flipBookIndex, setFlipBookIndex] = useState(0);
  const [showTranscoderSettings, setShowTranscoderSettings] = useState(false);
  const [stressTestMode, setStressTestMode] = useState(false);
  const [showStressTestMonitor, setShowStressTestMonitor] = useState(false);
  const [stressTestStreamUrl, setStressTestStreamUrl] = useState(null);

  // Use the XC API hook
  const xcApi = useXCApi({ apiDebug });

  const {
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
    globalStreamsCache,
    setStreams,
    setDisplayCount,
    setStatus,
    fetchCategories: fetchCategoriesFromHook,
    fetchStreams: fetchStreamsFromHook,
    fetchSeriesInfo: fetchSeriesInfoFromHook,
    fetchAccountInfo: fetchAccountInfoFromHook,
    fetchStreamMetadata: fetchStreamMetadataFromHook,
    fetchAllStreams,
    backToList,
    clearAccountInfo
  } = xcApi;

  // Use Favorites hook
  const {
    favorites,
    toggleFavorite
  } = useFavorites({ currentProfile });

  // Use Download Manager hook
  const {
    downloads,
    startDownload: handleDownload,
    cancelDownload,
    removeDownload,
    moveDownload
  } = useDownloadManager({
    currentProfile,
    selectedSection,
    selectedServer,
    setShowDownloadManager
  });

  // Use Chromecast hook
  const {
    castDevices,
    selectedCastDevice,
    setSelectedCastDevice,
    availableIps,
    selectedProxyIp,
    setSelectedProxyIp,
    transcoderSettings,
    setTranscoderSettings
  } = useChromecast();

  // Use Settings hook
  const {
    ffmpegPath,
    loadSettings,
    handleVlcPathChange,
    handleFfmpegPathChange
  } = useSettings({ setStatus });

  // Determine which streams to filter: Global Cache (if searching) or Category Streams
  const streamsToFilter = (searchQuery.length > 2 && globalStreamsCache[selectedSection]) 
    ? globalStreamsCache[selectedSection] 
    : streams;

  // Trigger Global Search when query is typed
  useEffect(() => {
    if (searchQuery.length > 2 && !globalStreamsCache[selectedSection]) {
        fetchAllStreams({
            section: selectedSection,
            server: selectedServer,
            profile: currentProfile
        });
    }
  }, [searchQuery, selectedSection, globalStreamsCache, selectedServer, currentProfile, fetchAllStreams]);

  // Use Filtered Streams hook
  const { visibleStreams, totalFilteredCount } = useFilteredStreams({
    streams: streamsToFilter,
    searchQuery,
    englishOnly,
    yearFilter,
    sortByYear,
    displayCount
  });

  // Use Grouped Categories hook
  const groupedCategories = useGroupedCategories({
    allCategories,
    selectedSection,
    searchQuery,
    englishOnly
  });

  // Wrapper functions that pass current context
  const fetchCategories = useCallback((section = selectedSection, bypassCache = false) => {
    fetchCategoriesFromHook({
      section,
      server: selectedServer,
      profile: currentProfile,
      bypassCache,
      setImageCacheMap
    });
  }, [fetchCategoriesFromHook, selectedServer, currentProfile, selectedSection]);

  const fetchStreams = useCallback((catId, bypassCache = false) => {
    fetchStreamsFromHook({
      catId,
      section: selectedSection,
      server: selectedServer,
      profile: currentProfile,
      bypassCache,
      favorites,
      setImageCacheMap
    });
  }, [fetchStreamsFromHook, selectedSection, selectedServer, currentProfile, favorites]);

  const fetchSeriesInfo = useCallback((seriesId) => {
    fetchSeriesInfoFromHook({
      seriesId,
      server: selectedServer,
      profile: currentProfile,
      setImageCacheMap
    });
  }, [fetchSeriesInfoFromHook, selectedServer, currentProfile]);

  const fetchAccountInfo = useCallback(() => {
    fetchAccountInfoFromHook({
      server: selectedServer,
      profile: currentProfile
    });
  }, [fetchAccountInfoFromHook, selectedServer, currentProfile]);

  const fetchStreamMetadata = useCallback((stream) => {
    return fetchStreamMetadataFromHook({
      stream,
      section: selectedSection,
      server: selectedServer,
      profile: currentProfile,
      setImageCacheMap
    });
  }, [fetchStreamMetadataFromHook, selectedSection, selectedServer, currentProfile, setImageCacheMap]);

  // Use Player hook
  const {
    currentStream,
    playStream: playStreamOriginal,
    closePlayer
  } = usePlayer({
    playerMode,
    selectedCastDevice,
    selectedSection,
    currentProfile,
    selectedServer,
    selectedProxyIp,
    transcoderSettings,
    ffmpegPath,
    fetchSeriesInfo
  });

  const playStream = (stream, type) => {
    if (stressTestMode) {
      // Build stream URL similar to how usePlayer/playStream does it, but we need it here.
      // Actually usePlayer handles constructing the URL from the stream object. 
      // It's better if we just use the logic from usePlayer but for getting the URL. 
      // However, duplication is bad.
      // Let's see if we can just get the URL.
      // For now, let's construct it manually since it's standard XC.
      const id = stream.stream_id || stream.series_id || stream.id;
      const container = stream.container_extension || 'ts'; // Default to ts
      // Live/VOD logic
      let finalUrl = '';
      if (selectedSection === 'live') {
          finalUrl = `${selectedServer}/live/${currentProfile.username}/${currentProfile.password}/${id}.ts`;
      } else if (selectedSection === 'vod') {
          finalUrl = `${selectedServer}/movie/${currentProfile.username}/${currentProfile.password}/${id}.${container}`;
      } else {
        // Series logic usually complicated (needs episode).
        // If type is 'episode', stream is an episode object.
        if (type === 'episode' || stream.episode_num) {
            finalUrl = `${selectedServer}/series/${currentProfile.username}/${currentProfile.password}/${id}.${container}`;
        } else {
            setStatus("Stress test supports individual streams/episodes only.");
            return;
        }
      }

      setStressTestStreamUrl(finalUrl);
      setShowStressTestMonitor(true);
    } else {
      playStreamOriginal(stream, type);
    }
  };

  // --- Effects ---

  useEffect(() => {
    const init = async () => {
        const config = await loadSettings();
        if (config.profiles?.length > 0) {
            const active = config.profiles.find(p => p.id === config.activeProfileId) || config.profiles[0];
            setCurrentProfile(active);
            if (active.servers?.length > 0) setSelectedServer(active.servers[0]);
        } else {
            setShowProfiles(true);
        }
    };
    init();
  }, [loadSettings]);

  useEffect(() => {
    if (currentProfile && selectedServer) {
        fetchCategories('live');
        fetchCategories('vod');
        fetchCategories('series');
    }
  }, [currentProfile?.id, selectedServer]);

  // Reset displayCount and flipBookIndex when filters or sort changes
  useEffect(() => {
    setDisplayCount(100);
    setFlipBookIndex(0);
  }, [searchQuery, yearFilter, englishOnly, sortByYear, setDisplayCount]);

  // Reset flipBookIndex when streams change (new category selected)
  useEffect(() => {
    setFlipBookIndex(0);
  }, [streams]);

  // Progressive loading
  useEffect(() => {
    if (streams.length > displayCount && !isRendering) {
      const timer = setTimeout(() => {
        const newCount = Math.min(displayCount + 100, streams.length);
        if (apiDebug) console.log(`[RENDER] Loading ${newCount - displayCount} more tiles (${displayCount} -> ${newCount})`);
        setDisplayCount(newCount);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [streams.length, displayCount, isRendering, apiDebug, setDisplayCount]);

  const handleCategoryClick = (catId) => {
    const now = Date.now();
    const isSameCategory = selectedCategory === catId;
    const isWithinOneSecond = now - lastCategoryClick.timestamp < 1000;
    
    setLastCategoryClick({ id: catId, timestamp: now });

    // Handle cache-bypassing refresh (double click)
    if (isSameCategory && isWithinOneSecond) {
        if (apiDebug) console.log(`[REFRESH] Double-click detected for category ${catId}. Purging cache...`);
        fetchStreams(catId, true);
        return;
    }

    // Handle new category selection
    if (!isSameCategory) {
        setSelectedCategory(catId);
        xcApi.setStreams([]);
        backToList();
        fetchStreams(catId, false);
        return;
    }

    // Normal click on already selected category
    fetchStreams(catId, false);
  };

  const handleCloseContextMenu = () => setContextMenu(null);
  
  const handleContextMenu = useCallback(async (e, stream) => {
    e.preventDefault();
    const id = stream.stream_id || stream.series_id || stream.id;
    const isEpisode = !!stream.episode_num;
    setContextMenu({ mouseX: e.clientX, mouseY: e.clientY, stream, isLoading: !isEpisode });

    if (isEpisode) {
        setContextMenu(prev => ({ ...prev, info: stream.info || stream, rawData: stream, isLoading: false }));
        return;
    }

    if (selectedSection === 'vod' || selectedSection === 'series') {
        const action = selectedSection === 'vod' ? 'get_vod_info' : 'get_series_info';
        const paramKey = selectedSection === 'vod' ? 'vod_id' : 'series_id';
        
        const params = {
            server: selectedServer,
            username: currentProfile.username,
            password: currentProfile.password,
            action,
            extraParams: { [paramKey]: id }
        };

        if (apiDebug) console.log(`[API DEBUG] Calling ${action} for ID ${id}`, params);

        try {
            const result = await window.api.xcApi(params);
            if (result.success) {
                if (apiDebug) console.log(`[API DEBUG] ${action} Result ${result.fromCache ? '(FROM CACHE)' : '(FRESH)'}:`, result.data);
                setContextMenu(prev => ({ ...prev, info: result.data.info, rawData: result.data, isLoading: false }));
            } else {
                if (apiDebug) console.error(`[API DEBUG] ${action} Error:`, result.error);
                setContextMenu(prev => ({ ...prev, isLoading: false }));
            }
        } catch (err) {
            if (apiDebug) console.error(`[API DEBUG] ${action} Exception:`, err);
            setContextMenu(prev => ({ ...prev, isLoading: false }));
        }
    } else {
        setContextMenu(prev => ({ ...prev, isLoading: false }));
    }
  }, [selectedSection, selectedServer, currentProfile, apiDebug]);

  const copyToClipboard = (text) => {
    if (text) {
        navigator.clipboard.writeText(text);
        setStatus(`Copied to clipboard`);
    }
    handleCloseContextMenu();
  };

  const getSectionColor = () => {
    if (selectedSection === 'live') return '#ffd43b';
    if (selectedSection === 'vod') return '#40c057';
    if (selectedSection === 'series') return '#ff6b6b';
    return '#00d4ff'; 
  };

  return (
    <div className="container" onClick={handleCloseContextMenu} style={{ '--section-accent': getSectionColor() }}>
      <Header 
        currentProfile={currentProfile}
        selectedServer={selectedServer}
        setSelectedServer={setSelectedServer}
        setShowProfiles={setShowProfiles}
        fetchAccountInfo={fetchAccountInfo}
        getSectionColor={getSectionColor}
        selectedSection={selectedSection}
        setSelectedSection={setSelectedSection}
        setSelectedCategory={setSelectedCategory}
        setStreams={setStreams}
        backToList={backToList}
        setLastCategoryClick={setLastCategoryClick}
        flipBookMode={flipBookMode}
        setFlipBookMode={setFlipBookMode}
        setFlipBookIndex={setFlipBookIndex}
        showPlot={showPlot}
        setShowPlot={setShowPlot}
        downloads={downloads}
        setShowDownloadManager={setShowDownloadManager}
        showDownloadManager={showDownloadManager}
        apiDebug={apiDebug}
        setApiDebug={setApiDebug}
        setStatus={setStatus}
        tileSize={tileSize}
        setTileSize={setTileSize}
        playerMode={playerMode}
        setPlayerMode={setPlayerMode}
        handleVlcPathChange={handleVlcPathChange}
        castDevices={castDevices}
        selectedCastDevice={selectedCastDevice}
        setSelectedCastDevice={setSelectedCastDevice}
        availableIps={availableIps}
        selectedProxyIp={selectedProxyIp}
        setSelectedProxyIp={setSelectedProxyIp}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        englishOnly={englishOnly}
        setEnglishOnly={setEnglishOnly}
        sortByYear={sortByYear}
        setSortByYear={setSortByYear}
        yearFilter={yearFilter}
        setYearFilter={setYearFilter}
        handleFfmpegPathChange={handleFfmpegPathChange}
        ffmpegPath={ffmpegPath}
        transcoderSettings={transcoderSettings}
        setShowTranscoderSettings={setShowTranscoderSettings}
        stressTestMode={stressTestMode}
        setStressTestMode={setStressTestMode}
      />

      <div className="main-content">
        {showProfiles && <ProfileManager onClose={() => setShowProfiles(false)} onProfileChanged={setCurrentProfile} />}
        
        <Sidebar 
          groupedCategories={groupedCategories}
          expandedGroups={expandedGroups}
          setExpandedGroups={setExpandedGroups}
          selectedCategory={selectedCategory}
          handleCategoryClick={handleCategoryClick}
        />

        <div className="content-area">
          {flipBookMode && viewMode !== 'details' ? (
            <FlipBookView
              streams={visibleStreams}
              currentIndex={flipBookIndex}
              onIndexChange={setFlipBookIndex}
              onPlay={playStream}
              profileId={currentProfile?.id}
              cacheMap={imageCacheMap}
              apiDebug={apiDebug}
              fetchMetadata={fetchStreamMetadata}
              metadataCache={metadataCache}
              sectionColor={getSectionColor()}
              sectionType={selectedSection}
            />
          ) : (
            <>
              {/* Series Details Backdrop */}
              {viewMode === 'details' && seriesInfo?.info?.backdrop_path && (
                <>
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 0,
                    overflow: 'hidden'
                  }}>
                    <CachedImage
                      src={Array.isArray(seriesInfo.info.backdrop_path) ? seriesInfo.info.backdrop_path[0] : seriesInfo.info.backdrop_path}
                      alt="Backdrop"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        opacity: 0.3,
                        filter: 'blur(3px)'
                      }}
                      profileId={currentProfile?.id}
                      cacheMap={imageCacheMap}
                      apiDebug={apiDebug}
                    />
                  </div>
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'radial-gradient(circle, transparent 0%, var(--bg-primary) 100%)',
                    zIndex: 1
                  }} />
                </>
              )}

              <div className="sidebar-header" style={{ display: 'flex', gap: '15px', alignItems: 'center', position: 'relative', zIndex: 2 }}>
                {viewMode === 'details' ? (
                    <><button className="btn" onClick={backToList} style={{ padding: '2px 8px', fontSize: '0.7rem' }}>← BACK</button>
                    <span style={{ color: 'var(--section-accent)', fontWeight: 'bold' }}>{seriesInfo?.info?.name}</span></>
                ) : (
                    <span>
                      Streams ({visibleStreams.length}
                      {totalFilteredCount > visibleStreams.length && (
                        <span style={{ color: '#888' }}> of {totalFilteredCount}</span>
                      )})
                    </span>
                )}
              </div>

              <div className="stream-list" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${tileSize}px, 1fr))`, position: 'relative', zIndex: 2 }}>
                {viewMode === 'details' ? (
                    Object.keys(seriesInfo?.episodes || {}).sort((a,b) => parseInt(a)-parseInt(b)).map(seasonNum => (
                        <React.Fragment key={`season-${seasonNum}`}>
                            <div className="section-header" style={{ marginTop: seasonNum === '1' ? '0' : '20px' }}>SEASON {seasonNum.padStart(2, '0')}</div>
                                                    {seriesInfo.episodes[seasonNum].map(ep => (
                                                        <div key={ep.id} className="stream-card" onDoubleClick={() => playStream(ep, 'episode')} onContextMenu={(e) => handleContextMenu(e, ep)}>
                                                            <CachedImage
                                                                src={ep.info?.movie_image || seriesInfo?.info?.cover}
                                                                alt={ep.title}
                                                                className="stream-logo"
                                                                profileId={currentProfile?.id}
                                                                cacheMap={imageCacheMap}
                                                                apiDebug={apiDebug}
                                                            />
                                                            <div className="stream-name">E{ep.episode_num}: {ep.title}</div>
                                                        </div>
                                                    ))}
                        </React.Fragment>
                    ))
                ) : (
                    visibleStreams.map((s) => {
                        const id = (s.stream_id || s.series_id || s.id).toString();
                        return (
                            <StreamCard
                                key={id}
                                stream={s}
                                showPlot={showPlot}
                                onDoubleClick={() => playStream(s)}
                                onContextMenu={(e) => handleContextMenu(e, s)}
                                profileId={currentProfile?.id}
                                cacheMap={imageCacheMap}
                                apiDebug={apiDebug}
                                fetchMetadata={fetchStreamMetadata}
                                metadataCache={metadataCache}
                                sectionType={selectedSection}
                                onDownload={handleDownload}
                                isFavorite={favorites.includes(id)}
                                onToggleFavorite={toggleFavorite}
                            />
                        );
                    })
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {currentStream && <VideoPlayer url={currentStream.url} title={currentStream.name || currentStream.title} onClose={closePlayer} />}

      <AccountModal accountInfo={accountInfo} clearAccountInfo={clearAccountInfo} />

      <TranscoderSettingsModal 
        isOpen={showTranscoderSettings} 
        onClose={() => setShowTranscoderSettings(false)}
        settings={transcoderSettings}
        onSave={setTranscoderSettings}
      />

      <StressTestMonitor 
        isOpen={showStressTestMonitor}
        onClose={() => setShowStressTestMonitor(false)}
        streamUrl={stressTestStreamUrl}
        settings={transcoderSettings}
      />

      <ContextMenu 
        contextMenu={contextMenu}
        getXcUrl={getXcUrl}
        selectedSection={selectedSection}
        currentProfile={currentProfile}
        selectedServer={selectedServer}
        getXcLogoUrl={getXcLogoUrl}
        copyToClipboard={copyToClipboard}
      />

      {isRendering && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          pointerEvents: 'all'
        }}>
          <div style={{
            padding: '20px 40px',
            backgroundColor: 'var(--bg-secondary)',
            border: '2px solid var(--section-accent)',
            borderRadius: '8px',
            fontSize: '1.2rem',
            color: 'var(--text-primary)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '10px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <RefreshCw size={24} className="spin" color={getSectionColor()} />
              <span>Rendering first 100 tiles...</span>
            </div>
            <div style={{ fontSize: '0.9rem', color: '#888' }}>
              {streams.length} total in category
            </div>
          </div>
        </div>
      )}

      <DownloadManagerUI 
        showDownloadManager={showDownloadManager}
        setShowDownloadManager={setShowDownloadManager}
        downloads={downloads}
        cancelDownload={cancelDownload}
        removeDownload={removeDownload}
        moveDownload={moveDownload}
        getSectionColor={getSectionColor}
      />

      <div className="status-bar">{status}</div>
    </div>
  );
}

export default App;
