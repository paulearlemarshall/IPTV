import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
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
import SpeedTestModal from './components/SpeedTestModal';

// Hooks
import { useXCApi } from './hooks/useXCApi';
import { useDownloadManager } from './hooks/useDownloadManager';
import { useFavorites } from './hooks/useFavorites';
import { useFilteredStreams } from './hooks/useFilteredStreams';
import { useGroupedCategories } from './hooks/useGroupedCategories';
import { useChromecast } from './hooks/useChromecast';
import { useSettings } from './hooks/useSettings';
import { usePlayer } from './hooks/usePlayer';
import { useUIState } from './hooks/useUIState';
import { useSearchState } from './hooks/useSearchState';
import { useContextMenu } from './hooks/useContextMenu';
import { useTestModes } from './hooks/useTestModes';

import { getXcUrl, getXcLogoUrl } from './utils/xc';

function App() {
  // Core Profile/Server State
  const [currentProfile, setCurrentProfile] = useState(null);
  const [selectedServer, setSelectedServer] = useState('');
  const [showProfiles, setShowProfiles] = useState(false);
  const [apiDebug, setApiDebug] = useState(true);
  const [selectedSection, setSelectedSection] = useState('vod');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [playerMode, setPlayerMode] = useState('vlc');
  const [lastCategoryClick, setLastCategoryClick] = useState({ id: null, timestamp: 0 });

  // Custom Hooks
  const uiState = useUIState();
  const searchState = useSearchState();
  const testModes = useTestModes();
  const xcApi = useXCApi({ apiDebug });
  
  // Destructure for easier access
  const { 
    streams, seriesInfo, accountInfo, metadataCache, isLoading, status, isRendering, displayCount, viewMode, globalStreamsCache,
    setStreams, setDisplayCount, setStatus, fetchCategories: fetchCats, fetchStreams: fetchStrms, 
    fetchSeriesInfo: fetchSeries, fetchAccountInfo: fetchAcct, fetchStreamMetadata: fetchMeta, 
    fetchAllStreams, backToList, clearAccountInfo 
  } = xcApi;

  const { favorites, toggleFavorite } = useFavorites({ currentProfile });
  
  const { 
    downloads, startDownload: handleDownload, cancelDownload, removeDownload, moveDownload 
  } = useDownloadManager({ currentProfile, selectedSection, selectedServer, setShowDownloadManager: uiState.setShowDownloadManager });

  const { 
    castDevices, selectedCastDevice, setSelectedCastDevice, availableIps, selectedProxyIp, setSelectedProxyIp, 
    transcoderSettings, setTranscoderSettings 
  } = useChromecast();

  const { 
    ffmpegPath, loadSettings, handleVlcPathChange, handleFfmpegPathChange 
  } = useSettings({ setStatus });

  // Context Menu Hook
  const { contextMenu, handleContextMenu, handleCloseContextMenu } = useContextMenu({
    selectedSection, selectedServer, currentProfile, apiDebug
  });

  // Derived State
  const streamsToFilter = (searchState.searchQuery.length > 2 && globalStreamsCache[selectedSection]) 
    ? globalStreamsCache[selectedSection] 
    : streams;

  const { visibleStreams, totalFilteredCount } = useFilteredStreams({
    streams: streamsToFilter,
    searchQuery: searchState.searchQuery,
    englishOnly: searchState.englishOnly,
    yearFilter: searchState.yearFilter,
    sortByYear: searchState.sortByYear,
    displayCount
  });

  const groupedCategories = useGroupedCategories({
    allCategories: xcApi.allCategories,
    selectedSection,
    searchQuery: searchState.searchQuery,
    englishOnly: searchState.englishOnly
  });

  // --- Callbacks Wrappers ---
  const fetchCategories = useCallback((section = selectedSection, bypassCache = false) => {
    fetchCats({ section, server: selectedServer, profile: currentProfile, bypassCache, setImageCacheMap: uiState.setImageCacheMap });
  }, [fetchCats, selectedServer, currentProfile, selectedSection, uiState.setImageCacheMap]);

  const fetchStreams = useCallback((catId, bypassCache = false) => {
    fetchStrms({ catId, section: selectedSection, server: selectedServer, profile: currentProfile, bypassCache, favorites, setImageCacheMap: uiState.setImageCacheMap });
  }, [fetchStrms, selectedSection, selectedServer, currentProfile, favorites, uiState.setImageCacheMap]);

  const fetchSeriesInfo = useCallback((seriesId) => {
    fetchSeries({ seriesId, server: selectedServer, profile: currentProfile, setImageCacheMap: uiState.setImageCacheMap });
  }, [fetchSeries, selectedServer, currentProfile, uiState.setImageCacheMap]);

  const fetchAccountInfo = useCallback(() => {
    fetchAcct({ server: selectedServer, profile: currentProfile });
  }, [fetchAcct, selectedServer, currentProfile]);

  const fetchStreamMetadata = useCallback((stream) => {
    return fetchMeta({ stream, section: selectedSection, server: selectedServer, profile: currentProfile, setImageCacheMap: uiState.setImageCacheMap });
  }, [fetchMeta, selectedSection, selectedServer, currentProfile, uiState.setImageCacheMap]);

  // Player Hook
  const { currentStream, playStream: playStreamOriginal, closePlayer } = usePlayer({
    playerMode, selectedCastDevice, selectedSection, currentProfile, selectedServer, selectedProxyIp, transcoderSettings, ffmpegPath, fetchSeriesInfo
  });

  // Play Interception Logic
  const playStream = (stream, type) => {
    if (testModes.speedTestMode) {
      if (selectedSection === 'live') {
        setStatus("Speed test only supports VOD and Series.");
        return;
      }
      testModes.setSpeedTestTarget(stream);
      testModes.setShowSpeedTestModal(true);
      return;
    }

    if (testModes.stressTestMode) {
      const id = stream.stream_id || stream.series_id || stream.id;
      const container = stream.container_extension || 'ts';
      let finalUrl = '';
      if (selectedSection === 'live') {
          finalUrl = `${selectedServer}/live/${currentProfile.username}/${currentProfile.password}/${id}.ts`;
      } else if (selectedSection === 'vod') {
          finalUrl = `${selectedServer}/movie/${currentProfile.username}/${currentProfile.password}/${id}.${container}`;
      } else {
        if (type === 'episode' || stream.episode_num) {
            finalUrl = `${selectedServer}/series/${currentProfile.username}/${currentProfile.password}/${id}.${container}`;
        } else {
            setStatus("Stress test supports individual streams/episodes only.");
            return;
        }
      }
      testModes.setStressTestStreamUrl(finalUrl);
      testModes.setShowStressTestMonitor(true);
    } else {
      playStreamOriginal(stream, type);
    }
  };

  // --- Effects ---
  useEffect(() => {
    const init = async () => {
        const config = await loadSettings();
        console.log('[App] Loaded config:', config);
        if (config.profiles?.length > 0) {
            const active = config.profiles.find(p => p.id === config.activeProfileId) || config.profiles[0];
            console.log('[App] Active Profile:', active);
            setCurrentProfile(active);
            if (active.defaultServerUrl && active.servers?.includes(active.defaultServerUrl)) {
                console.log('[App] Selecting DEFAULT server:', active.defaultServerUrl);
                setSelectedServer(active.defaultServerUrl);
            } else if (active.servers?.length > 0) {
                console.log('[App] Selecting FIRST server (fallback):', active.servers[0]);
                setSelectedServer(active.servers[0]);
            }
        } else {
            setShowProfiles(true);
        }
    };
    init();
  }, [loadSettings]);

  useEffect(() => {
    if (currentProfile && selectedServer) {
        fetchCategories('live'); fetchCategories('vod'); fetchCategories('series');
        fetchAllStreams({ section: 'live', server: selectedServer, profile: currentProfile });
        fetchAllStreams({ section: 'vod', server: selectedServer, profile: currentProfile });
        fetchAllStreams({ section: 'series', server: selectedServer, profile: currentProfile });
    }
  }, [currentProfile?.id, selectedServer]);

  useEffect(() => {
    setDisplayCount(100);
    uiState.setFlipBookIndex(0);
  }, [searchState.searchQuery, searchState.yearFilter, searchState.englishOnly, searchState.sortByYear, setDisplayCount, uiState.setFlipBookIndex]);

  useEffect(() => {
    uiState.setFlipBookIndex(0);
  }, [streams, uiState.setFlipBookIndex]);

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

    if (isSameCategory && isWithinOneSecond) {
        if (apiDebug) console.log(`[REFRESH] Double-click detected for category ${catId}. Purging cache...`);
        fetchStreams(catId, true);
        return;
    }
    if (!isSameCategory) {
        setSelectedCategory(catId);
        xcApi.setStreams([]);
        backToList();
        fetchStreams(catId, false);
        return;
    }
    fetchStreams(catId, false);
  };

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
        
        // UI State Props
        flipBookMode={uiState.flipBookMode}
        setFlipBookMode={uiState.setFlipBookMode}
        setFlipBookIndex={uiState.setFlipBookIndex}
        showPlot={uiState.showPlot}
        setShowPlot={uiState.setShowPlot}
        tileSize={uiState.tileSize}
        setTileSize={uiState.setTileSize}
        showDownloadManager={uiState.showDownloadManager}
        setShowDownloadManager={uiState.setShowDownloadManager}
        
        // Search Props
        searchQuery={searchState.searchQuery}
        setSearchQuery={searchState.setSearchQuery}
        englishOnly={searchState.englishOnly}
        setEnglishOnly={searchState.setEnglishOnly}
        yearFilter={searchState.yearFilter}
        setYearFilter={searchState.setYearFilter}
        sortByYear={searchState.sortByYear}
        setSortByYear={searchState.setSortByYear}

        // Test Modes
        stressTestMode={testModes.stressTestMode}
        setStressTestMode={testModes.setStressTestMode}
        speedTestMode={testModes.speedTestMode}
        setSpeedTestMode={testModes.setSpeedTestMode}

        downloads={downloads}
        apiDebug={apiDebug}
        setApiDebug={setApiDebug}
        setStatus={setStatus}
        playerMode={playerMode}
        setPlayerMode={setPlayerMode}
        handleVlcPathChange={handleVlcPathChange}
        castDevices={castDevices}
        selectedCastDevice={selectedCastDevice}
        setSelectedCastDevice={setSelectedCastDevice}
        availableIps={availableIps}
        selectedProxyIp={selectedProxyIp}
        setSelectedProxyIp={setSelectedProxyIp}
        handleFfmpegPathChange={handleFfmpegPathChange}
        ffmpegPath={ffmpegPath}
        transcoderSettings={transcoderSettings}
        setShowTranscoderSettings={uiState.setShowTranscoderSettings}
      />

      <div className="main-content">
        {showProfiles && <ProfileManager onClose={() => setShowProfiles(false)} onProfileChanged={setCurrentProfile} />}
        
        <Sidebar 
          groupedCategories={groupedCategories}
          expandedGroups={uiState.expandedGroups}
          setExpandedGroups={uiState.setExpandedGroups}
          selectedCategory={selectedCategory}
          handleCategoryClick={handleCategoryClick}
        />

        <div className="content-area">
          {uiState.flipBookMode && viewMode !== 'details' ? (
            <FlipBookView
              streams={visibleStreams}
              currentIndex={uiState.flipBookIndex}
              onIndexChange={uiState.setFlipBookIndex}
              onPlay={playStream}
              profileId={currentProfile?.id}
              cacheMap={uiState.imageCacheMap}
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
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 0, overflow: 'hidden'
                  }}>
                    <CachedImage
                      src={Array.isArray(seriesInfo.info.backdrop_path) ? seriesInfo.info.backdrop_path[0] : seriesInfo.info.backdrop_path}
                      alt="Backdrop"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.3, filter: 'blur(3px)' }}
                      profileId={currentProfile?.id}
                      cacheMap={uiState.imageCacheMap}
                      apiDebug={apiDebug}
                    />
                  </div>
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'radial-gradient(circle, transparent 0%, var(--bg-primary) 100%)', zIndex: 1
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

              <div className="stream-list" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${uiState.tileSize}px, 1fr))`, position: 'relative', zIndex: 2 }}>
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
                                                                cacheMap={uiState.imageCacheMap}
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
                                showPlot={uiState.showPlot}
                                onDoubleClick={() => playStream(s)}
                                onContextMenu={(e) => handleContextMenu(e, s)}
                                profileId={currentProfile?.id}
                                cacheMap={uiState.imageCacheMap}
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
        isOpen={uiState.showTranscoderSettings} 
        onClose={() => uiState.setShowTranscoderSettings(false)}
        settings={transcoderSettings}
        onSave={setTranscoderSettings}
      />

      <StressTestMonitor 
        isOpen={testModes.showStressTestMonitor}
        onClose={() => testModes.setShowStressTestMonitor(false)}
        streamUrl={testModes.stressTestStreamUrl}
        settings={transcoderSettings}
      />

      <SpeedTestModal 
        isOpen={testModes.showSpeedTestModal}
        onClose={() => testModes.setShowSpeedTestModal(false)}
        stream={testModes.speedTestTarget}
        servers={currentProfile?.servers || [selectedServer]}
        username={currentProfile?.username}
        password={currentProfile?.password}
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
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, pointerEvents: 'all'
        }}>
          <div style={{
            padding: '20px 40px', backgroundColor: 'var(--bg-secondary)', border: '2px solid var(--section-accent)',
            borderRadius: '8px', fontSize: '1.2rem', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px'
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
        showDownloadManager={uiState.showDownloadManager}
        setShowDownloadManager={uiState.setShowDownloadManager}
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