import React from 'react';
import { X, User } from 'lucide-react';

const AccountModal = ({ accountInfo, clearAccountInfo }) => {
  if (!accountInfo) return null;

  return (
    <div className="modal-overlay" onClick={clearAccountInfo}>
      <div className="account-modal" onClick={e => e.stopPropagation()} style={{ position: 'relative' }}>
        <button className="close-modal-btn" onClick={clearAccountInfo}><X size={20} /></button>
        <div className="series-browser-header" style={{ marginBottom: '0' }}>
          <div className="series-header-info">
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <User size={24} /> Account Details
            </h2>
          </div>
        </div>
        <div className="account-body">
          <div className="account-grid">
            <div className="account-section">
              <h3>User Profile</h3>
              <div className="account-row"><span>Username:</span> <span>{accountInfo.user_info?.username}</span></div>
              <div className="account-row"><span>Password:</span> <span>{accountInfo.user_info?.password}</span></div>
              <div className="account-row">
                <span>Status:</span> 
                <span style={{ color: accountInfo.user_info?.status === 'Active' ? '#40c057' : '#ff6b6b' }}>
                  {accountInfo.user_info?.status}
                </span>
              </div>
              <div className="account-row">
                <span>Expiry:</span> 
                <span>{accountInfo.user_info?.exp_date ? new Date(parseInt(accountInfo.user_info.exp_date) * 1000).toLocaleDateString() : 'N/A'}</span>
              </div>
              <div className="account-row">
                <span>Created:</span> 
                <span>{accountInfo.user_info?.created_at ? new Date(parseInt(accountInfo.user_info.created_at) * 1000).toLocaleDateString() : 'N/A'}</span>
              </div>
              <div className="account-row"><span>Trial:</span> <span>{accountInfo.user_info?.is_trial === "1" ? "Yes" : "No"}</span></div>
              <div className="account-row"><span>Auth:</span> <span>{accountInfo.user_info?.auth}</span></div>
            </div>
            <div className="account-section">
              <h3>Connections</h3>
              <div className="account-row"><span>Max Allowed:</span> <span>{accountInfo.user_info?.max_connections}</span></div>
              <div className="account-row"><span>Currently Active:</span> <span>{accountInfo.user_info?.active_cons}</span></div>
              <div className="account-row"><span>Formats:</span> <span>{accountInfo.user_info?.allowed_output_formats?.join(', ')}</span></div>
              <div className="account-row" style={{ marginTop: '10px' }}>
                <span>Message:</span> 
                <span style={{ fontStyle: 'italic' }}>{accountInfo.user_info?.message || "No system messages"}</span>
              </div>
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
            <details>
              <summary style={{ cursor: 'pointer', fontSize: '0.8rem', color: '#888' }}>Raw Response</summary>
              <pre>{JSON.stringify(accountInfo, null, 2)}</pre>
            </details>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountModal;
