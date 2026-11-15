import React from 'react';
import { Map, Users, Bell, History, MapPin } from 'lucide-react';

export default function MobileBottomNav({
  activeTab,
  sidebarOpen,
  onSelectTab,
  onToggleMap,
  unreadAlertsCount = 0,
  onToggleGeofences,
  isGeofenceDrawerOpen
}) {
  const isMapActive = !sidebarOpen && !isGeofenceDrawerOpen;
  const isFamilyActive = sidebarOpen && activeTab === 'family';
  const isAlertsActive = sidebarOpen && activeTab === 'alerts';
  const isHistoryActive = sidebarOpen && activeTab === 'history';
  const isZonesActive = isGeofenceDrawerOpen;

  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile Navigation Bar">
      {/* 1. Map Tab */}
      <button
        type="button"
        className={`mobile-nav-item ${isMapActive ? 'active' : ''}`}
        onClick={onToggleMap}
        aria-label="View Live Map"
      >
        <Map size={24} strokeWidth={isMapActive ? 2.4 : 2} />
        <span>Map</span>
      </button>

      {/* 2. Family Tab */}
      <button
        type="button"
        className={`mobile-nav-item ${isFamilyActive ? 'active' : ''}`}
        onClick={() => onSelectTab('family')}
        aria-label="View Family Members"
      >
        <Users size={24} strokeWidth={isFamilyActive ? 2.4 : 2} />
        <span>Family</span>
      </button>

      {/* 3. Alerts Tab (with badge) */}
      <button
        type="button"
        className={`mobile-nav-item ${isAlertsActive ? 'active' : ''}`}
        onClick={() => onSelectTab('alerts')}
        aria-label="View Safety Alerts"
        style={{ position: 'relative' }}
      >
        <Bell size={24} strokeWidth={isAlertsActive ? 2.4 : 2} />
        <span>Alerts</span>
        {unreadAlertsCount > 0 && (
          <span className="mobile-nav-badge">
            {unreadAlertsCount > 9 ? '9+' : unreadAlertsCount}
          </span>
        )}
      </button>

      {/* 4. History Tab */}
      <button
        type="button"
        className={`mobile-nav-item ${isHistoryActive ? 'active' : ''}`}
        onClick={() => onSelectTab('history')}
        aria-label="View Location History"
      >
        <History size={24} strokeWidth={isHistoryActive ? 2.4 : 2} />
        <span>History</span>
      </button>

      {/* 5. Safe Zones Tab */}
      <button
        type="button"
        className={`mobile-nav-item ${isZonesActive ? 'active' : ''}`}
        onClick={onToggleGeofences}
        aria-label="Manage Safe Zones"
      >
        <MapPin size={24} strokeWidth={isZonesActive ? 2.4 : 2} />
        <span>Zones</span>
      </button>
    </nav>
  );
}
