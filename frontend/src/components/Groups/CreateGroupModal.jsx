import React, { useState } from 'react';
import { useFamily } from '../../context/FamilyContext';
import {
  Users, Plus, X, Shield, MapPin, Sparkles, Check, Heart, Briefcase, GraduationCap, Compass, Tag
} from 'lucide-react';

const GROUP_TYPES = [
  { id: 'FAMILY', label: 'Family', icon: Heart, color: '#4F46E5' },
  { id: 'FRIENDS', label: 'Friends', icon: Users, color: '#059669' },
  { id: 'COLLEGE', label: 'College', icon: GraduationCap, color: '#D97706' },
  { id: 'CLASS', label: 'Class', icon: GraduationCap, color: '#0891B2' },
  { id: 'WORK', label: 'Work', icon: Briefcase, color: '#7C3AED' },
  { id: 'PROJECT', label: 'Project Team', icon: Briefcase, color: '#2563EB' },
  { id: 'TRAVEL', label: 'Travel', icon: Compass, color: '#DB2777' },
  { id: 'CUSTOM', label: 'Custom', icon: Tag, color: '#475569' }
];

const PRESET_COLORS = [
  '#4F46E5', '#059669', '#D97706', '#7C3AED',
  '#DB2777', '#0891B2', '#2563EB', '#DC2626'
];

export default function CreateGroupModal({ isOpen, onClose }) {
  const { createGroup } = useFamily();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [groupType, setGroupType] = useState('FAMILY');
  const [avatarColor, setAvatarColor] = useState('#4F46E5');
  const [sharingEnabled, setSharingEnabled] = useState(true);
  const [historyEnabled, setHistoryEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleTypeSelect = (type) => {
    setGroupType(type.id);
    setAvatarColor(type.color);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter a group name.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await createGroup({
        name: name.trim(),
        groupType,
        description: description.trim(),
        avatarColor,
        icon: 'Users',
        sharingEnabled,
        historyEnabled
      });
      setName('');
      setDescription('');
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create group.');
    } finally {
      setLoading(false);
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
            <div style={{ background: `${avatarColor}25`, padding: '8px', borderRadius: '10px' }}>
              <Plus size={22} color={avatarColor} />
            </div>
            <div>
              <h2 style={{ fontSize: '18px', margin: 0 }}>Create New Group</h2>
              <div style={{ fontSize: '12px', color: 'var(--text-400)' }}>
                Multi-group location circle
              </div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Group Name */}
          <div className="form-group mb-3">
            <label className="form-label">Group Name *</label>
            <input
              type="text"
              className="input-field"
              placeholder="e.g. My Family, College Gang, Euro Trip 2026"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              required
            />
          </div>

          {/* Group Type Selector */}
          <div className="form-group mb-3">
            <label className="form-label">Group Type</label>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '8px'
              }}
            >
              {GROUP_TYPES.map((t) => {
                const IconComponent = t.icon;
                const isSelected = groupType === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleTypeSelect(t)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '8px 4px',
                      borderRadius: '8px',
                      background: isSelected ? `${t.color}25` : 'var(--bg-800)',
                      border: isSelected ? `2px solid ${t.color}` : '1px solid var(--glass-border)',
                      color: isSelected ? '#fff' : 'var(--text-300)',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    <IconComponent size={16} color={isSelected ? t.color : 'var(--text-400)'} />
                    <span style={{ fontSize: '11px', fontWeight: isSelected ? 700 : 500 }}>
                      {t.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Description */}
          <div className="form-group mb-3">
            <label className="form-label">Description (Optional)</label>
            <input
              type="text"
              className="input-field"
              placeholder="Brief note about this circle"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={120}
            />
          </div>

          {/* Color Picker */}
          <div className="form-group mb-4">
            <label className="form-label">Theme Color</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {PRESET_COLORS.map((col) => (
                <button
                  key={col}
                  type="button"
                  onClick={() => setAvatarColor(col)}
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: col,
                    border: avatarColor === col ? '3px solid #FFFFFF' : '2px solid transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: avatarColor === col ? `0 0 10px ${col}` : 'none'
                  }}
                >
                  {avatarColor === col && <Check size={14} color="#FFFFFF" />}
                </button>
              ))}
            </div>
          </div>

          {/* Initial Location Sharing Policy (Requirement 5 & 7) */}
          <div
            style={{
              background: 'var(--bg-800)',
              border: '1px solid var(--glass-border)',
              borderRadius: '10px',
              padding: '12px',
              marginBottom: '16px'
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-100)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <MapPin size={16} color="var(--primary-400)" />
              <span>Location Sharing for this Group</span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-400)', marginBottom: '10px', lineHeight: '1.4' }}>
              You control location sharing independently for each group. You can pause or resume sharing with this group at any time.
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-200)' }}>Share Live Location with this group:</span>
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
          </div>

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

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={loading}
              style={{ padding: '10px 18px', fontSize: '13px' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{
                padding: '10px 20px',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: avatarColor,
                borderColor: avatarColor
              }}
            >
              <Plus size={16} />
              <span>{loading ? 'Creating Group...' : 'Create Group'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

