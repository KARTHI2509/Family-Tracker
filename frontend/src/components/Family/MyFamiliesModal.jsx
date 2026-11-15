import React, { useState } from 'react';
import { useFamily } from '../../context/FamilyContext';
import { useAuth } from '../../context/AuthContext';
import {
  Users, Plus, Link, Check, Crown, LogOut, X,
  Shield, CheckCircle2, ChevronRight, ArrowRight,
  Sparkles, RefreshCw, AlertCircle, Home, Briefcase, GraduationCap, Compass
} from 'lucide-react';

export default function MyFamiliesModal({
  isOpen,
  onClose,
  onOpenManage,
  onOpenLeave
}) {
  const {
    myFamilies,
    loadingMyFamilies,
    createAnotherFamily,
    joinAnotherFamily,
    selectActiveFamily,
    leaveFamilyCircle,
    familyDetails
  } = useFamily();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState('list'); // 'list' | 'create' | 'join'
  
  // Create family state
  const [createName, setCreateName] = useState('');
  const [createType, setCreateType] = useState('FAMILY');
  const [createDesc, setCreateDesc] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');

  // Join family state
  const [inviteCode, setInviteCode] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState('');

  // Leave circle confirmation state
  const [leavingFamily, setLeavingFamily] = useState(null);
  const [leaveLoading, setLeaveLoading] = useState(false);

  if (!isOpen) return null;

  const currentFamilyId = familyDetails?.family?.id || user?.family_id;

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!createName.trim()) {
      setCreateError('Please enter a family name');
      return;
    }
    setCreateLoading(true);
    setCreateError('');
    try {
      await createAnotherFamily({
        name: createName.trim(),
        groupType: createType,
        description: createDesc.trim()
      });
      setCreateName('');
      setCreateDesc('');
      setActiveTab('list');
    } catch (err) {
      setCreateError(err.message || 'Failed to create family circle');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleJoinSubmit = async (e) => {
    e.preventDefault();
    const cleanCode = inviteCode.trim().toUpperCase();
    if (cleanCode.length !== 6) {
      setJoinError('Invite code must be 6 characters');
      return;
    }
    setJoinLoading(true);
    setJoinError('');
    try {
      await joinAnotherFamily(cleanCode);
      setInviteCode('');
      setActiveTab('list');
    } catch (err) {
      setJoinError(err.message || 'Failed to join family circle');
    } finally {
      setJoinLoading(false);
    }
  };

  const handleSelect = async (famId) => {
    if (famId === currentFamilyId) return;
    try {
      await selectActiveFamily(famId);
      onClose();
    } catch (err) {
      console.error('Error selecting active family:', err);
    }
  };

  const confirmLeaveCircle = async () => {
    if (!leavingFamily) return;
    setLeaveLoading(true);
    try {
      await leaveFamilyCircle(leavingFamily.id);
      setLeavingFamily(null);
    } catch (err) {
      console.error('Failed to leave circle:', err);
    } finally {
      setLeaveLoading(false);
    }
  };

  const getTypeIcon = (type) => {
    switch ((type || '').toUpperCase()) {
      case 'WORK':
      case 'PROJECT':
        return <Briefcase size={14} />;
      case 'COLLEGE':
      case 'CLASS':
        return <GraduationCap size={14} />;
      case 'TRAVEL':
        return <Compass size={14} />;
      default:
        return <Home size={14} />;
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1250 }}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '580px', width: '100%', maxHeight: '90dvh', overflowY: 'auto' }}
      >
        {/* Header */}
        <div className="modal-header" style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: 'rgba(99, 102, 241, 0.15)', padding: '8px', borderRadius: '10px' }}>
              <Users size={22} color="#818CF8" />
            </div>
            <div>
              <h2 style={{ fontSize: '18px', margin: 0, color: '#fff' }}>My Families & Circles</h2>
              <div style={{ fontSize: '12px', color: 'var(--text-400)' }}>
                You are a member of {myFamilies.length} independent {myFamilies.length === 1 ? 'family' : 'families'}
              </div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            background: 'var(--bg-900)',
            padding: '4px',
            borderRadius: '10px',
            marginBottom: '16px',
            border: '1px solid var(--glass-border)'
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('list')}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 600,
              background: activeTab === 'list' ? 'var(--primary-600)' : 'transparent',
              color: activeTab === 'list' ? '#fff' : 'var(--text-300)',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.15s ease'
            }}
          >
            <Users size={15} />
            <span>All Families ({myFamilies.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('create')}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 600,
              background: activeTab === 'create' ? 'var(--primary-600)' : 'transparent',
              color: activeTab === 'create' ? '#fff' : 'var(--text-300)',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.15s ease'
            }}
          >
            <Plus size={15} />
            <span>+ Create Another</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('join')}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 600,
              background: activeTab === 'join' ? 'var(--primary-600)' : 'transparent',
              color: activeTab === 'join' ? '#fff' : 'var(--text-300)',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.15s ease'
            }}
          >
            <Link size={15} />
            <span>🔗 Join Circle</span>
          </button>
        </div>

        {/* TAB 1: ALL FAMILIES LIST */}
        {activeTab === 'list' && (
          <div>
            {loadingMyFamilies ? (
              <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-400)', fontSize: '13px' }}>
                <RefreshCw size={24} className="spin" style={{ margin: '0 auto 10px', display: 'block', color: 'var(--primary-400)' }} />
                Loading your family circles...
              </div>
            ) : myFamilies.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '36px 20px',
                  background: 'var(--bg-800)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: '12px'
                }}
              >
                <Users size={36} color="var(--text-400)" style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                <h4 style={{ margin: '0 0 6px', color: '#fff', fontSize: '15px' }}>No Families Yet</h4>
                <p style={{ margin: '0 0 16px', color: 'var(--text-400)', fontSize: '13px' }}>
                  Create your first family circle or join an existing circle with an invite code.
                </p>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                  <button className="btn btn-primary" onClick={() => setActiveTab('create')} style={{ fontSize: '13px', padding: '8px 16px' }}>
                    <Plus size={14} style={{ marginRight: '4px' }} /> Create Family
                  </button>
                  <button className="btn btn-secondary" onClick={() => setActiveTab('join')} style={{ fontSize: '13px', padding: '8px 16px' }}>
                    <Link size={14} style={{ marginRight: '4px' }} /> Join with Code
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {myFamilies.map((fam) => {
                  const isActive = fam.id === currentFamilyId || fam.isActive;
                  const isOwner = fam.isOwner || fam.role === 'OWNER' || fam.role === 'owner';

                  return (
                    <div
                      key={fam.id}
                      style={{
                        background: isActive ? 'rgba(99, 102, 241, 0.08)' : 'var(--bg-800)',
                        border: isActive ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid var(--glass-border)',
                        borderRadius: '12px',
                        padding: '14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        position: 'relative',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      {/* Top Bar: Name, Type, Role & Active Pill */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div
                            style={{
                              width: '40px',
                              height: '40px',
                              borderRadius: '10px',
                              background: isActive ? 'linear-gradient(135deg, #6366F1, #8B5CF6)' : 'var(--bg-700)',
                              color: '#fff',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: '16px',
                              flexShrink: 0
                            }}
                          >
                            {fam.name ? fam.name.charAt(0).toUpperCase() : 'F'}
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <h4 style={{ margin: 0, fontSize: '15px', color: '#fff', fontWeight: 600 }}>
                                {fam.name}
                              </h4>
                              {fam.group_type && (
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    fontSize: '11px',
                                    padding: '1px 6px',
                                    borderRadius: '4px',
                                    background: 'var(--bg-900)',
                                    color: 'var(--text-300)',
                                    border: '1px solid var(--glass-border)'
                                  }}
                                >
                                  {getTypeIcon(fam.group_type)}
                                  <span>{fam.group_type}</span>
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-400)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span>{fam.member_count || 1} {fam.member_count === 1 ? 'member' : 'members'}</span>
                              <span>•</span>
                              <span style={{ color: isOwner ? '#F59E0B' : 'var(--text-300)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                {isOwner && <Crown size={12} />}
                                {isOwner ? 'Owner' : 'Member'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {isActive ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '4px 10px',
                              borderRadius: '9999px',
                              background: 'rgba(16, 185, 129, 0.15)',
                              color: '#34D399',
                              border: '1px solid rgba(16, 185, 129, 0.3)',
                              fontSize: '11px',
                              fontWeight: 600,
                              flexShrink: 0
                            }}
                          >
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />
                            Active Circle
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => handleSelect(fam.id)}
                            style={{
                              padding: '6px 12px',
                              fontSize: '12px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              flexShrink: 0
                            }}
                          >
                            <span>Open Circle</span>
                            <ArrowRight size={13} />
                          </button>
                        )}
                      </div>

                      {/* Description if any */}
                      {fam.description && (
                        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-400)', lineHeight: '1.4' }}>
                          {fam.description}
                        </p>
                      )}

                      {/* Bottom Actions Row */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          paddingTop: '8px',
                          borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                          fontSize: '12px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {fam.invite_code && (
                            <span style={{ color: 'var(--text-400)', fontFamily: 'ui-monospace, monospace', fontSize: '11px' }}>
                              Code: <strong style={{ color: 'var(--primary-400)' }}>{fam.invite_code}</strong>
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {isActive && (
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                if (onOpenManage) onOpenManage();
                              }}
                              style={{
                                background: 'transparent',
                                border: '1px solid var(--glass-border)',
                                color: 'var(--text-300)',
                                borderRadius: '6px',
                                padding: '4px 10px',
                                fontSize: '11px',
                                cursor: 'pointer'
                              }}
                            >
                              Manage Roster
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setLeavingFamily(fam)}
                            style={{
                              background: 'transparent',
                              border: '1px solid rgba(239, 68, 68, 0.2)',
                              color: '#F87171',
                              borderRadius: '6px',
                              padding: '4px 10px',
                              fontSize: '11px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px'
                            }}
                          >
                            <LogOut size={11} />
                            <span>Leave</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: CREATE ANOTHER FAMILY FORM */}
        {activeTab === 'create' && (
          <form onSubmit={handleCreateSubmit}>
            <div style={{ background: 'var(--bg-800)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
              <h4 style={{ margin: '0 0 4px', fontSize: '15px', color: '#fff' }}>Create a New Family / Circle</h4>
              <p style={{ margin: '0 0 14px', fontSize: '12px', color: 'var(--text-400)', lineHeight: '1.4' }}>
                Create an independent circle (e.g. <em>Home Family</em>, <em>Friends Circle</em>, <em>Travel Group</em>). You will remain a member of all your existing families.
              </p>

              {createError && (
                <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #EF4444', borderRadius: '8px', padding: '10px', marginBottom: '12px', fontSize: '12px', color: '#FCA5A5', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertCircle size={15} color="#EF4444" style={{ flexShrink: 0 }} />
                  <span>{createError}</span>
                </div>
              )}

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-200)', marginBottom: '4px' }}>
                  Circle Name *
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Friends Trip, College Friends, Work Team"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', fontSize: '13px', padding: '9px 12px' }}
                  maxLength={50}
                  required
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-200)', marginBottom: '4px' }}>
                  Circle Category
                </label>
                <select
                  className="input"
                  value={createType}
                  onChange={(e) => setCreateType(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', fontSize: '13px', padding: '9px 12px' }}
                >
                  <option value="FAMILY">Family (Default)</option>
                  <option value="FRIENDS">Friends</option>
                  <option value="COLLEGE">College / University</option>
                  <option value="WORK">Work / Project</option>
                  <option value="TRAVEL">Travel / Vacation</option>
                  <option value="CUSTOM">Custom Group</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-200)', marginBottom: '4px' }}>
                  Description (Optional)
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Weekend road trip tracking and safety check-ins"
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', fontSize: '13px', padding: '9px 12px' }}
                  maxLength={150}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setActiveTab('list')}
                disabled={createLoading}
                style={{ fontSize: '13px', padding: '9px 16px' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={createLoading || !createName.trim()}
                style={{ fontSize: '13px', padding: '9px 20px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {createLoading ? <RefreshCw size={14} className="spin" /> : <Plus size={14} />}
                <span>{createLoading ? 'Creating Circle...' : 'Create Circle'}</span>
              </button>
            </div>
          </form>
        )}

        {/* TAB 3: JOIN ANOTHER FAMILY FORM */}
        {activeTab === 'join' && (
          <form onSubmit={handleJoinSubmit}>
            <div style={{ background: 'var(--bg-800)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
              <h4 style={{ margin: '0 0 4px', fontSize: '15px', color: '#fff' }}>Join Another Family Circle</h4>
              <p style={{ margin: '0 0 14px', fontSize: '12px', color: 'var(--text-400)', lineHeight: '1.4' }}>
                Enter an invite code provided by a family creator. Joining this circle will <strong>not</strong> remove you from any of your current families.
              </p>

              {joinError && (
                <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #EF4444', borderRadius: '8px', padding: '10px', marginBottom: '12px', fontSize: '12px', color: '#FCA5A5', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertCircle size={15} color="#EF4444" style={{ flexShrink: 0 }} />
                  <span>{joinError}</span>
                </div>
              )}

              <div style={{ marginBottom: '10px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-200)', marginBottom: '6px' }}>
                  6-Character Invite Code
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. ABC123"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    fontSize: '18px',
                    letterSpacing: '0.2em',
                    textTransform: 'uppercase',
                    textAlign: 'center',
                    padding: '12px',
                    fontFamily: 'ui-monospace, monospace'
                  }}
                  maxLength={6}
                  required
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setActiveTab('list')}
                disabled={joinLoading}
                style={{ fontSize: '13px', padding: '9px 16px' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={joinLoading || inviteCode.trim().length !== 6}
                style={{ fontSize: '13px', padding: '9px 20px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {joinLoading ? <RefreshCw size={14} className="spin" /> : <Link size={14} />}
                <span>{joinLoading ? 'Joining Circle...' : 'Join Circle'}</span>
              </button>
            </div>
          </form>
        )}

        {/* LEAVE CONFIRMATION SUB-MODAL */}
        {leavingFamily && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px',
              zIndex: 1350
            }}
          >
            <div
              style={{
                background: 'var(--bg-850)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '14px',
                padding: '20px',
                maxWidth: '440px',
                width: '100%',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.6)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <div style={{ background: 'rgba(239, 68, 68, 0.15)', padding: '8px', borderRadius: '10px' }}>
                  <LogOut size={20} color="#EF4444" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', color: '#fff' }}>Leave Circle "{leavingFamily.name}"?</h3>
                  <div style={{ fontSize: '12px', color: 'var(--text-400)' }}>
                    Your other family circles will remain untouched.
                  </div>
                </div>
              </div>

              <p style={{ fontSize: '13px', color: 'var(--text-300)', lineHeight: '1.5', margin: '0 0 16px' }}>
                Are you sure you want to leave <strong>{leavingFamily.name}</strong>? You will no longer share locations or receive alerts from this circle unless re-invited.
              </p>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setLeavingFamily(null)}
                  disabled={leaveLoading}
                  style={{ fontSize: '13px', padding: '8px 14px' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={confirmLeaveCircle}
                  disabled={leaveLoading}
                  style={{
                    fontSize: '13px',
                    padding: '8px 16px',
                    background: '#EF4444',
                    borderColor: '#EF4444',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {leaveLoading ? <RefreshCw size={14} className="spin" /> : <LogOut size={14} />}
                  <span>{leaveLoading ? 'Leaving...' : 'Yes, Leave Circle'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

