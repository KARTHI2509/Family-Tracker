import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useFamily } from '../../context/FamilyContext';
import { Menu, LogOut, Navigation, NavigationOff, AlertTriangle, ShieldCheck, BatteryCharging, Send } from 'lucide-react';
import JourneyModal from '../Dashboard/JourneyModal';

export default function Header({ onToggleSidebar, familyName }) {
  const { user, logout } = useAuth();
  const { isTrackingEnabled, toggleTracking, trackingStatus, trackingMode, setTrackingMode } = useFamily();
  const [isJourneyModalOpen, setIsJourneyModalOpen] = useState(false);
  const [showModeDropdown, setShowModeDropdown] = useState(false);

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const getTrackingBadge = () => {
    if (trackingStatus === 'denied') {
      return (
        <button
          className="btn btn-ghost"
          onClick={() => toggleTracking(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            color: 'var(--danger-400)',
            background: 'rgba(239, 68, 68, 0.1)',
            padding: '4px 10px',
            borderRadius: '9999px',
            border: '1px solid rgba(239, 68, 68, 0.3)'
          }}
          title="Location permission denied in browser. Click to retry."
        >
          <AlertTriangle size={13} />
          <span className="header-pill-text">GPS Blocked</span>
        </button>
      );
    }

    if (isTrackingEnabled) {
      return (
        <button
          className="btn btn-ghost"
          onClick={() => toggleTracking(false)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            color: 'var(--success-400)',
            background: 'rgba(16, 185, 129, 0.12)',
            padding: '4px 10px',
            borderRadius: '9999px',
            border: '1px solid rgba(16, 185, 129, 0.3)'
          }}
          title="You are currently broadcasting live location. Click to pause."
        >
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />
          <Navigation size={12} />
          <span className="header-pill-text">Sharing Live</span>
        </button>
      );
    }

    return (
      <button
        className="btn btn-ghost"
        onClick={() => toggleTracking(true)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '12px',
          color: 'var(--text-300)',
          background: 'var(--bg-700)',
          padding: '4px 10px',
          borderRadius: '9999px',
          border: '1px solid var(--glass-border)'
        }}
        title="Location sharing is paused. Click to start broadcasting."
      >
        <NavigationOff size={13} />
        <span className="header-pill-text">Share Location</span>
      </button>
    );
  };

  return (
    <>
      <header className="header">
        <div className="header-left">
          <button
            className="hamburger-btn btn btn-ghost"
            onClick={onToggleSidebar}
            aria-label="Toggle navigation menu"
            style={{ padding: '6px' }}
          >
            <Menu size={20} />
          </button>

          <div className="logo">
            <span className="logo-icon">🛡️</span>
            <span className="logo-text">FamilyTracker</span>
          </div>

          {familyName && (
            <span className="family-name-badge">
              {familyName}
            </span>
          )}
        </div>

        <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Journey Safety & Check-In Button */}
          <button
            className="btn btn-ghost"
            onClick={() => setIsJourneyModalOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              padding: '4px 10px',
              borderRadius: '9999px',
              background: 'rgba(59, 130, 246, 0.12)',
              color: '#60A5FA',
              border: '1px solid rgba(59, 130, 246, 0.3)'
            }}
            title="Start a tracked trip or send emergency check-in"
          >
            <Send size={13} />
            <span className="header-pill-text">Trip & Check-In</span>
          </button>

          {/* Battery Mode Switcher */}
          <div style={{ position: 'relative' }}>
            <button
              className="btn btn-ghost"
              onClick={() => setShowModeDropdown(!showModeDropdown)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '11px',
                padding: '4px 8px',
                borderRadius: '9999px',
                background: 'var(--bg-700)',
                color: 'var(--text-300)',
                border: '1px solid var(--glass-border)'
              }}
              title="Change location refresh frequency"
            >
              <BatteryCharging size={13} />
              <span className="header-pill-text" style={{ textTransform: 'capitalize' }}>
                {trackingMode === 'battery_saver' ? 'Eco (10m)' : (trackingMode === 'high_accuracy' ? 'Live (1m)' : 'Balanced (5m)')}
              </span>
            </button>

            {showModeDropdown && (
              <div
                style={{
                  position: 'absolute',
                  top: '36px',
                  right: '0',
                  background: 'var(--bg-800)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: '8px',
                  padding: '6px',
                  boxShadow: 'var(--shadow-xl)',
                  zIndex: 999,
                  minWidth: '150px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}
              >
                <button
                  type="button"
                  onClick={() => { setTrackingMode('battery_saver'); setShowModeDropdown(false); }}
                  style={{
                    background: trackingMode === 'battery_saver' ? 'var(--primary-600)' : 'transparent',
                    color: '#fff',
                    border: 'none',
                    padding: '6px 10px',
                    textAlign: 'left',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  Eco Mode (10 min)
                </button>
                <button
                  type="button"
                  onClick={() => { setTrackingMode('balanced'); setShowModeDropdown(false); }}
                  style={{
                    background: trackingMode === 'balanced' ? 'var(--primary-600)' : 'transparent',
                    color: '#fff',
                    border: 'none',
                    padding: '6px 10px',
                    textAlign: 'left',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  Balanced (5 min)
                </button>
                <button
                  type="button"
                  onClick={() => { setTrackingMode('high_accuracy'); setShowModeDropdown(false); }}
                  style={{
                    background: trackingMode === 'high_accuracy' ? 'var(--primary-600)' : 'transparent',
                    color: '#fff',
                    border: 'none',
                    padding: '6px 10px',
                    textAlign: 'left',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  High Accuracy (1 min)
                </button>
              </div>
            )}
          </div>

          {/* Location Sharing Controller */}
          {getTrackingBadge()}

          {/* Super Admin Direct Pill Link */}
          {isAdmin && (
            <Link
              to="/admin/dashboard"
              style={{
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '12px',
                fontWeight: 700,
                color: '#F59E0B',
                background: 'rgba(245, 158, 11, 0.12)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                padding: '4px 10px',
                borderRadius: '9999px'
              }}
            >
              <ShieldCheck size={14} />
              <span className="header-pill-text">Admin</span>
            </Link>
          )}

          <div className="user-menu" style={{ marginLeft: '4px' }}>
            <div
              className="user-avatar-small"
              style={{ backgroundColor: user?.avatar_color || '#4F46E5' }}
              title={`${user?.name} (${user?.email})`}
            >
              {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <button
              className="btn btn-ghost"
              onClick={logout}
              title="Log out"
              style={{ padding: '6px 10px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <LogOut size={16} />
              <span className="header-pill-text" style={{ fontSize: '12px' }}>Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Journey Modal */}
      <JourneyModal
        isOpen={isJourneyModalOpen}
        onClose={() => setIsJourneyModalOpen(false)}
      />
    </>
  );
}
