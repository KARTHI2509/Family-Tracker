import React, { useState } from 'react';
import { useFamily } from '../../context/FamilyContext';
import {
  MapPin, Shield, Check, X, Users, Eye, EyeOff, Info, AlertTriangle, RefreshCw
} from 'lucide-react';

export default function GroupLocationSettingsModal({ isOpen, onClose }) {
  const { groups, updateGroupLocationSharing, fetchGroups } = useFamily();
  const [loadingGroup, setLoadingGroup] = useState(null);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleToggleSharing = async (group, currentVal) => {
    setLoadingGroup(group.id);
    setError('');
    try {
      await updateGroupLocationSharing(group.id, {
        sharingEnabled: !currentVal
      });
      await fetchGroups();
    } catch (err) {
      setError(err.message || 'Failed to update sharing preference.');
    } finally {
      setLoadingGroup(null);
    }
  };

  const handleToggleHistory = async (group, currentVal) => {
    setLoadingGroup(group.id);
    setError('');
    try {
      await updateGroupLocationSharing(group.id, {
        historyEnabled: !currentVal
      });
      await fetchGroups();
    } catch (err) {
      setError(err.message || 'Failed to update history preference.');
    } finally {
      setLoadingGroup(null);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1250 }}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '520px', width: '100%', maxHeight: '90dvh', overflowY: 'auto' }}
      >
        {/* Header */}
        <div className="modal-header" style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: 'rgba(99, 102, 241, 0.15)', padding: '8px', borderRadius: '10px' }}>
              <MapPin size={22} className="text-primary" />
            </div>
            <div>
              <h2 style={{ fontSize: '18px', margin: 0 }}>Group Location Permissions</h2>
              <div style={{ fontSize: '12px', color: 'var(--text-400)' }}>
                Per-group live sharing & history controls
              </div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        {/* Educational Privacy Callout */}
        <div
          style={{
            background: 'rgba(99, 102, 241, 0.08)',
            border: '1px solid rgba(99, 102, 241, 0.25)',
            borderRadius: '10px',
            padding: '12px 14px',
            marginBottom: '16px',
            display: 'flex',
            gap: '10px',
            alignItems: 'flex-start'
          }}
        >
          <Info size={18} color="var(--primary-400)" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div style={{ fontSize: '12px', color: 'var(--text-300)', lineHeight: '1.4' }}>
            <strong>Selective Distribution:</strong> Native background GPS runs once for your device, but our server delivers each update <strong>only to the groups you enable below</strong>. If you pause sharing for College, College members will never receive your coordinates.
          </div>
        </div>

        {/* Group Permission Switches List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '18px' }}>
          {groups.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-400)', fontSize: '13px' }}>
              You do not belong to any groups yet.
            </div>
          ) : (
            groups.map((g) => {
              const isSharing = g.sharingEnabled !== false;
              const isHistory = g.historyEnabled !== false;
              const isUpdating = loadingGroup === g.id;

              return (
                <div
                  key={g.id}
                  style={{
                    background: 'var(--bg-800)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '10px',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          background: g.avatarColor || g.avatar_color || '#4F46E5',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: '13px'
                        }}
                      >
                        {g.name?.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-100)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>{g.name}</span>
                          <span
                            style={{
                              fontSize: '10px',
                              padding: '1px 5px',
                              borderRadius: '4px',
                              background: 'var(--bg-900)',
                              color: 'var(--text-400)',
                              border: '1px solid var(--glass-border)'
                            }}
                          >
                            {g.groupType || g.group_type}
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-400)' }}>
                          {g.totalMembers} members • Role: {g.role}
                        </div>
                      </div>
                    </div>

                    <span
                      style={{
                        fontSize: '11px',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontWeight: 600,
                        background: isSharing ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        color: isSharing ? '#34D399' : '#F87171',
                        border: isSharing ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)'
                      }}
                    >
                      {isSharing ? 'Sharing Active' : 'Sharing Paused'}
                    </span>
                  </div>

                  {/* Individual Controls */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderTop: '1px solid var(--glass-border)',
                      paddingTop: '8px'
                    }}
                  >
                    <span style={{ fontSize: '12px', color: 'var(--text-200)' }}>Live Location Broadcast</span>
                    <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '38px', height: '22px' }}>
                      <input
                        type="checkbox"
                        checked={isSharing}
                        disabled={isUpdating}
                        onChange={() => handleToggleSharing(g, isSharing)}
                        style={{ opacity: 0, width: 0, height: 0 }}
                      />
                      <span
                        style={{
                          position: 'absolute',
                          cursor: 'pointer',
                          top: 0, left: 0, right: 0, bottom: 0,
                          backgroundColor: isSharing ? 'var(--primary-500)' : '#475569',
                          borderRadius: '34px',
                          transition: '.2s'
                        }}
                      >
                        <span
                          style={{
                            position: 'absolute',
                            content: '""',
                            height: '16px',
                            width: '16px',
                            left: isSharing ? '18px' : '3px',
                            bottom: '3px',
                            backgroundColor: 'white',
                            borderRadius: '50%',
                            transition: '.2s'
                          }}
                        />
                      </span>
                    </label>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderTop: '1px solid var(--glass-border)',
                      paddingTop: '8px'
                    }}
                  >
                    <span style={{ fontSize: '12px', color: 'var(--text-200)' }}>Location History Sharing (7 days)</span>
                    <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '38px', height: '22px' }}>
                      <input
                        type="checkbox"
                        checked={isHistory}
                        disabled={isUpdating}
                        onChange={() => handleToggleHistory(g, isHistory)}
                        style={{ opacity: 0, width: 0, height: 0 }}
                      />
                      <span
                        style={{
                          position: 'absolute',
                          cursor: 'pointer',
                          top: 0, left: 0, right: 0, bottom: 0,
                          backgroundColor: isHistory ? 'var(--primary-500)' : '#475569',
                          borderRadius: '34px',
                          transition: '.2s'
                        }}
                      >
                        <span
                          style={{
                            position: 'absolute',
                            content: '""',
                            height: '16px',
                            width: '16px',
                            left: isHistory ? '18px' : '3px',
                            bottom: '3px',
                            backgroundColor: 'white',
                            borderRadius: '50%',
                            transition: '.2s'
                          }}
                        />
                      </span>
                    </label>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #EF4444', borderRadius: '8px', padding: '10px', marginBottom: '16px', fontSize: '12px', color: '#FCA5A5' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            style={{ padding: '8px 18px', fontSize: '13px' }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

