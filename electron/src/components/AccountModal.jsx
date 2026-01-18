import React from 'react';
import { X, User, Activity, Server, Clock, Calendar, ShieldCheck, MessageSquare } from 'lucide-react';

const AccountModal = ({ accountInfo, clearAccountInfo }) => {
  if (!accountInfo) return null;

  const userInfo = accountInfo.user_info || {};
  const serverInfo = accountInfo.server_info || {};

  return (
    <div className="modal-overlay" onClick={clearAccountInfo}>
      <div className="transcoder-modal" onClick={e => e.stopPropagation()} style={{ width: '650px', height: 'auto', maxHeight: '80vh' }}>
        <div className="transcoder-header" style={{ background: 'linear-gradient(to right, rgba(64, 192, 87, 0.1), transparent)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <User size={24} color="#40c057" />
            <div>
              <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#fff' }}>Account Details</div>
              <div style={{ fontSize: '0.65rem', color: '#909296', textTransform: 'uppercase' }}>Subscription Status</div>
            </div>
          </div>
          <button className="close-modal-btn" onClick={clearAccountInfo}><X size={20} /></button>
        </div>

        <div className="transcoder-body">
          <div className="setting-group">
            <h3 style={{ color: '#40c057' }}><User size={14} style={{ marginRight: '6px' }} /> User Profile</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div className="toggle-card">
                <div><div style={{ fontSize: '0.7rem', color: '#909296' }}>Username</div><div style={{ fontWeight: 'bold' }}>{userInfo.username}</div></div>
              </div>
              <div className="toggle-card">
                <div><div style={{ fontSize: '0.7rem', color: '#909296' }}>Status</div><div style={{ fontWeight: 'bold', color: userInfo.status === 'Active' ? '#40c057' : '#ff6b6b' }}>{userInfo.status}</div></div>
              </div>
              <div className="toggle-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Calendar size={18} color="#ffd43b" />
                    <div><div style={{ fontSize: '0.7rem', color: '#909296' }}>Expiry Date</div><div style={{ fontWeight: 'bold' }}>{userInfo.exp_date ? new Date(parseInt(userInfo.exp_date) * 1000).toLocaleDateString() : 'N/A'}</div></div>
                </div>
              </div>
              <div className="toggle-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Clock size={18} color="#339af0" />
                    <div><div style={{ fontSize: '0.7rem', color: '#909296' }}>Created At</div><div style={{ fontWeight: 'bold' }}>{userInfo.created_at ? new Date(parseInt(userInfo.created_at) * 1000).toLocaleDateString() : 'N/A'}</div></div>
                </div>
              </div>
            </div>
            
            <div style={{ marginTop: '10px', display: 'flex', gap: '10px' }}>
                <div className="toggle-card" style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Activity size={18} color="#cc5de8" />
                        <div>
                            <div style={{ fontSize: '0.7rem', color: '#909296' }}>Active Connections</div>
                            <div style={{ fontWeight: 'bold' }}>{userInfo.active_cons} / {userInfo.max_connections}</div>
                        </div>
                    </div>
                </div>
                <div className="toggle-card" style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <ShieldCheck size={18} color="#ff922b" />
                        <div>
                            <div style={{ fontSize: '0.7rem', color: '#909296' }}>Trial Account</div>
                            <div style={{ fontWeight: 'bold' }}>{userInfo.is_trial === "1" ? "Yes" : "No"}</div>
                        </div>
                    </div>
                </div>
            </div>
          </div>

          <div className="setting-group">
            <h3 style={{ color: '#339af0' }}><Server size={14} style={{ marginRight: '6px' }} /> Server Information</h3>
            <div style={{ background: '#141517', padding: '15px', borderRadius: '8px', border: '1px solid #373a40', fontSize: '0.8rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                    <span style={{ color: '#909296' }}>URL:</span> <span>{serverInfo.url}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                    <span style={{ color: '#909296' }}>Port (HTTP/HTTPS):</span> <span>{serverInfo.port} / {serverInfo.https_port}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                    <span style={{ color: '#909296' }}>Protocol:</span> <span>{serverInfo.server_protocol}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#909296' }}>Timezone:</span> <span>{serverInfo.timezone}</span>
                </div>
            </div>
          </div>

          {userInfo.message && (
            <div style={{ marginTop: '20px', padding: '10px', background: 'rgba(51, 154, 240, 0.1)', borderRadius: '6px', borderLeft: '3px solid #339af0', display: 'flex', gap: '10px', alignItems: 'center' }}>
                <MessageSquare size={16} color="#339af0" />
                <div style={{ fontStyle: 'italic', fontSize: '0.8rem', color: '#c1c2c5' }}>"{userInfo.message}"</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AccountModal;
