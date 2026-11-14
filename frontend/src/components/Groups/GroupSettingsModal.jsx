import React, { useState, useEffect } from 'react';
import { useFamily } from '../../context/FamilyContext';
import { useAuth } from '../../context/AuthContext';
import {
  Settings, Users, Shield, Crown, Copy, Check, LogOut, Trash2, X,
  UserX, ArrowUpRight, ArrowDownRight, Edit2, MapPin, Eye, EyeOff
} from 'lucide-react';

export default function GroupSettingsModal({ isOpen, onClose, group }) {
  const { user } = useAuth();
  const {
    fetchGroupMembers, updateGroupSettings, updateMemberRole,
    removeMember, transferGroupOwner, leaveGroup, deleteGroup,
    updateGroupLocationSharing
  } = useFamily();

  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editType, setEditType] = useState('FAMILY');
  const [sharingEnabled, setSharingEnabled] = useState(true);
  const [successorId, setSuccessorId] = useState('');
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState('');

  const isOwner = group?.role === 'OWNER' || group?.isOwner;
  const isAdmin = isOwner || group?.role === 'ADMIN' || group?.isAdmin;

  useEffect(() => {
    if (isOpen && group?.id) {
      setEditName(group.name || '');
      setEditDesc(group.description || '');
      setEditType(group.groupType || group.group_type || 'FAMILY');
      setSharingEnabled(group.sharingEnabled !== false);
      loadMembers();
    }
  }, [isOpen, group]);

  const loadMembers = async () => {
    if (!group?.id) return;
    setLoading(true);
    try {
      const data = await fetchGroupMembers(group.id);
      setMembers(data || []);
      const others = (data || []).filter(m => m.id !== user?.id);
      if (others.length > 0) {
        setSuccessorId(String(others[0].id));
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !group) return null;

  const handleCopyCode = async () => {
    if (!group.inviteCode && !group.invite_code) return;
    const code = group.inviteCode || group.invite_code;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (_) {}
  };

  const handleSaveMetadata = async () => {
    if (!editName.trim()) {
      setError('Group name cannot be empty.');
      return;
    }
    setError('');
    try {
      await updateGroupSettings(group.id, {
        name: editName.trim(),
        description: editDesc.trim(),
        groupType: editType,
        avatarColor: group.avatarColor || group.avatar_color
      });
      setIsEditing(false);
    } catch (err) {
      setError(err.message || 'Failed to update group.');
    }
  };

  const handleToggleSharing = async (val) => {
    setSharingEnabled(val);
    try {
      await updateGroupLocationSharing(group.id, { sharingEnabled: val });
    } catch (err) {
      setError(err.message || 'Failed to update location sharing.');
    }
  };

  const handlePromoteDemote = async (memberId, currentRole) => {
    const newRole = currentRole === 'ADMIN' ? 'MEMBER' : 'ADMIN';
    try {
      await updateMemberRole(group.id, memberId, newRole);
      await loadMembers();
    } catch (err) {
      setError(err.message || 'Failed to change role.');
    }
  };

  const handleRemoveMember = async (memberId) => {
    if (!window.confirm('Are you sure you want to remove this member from the group?')) return;
    try {
      await removeMember(group.id, memberId);
      await loadMembers();
    } catch (err) {
      setError(err.message || 'Failed to remove member.');
    }
  };

  const handleTransferOwner = async (newOwnerId) => {
    if (!window.confirm('Transfer full ownership of this group? You will become an administrator.')) return;
    try {
      await transferGroupOwner(group.id, newOwnerId);
      await loadMembers();
    } catch (err) {
      setError(err.message || 'Failed to transfer ownership.');
    }
  };

  const handleConfirmLeave = async () => {
    try {
      await leaveGroup(group.id, isOwner && members.length > 1 ? successorId : null);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to leave group.');
    }
  };

  const handleConfirmDelete = async () => {
    try {
      await deleteGroup(group.id);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to delete group.');
    }
  };

  const otherMembers = members.filter(m => m.id !== user?.id);

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1250 }}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '540px', width: '100%', maxHeight: '90dvh', overflowY: 'auto' }}
      >
        {/* Header */}
        <div className="modal-header" style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: `${group.avatarColor || '#4F46E5'}25`, padding: '8px', borderRadius: '10px' }}>
              <Settings size={22} color={group.avatarColor || '#4F46E5'} />
            </div>
            <div>
              <h2 style={{ fontSize: '18px', margin: 0 }}>{group.name} Settings</h2>
              <div style={{ fontSize: '12px', color: 'var(--text-400)' }}>
                Type: {group.groupType || group.group_type} • Role: {group.role || 'MEMBER'}
              </div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        {/* Invite Code Bar */}
        <div
          style={{
            background: 'var(--bg-800)',
            border: '1px solid var(--glass-border)',
            borderRadius: '10px',
            padding: '12px 16px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-400)', textTransform: 'uppercase' }}>Group Invite Code</div>
            <code style={{ fontSize: '18px', fontWeight: 800, color: 'var(--primary-400)', letterSpacing: '4px' }}>
              {group.inviteCode || group.invite_code || '------'}
            </code>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleCopyCode}
            style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            {copied ? <Check size={14} color="#10B981" /> : <Copy size={14} />}
            <span>{copied ? 'Copied!' : 'Copy Code'}</span>
          </button>
        </div>

        {/* Personal Sharing Control for THIS Group */}
        <div
          style={{
            background: 'var(--bg-800)',
            border: '1px solid var(--glass-border)',
            borderRadius: '10px',
            padding: '12px 16px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-100)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              {sharingEnabled ? <Eye size={16} color="#34D399" /> : <EyeOff size={16} color="#F87171" />}
              <span>Share Location with this Group</span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-400)' }}>
              {sharingEnabled ? 'Members of this group can see your live marker' : 'Location sharing is paused for this group'}
            </div>
          </div>

          <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '38px', height: '22px' }}>
            <input
              type="checkbox"
              checked={sharingEnabled}
              onChange={(e) => handleToggleSharing(e.target.checked)}
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

        {/* Metadata Edit Form (Owner / Admin) */}
        {isAdmin && isEditing ? (
          <div style={{ background: 'var(--bg-900)', border: '1px solid var(--glass-border)', borderRadius: '10px', padding: '14px', marginBottom: '16px' }}>
            <h4 style={{ margin: '0 0 10px', fontSize: '13px', color: 'var(--text-200)' }}>Edit Group Info</h4>
            <div className="form-group mb-2">
              <label className="form-label" style={{ fontSize: '11px' }}>Group Name</label>
              <input
                type="text"
                className="input-field"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={50}
              />
            </div>
            <div className="form-group mb-3">
              <label className="form-label" style={{ fontSize: '11px' }}>Description</label>
              <input
                type="text"
                className="input-field"
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                maxLength={120}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setIsEditing(false)} style={{ padding: '6px 12px', fontSize: '12px' }}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSaveMetadata} style={{ padding: '6px 14px', fontSize: '12px' }}>
                Save Changes
              </button>
            </div>
          </div>
        ) : isAdmin && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setIsEditing(true)}
              style={{ fontSize: '12px', padding: '4px 8px', color: 'var(--text-300)', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <Edit2 size={13} />
              <span>Edit Group Name & Details</span>
            </button>
          </div>
        )}

        {/* Member Roster */}
        <div style={{ marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-300)' }}>
              Group Members ({members.length})
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
            {members.map((m) => {
              const isCurrent = m.id === user?.id;
              const isThisOwner = m.role === 'OWNER';
              const isThisAdmin = m.role === 'ADMIN';

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
                    border: '1px solid var(--glass-border)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: m.avatarColor || m.avatar_color || '#4F46E5',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '13px'
                      }}
                    >
                      {m.name?.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-100)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>{m.name}</span>
                        {isCurrent && <span style={{ fontSize: '11px', color: 'var(--text-400)' }}>(You)</span>}
                        {isThisOwner && (
                          <span style={{ fontSize: '10px', background: 'rgba(245, 158, 11, 0.15)', color: '#F59E0B', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '1px 5px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                            <Crown size={10} /> Owner
                          </span>
                        )}
                        {isThisAdmin && !isThisOwner && (
                          <span style={{ fontSize: '10px', background: 'rgba(99, 102, 241, 0.15)', color: '#818CF8', border: '1px solid rgba(99, 102, 241, 0.3)', padding: '1px 5px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                            <Shield size={10} /> Admin
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-400)' }}>
                        {m.email} • {m.sharingEnabled ? 'Sharing ON' : 'Sharing PAUSED'}
                      </div>
                    </div>
                  </div>

                  {/* Actions for other members */}
                  {!isCurrent && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {isOwner && (
                        <>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => handlePromoteDemote(m.id, m.role)}
                            style={{ padding: '4px 6px', fontSize: '11px', color: 'var(--text-300)' }}
                            title={m.role === 'ADMIN' ? 'Demote to Member' : 'Promote to Admin'}
                          >
                            {m.role === 'ADMIN' ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => handleTransferOwner(m.id)}
                            style={{ padding: '4px 6px', fontSize: '11px', color: '#F59E0B' }}
                            title="Make Group Owner"
                          >
                            <Crown size={14} />
                          </button>
                        </>
                      )}

                      {(isOwner || (isAdmin && m.role === 'MEMBER')) && (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => handleRemoveMember(m.id)}
                          style={{ padding: '4px 6px', fontSize: '11px', color: '#EF4444' }}
                          title="Remove from Group"
                        >
                          <UserX size={14} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Leave Confirmation Card */}
        {showLeaveConfirm && (
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '10px', padding: '14px', marginBottom: '16px' }}>
            <h4 style={{ margin: '0 0 6px', fontSize: '13px', color: '#EF4444' }}>Are you sure you want to leave this group?</h4>
            <p style={{ fontSize: '12px', color: 'var(--text-300)', margin: '0 0 10px', lineHeight: '1.4' }}>
              Your other groups will not be affected. You can rejoin anytime with an invite code.
            </p>
            {isOwner && otherMembers.length > 0 && (
              <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-300)', display: 'block', marginBottom: '4px' }}>
                  Select a new group owner:
                </label>
                <select
                  value={successorId}
                  onChange={(e) => setSuccessorId(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', background: 'var(--bg-900)', color: '#fff', border: '1px solid var(--glass-border)', fontSize: '12px' }}
                >
                  {otherMembers.map(m => (
                    <option key={m.id} value={m.id}>{m.name} ({m.email})</option>
                  ))}
                </select>
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowLeaveConfirm(false)} style={{ padding: '6px 12px', fontSize: '12px' }}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleConfirmLeave} style={{ padding: '6px 14px', fontSize: '12px', background: '#DC2626', color: '#fff' }}>
                Confirm & Leave
              </button>
            </div>
          </div>
        )}

        {/* Delete Confirmation Card */}
        {showDeleteConfirm && isOwner && (
          <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #DC2626', borderRadius: '10px', padding: '14px', marginBottom: '16px' }}>
            <h4 style={{ margin: '0 0 6px', fontSize: '13px', color: '#EF4444' }}>Permanently Delete Group?</h4>
            <p style={{ fontSize: '12px', color: 'var(--text-300)', margin: '0 0 10px', lineHeight: '1.4' }}>
              This will remove the group, its safe zones, and disconnect all members. This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowDeleteConfirm(false)} style={{ padding: '6px 12px', fontSize: '12px' }}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleConfirmDelete} style={{ padding: '6px 14px', fontSize: '12px', background: '#DC2626', color: '#fff' }}>
                Permanently Delete
              </button>
            </div>
          </div>
        )}

        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #EF4444', borderRadius: '8px', padding: '10px', marginBottom: '16px', fontSize: '12px', color: '#FCA5A5' }}>
            {error}
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between', borderTop: '1px solid var(--glass-border)', paddingTop: '14px', marginTop: '10px' }}>
          <div>
            {isOwner && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setShowDeleteConfirm(true)}
                style={{ color: '#EF4444', fontSize: '12px', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Trash2 size={14} />
                <span>Delete Group</span>
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowLeaveConfirm(true)}
              style={{ padding: '8px 14px', fontSize: '12px', color: '#F87171', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <LogOut size={14} />
              <span>Leave Group</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              style={{ padding: '8px 16px', fontSize: '12px' }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

