import React, { useState } from 'react';
import { useFamily } from '../../context/FamilyContext';
import {
  Users, Plus, UserPlus, Map, Settings, Copy, Check, Shield, Crown,
  Search, Filter, Heart, Briefcase, GraduationCap, Compass, Tag, Eye, EyeOff, Radio
} from 'lucide-react';

export default function MyGroups({
  onOpenCreate,
  onOpenJoin,
  onOpenSettings,
  onOpenLocationSettings,
  onOpenAllGroupsMap,
  onSelectGroup
}) {
  const { groups, activeGroupId, switchActiveGroup, updateGroupLocationSharing } = useFamily();
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [copiedId, setCopiedId] = useState(null);

  const filteredGroups = groups.filter((g) => {
    const matchesSearch = g.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (g.description && g.description.toLowerCase().includes(searchTerm.toLowerCase()));
    const groupType = (g.groupType || g.group_type || 'FAMILY').toUpperCase();
    const matchesType = typeFilter === 'ALL' || groupType === typeFilter;
    return matchesSearch && matchesType;
  });

  const handleCopyCode = async (groupId, code) => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(groupId);
      setTimeout(() => setCopiedId(null), 2500);
    } catch (_) {}
  };

  const handleQuickToggleSharing = async (e, group) => {
    e.stopPropagation();
    const current = group.sharingEnabled !== false;
    await updateGroupLocationSharing(group.id, { sharingEnabled: !current });
  };

  return (
    <div className="my-groups-container" style={{ padding: '16px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Top Header Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 4px', color: '#fff' }}>
            My Groups & Circles
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-400)', margin: 0 }}>
            Share location with your family, friends, college, and teams with one account
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onOpenAllGroupsMap}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '8px 14px' }}
          >
            <Map size={16} color="var(--primary-400)" />
            <span>All Groups Map</span>
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={onOpenJoin}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '8px 14px' }}
          >
            <UserPlus size={16} />
            <span>Join Group</span>
          </button>

          <button
            type="button"
            className="btn btn-primary"
            onClick={onOpenCreate}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '8px 16px' }}
          >
            <Plus size={16} />
            <span>Create Group</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div style={{ position: 'relative', flex: '1', minWidth: '220px' }}>
          <Search size={16} color="var(--text-400)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            className="input-field"
            placeholder="Search groups by name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ paddingLeft: '36px' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
          {['ALL', 'FAMILY', 'FRIENDS', 'COLLEGE', 'WORK', 'PROJECT', 'TRAVEL'].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              style={{
                padding: '6px 12px',
                borderRadius: '9999px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                background: typeFilter === t ? 'var(--primary-600)' : 'var(--bg-800)',
                color: typeFilter === t ? '#fff' : 'var(--text-300)',
                border: typeFilter === t ? '1px solid var(--primary-500)' : '1px solid var(--glass-border)',
                whiteSpace: 'nowrap'
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Groups Grid */}
      {filteredGroups.length === 0 ? (
        <div
          style={{
            background: 'var(--bg-800)',
            border: '1px solid var(--glass-border)',
            borderRadius: '16px',
            padding: '48px 24px',
            textAlign: 'center'
          }}
        >
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>👥</div>
          <h3 style={{ fontSize: '18px', margin: '0 0 6px', color: '#fff' }}>No groups found</h3>
          <p style={{ color: 'var(--text-400)', fontSize: '13px', maxWidth: '380px', margin: '0 auto 20px' }}>
            Create your first circle for family, friends, or colleagues, or join an existing group with an invite code.
          </p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={onOpenCreate}>Create Group</button>
            <button className="btn btn-secondary" onClick={onOpenJoin}>Join with Code</button>
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '16px'
          }}
        >
          {filteredGroups.map((g) => {
            const isSelected = activeGroupId === g.id;
            const isSharing = g.sharingEnabled !== false;
            const isOwner = g.isOwner || g.role === 'OWNER';
            const groupColor = g.avatarColor || g.avatar_color || '#4F46E5';

            return (
              <div
                key={g.id}
                style={{
                  background: 'var(--bg-800)',
                  border: isSelected ? `2px solid ${groupColor}` : '1px solid var(--glass-border)',
                  borderRadius: '14px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: isSelected ? `0 0 20px ${groupColor}25` : 'none',
                  transition: 'all 0.2s ease',
                  position: 'relative'
                }}
              >
                {/* Active Group Indicator */}
                {isSelected && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '12px',
                      right: '12px',
                      background: `${groupColor}25`,
                      color: groupColor,
                      border: `1px solid ${groupColor}50`,
                      borderRadius: '9999px',
                      fontSize: '10px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <Radio size={10} /> Active Map
                  </div>
                )}

                <div>
                  {/* Group Header Info */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                    <div
                      style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '12px',
                        background: groupColor,
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        fontSize: '18px',
                        flexShrink: 0
                      }}
                    >
                      {g.name?.charAt(0).toUpperCase()}
                    </div>

                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <h3 style={{ fontSize: '17px', margin: 0, color: '#fff', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {g.name}
                        </h3>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-400)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                        <span
                          style={{
                            background: 'var(--bg-900)',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            border: '1px solid var(--glass-border)',
                            color: 'var(--text-300)',
                            fontWeight: 600
                          }}
                        >
                          {g.groupType || g.group_type}
                        </span>
                        <span>•</span>
                        <span>{isOwner ? '👑 Owner' : `Member (${g.role})`}</span>
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  {g.description && (
                    <p style={{ fontSize: '12px', color: 'var(--text-300)', margin: '0 0 12px', lineHeight: '1.4' }}>
                      {g.description}
                    </p>
                  )}

                  {/* Metrics Badges */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '8px',
                      background: 'var(--bg-900)',
                      borderRadius: '8px',
                      padding: '10px',
                      marginBottom: '14px',
                      textAlign: 'center'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '10px', color: 'var(--text-400)', textTransform: 'uppercase' }}>Members</div>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-100)' }}>{g.totalMembers || 1}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '10px', color: 'var(--success-400)', textTransform: 'uppercase' }}>Online</div>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--success-500)' }}>{g.onlineMembers || 0}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '10px', color: 'var(--text-400)', textTransform: 'uppercase' }}>Sharing</div>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--primary-400)' }}>{g.sharingMembers || 0}</div>
                    </div>
                  </div>

                  {/* Quick Location Sharing Switch for THIS group */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: isSharing ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                      border: `1px solid ${isSharing ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
                      borderRadius: '8px',
                      padding: '8px 12px',
                      marginBottom: '14px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {isSharing ? <Eye size={15} color="#34D399" /> : <EyeOff size={15} color="#F87171" />}
                      <span style={{ fontSize: '12px', fontWeight: 600, color: isSharing ? '#34D399' : '#F87171' }}>
                        {isSharing ? 'Sharing Location' : 'Location Paused'}
                      </span>
                    </div>

                    <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '34px', height: '18px' }}>
                      <input
                        type="checkbox"
                        checked={isSharing}
                        onChange={(e) => handleQuickToggleSharing(e, g)}
                        style={{ opacity: 0, width: 0, height: 0 }}
                      />
                      <span
                        style={{
                          position: 'absolute',
                          cursor: 'pointer',
                          top: 0, left: 0, right: 0, bottom: 0,
                          backgroundColor: isSharing ? 'var(--success-500)' : '#475569',
                          borderRadius: '34px',
                          transition: '.2s'
                        }}
                      >
                        <span
                          style={{
                            position: 'absolute',
                            content: '""',
                            height: '14px',
                            width: '14px',
                            left: isSharing ? '17px' : '2px',
                            bottom: '2px',
                            backgroundColor: 'white',
                            borderRadius: '50%',
                            transition: '.2s'
                          }}
                        />
                      </span>
                    </label>
                  </div>
                </div>

                {/* Card Actions */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      switchActiveGroup(g.id);
                      if (onSelectGroup) onSelectGroup(g);
                    }}
                    style={{ flex: 1, padding: '8px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    <Map size={14} />
                    <span>Open Map</span>
                  </button>

                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => onOpenSettings && onOpenSettings(g)}
                    style={{ padding: '8px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    title="Group Settings & Members"
                  >
                    <Settings size={15} />
                  </button>

                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handleCopyCode(g.id, g.inviteCode || g.invite_code)}
                    style={{ padding: '8px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    title="Copy Group Invite Code"
                  >
                    {copiedId === g.id ? <Check size={15} color="#10B981" /> : <Copy size={15} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

