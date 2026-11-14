import React, { useState } from 'react';
import { useFamily } from '../../context/FamilyContext';
import { useAuth } from '../../context/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import {
  Share2, Battery, Zap, Gauge, Copy, Check, ShieldAlert,
  Users, RefreshCw, Settings, LogOut, Crown
} from 'lucide-react';

export default function FamilyPanel({
  onSelectMember,
  selectedMemberId,
  onOpenManagement,
  onOpenSwitch,
  onOpenLeave
}) {
  const { members, onlineUsers, activeSOSEvents, getInviteCode, familyDetails } = useFamily();
  const { user } = useAuth();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [copied, setCopied] = useState(false);

  const activeFamily = familyDetails?.family;
  const currentInviteCode = activeFamily?.invite_code || activeFamily?.inviteCode || '';
  const isOwner = familyDetails?.userRole === 'owner' || activeFamily?.created_by === user?.id;

  const handleOpenInvite = async () => {
    try {
      const code = currentInviteCode || await getInviteCode();
      setInviteCode(code);
      setShowInviteModal(true);
    } catch (err) {
      console.error('Failed to get invite code:', err);
    }
  };

  const handleCopyCode = (codeToCopy) => {
    const code = codeToCopy || inviteCode || currentInviteCode;
    if (!code) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code);
    } else {
      const input = document.createElement('input');
      input.value = code;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const getBatteryClass = (level) => {
    if (level === null || level === undefined) return '';
    if (level > 50) return 'battery-green';
    if (level > 20) return 'battery-yellow';
    return 'battery-red';
  };

  return (
    <div className="family-panel">
      {/* Family Circle Info & Management Card */}
      <div
        className="family-card-header"
        style={{
          background: 'var(--bg-800)',
          border: '1px solid var(--glass-border)',
          borderRadius: '12px',
          padding: '14px',
          marginBottom: '14px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-400)', fontWeight: 600 }}>
              Current Circle
            </div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-100)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>{activeFamily?.name || user?.family_name || 'My Family'}</span>
              {isOwner && (
                <span
                  style={{
                    fontSize: '10px',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    background: 'rgba(245, 158, 11, 0.15)',
                    color: '#F59E0B',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '2px'
                  }}
                  title="You are the creator/owner of this family"
                >
                  <Crown size={10} /> Owner
                </span>
              )}
            </div>
          </div>

          {currentInviteCode && (
            <button
              type="button"
              onClick={() => handleCopyCode(currentInviteCode)}
              className="btn btn-secondary"
              style={{ padding: '4px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
              title="Click to copy invite code"
            >
              <code style={{ color: 'var(--primary-400)', fontWeight: 700 }}>{currentInviteCode}</code>
              {copied ? <Check size={12} color="#10B981" /> : <Copy size={12} />}
            </button>
          )}
        </div>

        {/* Quick Management & Switch Actions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '10px' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onOpenManagement}
            style={{
              padding: '6px 8px',
              fontSize: '11px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px'
            }}
          >
            <Settings size={13} />
            <span>Manage Circle</span>
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={onOpenSwitch}
            style={{
              padding: '6px 8px',
              fontSize: '11px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              color: 'var(--primary-300)'
            }}
          >
            <RefreshCw size={13} />
            <span>Switch Family</span>
          </button>
        </div>
      </div>

      {/* Member List */}
      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-400)', marginBottom: '8px', paddingLeft: '4px' }}>
        MEMBERS ({members.length})
      </div>

      {members.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">👥</div>
          <h4>No Family Members Yet</h4>
          <p>Share your invite code to bring family members into your circle!</p>
        </div>
      ) : (
        members.map((member) => {
          const isOnline = onlineUsers.has(member.id);
          const isSOS = activeSOSEvents.has(member.id);
          const loc = member.latest_location || {};
          const updatedAt = loc.timestamp || member.updated_at || member.created_at;
          const isSelected = selectedMemberId === member.id;
          const isCurrentUser = member.id === user?.id;

          return (
            <div
              key={member.id}
              className={`member-card ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelectMember && onSelectMember(member)}
            >
              <div className="member-avatar">
                <div
                  className="member-avatar-circle"
                  style={{
                    backgroundColor: isSOS ? '#DC2626' : (member.avatar_color || '#4F46E5'),
                  }}
                >
                  {(member.name || 'U').charAt(0).toUpperCase()}
                </div>
                <div
                  className={`member-status-dot ${isOnline ? 'bg-success' : 'bg-muted'}`}
                  style={{
                    backgroundColor: isOnline ? 'var(--success-500)' : 'var(--text-500)',
                  }}
                />
              </div>

              <div className="member-info">
                <div className="member-name">
                  {member.name} {isCurrentUser && <span className="text-muted" style={{ fontSize: '11px' }}>(You)</span>}
                  {isSOS && (
                    <span style={{ color: 'var(--danger-500)', fontWeight: 700, marginLeft: '6px', fontSize: '11px' }}>
                      🚨 SOS
                    </span>
                  )}
                </div>

                <div className="member-last-seen">
                  {isOnline ? (
                    <span style={{ color: 'var(--success-500)' }}>Active now</span>
                  ) : updatedAt ? (
                    `Last seen ${formatDistanceToNow(new Date(updatedAt), { addSuffix: true })}`
                  ) : (
                    'No location recorded'
                  )}
                </div>
              </div>

              <div className="member-meta">
                {loc.speed !== undefined && loc.speed > 5 && (
                  <div className="speed-indicator" title="Current Speed">
                    <Gauge size={13} />
                    <span>{Math.round(loc.speed)} km/h</span>
                  </div>
                )}

                {loc.battery_level !== undefined && loc.battery_level !== null && (
                  <div className={`battery-indicator ${getBatteryClass(loc.battery_level)}`} title="Battery Level">
                    {loc.is_charging ? <Zap size={13} /> : <Battery size={13} />}
                    <span>{loc.battery_level}%</span>
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}

      {/* Invite Button */}
      <button
        className="btn btn-secondary w-full mt-3"
        onClick={handleOpenInvite}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '13px' }}
      >
        <Share2 size={16} />
        <span>Invite Family Member</span>
      </button>

      {/* Invite Code Modal */}
      {showInviteModal && (
        <div className="modal-overlay" onClick={() => setShowInviteModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Invite to Family Circle</h2>
              <button className="modal-close" onClick={() => setShowInviteModal(false)}>
                ×
              </button>
            </div>
            <p className="text-muted text-sm mb-4">
              Share this invite code with your family members so they can join your circle and share their location.
            </p>

            <div className="invite-code mb-4" style={{ textAlign: 'center', padding: '20px', background: 'var(--bg-900)', borderRadius: '12px' }}>
              <code style={{ fontSize: '28px', letterSpacing: '6px', fontWeight: 800, color: 'var(--primary-400)' }}>
                {inviteCode}
              </code>
            </div>

            <button
              className="btn btn-primary w-full"
              onClick={() => handleCopyCode(inviteCode)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              <span>{copied ? 'Copied to Clipboard!' : 'Copy Invite Code'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
