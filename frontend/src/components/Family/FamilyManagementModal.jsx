import React, { useState } from 'react';
import { useFamily } from '../../context/FamilyContext';
import { useAuth } from '../../context/AuthContext';
import {
  Users, Copy, Check, Shield, Crown, RefreshCw, LogOut, X,
  UserCheck, AlertCircle, Sparkles
} from 'lucide-react';

export default function FamilyManagementModal({
  isOpen,
  onClose,
  onOpenSwitch,
  onOpenLeave
}) {
  const { familyDetails, members, onlineUsers } = useFamily();
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const family = familyDetails?.family;
  const inviteCode = family?.invite_code || family?.inviteCode || '------';
  const isOwner = familyDetails?.userRole === 'owner' || family?.created_by === user?.id;
  const memberList = familyDetails?.members || members || [];
  const otherMembers = familyDetails?.otherMembers || memberList.filter(m => m.id !== user?.id);

  const handleCopyCode = async () => {
    if (!inviteCode || inviteCode === '------') return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(inviteCode);
      } else {
        const input = document.createElement('input');
        input.value = inviteCode;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.warn('Copy failed:', err);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1200 }}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '540px' }}
      >
        {/* Header */}
        <div className="modal-header" style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: 'rgba(99, 102, 241, 0.15)', padding: '8px', borderRadius: '10px' }}>
              <Users size={22} className="text-primary" />
            </div>
            <div>
              <h2 style={{ fontSize: '18px', margin: 0 }}>Family Circle Management</h2>
              <div style={{ fontSize: '12px', color: 'var(--text-400)' }}>
                Overview, members & circle settings
              </div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        {/* Family Summary Card */}
        <div
          style={{
            background: 'var(--bg-800)',
            border: '1px solid var(--glass-border)',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '16px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-400)', fontWeight: 600 }}>
                Active Circle
              </div>
              <h3 style={{ fontSize: '20px', margin: '4px 0 2px', color: 'var(--text-100)', fontWeight: 700 }}>
                {family?.name || 'My Family'}
              </h3>
              <div style={{ fontSize: '12px', color: 'var(--text-300)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>Role:</span>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    background: isOwner ? 'rgba(245, 158, 11, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                    color: isOwner ? '#F59E0B' : '#818CF8',
                    border: `1px solid ${isOwner ? 'rgba(245, 158, 11, 0.3)' : 'rgba(99, 102, 241, 0.3)'}`
                  }}
                >
                  {isOwner ? <Crown size={12} /> : <UserCheck size={12} />}
                  {isOwner ? 'Family Owner / Creator' : 'Circle Member'}
                </span>
              </div>
            </div>

            {/* Invite Code Pill */}
            <div
              style={{
                background: 'var(--bg-900)',
                border: '1px solid var(--glass-border)',
                borderRadius: '8px',
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <div>
                <div style={{ fontSize: '10px', color: 'var(--text-400)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Invite Code
                </div>
                <div style={{ fontSize: '16px', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--primary-400)' }}>
                  {inviteCode}
                </div>
              </div>
              <button
                type="button"
                onClick={handleCopyCode}
                className="btn btn-secondary"
                style={{ padding: '6px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                title="Copy Invite Code"
              >
                {copied ? <Check size={14} color="#10B981" /> : <Copy size={14} />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Member Roster */}
        <div style={{ marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-300)' }}>
              Circle Members ({memberList.length})
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-400)' }}>
              Real-time member status
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              maxHeight: '220px',
              overflowY: 'auto',
              paddingRight: '4px'
            }}
          >
            {memberList.map((m) => {
              const isMemberOnline = onlineUsers?.has ? onlineUsers.has(m.id) : false;
              const isThisOwner = m.is_owner || (family && family.created_by === m.id);
              const isCurrentUser = m.id === user?.id;

              return (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: 'var(--bg-800)',
                    border: isCurrentUser ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid var(--glass-border)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: m.avatar_color || '#6366F1',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '13px',
                        position: 'relative'
                      }}
                    >
                      {m.name?.charAt(0).toUpperCase()}
                      <span
                        style={{
                          position: 'absolute',
                          bottom: '-1px',
                          right: '-1px',
                          width: '9px',
                          height: '9px',
                          borderRadius: '50%',
                          background: isMemberOnline ? '#10B981' : '#6B7280',
                          border: '2px solid var(--bg-800)'
                        }}
                        title={isMemberOnline ? 'Online' : 'Offline'}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-100)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>{m.name}</span>
                        {isCurrentUser && (
                          <span style={{ fontSize: '10px', color: 'var(--text-400)', fontWeight: 400 }}>(You)</span>
                        )}
                        {isThisOwner && (
                          <span
                            style={{
                              fontSize: '10px',
                              padding: '1px 5px',
                              borderRadius: '4px',
                              background: 'rgba(245, 158, 11, 0.15)',
                              color: '#F59E0B',
                              border: '1px solid rgba(245, 158, 11, 0.3)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '2px'
                            }}
                          >
                            <Crown size={10} /> Owner
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-400)' }}>
                        {m.email}
                      </div>
                    </div>
                  </div>

                  <span
                    style={{
                      fontSize: '11px',
                      color: isMemberOnline ? '#34D399' : 'var(--text-400)',
                      fontWeight: 500
                    }}
                  >
                    {isMemberOnline ? 'Online' : 'Offline'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action Controls */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '10px',
            marginTop: '16px',
            paddingTop: '16px',
            borderTop: '1px solid var(--glass-border)'
          }}
        >
          {/* Switch Family Action */}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              onClose();
              if (onOpenSwitch) onOpenSwitch();
            }}
            style={{
              padding: '12px 16px',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <RefreshCw size={16} />
            <span>Switch to Another Family</span>
          </button>

          {/* Leave Family Action */}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              onClose();
              if (onOpenLeave) onOpenLeave();
            }}
            style={{
              padding: '12px 16px',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              borderColor: 'rgba(239, 68, 68, 0.3)',
              color: '#F87171'
            }}
          >
            <LogOut size={16} color="#F87171" />
            <span>Leave Family Circle</span>
          </button>
        </div>
      </div>
    </div>
  );
}

