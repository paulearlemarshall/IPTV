import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Save, Check, Edit2, User } from 'lucide-react';

const ProfileManager = ({ onClose, onProfileChanged }) => {
    const [profiles, setProfiles] = useState([]);
    const [activeId, setActiveId] = useState(null);
    const [editingId, setEditingId] = useState(null);
    
    // Form State
    const [formData, setFormData] = useState({
        name: '',
        username: '',
        password: '',
        servers: ['http://']
    });

    useEffect(() => {
        loadProfiles();
    }, []);

    const loadProfiles = async () => {
        if (window.api && window.api.config) {
            const config = await window.api.config.load();
            setProfiles(config.profiles || []);
            setActiveId(config.activeProfileId);
        }
    };

    const handleSaveConfig = async (newProfiles, newActiveId) => {
        if (window.api && window.api.config) {
            await window.api.config.save({
                profiles: newProfiles,
                activeProfileId: newActiveId
            });
            setProfiles(newProfiles);
            setActiveId(newActiveId);
            onProfileChanged(newProfiles.find(p => p.id === newActiveId));
        }
    };

    const handleAdd = () => {
        const newId = Date.now().toString();
        const newProfile = { id: newId, name: 'New Provider', username: '', password: '', servers: ['http://'] };
        setFormData(newProfile);
        setEditingId(newId);
    };

    const handleEdit = (profile) => {
        setFormData({ ...profile, servers: profile.servers || ['http://'] });
        setEditingId(profile.id);
    };

    const handleDelete = async (id) => {
        if (confirm("Are you sure you want to delete this profile?")) {
            const updatedProfiles = profiles.filter(p => p.id !== id);
            let nextActive = activeId;
            if (activeId === id) {
                nextActive = updatedProfiles.length > 0 ? updatedProfiles[0].id : null;
            }
            await handleSaveConfig(updatedProfiles, nextActive);
            if (editingId === id) setEditingId(null);
        }
    };

    const handleFormSave = async () => {
        // Clean up empty servers
        const cleanedFormData = {
            ...formData,
            servers: formData.servers.filter(s => s.trim() !== "" && s !== "http://")
        };
        // Ensure at least one placeholder if empty
        if (cleanedFormData.servers.length === 0) cleanedFormData.servers = ["http://"];

        let updatedProfiles;
        const existingIndex = profiles.findIndex(p => p.id === formData.id);
        
        if (existingIndex >= 0) {
            updatedProfiles = [...profiles];
            updatedProfiles[existingIndex] = cleanedFormData;
        } else {
            updatedProfiles = [...profiles, cleanedFormData];
        }

        const nextActive = activeId || cleanedFormData.id;
        
        await handleSaveConfig(updatedProfiles, nextActive);
        setEditingId(null);
    };

    const handleServerChange = (index, value) => {
        const newServers = [...formData.servers];
        newServers[index] = value;
        setFormData({ ...formData, servers: newServers });
    };

    const addServerLine = () => {
        setFormData({ ...formData, servers: [...formData.servers, 'http://'] });
    };

    const removeServerLine = (index) => {
        if (formData.servers.length > 1) {
            const newServers = formData.servers.filter((_, i) => i !== index);
            setFormData({ ...formData, servers: newServers });
        }
    };

    const handleSetActive = async (id) => {
        await handleSaveConfig(profiles, id);
    };

    const isEditing = editingId !== null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="transcoder-modal" onClick={e => e.stopPropagation()} style={{ width: '700px', height: '550px' }}>
                <div className="transcoder-header" style={{ background: 'linear-gradient(to right, rgba(51, 154, 240, 0.1), transparent)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <User size={24} color="#339af0" />
                        <div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#fff' }}>Profile Manager</div>
                            <div style={{ fontSize: '0.65rem', color: '#909296', textTransform: 'uppercase' }}>Manage IPTV Accounts</div>
                        </div>
                    </div>
                    <button className="close-modal-btn" onClick={onClose}><X size={20} /></button>
                </div>
                
                <div className="transcoder-body" style={{ padding: 0, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                        {/* Left: List */}
                        <div style={{ width: '220px', borderRight: '1px solid #373a40', display: 'flex', flexDirection: 'column', backgroundColor: '#141517' }}>
                            <div style={{ padding: '15px', borderBottom: '1px solid #373a40' }}>
                                <button className="btn btn-primary" style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: '5px' }} onClick={handleAdd}>
                                    <Plus size={14} /> Add Profile
                                </button>
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto' }}>
                                {profiles.map(p => (
                                    <div 
                                        key={p.id}
                                        onClick={() => handleEdit(p)}
                                        style={{ 
                                            padding: '12px 15px', 
                                            cursor: 'pointer',
                                            backgroundColor: editingId === p.id ? '#2c2e33' : 'transparent',
                                            borderLeft: activeId === p.id ? '3px solid #339af0' : '3px solid transparent',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            transition: 'background 0.2s'
                                        }}
                                    >
                                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            <div style={{ fontWeight: activeId === p.id ? 'bold' : 'normal', color: '#fff', fontSize: '0.9rem' }}>{p.name}</div>
                                            <div style={{ fontSize: '0.7rem', color: '#909296' }}>{p.username}</div>
                                        </div>
                                        {activeId === p.id && <Check size={16} color="#339af0" />}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Right: Form */}
                        <div style={{ flex: 1, padding: '20px', overflowY: 'auto', backgroundColor: '#1a1b1e' }}>
                            {isEditing ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                    
                                    <div className="input-field">
                                        <label>Profile Name</label>
                                        <input 
                                            value={formData.name} 
                                            onChange={e => setFormData({...formData, name: e.target.value})}
                                            placeholder="e.g. My IPTV Provider"
                                        />
                                    </div>

                                    <div className="input-field">
                                        <label>Server URLs (One per line)</label>
                                        {formData.servers.map((srv, idx) => (
                                            <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                                <input 
                                                    style={{ flex: 1 }} 
                                                    value={srv} 
                                                    onChange={e => handleServerChange(idx, e.target.value)}
                                                    placeholder="http://domain.com:8080"
                                                />
                                                <button className="btn" onClick={() => removeServerLine(idx)} style={{ padding: '8px', background: '#25262b', border: '1px solid #373a40' }}>
                                                    <Trash2 size={14} color="#ff6b6b" />
                                                </button>
                                            </div>
                                        ))}
                                        <button className="btn" onClick={addServerLine} style={{ width: 'fit-content', fontSize: '0.75rem', gap: '5px', display: 'flex', alignItems: 'center' }}>
                                            <Plus size={12} /> Add Alternate Server
                                        </button>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                        <div className="input-field">
                                            <label>Username</label>
                                            <input 
                                                value={formData.username} 
                                                onChange={e => setFormData({...formData, username: e.target.value})}
                                            />
                                        </div>

                                        <div className="input-field">
                                            <label>Password</label>
                                            <input 
                                                type="password"
                                                value={formData.password} 
                                                onChange={e => setFormData({...formData, password: e.target.value})}
                                            />
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '10px', marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #2c2e33' }}>
                                        <button className="btn btn-primary" onClick={handleFormSave} style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: '8px', height: '40px', alignItems: 'center' }}>
                                            <Save size={16} /> Save Changes
                                        </button>
                                        {profiles.find(p => p.id === formData.id) && (
                                            <>
                                                <button 
                                                    className="btn" 
                                                    onClick={() => handleSetActive(formData.id)} 
                                                    disabled={activeId === formData.id}
                                                    style={{ flex: 1, background: activeId === formData.id ? '#2c2e33' : '#339af0', color: activeId === formData.id ? '#909296' : 'white', border: 'none' }}
                                                >
                                                    {activeId === formData.id ? 'Currently Active' : 'Set as Active'}
                                                </button>
                                                <button className="btn" style={{ borderColor: '#ff6b6b', color: '#ff6b6b', padding: '0 15px' }} onClick={() => handleDelete(formData.id)}>
                                                    <Trash2 size={16} />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#5c5f66', gap: '10px' }}>
                                    <User size={48} opacity={0.2} />
                                    <span>Select a profile to edit or create a new one</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProfileManager;
