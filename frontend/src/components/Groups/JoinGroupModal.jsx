import React, { useState } from 'react';
import { useFamily } from '../../context/FamilyContext';
import {
  Users, UserPlus, Check, X, Shield, ArrowRight, AlertTriangle, MapPin
} from 'lucide-react';

export default function JoinGroupModal({ isOpen, onClose }) {
  const { validateGroupInvite, joinGroup } = useFamily();
  const [inviteCode, setInviteCode] = useState('');
  const [preview, setPreview] = useState(null);
  const [validating, setValidating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [sharingEnabled, setSharingEnabled] = useState(true);

  if (!isOpen) return null;

  const handleCodeChange = async (e) => {
    const raw = e.target.value;
    // Extract 6 chars if user pasted a link e.g. /invite/ABC123
    let clean = raw.trim();
    if (clean.includes('/')) {
      const parts = clean.split('/');
      clean = parts[parts.length - 1];
    }
    clean = clean.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    setInviteCode(clean);
    setError('');
    setPreview(null);

    if (clean.length === 6) {
      setValidating(true);
      try {
        const data = await validateGroupInvite(clean);
        setPreview(data);
      } catch (err) {
        setError(err.message || 'Invalid invite code.');
      } finally {
        setValidating(false);
      }
    }
  };

  const handleConfirmJoin = async () => {
    if (!inviteCode || inviteCode.length < 6) {
      setError('Please enter a valid 6-character invite code.');
      return;
    }

    setJoining(true);
    setError('');
    try {
      await joinGroup(inviteCode, { sharingEnabled });
      setInviteCode('');
      setPreview(null);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to join group.');
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1250 }}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '480px', width: '100%', maxHeight: '90dvh', overflowY: 'auto' }}
      >
        {/* Header */}
        <div className="modal-header" style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: 'rgba(5, 150, 105, 0.15)', padding: '8px', borderRadius: '10px' }}>
              <UserPlus size={22} color="#059669" />
            </div>
            <div>
              <h2 style={{ fontSize: '18px', margin: 0 }}>Join a Group</h2>
              <div style={{ fontSize: '12px', color: 'var(--text-400)' }}>
                Add another circle to your account
              </div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        {/* Invite Code Input */}
        <div className="form-group mb-3">
          <label className="form-label">6-Character Invite Code or Link</label>
          <input
            type="text"
            className="input-field"
            placeholder="e.g. 7X8K2M"
            value={inviteCode}
            onChange={handleCodeChange}
            maxLength={60}
            style={{ fontSize: '18px', letterSpacing: '4px', textTransform: 'uppercase', textAlign: 'center' }}
            autoFocus
          />
          {validating && (
            <div style={{ fontSize: '12px', color: 'var(--text-400)', marginTop: '4px', textAlign: 'center' }}>
              Checking group code...
            </div>
          )}
        </div>

        {/* Group Preview Card */}
        {preview && (
          <div
            style={{
              background: 'var(--bg-800)',
              border: `1px solid ${preview.avatarColor || 'var(--glass-border)'}`,
              borderRadius: '10px',
              padding: '14px',
              marginBottom: '16px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background: preview.avatarColor || '#4F46E5',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '15px'
                  }}
                >
                  {preview.groupName?.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 style={{ fontSize: '16px', margin: 0, color: 'var(--text-100)', fontWeight: 700 }}>
                    {preview.groupName}
                  </h3>
                  <div style={{ fontSize: '11px', color: 'var(--text-400)' }}>
                    Type: <span style={{ color: 'var(--text-200)', fontWeight: 600 }}>{preview.groupType}</span> • Created by {preview.creatorName}
                  </div>
                </div>
              </div>

              <span
                style={{
                  fontSize: '11px',
                  background: 'var(--bg-900)',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  color: 'var(--text-300)'
                }}
              >
                {preview.memberCount} members
              </span>
            </div>

            {preview.description && (
              <p style={{ fontSize: '12px', color: 'var(--text-300)', margin: '6px 0 10px', lineHeight: '1.4' }}>
                {preview.description}
              </p>
            )}

            {preview.alreadyMember && (
              <div style={{ color: '#FBBF24', fontSize: '12px', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <AlertTriangle size={14} />
                <span>You are already an active member of this group.</span>
              </div>
            )}
          </div>
        )}

        {/* Initial Location Sharing Setting */}
        {preview && !preview.alreadyMember && (
          <div
            style={{
              background: 'var(--bg-900)',
              border: '1px solid var(--glass-border)',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-200)' }}>
                Share Live Location with {preview.groupName}?
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-400)' }}>
                Can be changed anytime in Location Settings
              </div>
            </div>

            <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '38px', height: '22px' }}>
              <input
                type="checkbox"
                checked={sharingEnabled}
                onChange={(e) => setSharingEnabled(e.target.checked)}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span
                style={{
                  position: 'absolute',
                  cursor: 'pointer',
                  top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: sharingEnabled ? 'var(--primary-500)' : '#475569',
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
                    left: sharingEnabled ? '18px' : '3px',
                    bottom: '3px',
                    backgroundColor: 'white',
                    borderRadius: '50%',
                    transition: '.2s'
                  }}
                />
              </span>
            </label>
          </div>
        )}

        {error && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid #EF4444',
              borderRadius: '8px',
              padding: '10px',
              marginBottom: '16px',
              fontSize: '12px',
              color: '#FCA5A5'
            }}
          >
            {error}
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={joining}
            style={{ padding: '10px 18px', fontSize: '13px' }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleConfirmJoin}
            disabled={joining || !preview || preview.alreadyMember}
            style={{
              padding: '10px 20px',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: '#059669',
              borderColor: '#059669'
            }}
          >
            <UserPlus size={16} />
            <span>{joining ? 'Joining Group...' : 'Confirm & Join Group'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

