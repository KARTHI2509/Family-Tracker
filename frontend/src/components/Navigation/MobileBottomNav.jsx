import React from 'react';
import { Map, Users, Bell, History, Shield, MapPin } from 'lucide-react';

export default function MobileBottomNav({
  activeTab,
  sidebarOpen,
  onSelectTab,
  onToggleMap,
  unreadAlertsCount = 0,
  onOpenSafetyModal,
  onToggleGeofences,
  isGeofenceDrawerOpen
}) {
  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile Navigation Bar">
      {/* 1. Map Button */}
      <button
        type="button"
        className={`mobile-nav-item ${!sidebarOpen && !isGeofenceDrawerOpen ? 'active' : ''}`}
        onClick={onToggleMap}
        aria-label="View Live Map"
      >
        <Map size={20} />
        <span>Map</span>
      </button>

      {/* 2. Family Button */}
      <button
        type="button"
        className={`mobile-nav-item ${sidebarOpen && activeTab === 'family' ? 'active' : ''}`}
        onClick={() => onSelectTab('family')}
        aria-label="View Family Members"
      >
        <Users size={20} />
        <span>Family</span>
      </button>

      {/* 3. Alerts Button (with badge) */}
      <button
        type="button"
        className={`mobile-nav-item ${sidebarOpen && activeTab === 'alerts' ? 'active' : ''}`}
        onClick={() => onSelectTab('alerts')}
        aria-label="View Safety Alerts"
        style={{ position: 'relative' }}
      >
        <Bell size={20} />
        <span>Alerts</span>
        {unreadAlertsCount > 0 && (
          <span className="mobile-nav-badge">
            {unreadAlertsCount > 9 ? '9+' : unreadAlertsCount}
          </span>
        )}
      </button>

      {/* 4. History Button */}
      <button
        type="button"
        className={`mobile-nav-item ${sidebarOpen && activeTab === 'history' ? 'active' : ''}`}
        onClick={() => onSelectTab('history')}
        aria-label="View Location History"
      >
        <History size={20} />
        <span>History</span>
      </button>

      {/* 5. Safe Zones / Safety Trip Button */}
      <button
        type="button"
        className={`mobile-nav-item ${isGeofenceDrawerOpen ? 'active' : ''}`}
        onClick={onToggleGeofences}
        aria-label="Manage Safe Zones"
      >
        <MapPin size={20} />
        <span>Zones</span>
      </button>
    </nav>
  );
}

