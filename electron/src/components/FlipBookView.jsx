import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Play } from 'lucide-react';
import CachedImage from './CachedImage';
import StarRating from './StarRating';

import { Swiper, SwiperSlide } from 'swiper/react';
import { EffectCoverflow, Navigation, Keyboard, Mousewheel } from 'swiper/modules';

import 'swiper/css';
import 'swiper/css/effect-coverflow';
import 'swiper/css/navigation';

const FlipBookView = ({ 
  streams, 
  currentIndex, 
  onIndexChange, 
  onPlay, 
  profileId, 
  cacheMap, 
  apiDebug,
  fetchMetadata,
  metadataCache,
  sectionColor,
  sectionType = 'vod'
}) => {
  const [metadata, setMetadata] = useState(null);
  const [isLoadingMeta, setIsLoadingMeta] = useState(false);
  const [containerHeight, setContainerHeight] = useState(600);
  const swiperRef = useRef(null);
  const containerRef = useRef(null);

  const isLive = sectionType === 'live';
  
  const INFO_BOX_HEIGHT = 90;
  const MIN_METADATA_HEIGHT = 100;
  const HEADER_FOOTER_HEIGHT = 100;
  
  const availableHeight = containerHeight - HEADER_FOOTER_HEIGHT;
  const posterRatio = isLive ? (9/16) : (3/2);
  
  const basePosterWidth = isLive ? 420 : 260;
  const basePosterHeight = isLive ? Math.round(420 * 9/16) : Math.round(260 * 3/2);
  
  const maxPosterHeight = Math.min(basePosterHeight, availableHeight * 0.55);
  const POSTER_HEIGHT = Math.max(200, maxPosterHeight);
  const POSTER_WIDTH = isLive ? Math.round(POSTER_HEIGHT * 16/9) : Math.round(POSTER_HEIGHT * 2/3);
  
  const metadataAvailable = availableHeight - POSTER_HEIGHT - INFO_BOX_HEIGHT - 40;
  const METADATA_HEIGHT = isLive ? 0 : Math.max(MIN_METADATA_HEIGHT, Math.min(metadataAvailable, 200));

  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        setContainerHeight(containerRef.current.clientHeight);
      }
    };
    
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  const currentStream = streams[currentIndex];

  useEffect(() => {
    if (!currentStream) return;
    
    const id = currentStream.stream_id || currentStream.series_id || currentStream.id;
    const cacheKey = `${sectionType}_${id}`;
    const cached = metadataCache && metadataCache[cacheKey];

    if (cached) {
      setMetadata(cached);
      setIsLoadingMeta(false);
    } else {
      setIsLoadingMeta(true);
      setMetadata(null);
      
      fetchMetadata(currentStream).then(data => {
        if (data) setMetadata(data);
        setIsLoadingMeta(false);
      }).catch(() => {
        setIsLoadingMeta(false);
      });
    }
  }, [currentStream, fetchMetadata, sectionType, metadataCache]);

  useEffect(() => {
    if (isLive || !streams.length) return;

    const timer = setTimeout(() => {
      const prefetchCount = 2;
      for (let i = 1; i <= prefetchCount; i++) {
        const nextIdx = currentIndex + i;
        if (nextIdx < streams.length) {
          const nextS = streams[nextIdx];
          const nextId = nextS.stream_id || nextS.series_id || nextS.id;
          const cacheKey = `${sectionType}_${nextId}`;
          
          if (!metadataCache || !metadataCache[cacheKey]) {
            fetchMetadata(nextS).catch(() => {});
          }
        }
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [currentIndex, streams, fetchMetadata, isLive, sectionType, metadataCache]);

  if (!streams || streams.length === 0) {
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

  const name = currentStream?.name || currentStream?.title || 'Unknown';
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

  return (
    <div 
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '15px 20px',
        background: 'linear-gradient(180deg, #1a1b1e 0%, #25262b 100%)',
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      {/* Backdrop */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        opacity: (metadata && backdrop) ? 0.3 : 0,
        filter: 'blur(2px)',
        zIndex: 0,
        transition: 'opacity 0.6s ease-in-out',
        backgroundColor: '#000'
      }}>
        {backdrop && (
          <CachedImage
            src={backdrop}
            alt="backdrop"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            profileId={profileId}
            cacheMap={cacheMap}
            apiDebug={apiDebug}
          />
        )}
      </div>
      
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'radial-gradient(circle, transparent 0%, rgba(0,0,0,0.8) 100%)',
        zIndex: 1,
        opacity: (metadata && backdrop) ? 1 : 0,
        transition: 'opacity 0.6s ease-in-out'
      }} />

      {/* Counter */}
      <div style={{ 
        textAlign: 'center', 
        marginBottom: '10px',
        color: '#909296',
        fontSize: '0.85rem',
        flexShrink: 0,
        zIndex: 2
      }}>
        <span style={{ color: sectionColor, fontWeight: 'bold' }}>{currentIndex + 1}</span>
        <span> / {streams.length}</span>
      </div>

      {/* Swiper Container */}
      <div style={{
        flex: '1 1 auto',
        width: '100%',
        position: 'relative',
        zIndex: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'visible',
        minHeight: 0
      }}>
        {/* Navigation Buttons */}
        <button
          className="swiper-prev-btn"
          style={{
            position: 'absolute',
            left: '20px',
            top: '50%',
            transform: 'translateY(-50%)',
            background: currentIndex === 0 ? '#2c2e33' : sectionColor,
            border: 'none',
            borderRadius: '50%',
            width: '45px',
            height: '45px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: currentIndex === 0 ? 'not-allowed' : 'pointer',
            opacity: currentIndex === 0 ? 0.3 : 1,
            zIndex: 10
          }}
        >
          <ChevronLeft size={24} color={currentIndex === 0 ? '#666' : '#000'} />
        </button>

        <button
          className="swiper-next-btn"
          style={{
            position: 'absolute',
            right: '20px',
            top: '50%',
            transform: 'translateY(-50%)',
            background: currentIndex === streams.length - 1 ? '#2c2e33' : sectionColor,
            border: 'none',
            borderRadius: '50%',
            width: '45px',
            height: '45px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: currentIndex === streams.length - 1 ? 'not-allowed' : 'pointer',
            opacity: currentIndex === streams.length - 1 ? 0.3 : 1,
            zIndex: 10
          }}
        >
          <ChevronRight size={24} color={currentIndex === streams.length - 1 ? '#666' : '#000'} />
        </button>

        <Swiper
          effect={'coverflow'}
          grabCursor={true}
          centeredSlides={true}
          slidesPerView={'auto'}
          initialSlide={currentIndex}
          coverflowEffect={{
            rotate: 30,
            stretch: 0,
            depth: 200,
            modifier: 1,
            slideShadows: true,
          }}
          navigation={{
            prevEl: '.swiper-prev-btn',
            nextEl: '.swiper-next-btn',
          }}
          keyboard={{ enabled: true }}
          mousewheel={true}
          modules={[EffectCoverflow, Navigation, Keyboard, Mousewheel]}
          onSlideChange={(swiper) => onIndexChange(swiper.activeIndex)}
          onSwiper={(swiper) => { swiperRef.current = swiper; }}
          style={{
            width: '100%',
            paddingTop: '30px',
            paddingBottom: '30px',
            overflow: 'visible'
          }}
        >
          {streams.map((stream, index) => (
            <SwiperSlide 
              key={stream.stream_id || stream.series_id || stream.id || index}
              style={{
                width: POSTER_WIDTH,
                backgroundPosition: 'center',
                backgroundSize: 'cover',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                filter: index === currentIndex ? 'none' : 'brightness(0.5)',
                transition: 'filter 0.3s'
              }}
            >
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0',
                width: '100%'
              }}>
                {/* Poster */}
                <div 
                  style={{
                    width: POSTER_WIDTH,
                    height: POSTER_HEIGHT,
                    background: '#1a1b1e',
                    borderRadius: '10px 10px 0 0',
                    overflow: 'hidden',
                    boxShadow: index === currentIndex ? `0 -4px 20px rgba(0,0,0,0.4), 0 0 0 2px ${sectionColor}` : '0 -4px 10px rgba(0,0,0,0.3)',
                    cursor: 'pointer',
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  onDoubleClick={() => onPlay(stream)}
                >
                  <CachedImage
                    src={stream.stream_icon || stream.cover}
                    alt={stream.name || stream.title}
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                    profileId={profileId}
                    cacheMap={cacheMap}
                    apiDebug={apiDebug}
                  />
                  {index === currentIndex && (
                    <div 
                      style={{
                        position: 'absolute',
                        top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.4)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: 0,
                        transition: 'opacity 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                      onMouseLeave={(e) => e.currentTarget.style.opacity = '0'}
                      onClick={() => onPlay(stream)}
                    >
                      <div style={{
                        width: '60px',
                        height: '60px',
                        borderRadius: '50%',
                        background: sectionColor,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
                      }}>
                        <Play size={30} color="#000" fill="#000" />
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Info Box */}
                <div style={{ 
                  width: POSTER_WIDTH,
                  height: INFO_BOX_HEIGHT,
                  background: '#2c2e33',
                  borderRadius: '0 0 10px 10px',
                  padding: '10px 12px',
                  boxShadow: index === currentIndex ? `0 4px 20px rgba(0,0,0,0.4), 0 0 0 2px ${sectionColor}` : '0 4px 10px rgba(0,0,0,0.3)',
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between'
                }}>
                  <div style={{ 
                    fontSize: '1rem', 
                    fontWeight: 'bold', 
                    color: '#fff',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {stream.name || stream.title}
                  </div>
                  
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between'
                  }}>
                    {!isLive && index === currentIndex && <StarRating rating={rating} size={12} />}
                    {(index !== currentIndex || isLive) && <div />}
                    <div style={{ display: 'flex', gap: '8px', color: '#909296', fontSize: '0.8rem' }}>
                      {index === currentIndex && year && <span>{year}</span>}
                      {index === currentIndex && duration && <span>{duration}</span>}
                    </div>
                  </div>
                  
                  <div style={{ 
                    fontSize: '0.75rem', 
                    color: sectionColor,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    minHeight: '16px'
                  }}>
                    {index === currentIndex ? (genre || '\u00A0') : '\u00A0'}
                  </div>
                </div>
              </div>
            </SwiperSlide>
          ))}
        </Swiper>
      </div>

      {/* Metadata Panel - Responsive */}
      {!isLive && METADATA_HEIGHT > 0 && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          marginTop: '15px',
          flexShrink: 0,
          zIndex: 2
        }}>
          <div style={{
            width: '100%',
            maxWidth: '750px',
            minWidth: '350px',
            height: METADATA_HEIGHT,
            background: 'rgba(37, 38, 43, 0.95)',
            borderRadius: '8px',
            padding: '12px 18px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            boxSizing: 'border-box',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
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
                <div style={{ 
                  display: 'flex',
                  gap: '15px',
                  marginBottom: '8px',
                  minHeight: '20px',
                  flexShrink: 0
                }}>
                  {director && (
                    <div style={{ 
                      fontSize: '0.8rem', 
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
                      fontSize: '0.8rem', 
                      color: '#c1c2c5',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      flex: '1 1 auto'
                    }}>
                      <span style={{ color: '#909296' }}>Cast: </span>{cast}
                    </div>
                  )}
                  {!director && !cast && <div style={{ color: '#444', fontSize: '0.8rem' }}>&nbsp;</div>}
                </div>
                
                <div style={{ 
                  flex: '1 1 auto',
                  overflow: 'auto',
                  minHeight: 0
                }}>
                  {plot ? (
                    <div style={{ 
                      fontSize: '0.85rem', 
                      color: '#c1c2c5', 
                      lineHeight: '1.4'
                    }}>
                      {plot}
                    </div>
                  ) : (
                    <div style={{ 
                      color: '#444', 
                      fontStyle: 'italic', 
                      textAlign: 'center',
                      paddingTop: '15px'
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
        marginTop: '10px',
        color: '#444',
        fontSize: '0.7rem',
        flexShrink: 0,
        zIndex: 2
      }}>
        ← → or mouse wheel to navigate • Double-click to play
      </div>
    </div>
  );
};

export default FlipBookView;
