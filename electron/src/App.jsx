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
import { useXCApi } from './hooks/useXCApi';
import { useDownloadManager } from './hooks/useDownloadManager';
import { useFavorites } from './hooks/useFavorites';
import { useFilteredStreams } from './hooks/useFilteredStreams';
import { useGroupedCategories } from './hooks/useGroupedCategories';
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
  const [currentStream, setCurrentStream] = useState(null);

  const [castDevices, setCastDevices] = useState(['None']);
  const [selectedCastDevice, setSelectedCastDevice] = useState('None');
  const [availableIps, setAvailableIps] = useState([]);
  const [selectedProxyIp, setSelectedProxyIp] = useState('');
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
    setStreams,
    setDisplayCount,
    setStatus,
    fetchCategories: fetchCategoriesFromHook,
    fetchStreams: fetchStreamsFromHook,
    fetchSeriesInfo: fetchSeriesInfoFromHook,
    fetchAccountInfo: fetchAccountInfoFromHook,
    fetchStreamMetadata: fetchStreamMetadataFromHook,
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

  // Use Filtered Streams hook
  const { visibleStreams, totalFilteredCount } = useFilteredStreams({
    streams,
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

        // Determine technical details for Chromecast
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

        // Determine metadata type (0: Generic, 1: Movie, 2: TV Show)
        let metaType = 0;
        if (type === 'vod') metaType = 1;
        if (type === 'series' || type === 'episode') metaType = 2;

        window.api.castPlay(device, finalUrl, {
            title: stream.name || stream.title,
            subtitle: isLive ? 'Live TV' : (stream.release_date || stream.year || ''),
            images: [{ url: getXcLogoUrl(stream, selectedServer) }],
            type: metaType
        }, selectedProxyIp, streamType, contentType);
    } else {
        window.api.launchVLC(finalUrl, null, stream.name || stream.title);
    }
  }, [playerMode, selectedCastDevice, selectedSection, currentProfile, selectedServer, fetchSeriesInfo, selectedProxyIp]);

  // --- Effects ---

  useEffect(() => {
    const init = async () => {
        const config = await window.api.config.load();
        if (config.profiles?.length > 0) {
            const active = config.profiles.find(p => p.id === config.activeProfileId) || config.profiles[0];
            setCurrentProfile(active);
            if (active.servers?.length > 0) setSelectedServer(active.servers[0]);
        } else {
            setShowProfiles(true);
        }

        if (window.api.onCastDeviceFound) {
            window.api.onCastDeviceFound((name) => {
                setCastDevices(prev => {
                    if (prev.includes(name)) return prev;
                    const next = [...prev.filter(d => d !== 'None'), name];
                    setSelectedCastDevice(current => {
                        if (!current || current === 'None') return name;
                        return current;
                    });
                    return next;
                });
            });
            window.api.castScan();
        }

        if (window.api.getAvailableIps) {
            const ips = await window.api.getAvailableIps();
            setAvailableIps(ips);
            if (ips.length > 0) setSelectedProxyIp(ips[0]);
        }
    };
    init();
  }, []);

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

  const handleVlcPathChange = async () => {
    if (window.api && window.api.selectVlcPath) {
        const newPath = await window.api.selectVlcPath();
        if (newPath) {
            const config = await window.api.config.load();
            config.vlcPath = newPath;
            await window.api.config.save(config);
            setStatus(`VLC path updated: ${newPath}`);
        }
    }
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
              <div className="sidebar-header" style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
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

              <div className="stream-list" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${tileSize}px, 1fr))` }}>
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

      {currentStream && <VideoPlayer url={currentStream.url} title={currentStream.name || currentStream.title} onClose={() => setCurrentStream(null)} />}

      <AccountModal accountInfo={accountInfo} clearAccountInfo={clearAccountInfo} />

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
