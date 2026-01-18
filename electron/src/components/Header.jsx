import React from 'react';
import { Settings, RefreshCw, Play, Search, X, User, Bug, Calendar, ArrowDown, BookOpen, Film, Dna, Thermometer, Timer } from 'lucide-react';

const Header = ({
  currentProfile,
  selectedServer,
  setSelectedServer,
  setShowProfiles,
  fetchAccountInfo,
  getSectionColor,
  selectedSection,
  setSelectedSection,
  setSelectedCategory,
  setStreams,
  backToList,
  setLastCategoryClick,
  flipBookMode,
  setFlipBookMode,
  setFlipBookIndex,
  showPlot,
  setShowPlot,
  downloads,
  setShowDownloadManager,
  showDownloadManager,
  apiDebug,
  setApiDebug,
  setStatus,
  tileSize,
  setTileSize,
  playerMode,
  setPlayerMode,
  handleVlcPathChange,
  castDevices,
  selectedCastDevice,
  setSelectedCastDevice,
  availableIps,
  selectedProxyIp,
  setSelectedProxyIp,
  searchQuery,
  setSearchQuery,
  englishOnly,
  setEnglishOnly,
  sortByYear,
  setSortByYear,
  yearFilter,
  setYearFilter,
  handleFfmpegPathChange,
  ffmpegPath,
  transcoderSettings,
  setShowTranscoderSettings,
  stressTestMode,
  setStressTestMode,
  speedTestMode,
  setSpeedTestMode
}) => {
  return (
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
        <button className="btn" onClick={() => setShowProfiles(true)} style={{ background: 'transparent', border: 'none' }}>
          <Settings size={16} /> Profiles
        </button>

        <select value={selectedServer} onChange={(e) => setSelectedServer(e.target.value)} style={{ width: '150px' }}>
          {currentProfile?.servers?.map(url => <option key={url} value={url}>{url}</option>)}
        </select>

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

        {/* EN filter toggle (moved next to section tabs) */}
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

        <button
          className="btn"
          onClick={handleFfmpegPathChange}
          style={{
              background: 'transparent',
              border: !ffmpegPath ? '1px solid #ff6b6b' : 'none',
              color: ffmpegPath ? '#40c057' : '#ff6b6b',
              display: 'flex',
              alignItems: 'center',
              padding: '4px'
          }}
          title={ffmpegPath ? `FFmpeg: ${ffmpegPath}` : 'Required: Click to set FFmpeg Path'}
        >
          <Film size={16} />
        </button>

        <button
          className="btn"
          onClick={() => ffmpegPath && setShowTranscoderSettings(true)}
          style={{
              background: 'transparent',
              border: 'none',
              color: !ffmpegPath ? '#555' : (transcoderSettings.enabled ? '#ffd43b' : '#909296'),
              display: 'flex',
              alignItems: 'center',
              padding: '4px',
              cursor: ffmpegPath ? 'pointer' : 'not-allowed',
              opacity: ffmpegPath ? 1 : 0.5
          }}
          title={!ffmpegPath ? 'Set FFmpeg path first' : (transcoderSettings.enabled ? 'Transcoder: ON (Click for Settings)' : 'Transcoder: OFF (Click for Settings)')}
        >
          <Dna size={16} />
        </button>

        <button
          className="btn"
          onClick={() => ffmpegPath && setStressTestMode(!stressTestMode)}
          style={{
              background: stressTestMode ? '#e03131' : 'transparent',
              border: 'none',
              borderRadius: '4px',
              color: stressTestMode ? '#fff' : (!ffmpegPath ? '#555' : '#909296'),
              display: 'flex',
              alignItems: 'center',
              padding: '4px',
              cursor: ffmpegPath ? 'pointer' : 'not-allowed',
              opacity: ffmpegPath ? 1 : 0.5
          }}
          title={!ffmpegPath ? 'Set FFmpeg path first' : (stressTestMode ? 'Stress Test Mode: ON (Click stream to test)' : 'Stress Test Mode: OFF')}
        >
          <Thermometer size={16} />
        </button>

        <button
          className="btn"
          onClick={() => setSpeedTestMode(!speedTestMode)}
          style={{
              background: speedTestMode ? '#3b5bdb' : 'transparent',
              border: 'none',
              borderRadius: '4px',
              color: speedTestMode ? '#fff' : '#909296',
              display: 'flex',
              alignItems: 'center',
              padding: '4px',
              cursor: 'pointer'
          }}
          title={speedTestMode ? 'Speed Test Mode: ON (Click VOD/Series to test)' : 'Speed Test Mode: OFF'}
        >
          <Timer size={16} />
        </button>

        <input type="range" min="100" max="400" value={tileSize} onChange={(e) => setTileSize(Number(e.target.value))} style={{ width: '60px' }} />

        <div className="player-selector" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {['vlc', 'internal', 'cast'].map(m => (
            <React.Fragment key={m}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '0.7rem' }}>
                <input 
                    type="radio" 
                    name="playerMode" 
                    checked={playerMode === m} 
                    onChange={() => {
                        setPlayerMode(m);
                        if (m === 'cast') window.api.castScan();
                    }} 
                /> 
                <span onClick={m === 'vlc' ? handleVlcPathChange : undefined} style={{ cursor: m === 'vlc' ? 'pointer' : 'inherit' }}>{m.toUpperCase()}</span>
              </label>
              {m === 'cast' && playerMode === 'cast' && (
                <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
                  <select value={selectedCastDevice} onChange={(e) => setSelectedCastDevice(e.target.value)} style={{ padding: '1px 4px', fontSize: '0.65rem', width: '100px', marginLeft: '2px', height: '20px' }}>
                    {castDevices.map(name => <option key={name} value={name}>{name}</option>)}
                  </select>
                  <button 
                    className="btn" 
                    onClick={() => window.api.castStop(selectedCastDevice)}
                    style={{ 
                        padding: '0 4px', 
                        height: '20px', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        background: 'rgba(255, 107, 107, 0.1)',
                        border: '1px solid #ff6b6b',
                        color: '#ff6b6b'
                    }}
                    title="Stop Casting"
                  >
                    <X size={12} strokeWidth={3} />
                  </button>
                  <select 
                    value={selectedProxyIp} 
                    onChange={(e) => setSelectedProxyIp(e.target.value)} 
                    style={{ padding: '1px 4px', fontSize: '0.65rem', width: '110px', height: '20px' }}
                    title="Select the local IP for the Chromecast proxy"
                  >
                    {availableIps.map(ip => <option key={ip} value={ip}>{ip}</option>)}
                  </select>
                </div>
              )}
            </React.Fragment>
          ))}
        </div>

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

        <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} style={{ width: '80px', fontSize: '0.75rem' }}>
          <option value="none">Year</option>
          {Array.from({ length: new Date().getFullYear() - 1950 + 1 }, (_, i) => new Date().getFullYear() - i).map(year => (
            <option key={year} value={year}>{year}</option>
          ))}
        </select>

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
  );
};

export default Header;
