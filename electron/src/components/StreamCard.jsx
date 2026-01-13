import React, { useState, useEffect, useRef } from 'react';
import { Star, Download } from 'lucide-react';
import CachedImage from './CachedImage';
import StarRating from './StarRating';
import { useIntersectionObserver } from '../hooks/useIntersectionObserver';

const StreamCard = React.memo(({ stream, showPlot, onDoubleClick, onContextMenu, profileId, cacheMap, apiDebug, fetchMetadata, metadataCache, sectionType, onDownload, isFavorite, onToggleFavorite }) => {
  const [metadata, setMetadata] = useState(null);
  const cardRef = useRef(null);
  const [isVisible] = useIntersectionObserver(cardRef, { rootMargin: '200px' });

  useEffect(() => {
    if (showPlot && isVisible && !metadata && (sectionType === 'vod' || sectionType === 'series')) {
      const id = stream.stream_id || stream.series_id || stream.id;
      const cacheKey = `${sectionType}_${id}`;

      if (metadataCache && metadataCache[cacheKey]) {
        setMetadata(metadataCache[cacheKey]);
      } else {
        fetchMetadata(stream).then(data => {
          if (data) setMetadata(data);
        });
      }
    }
  }, [showPlot, isVisible, stream, fetchMetadata, metadata, metadataCache, sectionType]);

  const logo = stream.stream_icon || stream.cover;
  const name = stream.name || stream.title;
  const plot = metadata?.plot || metadata?.description || '';
  const year = metadata?.releasedate?.split('-')[0] || metadata?.release_date?.split('-')[0] || '';
  const rating = parseFloat(metadata?.rating || 0);
  const duration = metadata?.duration_secs ? `${Math.floor(metadata.duration_secs / 60)}m` : (metadata?.duration || '');
  const cast = metadata?.cast || '';
  const director = metadata?.director || '';

  return (
    <div
      ref={cardRef}
      className="stream-card"
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      style={{
        height: showPlot && (sectionType === 'vod' || sectionType === 'series') ? '480px' : undefined,
        minHeight: showPlot && (sectionType === 'vod' || sectionType === 'series') ? '420px' : undefined,
        maxHeight: showPlot && (sectionType === 'vod' || sectionType === 'series') ? '550px' : undefined
      }}
    >
      <CachedImage
        src={logo}
        alt={name}
        className="stream-logo"
        profileId={profileId}
        cacheMap={cacheMap}
        apiDebug={apiDebug}
      />
      <div className="stream-name" style={{ fontWeight: 'bold' }}>{name}</div>
      
      {sectionType !== 'episode' && (
        <button
          className="favorite-btn"
          onClick={(e) => {
            e.stopPropagation();
            if (onToggleFavorite) onToggleFavorite(stream);
          }}
          style={{
            position: 'absolute',
            top: '5px',
            right: '5px',
            background: 'rgba(0, 0, 0, 0.5)',
            border: 'none',
            borderRadius: '50%',
            width: '24px',
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 11,
            transition: 'transform 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.2)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          <Star size={14} fill={isFavorite ? "#ffd43b" : "none"} color={isFavorite ? "#ffd43b" : "#909296"} />
        </button>
      )}

      {(sectionType === 'vod' || sectionType === 'series') && (
        <button
          className="download-btn"
          onClick={(e) => {
            e.stopPropagation();
            if (onDownload) onDownload(stream);
          }}
          style={{
            position: 'absolute',
            bottom: '-1px',
            right: '-1px',
            background: 'rgba(0, 0, 0, 0.7)',
            border: '1px solid var(--section-accent)',
            borderRight: 'none',
            borderBottom: 'none',
            borderRadius: '4px 0 4px 0',
            padding: '3px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.2s, transform 0.2s',
            zIndex: 10
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--section-accent)';
            e.currentTarget.style.transform = 'scale(1.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(0, 0, 0, 0.7)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
          title="Download"
        >
          <Download size={8} color="white" />
        </button>
      )}
      {showPlot && (sectionType === 'vod' || sectionType === 'series') && (
        <div className="stream-plot">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <StarRating rating={rating} />
            {duration && <span style={{ fontSize: '0.7rem', color: '#888' }}>{duration}</span>}
          </div>
          
          <div style={{ fontSize: '0.75rem', color: '#ffd43b', marginBottom: '4px' }}>
            {year && <span>{year}</span>}
            {director && <span style={{ marginLeft: '8px', color: '#aaa' }}>Dir: {director}</span>}
          </div>

          {cast && (
            <div style={{ fontSize: '0.65rem', color: '#909296', marginBottom: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <strong>Cast:</strong> {cast}
            </div>
          )}

          {plot ? (
            <div style={{
              fontSize: '0.7rem',
              color: '#c1c2c5',
              lineHeight: '1.3',
              flex: '1 1 0',
              minHeight: 0,
              overflow: 'auto'
            }}>
              {plot}
            </div>
          ) : (
            <div style={{ fontSize: '0.7rem', color: '#555', fontStyle: 'italic' }}>
              {metadata === null ? 'Loading...' : 'No description available'}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default StreamCard;
