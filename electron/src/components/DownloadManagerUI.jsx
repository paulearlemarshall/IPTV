import React from 'react';
import { Download, X, ArrowUp, ArrowDown } from 'lucide-react';

const DownloadManagerUI = ({ 
  showDownloadManager, 
  setShowDownloadManager, 
  downloads, 
  cancelDownload, 
  removeDownload, 
  moveDownload,
  getSectionColor
}) => {
  if (!showDownloadManager) return null;

  return (
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
  );
};

export default DownloadManagerUI;
