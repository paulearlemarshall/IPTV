import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Settings, RefreshCw, Play, Search, Copy, Download, Cast, ChevronRight, ChevronDown, X, User, Bug, Calendar, ArrowDown, ArrowUp, Star, BookOpen } from 'lucide-react';
import VideoPlayer from './components/VideoPlayer';
import CachedImage from './components/CachedImage';
import ProfileManager from './components/ProfileManager';
import FlipBookView from './components/FlipBookView';
import StarRating from './components/StarRating';
import StreamCard from './components/StreamCard';
import { useXCApi } from './hooks/useXCApi';
import { useIntersectionObserver } from './hooks/useIntersectionObserver';
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
        window.api.castPlay(device, finalUrl, {
            title: stream.name || stream.title,
            images: [{ url: getXcLogoUrl(stream, selectedServer) }]
        });
    } else {
        window.api.launchVLC(finalUrl, null, stream.name || stream.title);
    }
  }, [playerMode, selectedCastDevice, selectedSection, currentProfile, selectedServer, fetchSeriesInfo]);

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

    if (isSameCategory && isWithinOneSecond) {
        if (apiDebug) console.log(`[REFRESH] Double-click detected for category ${catId}. Purging cache...`);
        fetchStreams(catId, true);
    } else if (!isSameCategory) {
        setSelectedCategory(catId);
        xcApi.setStreams([]);
        backToList();
        fetchStreams(catId, false);
    } else {
        fetchStreams(catId, false);
    }
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
      <div className="header">
        {/* Left section: Profile info */}
        <div 
            style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
            onClick={fetchAccountInfo}
            title="Click for Account Info"
        >
            <User size={20} color={getSectionColor()} /> 
            <span className="rainbow-text">{currentProfile?.name || 'No Profile'}</span>
        </div>
        
        <div className="controls">
          {/* Profile button */}
          <button className="btn" onClick={() => setShowProfiles(true)} style={{ background: 'transparent', border: 'none' }}>
            <Settings size={16} /> Profiles
          </button>

          {/* Server dropdown */}
          <select value={selectedServer} onChange={(e) => setSelectedServer(e.target.value)} style={{ width: '150px' }}>
            {currentProfile?.servers?.map(url => <option key={url} value={url}>{url}</option>)}
          </select>

          {/* Section tabs in rounded rectangle */}
          <div style={{
            display: 'flex',
            background: '#2c2e33',
            borderRadius: '6px',
            padding: '2px',
            gap: '2px'
          }}>
            {[{ id: 'live', color: '#ffd43b' }, { id: 'vod', color: '#40c057' }, { id: 'series', color: '#ff6b6b' }].map(s => (
                <button 
                    key={s.id} 
                    className="btn section-btn" 
                    onClick={() => { 
                        setSelectedSection(s.id); 
                        setSelectedCategory(null); 
                        setStreams([]);
                        backToList();
                        setLastCategoryClick({ id: null, timestamp: 0 });
                    }} 
                    style={{ 
                        padding: '4px 14px', 
                        fontSize: '0.7rem', 
                        backgroundColor: selectedSection === s.id ? s.color : 'transparent', 
                        color: selectedSection === s.id ? '#000' : '#909296',
                        border: 'none',
                        borderRadius: '4px',
                        fontWeight: selectedSection === s.id ? 'bold' : 'normal'
                    }}
                >
                    {s.id.toUpperCase()}
                </button>
            ))}
          </div>

          {/* Book (Flip Book Mode) */}
          <button
            className="btn"
            onClick={() => {
              setFlipBookMode(!flipBookMode);
              if (!flipBookMode) setFlipBookIndex(0);
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: flipBookMode ? getSectionColor() : '#909296',
              display: 'flex',
              alignItems: 'center',
              padding: '4px'
            }}
            title="Flip Book Mode"
          >
            <BookOpen size={16} />
          </button>

          {/* Plot toggle (text-based) */}
          <button
            onClick={() => {
              if (selectedSection === 'vod' || selectedSection === 'series') {
                setShowPlot(!showPlot);
              }
            }}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '0.75rem',
              fontWeight: 'bold',
              color: (selectedSection === 'vod' || selectedSection === 'series') 
                ? (showPlot ? getSectionColor() : '#909296')
                : '#555',
              cursor: (selectedSection === 'vod' || selectedSection === 'series') ? 'pointer' : 'not-allowed',
              padding: '4px 8px'
            }}
            title="Toggle Plot Display"
          >
            PLOT
          </button>

          {/* Download Manager */}
          <button
            className="btn"
            onClick={() => setShowDownloadManager(!showDownloadManager)}
            style={{
              background: 'transparent',
              border: 'none',
              color: downloads.some(d => d.status === 'downloading') ? getSectionColor() : '#909296',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px',
              position: 'relative'
            }}
            title="Download Manager"
          >
            <ArrowDown size={16} />
            {downloads.filter(d => d.status !== 'completed' && d.status !== 'cancelled').length > 0 && (
              <span style={{
                fontSize: '0.7rem',
                background: downloads.some(d => d.status === 'downloading') ? getSectionColor() : '#909296',
                color: '#000',
                borderRadius: '50%',
                width: '18px',
                height: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold'
              }}>
                {downloads.filter(d => d.status !== 'completed' && d.status !== 'cancelled').length}
              </span>
            )}
          </button>

          {/* Bug (API Debug) */}
          <button
            className="btn"
            onClick={() => {
                setApiDebug(!apiDebug);
                setStatus(`API Debug: ${!apiDebug ? 'ON' : 'OFF'}`);
            }}
            style={{
                background: 'transparent',
                border: 'none',
                color: apiDebug ? '#ff6b6b' : '#909296',
                display: 'flex',
                alignItems: 'center',
                padding: '4px'
            }}
            title="Toggle API Debug"
          >
            <Bug size={16} />
          </button>

          {/* Size slider */}
          <input type="range" min="100" max="400" value={tileSize} onChange={(e) => setTileSize(Number(e.target.value))} style={{ width: '60px' }} />

          {/* Chromecast / Player controls */}
          <div className="player-selector" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {['vlc', 'internal', 'cast'].map(m => (
              <React.Fragment key={m}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '0.7rem' }}>
                  <input type="radio" name="playerMode" checked={playerMode === m} onChange={() => setPlayerMode(m)} /> 
                  <span onClick={m === 'vlc' ? handleVlcPathChange : undefined} style={{ cursor: m === 'vlc' ? 'pointer' : 'inherit' }}>{m.toUpperCase()}</span>
                </label>
                {m === 'cast' && playerMode === 'cast' && (
                  <select value={selectedCastDevice} onChange={(e) => setSelectedCastDevice(e.target.value)} style={{ padding: '1px 4px', fontSize: '0.65rem', width: '100px', marginLeft: '2px', height: '20px' }}>
                    {castDevices.map(name => <option key={name} value={name}>{name}</option>)}
                  </select>
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Search bar */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={14} style={{ position: 'absolute', left: 6, top: 8, color: '#888', pointerEvents: 'none' }} />
            <input type="text" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ paddingLeft: '24px', paddingRight: searchQuery ? '24px' : '8px', width: '150px' }} />
            {searchQuery && (
              <X 
                size={14} 
                style={{ 
                  position: 'absolute', 
                  right: 6, 
                  color: '#ff6b6b', 
                  cursor: 'pointer'
                }} 
                onClick={() => setSearchQuery('')}
              />
            )}
          </div>

          {/* EN filter toggle (text-based) */}
          <button
            onClick={() => setEnglishOnly(!englishOnly)}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '0.75rem',
              fontWeight: 'bold',
              color: englishOnly ? getSectionColor() : '#909296',
              cursor: 'pointer',
              padding: '4px 8px'
            }}
            title="English Only Filter"
          >
            EN
          </button>

          {/* Year dropdown */}
          <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} style={{ width: '80px', fontSize: '0.75rem' }}>
            <option value="none">Year</option>
            {Array.from({ length: new Date().getFullYear() - 1950 + 1 }, (_, i) => new Date().getFullYear() - i).map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>

          {/* Calendar (Sort by year) */}
          <button
            className="btn"
            onClick={() => setSortByYear(!sortByYear)}
            style={{
              background: 'transparent',
              border: 'none',
              color: sortByYear ? getSectionColor() : '#909296',
              display: 'flex',
              alignItems: 'center',
              padding: '4px'
            }}
            title={sortByYear ? "Sort by year ON (newest first)" : "Sort by year OFF (natural order)"}
          >
            <Calendar size={16} />
          </button>
        </div>
      </div>

      <div className="main-content">
        {showProfiles && <ProfileManager onClose={() => setShowProfiles(false)} onProfileChanged={setCurrentProfile} />}
        <div className="sidebar">
          <div className="sidebar-header">Categories</div>
          <div className="sidebar-list">
            {Object.entries(groupedCategories).sort().map(([prefix, cats]) => (
                <div key={prefix}>
                    <div className="group-header" onClick={() => setExpandedGroups(p => ({...p, [prefix]: !p[prefix]}))}>
                        {expandedGroups[prefix] ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {prefix}
                    </div>
                    {expandedGroups[prefix] && cats.map(cat => (
                        <div key={cat.category_id} className={`category-item ${selectedCategory === cat.category_id ? 'active' : ''}`} onClick={() => handleCategoryClick(cat.category_id)} style={{ paddingLeft: '32px' }}>
                            {cat.category_name}
                        </div>
                    ))}
                </div>
            ))}
          </div>
        </div>

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

      {accountInfo && (
          <div className="modal-overlay" onClick={clearAccountInfo}>
              <div className="account-modal" onClick={e => e.stopPropagation()} style={{ position: 'relative' }}>
                  <button className="close-modal-btn" onClick={clearAccountInfo}><X size={20} /></button>
                  <div className="series-browser-header" style={{ marginBottom: '0' }}>
                      <div className="series-header-info"><h2 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><User size={24} /> Account Details</h2></div>
                  </div>
                  <div className="account-body">
                      <div className="account-grid">
                          <div className="account-section">
                              <h3>User Profile</h3>
                              <div className="account-row"><span>Username:</span> <span>{accountInfo.user_info?.username}</span></div>
                              <div className="account-row"><span>Password:</span> <span>{accountInfo.user_info?.password}</span></div>
                              <div className="account-row"><span>Status:</span> <span style={{ color: accountInfo.user_info?.status === 'Active' ? '#40c057' : '#ff6b6b' }}>{accountInfo.user_info?.status}</span></div>
                              <div className="account-row"><span>Expiry:</span> <span>{accountInfo.user_info?.exp_date ? new Date(parseInt(accountInfo.user_info.exp_date) * 1000).toLocaleDateString() : 'N/A'}</span></div>
                              <div className="account-row"><span>Created:</span> <span>{accountInfo.user_info?.created_at ? new Date(parseInt(accountInfo.user_info.created_at) * 1000).toLocaleDateString() : 'N/A'}</span></div>
                              <div className="account-row"><span>Trial:</span> <span>{accountInfo.user_info?.is_trial === "1" ? "Yes" : "No"}</span></div>
                              <div className="account-row"><span>Auth:</span> <span>{accountInfo.user_info?.auth}</span></div>
                          </div>
                          <div className="account-section">
                              <h3>Connections</h3>
                              <div className="account-row"><span>Max Allowed:</span> <span>{accountInfo.user_info?.max_connections}</span></div>
                              <div className="account-row"><span>Currently Active:</span> <span>{accountInfo.user_info?.active_cons}</span></div>
                              <div className="account-row"><span>Formats:</span> <span>{accountInfo.user_info?.allowed_output_formats?.join(', ')}</span></div>
                              <div className="account-row" style={{ marginTop: '10px' }}><span>Message:</span> <span style={{ fontStyle: 'italic' }}>{accountInfo.user_info?.message || "No system messages"}</span></div>
                          </div>
                      </div>

                      <div className="account-section">
                          <h3>Server Infrastructure</h3>
                          <div className="account-grid">
                              <div>
                                  <div className="account-row"><span>URL:</span> <span>{accountInfo.server_info?.url}</span></div>
                                  <div className="account-row"><span>HTTP Port:</span> <span>{accountInfo.server_info?.port}</span></div>
                                  <div className="account-row"><span>HTTPS Port:</span> <span>{accountInfo.server_info?.https_port}</span></div>
                                  <div className="account-row"><span>Protocol:</span> <span>{accountInfo.server_info?.server_protocol}</span></div>
                              </div>
                              <div>
                                  <div className="account-row"><span>RTMP Port:</span> <span>{accountInfo.server_info?.rtmp_port}</span></div>
                                  <div className="account-row"><span>Timezone:</span> <span>{accountInfo.server_info?.timezone}</span></div>
                                  <div className="account-row"><span>Server Time:</span> <span>{accountInfo.server_info?.time_now}</span></div>
                                  <div className="account-row"><span>Process:</span> <span>{accountInfo.server_info?.process ? "Running" : "Idle"}</span></div>
                              </div>
                          </div>
                      </div>

                      <div className="account-raw">
                          <details><summary style={{ cursor: 'pointer', fontSize: '0.8rem', color: '#888' }}>Raw Response</summary><pre>{JSON.stringify(accountInfo, null, 2)}</pre></details>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {contextMenu && (() => {
          const isEpisode = !!contextMenu.stream.episode_num;
          const finalUrl = getXcUrl(contextMenu.stream, isEpisode ? 'episode' : selectedSection, currentProfile, selectedServer);
          const finalLogoUrl = getXcLogoUrl(contextMenu.stream, selectedServer);
          const info = contextMenu.info;
          return (
              <div className="context-menu" style={{ top: contextMenu.mouseY, left: contextMenu.mouseX }} onClick={e => e.stopPropagation()}>
                  <div className="context-menu-item" onClick={() => copyToClipboard(finalUrl)}><Copy size={14} /> <span>Copy Stream URL</span></div>
                  {finalLogoUrl && <div className="context-menu-item" onClick={() => copyToClipboard(finalLogoUrl)}><Copy size={14} /> <span>Copy Logo URL</span></div>}
                  <div className="context-menu-separator" />
                  {contextMenu.isLoading ? (
                      <div className="context-menu-info" style={{ textAlign: 'center', opacity: 0.6 }}>Loading metadata...</div>
                  ) : info ? (
                      <div className="context-menu-metadata" style={{ minWidth: '300px' }}>
                          <div className="metadata-row" style={{ color: 'var(--section-accent)', fontWeight: 'bold', marginBottom: '8px', fontSize: '1rem' }}>
                            {contextMenu.stream.name || contextMenu.stream.title}
                          </div>
                          
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <StarRating rating={parseFloat(info.rating || 0)} />
                            {info.duration && <span style={{ fontSize: '0.75rem', color: '#888' }}>{info.duration}</span>}
                          </div>

                          {(info.plot || contextMenu.stream.plot) && (
                            <div className="metadata-row">
                              <strong>Plot:</strong> 
                              <div className="metadata-text" style={{ maxHeight: '100px', overflowY: 'auto' }}>{info.plot || contextMenu.stream.plot}</div>
                            </div>
                          )}

                          <div style={{ marginTop: '8px' }}>
                            {info.director && <div className="metadata-row" style={{ fontSize: '0.8rem' }}><strong>Director:</strong> {info.director}</div>}
                            {info.cast && <div className="metadata-row" style={{ fontSize: '0.8rem' }}><strong>Cast:</strong> {info.cast}</div>}
                            {info.genre && <div className="metadata-row" style={{ fontSize: '0.8rem' }}><strong>Genre:</strong> {info.genre}</div>}
                            {info.releasedate && <div className="metadata-row" style={{ fontSize: '0.8rem' }}><strong>Released:</strong> {info.releasedate}</div>}
                          </div>
                      </div>
                  ) : null}
                  <div className="context-menu-info"><strong>ID:</strong> {contextMenu.stream.stream_id || contextMenu.stream.series_id || contextMenu.stream.id}</div>
                  <div className="context-menu-info"><strong>Stream URL:</strong> <div className="url-text">{finalUrl || 'N/A'}</div></div>
                  {finalLogoUrl && <div className="context-menu-info"><strong>Logo URL:</strong> <div className="url-text">{finalLogoUrl}</div></div>}
                  {contextMenu.rawData && (
                      <div className="context-menu-info" style={{ marginTop: '5px', borderTop: '1px solid #373a40', paddingTop: '5px' }}>
                          <details>
                              <summary style={{ cursor: 'pointer', fontSize: '0.7rem', color: '#888' }}>Raw API Response</summary>
                              <pre style={{ 
                                  fontSize: '0.65rem', 
                                  maxHeight: '150px', 
                                  overflow: 'auto', 
                                  backgroundColor: '#000', 
                                  padding: '5px', 
                                  marginTop: '5px',
                                  color: '#40c057',
                                  borderRadius: '4px'
                              }}>
                                  {JSON.stringify(contextMenu.rawData, null, 2)}
                              </pre>
                          </details>
                      </div>
                  )}
              </div>
          );
      })()}

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

      {showDownloadManager && (
        <div style={{
          position: 'fixed',
          top: '60px',
          right: '20px',
          width: '450px',
          maxHeight: '600px',
          backgroundColor: 'var(--bg-secondary)',
          border: '2px solid var(--border)',
          borderRadius: '8px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
          zIndex: 10000,
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--bg-dark)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Download size={18} color={getSectionColor()} />
              <span style={{ fontWeight: 'bold' }}>Download Manager</span>
            </div>
            <button
              onClick={() => setShowDownloadManager(false)}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                padding: '4px'
              }}
            >
              <X size={18} />
            </button>
          </div>

          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '8px'
          }}>
            {downloads.length === 0 ? (
              <div style={{
                padding: '40px',
                textAlign: 'center',
                color: 'var(--text-secondary)',
                fontSize: '0.9rem'
              }}>
                No downloads yet. Click the download button on VOD or Series tiles to start.
              </div>
            ) : (
              downloads.map((dl, index) => (
                <div
                  key={dl.id}
                  style={{
                    padding: '12px',
                    marginBottom: '8px',
                    backgroundColor: 'var(--bg-dark)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px'
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '8px'
                  }}>
                    <div style={{
                      flex: 1,
                      fontSize: '0.85rem',
                      fontWeight: 'bold',
                      color: 'var(--text-primary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      marginRight: '8px'
                    }}>
                      {dl.name}
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {index > 0 && (
                        <button
                          onClick={() => moveDownload(dl.id, 'up')}
                          style={{
                            background: 'transparent',
                            border: '1px solid var(--border)',
                            borderRadius: '3px',
                            cursor: 'pointer',
                            padding: '2px',
                            display: 'flex',
                            alignItems: 'center'
                          }}
                          title="Move up"
                        >
                          <ArrowUp size={14} color="var(--text-secondary)" />
                        </button>
                      )}
                      {index < downloads.length - 1 && (
                        <button
                          onClick={() => moveDownload(dl.id, 'down')}
                          style={{
                            background: 'transparent',
                            border: '1px solid var(--border)',
                            borderRadius: '3px',
                            cursor: 'pointer',
                            padding: '2px',
                            display: 'flex',
                            alignItems: 'center'
                          }}
                          title="Move down"
                        >
                          <ArrowDown size={14} color="var(--text-secondary)" />
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (dl.status === 'downloading') {
                            cancelDownload(dl.id);
                          } else {
                            removeDownload(dl.id);
                          }
                        }}
                        style={{
                          background: 'transparent',
                          border: '1px solid #ff6b6b',
                          borderRadius: '3px',
                          cursor: 'pointer',
                          padding: '2px',
                          display: 'flex',
                          alignItems: 'center'
                        }}
                        title={dl.status === 'downloading' ? 'Cancel' : 'Remove'}
                      >
                        <X size={14} color="#ff6b6b" />
                      </button>
                    </div>
                  </div>

                  <div style={{
                    marginBottom: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '0.75rem'
                  }}>
                    <div style={{
                      padding: '2px 6px',
                      borderRadius: '3px',
                      backgroundColor:
                        dl.status === 'downloading' ? '#40c057' :
                        dl.status === 'completed' ? '#228be6' :
                        dl.status === 'error' ? '#ff6b6b' :
                        dl.status === 'cancelled' ? '#909296' :
                        '#ffd43b',
                      color: '#000',
                      fontWeight: 'bold',
                      fontSize: '0.7rem'
                    }}>
                      {dl.status.toUpperCase()}
                    </div>
                    {dl.status === 'downloading' && (
                      <span style={{ color: 'var(--text-secondary)' }}>{dl.speed}</span>
                    )}
                  </div>

                  {(dl.status === 'downloading' || dl.status === 'queued') && (
                    <div style={{
                      width: '100%',
                      height: '6px',
                      backgroundColor: 'var(--border)',
                      borderRadius: '3px',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        width: `${dl.progress}%`,
                        height: '100%',
                        backgroundColor: getSectionColor(),
                        transition: 'width 0.3s ease'
                      }} />
                    </div>
                  )}

                  {dl.status === 'downloading' && (
                    <div style={{
                      marginTop: '4px',
                      fontSize: '0.7rem',
                      color: 'var(--text-secondary)',
                      textAlign: 'right'
                    }}>
                      {dl.progress.toFixed(1)}%
                    </div>
                  )}

                  {dl.error && (
                    <div style={{
                      marginTop: '6px',
                      fontSize: '0.7rem',
                      color: '#ff6b6b',
                      padding: '4px',
                      backgroundColor: 'rgba(255, 107, 107, 0.1)',
                      borderRadius: '3px'
                    }}>
                      Error: {dl.error}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <div className="status-bar">{status}</div>
    </div>
  );
}

export default App;