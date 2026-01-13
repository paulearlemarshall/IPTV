import React from 'react';
import { Copy } from 'lucide-react';
import StarRating from './StarRating';

const ContextMenu = ({
  contextMenu,
  getXcUrl,
  selectedSection,
  currentProfile,
  selectedServer,
  getXcLogoUrl,
  copyToClipboard,
  isLoading
}) => {
  if (!contextMenu) return null;

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
};

export default ContextMenu;
