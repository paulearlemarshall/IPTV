import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Play, Star } from 'lucide-react';
import CachedImage from './CachedImage';
import StarRating from './StarRating';

const INFO_BOX_HEIGHT = 100;
const METADATA_HEIGHT = 140;

const FlipBookView = ({ 
  streams, 
  currentIndex, 
  onIndexChange, 
  onPlay, 
  profileId, 
  cacheMap, 
  apiDebug,
  fetchMetadata,
  sectionColor,
  sectionType = 'vod'
}) => {
  const [metadata, setMetadata] = useState(null);
  const [isLoadingMeta, setIsLoadingMeta] = useState(false);

  const isLive = sectionType === 'live';
  
  const POSTER_WIDTH = isLive ? 480 : 280;
  const POSTER_HEIGHT = isLive ? 270 : 400;
  const SIDE_CARD_WIDTH = isLive ? 220 : 160;
  const SIDE_CARD_HEIGHT = isLive ? 160 : 260;

  const currentStream = streams[currentIndex];
  const prevStream = currentIndex > 0 ? streams[currentIndex - 1] : null;
  const nextStream = currentIndex < streams.length - 1 ? streams[currentIndex + 1] : null;

  useEffect(() => {
    if (!currentStream) return;
    
    setIsLoadingMeta(true);
    setMetadata(null);
    
    fetchMetadata(currentStream).then(data => {
      setMetadata(data);
      setIsLoadingMeta(false);
    }).catch(() => {
      setIsLoadingMeta(false);
    });
  }, [currentStream, fetchMetadata]);

  // Prefetch metadata for next 2 tiles
  useEffect(() => {
    if (isLive || !streams.length) return;

    const prefetchCount = 2;
    for (let i = 1; i <= prefetchCount; i++) {
      const nextIdx = currentIndex + i;
      if (nextIdx < streams.length) {
        const nextStream = streams[nextIdx];
        fetchMetadata(nextStream).catch(() => {});
      }
    }
  }, [currentIndex, streams, fetchMetadata, isLive]);

  const handlePrev = () => {
    if (currentIndex > 0) {
      onIndexChange(currentIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < streams.length - 1) {
      onIndexChange(currentIndex + 1);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'Enter' && currentStream) onPlay(currentStream);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, streams.length, currentStream]);

  if (!currentStream) {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '100%',
        color: '#666'
      }}>
        No streams to display
      </div>
    );
  }

  const name = currentStream.name || currentStream.title || 'Unknown';
  const plot = metadata?.plot || metadata?.description || '';
  const year = metadata?.releasedate?.split('-')[0] || metadata?.release_date?.split('-')[0] || '';
  const rating = parseFloat(metadata?.rating || 0);
  const duration = metadata?.duration_secs ? `${Math.floor(metadata.duration_secs / 60)} min` : (metadata?.duration || '');
  const cast = metadata?.cast || '';
  const director = metadata?.director || '';
  const genre = metadata?.genre || '';
  
  const backdrop = Array.isArray(metadata?.backdrop_path) 
    ? metadata.backdrop_path[0] 
    : (metadata?.backdrop_path || '');

  const BookEnd = ({ side }) => (
    <div style={{
      width: SIDE_CARD_WIDTH,
      height: SIDE_CARD_HEIGHT,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }}>
      <div style={{
        width: '24px',
        height: isLive ? '120px' : '180px',
        background: 'linear-gradient(to bottom, #3c3f44, #2c2e33)',
        borderRadius: side === 'left' ? '4px 0 0 4px' : '0 4px 4px 0',
        boxShadow: side === 'left' ? '2px 0 8px rgba(0,0,0,0.5)' : '-2px 0 8px rgba(0,0,0,0.5)'
      }} />
    </div>
  );

  const SideCard = ({ stream, side }) => {
    if (!stream) {
      return <BookEnd side={side} />;
    }
    
    const logo = stream.stream_icon || stream.cover;
    const streamName = stream.name || stream.title;
    
    return (
      <div 
        style={{
          width: SIDE_CARD_WIDTH,
          height: SIDE_CARD_HEIGHT,
          background: '#25262b',
          borderRadius: '8px',
          overflow: 'hidden',
          opacity: 0.6,
          transform: `perspective(800px) rotateY(${side === 'left' ? '25deg' : '-25deg'})`,
          transformOrigin: side === 'left' ? 'right center' : 'left center',
          cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          flexShrink: 0,
          zIndex: 2
        }}
        onClick={() => side === 'left' ? handlePrev() : handleNext()}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = '0.8';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = '0.6';
        }}
      >
        <div style={{ 
          width: '100%', 
          height: SIDE_CARD_HEIGHT - 40, 
          background: '#1a1b1e',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <CachedImage
            src={logo}
            alt={streamName}
            style={{ 
              width: '100%', 
              height: '100%', 
              objectFit: 'contain'
            }}
            profileId={profileId}
            cacheMap={cacheMap}
            apiDebug={apiDebug}
          />
        </div>
        <div style={{ 
          height: '40px',
          padding: '6px 8px', 
          fontSize: '0.7rem', 
          color: '#909296',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: 'flex',
          alignItems: 'center'
        }}>
          {streamName}
        </div>
      </div>
    );
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      padding: '20px',
      background: 'linear-gradient(180deg, #1a1b1e 0%, #25262b 100%)',
      overflow: 'hidden',
      position: 'relative'
    }}>
      {/* Backdrop Image */}
      {backdrop && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          opacity: 0.3,
          filter: 'blur(2px)',
          zIndex: 0,
          transition: 'opacity 0.5s ease-in-out'
        }}>
          <CachedImage
            src={backdrop}
            alt="backdrop"
            style={{ 
              width: '100%', 
              height: '100%', 
              objectFit: 'cover'
            }}
            profileId={profileId}
            cacheMap={cacheMap}
            apiDebug={apiDebug}
          />
        </div>
      )}
      {/* Dark overlay for backdrop */}
      {backdrop && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'radial-gradient(circle, transparent 0%, rgba(0,0,0,0.8) 100%)',
          zIndex: 1
        }} />
      )}

      {/* Counter */}
      <div style={{ 
        textAlign: 'center', 
        marginBottom: '15px',
        color: '#909296',
        fontSize: '0.9rem',
        height: '24px',
        flexShrink: 0,
        zIndex: 2
      }}>
        <span style={{ color: sectionColor, fontWeight: 'bold' }}>{currentIndex + 1}</span>
        <span> / {streams.length}</span>
      </div>

      {/* Carousel Container - Fixed Height */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '25px',
        flexShrink: 0,
        height: POSTER_HEIGHT + INFO_BOX_HEIGHT + 20,
        overflow: 'visible',
        zIndex: 2
      }}>
        {/* Left Arrow */}
        <button
          onClick={handlePrev}
          disabled={currentIndex === 0}
          style={{
            background: currentIndex === 0 ? '#2c2e33' : sectionColor,
            border: 'none',
            borderRadius: '50%',
            width: '50px',
            height: '50px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: currentIndex === 0 ? 'not-allowed' : 'pointer',
            opacity: currentIndex === 0 ? 0.3 : 1,
            flexShrink: 0,
            zIndex: 3
          }}
        >
          <ChevronLeft size={28} color={currentIndex === 0 ? '#666' : '#000'} />
        </button>

        {/* Cards Container */}
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          gap: '25px',
          zIndex: 2
        }}>
          {/* Previous Card */}
          <SideCard stream={prevStream} side="left" />

          {/* Center Card - Featured */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0',
            flexShrink: 0,
            zIndex: 4
          }}>
            {/* Poster Container - Fixed Size */}
            <div 
              style={{
                width: POSTER_WIDTH,
                height: POSTER_HEIGHT,
                background: '#1a1b1e',
                borderRadius: '12px 12px 0 0',
                overflow: 'hidden',
                boxShadow: `0 -4px 20px rgba(0,0,0,0.4), 0 0 0 2px ${sectionColor}`,
                cursor: 'pointer',
                position: 'relative',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onDoubleClick={() => onPlay(currentStream)}
            >
              <CachedImage
                src={currentStream.stream_icon || currentStream.cover}
                alt={name}
                style={{ 
                  maxWidth: '100%', 
                  maxHeight: '100%', 
                  objectFit: 'contain'
                }}
                profileId={profileId}
                cacheMap={cacheMap}
                apiDebug={apiDebug}
              />
              {/* Play overlay */}
              <div 
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'rgba(0,0,0,0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: 0,
                  transition: 'opacity 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                onMouseLeave={(e) => e.currentTarget.style.opacity = '0'}
                onClick={() => onPlay(currentStream)}
              >
                <div style={{
                  width: '70px',
                  height: '70px',
                  borderRadius: '50%',
                  background: sectionColor,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
                }}>
                  <Play size={36} color="#000" fill="#000" />
                </div>
              </div>
            </div>
            
            {/* Info Box - Fixed Size */}
            <div style={{ 
              width: POSTER_WIDTH,
              height: INFO_BOX_HEIGHT,
              background: '#2c2e33',
              borderRadius: '0 0 12px 12px',
              padding: '12px 15px',
              boxShadow: `0 4px 20px rgba(0,0,0,0.4), 0 0 0 2px ${sectionColor}`,
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              flexShrink: 0,
              zIndex: 4
            }}>
              {/* Title */}
              <div style={{ 
                fontSize: '1.1rem', 
                fontWeight: 'bold', 
                color: '#fff',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {name}
              </div>
              
              {/* Rating & Year Row */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between'
              }}>
                {!isLive && <StarRating rating={rating} size={14} />}
                {isLive && <div />}
                <div style={{ display: 'flex', gap: '10px', color: '#909296', fontSize: '0.85rem' }}>
                  {year && <span>{year}</span>}
                  {duration && <span>{duration}</span>}
                </div>
              </div>
              
              {/* Genre */}
              <div style={{ 
                fontSize: '0.8rem', 
                color: sectionColor,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                minHeight: '18px'
              }}>
                {genre || '\u00A0'}
              </div>
            </div>
          </div>

          {/* Next Card */}
          <SideCard stream={nextStream} side="right" />
        </div>

        {/* Right Arrow */}
        <button
          onClick={handleNext}
          disabled={currentIndex === streams.length - 1}
          style={{
            background: currentIndex === streams.length - 1 ? '#2c2e33' : sectionColor,
            border: 'none',
            borderRadius: '50%',
            width: '50px',
            height: '50px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: currentIndex === streams.length - 1 ? 'not-allowed' : 'pointer',
            opacity: currentIndex === streams.length - 1 ? 0.3 : 1,
            flexShrink: 0,
            zIndex: 3
          }}
        >
          <ChevronRight size={28} color={currentIndex === streams.length - 1 ? '#666' : '#000'} />
        </button>
      </div>

      {/* Metadata Panel - Fixed Height, Expands Horizontally */}
      {!isLive && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          marginTop: '20px',
          flexShrink: 0,
          zIndex: 2
        }}>
          <div style={{
            width: '100%',
            maxWidth: '700px',
            minWidth: '400px',
            height: METADATA_HEIGHT,
            background: '#25262b',
            borderRadius: '8px',
            padding: '15px 20px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            boxSizing: 'border-box',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 3
          }}>
            {isLoadingMeta ? (
              <div style={{ 
                color: '#555', 
                textAlign: 'center', 
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                Loading metadata...
              </div>
            ) : (
              <>
                {/* Director & Cast Row - Fixed Height */}
                <div style={{ 
                  display: 'flex',
                  gap: '20px',
                  marginBottom: '10px',
                  minHeight: '22px',
                  flexShrink: 0
                }}>
                  {director && (
                    <div style={{ 
                      fontSize: '0.85rem', 
                      color: '#c1c2c5',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      flex: '0 0 auto',
                      maxWidth: '45%'
                    }}>
                      <span style={{ color: '#909296' }}>Director: </span>{director}
                    </div>
                  )}
                  {cast && (
                    <div style={{ 
                      fontSize: '0.85rem', 
                      color: '#c1c2c5',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      flex: '1 1 auto'
                    }}>
                      <span style={{ color: '#909296' }}>Cast: </span>{cast}
                    </div>
                  )}
                  {!director && !cast && (
                    <div style={{ color: '#444', fontSize: '0.85rem' }}>&nbsp;</div>
                  )}
                </div>
                
                {/* Plot - Scrollable within fixed height */}
                <div style={{ 
                  flex: '1 1 auto',
                  overflow: 'auto',
                  minHeight: 0
                }}>
                  {plot ? (
                    <div style={{ 
                      fontSize: '0.9rem', 
                      color: '#c1c2c5', 
                      lineHeight: '1.5'
                    }}>
                      {plot}
                    </div>
                  ) : (
                    <div style={{ 
                      color: '#444', 
                      fontStyle: 'italic', 
                      textAlign: 'center',
                      paddingTop: '20px'
                    }}>
                      No description available
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Instructions */}
      <div style={{ 
        textAlign: 'center', 
        marginTop: '15px',
        color: '#444',
        fontSize: '0.75rem',
        flexShrink: 0,
        zIndex: 2
      }}>
        ← → arrow keys to navigate • Double-click to play
      </div>
    </div>
  );
};

export default FlipBookView;
