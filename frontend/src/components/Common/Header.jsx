import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useFamily } from '../../context/FamilyContext';
import {
  Menu, LogOut, Navigation, NavigationOff, AlertTriangle, ShieldCheck,
  BatteryCharging, Send, Settings, Users, Sparkles, Shield, ChevronDown
} from 'lucide-react';
import JourneyModal from '../Dashboard/JourneyModal';
import LocationSettingsModal from '../Settings/LocationSettingsModal';

export default function Header({
  onToggleSidebar,
  familyName,
  onOpenFamilyManagement,
  onCheckUpdate,
  onOpenMyFamilies
}) {
  const { user, logout } = useAuth();
  const {
    isTrackingEnabled,
    toggleTracking,
    trackingStatus,
    trackingMode,
    setTrackingMode,
    myFamilies = []
  } = useFamily();

  const [isJourneyModalOpen, setIsJourneyModalOpen] = useState(false);
  const [isLocationSettingsOpen, setIsLocationSettingsOpen] = useState(false);
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  const modeDropdownRef = useRef(null);
  const userDropdownRef = useRef(null);

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (modeDropdownRef.current && !modeDropdownRef.current.contains(e.target)) {
        setShowModeDropdown(false);
      }
      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target)) {
        setShowUserDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const getTrackingBadge = () => {
    if (trackingStatus === 'denied') {
      return (
        <button
          className="header-pill-btn tracking-denied"
          onClick={() => setIsLocationSettingsOpen(true)}
          title="Location permission denied. Tap to configure."
          aria-label="Location permission denied"
        >
          <AlertTriangle size={18} color="#F87171" strokeWidth={2.2} style={{ flexShrink: 0 }} />
          <span className="header-pill-text">GPS Blocked</span>
        </button>
      );
    }

    if (isTrackingEnabled) {
      return (
        <button
          className="header-pill-btn tracking-live"
          onClick={() => toggleTracking(false)}
          title="Broadcasting live location. Tap to pause."
          aria-label="Location sharing active"
        >
          <span className="live-pulse-dot" />
          <Navigation size={18} color="#34D399" strokeWidth={2.4} style={{ flexShrink: 0 }} />
          <span className="header-pill-text">Live</span>
        </button>
      );
    }

    return (
      <button
        className="header-pill-btn tracking-idle"
        onClick={() => toggleTracking(true)}
        title="Location sharing is paused. Tap to start."
        aria-label="Start location sharing"
      >
        <NavigationOff size={18} color="#94A3B8" strokeWidth={2.2} style={{ flexShrink: 0 }} />
        <span className="header-pill-text">Share</span>
      </button>
    );
  };

  return (
    <>
      <header className="header">
        {/* Left Side: Navigation Menu, Logo & Family Selector */}
        <div className="header-left">
          <button
            className="hamburger-btn"
            onClick={onToggleSidebar}
            aria-label="Toggle navigation menu"
            title="Open Menu"
          >
            <Menu size={22} color="#F8FAFC" strokeWidth={2.2} />
          </button>

          <div className="logo">
            <div className="logo-icon-wrapper">
              <Shield size={22} color="#818CF8" strokeWidth={2.4} />
            </div>
            <span className="logo-text">FamilyTracker</span>
          </div>

          {familyName && (
            <button
              type="button"
              className="family-name-badge"
              onClick={onOpenMyFamilies || onOpenFamilyManagement}
              title="View All My Families, Switch or Create Circles"
            >
              <Users size={16} color="#818CF8" strokeWidth={2.2} style={{ flexShrink: 0 }} />
              <span className="family-name-text">{familyName}</span>
              {myFamilies.length > 1 && (
                <span className="family-count-badge">
                  {myFamilies.length}
                </span>
              )}
              <ChevronDown size={14} color="#94A3B8" style={{ flexShrink: 0 }} />
            </button>
          )}
        </div>

        {/* Right Side: Quick Action Controls & User Menu */}
        <div className="header-right">
          {/* Desktop-Only: Multi-Family Circle Manager */}
          <button
            type="button"
            className="header-pill-btn hide-mobile"
            onClick={onOpenMyFamilies || onOpenFamilyManagement}
            title="Switch, Create, or Join Multiple Families"
          >
            <Users size={18} color="#818CF8" strokeWidth={2} style={{ flexShrink: 0 }} />
            <span className="header-pill-text">My Families {myFamilies.length > 1 ? `(${myFamilies.length})` : ''}</span>
          </button>

          {/* Quick Trip & Safety Check-In */}
          <button
            type="button"
            className="header-pill-btn header-trip-btn"
            onClick={() => setIsJourneyModalOpen(true)}
            title="Start a tracked trip or send emergency check-in"
            aria-label="Trip and Check-In"
          >
            <Send size={18} color="#60A5FA" strokeWidth={2.2} style={{ flexShrink: 0 }} />
            <span className="header-pill-text">Trip</span>
          </button>

          {/* Desktop-Only: Frequency / Battery Mode Dropdown */}
          <div className="hide-mobile" style={{ position: 'relative' }} ref={modeDropdownRef}>
            <button
              type="button"
              className="header-pill-btn"
              onClick={() => setShowModeDropdown(!showModeDropdown)}
              title="Change location refresh frequency"
            >
              <BatteryCharging size={18} color="#FBBF24" strokeWidth={2} style={{ flexShrink: 0 }} />
              <span className="header-pill-text" style={{ textTransform: 'capitalize' }}>
                {trackingMode === 'battery_saver' ? 'Eco (10m)' : (trackingMode === 'high_accuracy' ? 'Live (1m)' : 'Balanced (5m)')}
              </span>
            </button>

            {showModeDropdown && (
              <div className="header-dropdown-menu">
                <button
                  type="button"
                  onClick={() => { setTrackingMode('battery_saver'); setShowModeDropdown(false); }}
                  className={trackingMode === 'battery_saver' ? 'active' : ''}
                >
                  Eco Mode (10 min)
                </button>
                <button
                  type="button"
                  onClick={() => { setTrackingMode('balanced'); setShowModeDropdown(false); }}
                  className={trackingMode === 'balanced' ? 'active' : ''}
                >
                  Balanced (5 min)
                </button>
                <button
                  type="button"
                  onClick={() => { setTrackingMode('high_accuracy'); setShowModeDropdown(false); }}
                  className={trackingMode === 'high_accuracy' ? 'active' : ''}
                >
                  High Accuracy (1 min)
                </button>
              </div>
            )}
          </div>

          {/* Location Sharing Controller */}
          {getTrackingBadge()}

          {/* Desktop-Only: Super Admin Direct Link */}
          {isAdmin && (
            <Link
              to="/admin/dashboard"
              className="header-pill-btn admin-badge hide-mobile"
              title="Admin Dashboard"
            >
              <ShieldCheck size={18} color="#F59E0B" strokeWidth={2.2} style={{ flexShrink: 0 }} />
              <span className="header-pill-text">Admin</span>
            </Link>
          )}

          {/* Desktop-Only: Sparkles Check for Updates */}
          {onCheckUpdate && (
            <button
              type="button"
              className="header-icon-btn hide-mobile"
              onClick={onCheckUpdate}
              title="Check for App Updates"
              aria-label="Check for Updates"
            >
              <Sparkles size={20} color="#34D399" strokeWidth={2} />
            </button>
          )}

          {/* Location Settings Button */}
          <button
            type="button"
            className="header-icon-btn"
            onClick={() => setIsLocationSettingsOpen(true)}
            title="Location Permissions, Background & Battery Settings"
            aria-label="Location Settings"
          >
            <Settings size={20} color="#CBD5E1" strokeWidth={2} />
          </button>

          {/* User Profile Menu */}
          <div className="user-menu" ref={userDropdownRef}>
            <button
              type="button"
              className="user-avatar-small"
              onClick={() => setShowUserDropdown(!showUserDropdown)}
              style={{ backgroundColor: user?.avatar_color || '#4F46E5' }}
              title={`${user?.name} (${user?.email})`}
              aria-label="User Account Menu"
            >
              {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
            </button>

            {/* Desktop Logout Button */}
            <button
              type="button"
              className="header-pill-btn logout-btn hide-mobile"
              onClick={logout}
              title="Log out"
              aria-label="Log out"
            >
              <LogOut size={16} color="#F87171" strokeWidth={2} style={{ flexShrink: 0 }} />
              <span className="header-pill-text">Logout</span>
            </button>

            {/* Mobile / Compact User Dropdown Menu */}
            {showUserDropdown && (
              <div className="header-dropdown-menu user-dropdown">
                <div className="user-dropdown-header">
                  <div className="user-dropdown-name">{user?.name || 'User'}</div>
                  <div className="user-dropdown-email">{user?.email}</div>
                </div>

                <div className="user-dropdown-divider" />

                <button
                  type="button"
                  onClick={() => {
                    setShowUserDropdown(false);
                    if (onOpenMyFamilies) onOpenMyFamilies();
                  }}
                  className="user-dropdown-item"
                >
                  <Users size={16} color="#818CF8" />
                  <span>My Families & Circles ({myFamilies.length})</span>
                </button>

                {isAdmin && (
                  <Link
                    to="/admin/dashboard"
                    onClick={() => setShowUserDropdown(false)}
                    className="user-dropdown-item"
                  >
                    <ShieldCheck size={16} color="#F59E0B" />
                    <span>Admin Dashboard</span>
                  </Link>
                )}

                {onCheckUpdate && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowUserDropdown(false);
                      onCheckUpdate();
                    }}
                    className="user-dropdown-item"
                  >
                    <Sparkles size={16} color="#34D399" />
                    <span>Check for Updates</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setShowUserDropdown(false);
                    setIsLocationSettingsOpen(true);
                  }}
                  className="user-dropdown-item"
                >
                  <Settings size={16} color="#CBD5E1" />
                  <span>App & Location Settings</span>
                </button>

                <div className="user-dropdown-divider" />

                <button
                  type="button"
                  onClick={() => {
                    setShowUserDropdown(false);
                    logout();
                  }}
                  className="user-dropdown-item text-danger"
                >
                  <LogOut size={16} color="#EF4444" />
                  <span>Log Out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Journey Modal */}
      <JourneyModal
        isOpen={isJourneyModalOpen}
        onClose={() => setIsJourneyModalOpen(false)}
      />

      {/* Location Permissions & Settings Modal */}
      <LocationSettingsModal
        isOpen={isLocationSettingsOpen}
        onClose={() => setIsLocationSettingsOpen(false)}
      />
    </>
  );
}
