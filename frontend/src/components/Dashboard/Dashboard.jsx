import React, { useState, useEffect } from 'react';
import Header from '../Common/Header';
import Toast from '../Common/Toast';
import LiveMap from '../Map/LiveMap';
import RouteReplayControls from '../Map/RouteReplay';
import GeofenceDrawer from '../Map/GeofenceDrawer';
import FamilyPanel from './FamilyPanel';
import AlertsPanel from './AlertsPanel';
import LocationHistory from './LocationHistory';
import PanicButton from '../SOS/PanicButton';
import MobileBottomNav from '../Navigation/MobileBottomNav';
import FamilyManagementModal from '../Family/FamilyManagementModal';
import SwitchFamilyModal from '../Family/SwitchFamilyModal';
import LeaveFamilyModal from '../Family/LeaveFamilyModal';
import LocationConsentModal from '../Family/LocationConsentModal';
import AppUpdateModal from '../Common/AppUpdateModal';
import { appUpdateService } from '../../services/appUpdateService';
import { useFamily } from '../../context/FamilyContext';
import { useAuth } from '../../context/AuthContext';
import { Users, Bell, History, MapPin, ShieldAlert, Radio, X } from 'lucide-react';

export default function Dashboard() {
  const { user } = useAuth();
  const {
    members, alerts, geofences, onlineUsers, activeSOSEvents, activeJourneys,
    familyDetails, pendingConsentFamily, setPendingConsentFamily
  } = useFamily();
  const [activeTab, setActiveTab] = useState('family');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [focusedCoord, setFocusedCoord] = useState(null);

  // Family Management Modals
  const [isFamilyManagementOpen, setIsFamilyManagementOpen] = useState(false);
  const [isSwitchFamilyOpen, setIsSwitchFamilyOpen] = useState(false);
  const [isLeaveFamilyOpen, setIsLeaveFamilyOpen] = useState(false);

  // App Update Modal
  const [updateInfo, setUpdateInfo] = useState(null);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);

  useEffect(() => {
    // Automatically check for app updates shortly after startup
    const timer = setTimeout(async () => {
      try {
        const info = await appUpdateService.checkForUpdate();
        if (info && info.updateAvailable) {
          setUpdateInfo(info);
          setIsUpdateModalOpen(true);
        }
      } catch (err) {
        console.warn('Initial update check error:', err);
      }
    }, 2500);

    return () => clearTimeout(timer);
  }, []);

  const handleManualCheckUpdate = async () => {
    try {
      const info = await appUpdateService.checkForUpdate(true);
      if (info) {
        setUpdateInfo(info);
        setIsUpdateModalOpen(true);
      }
    } catch (err) {
      console.warn('Manual update check error:', err);
    }
  };

  // Safe zone / geofence picking state
  const [isGeofenceDrawerOpen, setIsGeofenceDrawerOpen] = useState(false);
  const [isPickingLocation, setIsPickingLocation] = useState(false);
  const [pickedLocation, setPickedLocation] = useState(null);

  // Route replay state
  const [replayHistory, setReplayHistory] = useState(null);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replayMemberName, setReplayMemberName] = useState('');

  const unreadAlertsCount = alerts.filter(a => !a.is_read && !a.isRead).length;
  const totalMembers = members.length;
  const onlineCount = members.filter(m => onlineUsers.has(m.id)).length;
  const offlineCount = Math.max(0, totalMembers - onlineCount);
  const activeSOSCount = activeSOSEvents.size;

  const handleSelectMember = (member) => {
    setSelectedMember(member);
    const lat = member.latitude != null ? member.latitude : member.latest_location?.latitude;
    const lng = member.longitude != null ? member.longitude : member.latest_location?.longitude;
    if (lat != null && lng != null && !isNaN(lat) && !isNaN(lng)) {
      setFocusedCoord([lat, lng]);
    }
    // Auto-close sidebar on mobile so member is visible on map
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  };

  const handleMapClick = (latlng) => {
    if (isPickingLocation) {
      setPickedLocation(latlng);
    }
  };

  const handleStartRouteReplay = (points, name) => {
    if (!points || points.length === 0) return;
    setReplayHistory(points);
    setReplayIndex(0);
    setReplayMemberName(name);
    if (points[0].latitude != null && points[0].longitude != null) {
      setFocusedCoord([points[0].latitude, points[0].longitude]);
    }
  };

  const handleCloseRouteReplay = () => {
    setReplayHistory(null);
    setReplayIndex(0);
  };

  return (
    <div className="app-layout">
      <Header
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        familyName={user?.family_name || 'My Family Circle'}
        onOpenFamilyManagement={() => setIsFamilyManagementOpen(true)}
        onCheckUpdate={handleManualCheckUpdate}
      />

      {/* Emergency Alert Banner if any SOS is active */}
      {activeSOSCount > 0 && (
        <div
          style={{
            background: 'var(--danger-600)',
            color: '#FFFFFF',
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            gap: '8px',
            fontSize: '12px',
            fontWeight: 700,
            letterSpacing: '0.3px',
            animation: 'alertPulse 1.5s infinite',
            zIndex: 950,
            lineHeight: 1.4
          }}
        >
          <ShieldAlert size={18} style={{ flexShrink: 0 }} />
          <span>EMERGENCY SOS IS ACTIVE FOR {activeSOSCount} MEMBER(S)!</span>
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
        {/* Mobile Backdrop */}
        <div
          className={`sidebar-backdrop ${sidebarOpen ? 'visible' : ''}`}
          onClick={() => setSidebarOpen(false)}
        />

        {/* Sidebar */}
        <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
          {/* Mobile Close Bar */}
          <div className="sidebar-mobile-close-bar">
            <span style={{ fontWeight: 700, fontSize: '14px', color: '#FFFFFF' }}>FamilyTracker Menu</span>
            <button
              className="btn btn-ghost"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close menu"
              style={{ padding: '6px', color: 'var(--text-300)' }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Quick Metrics Header */}
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--glass-border)',
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '8px',
              textAlign: 'center',
              background: 'rgba(15, 23, 42, 0.4)'
            }}
          >
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-400)', textTransform: 'uppercase' }}>Members</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-100)' }}>{totalMembers}</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--success-400)', textTransform: 'uppercase' }}>Online</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--success-500)' }}>{onlineCount}</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-400)', textTransform: 'uppercase' }}>Zones</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--primary-400)' }}>{geofences.length}</div>
            </div>
          </div>

          <div className="sidebar-tabs">
            <button
              className={`sidebar-tab ${activeTab === 'family' ? 'active' : ''}`}
              onClick={() => setActiveTab('family')}
            >
              <Users size={16} />
              <span>Family</span>
            </button>

            <button
              className={`sidebar-tab ${activeTab === 'alerts' ? 'active' : ''}`}
              onClick={() => setActiveTab('alerts')}
            >
              <Bell size={16} />
              <span>Alerts</span>
              {unreadAlertsCount > 0 && (
                <span className="unread-badge" style={{ marginLeft: '4px' }}>
                  {unreadAlertsCount}
                </span>
              )}
            </button>

            <button
              className={`sidebar-tab ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => setActiveTab('history')}
            >
              <History size={16} />
              <span>History</span>
            </button>
          </div>

          <div className="sidebar-content">
            {activeTab === 'family' && (
              <FamilyPanel
                onSelectMember={handleSelectMember}
                selectedMemberId={selectedMember?.id}
                onOpenManagement={() => setIsFamilyManagementOpen(true)}
                onOpenSwitch={() => setIsSwitchFamilyOpen(true)}
                onOpenLeave={() => setIsLeaveFamilyOpen(true)}
              />
            )}
            {activeTab === 'alerts' && <AlertsPanel />}
            {activeTab === 'history' && (
              <LocationHistory
                onFocusPoint={(coord) => setFocusedCoord(coord)}
                onStartRouteReplay={handleStartRouteReplay}
              />
            )}
          </div>
        </aside>

        {/* Main Map View */}
        <main className="main-content">
          <div className="map-overlay-controls" style={{ position: 'absolute', top: '12px', left: '52px', zIndex: 800 }}>
            <button
              className={`map-control-btn ${isGeofenceDrawerOpen ? 'active' : ''}`}
              onClick={() => setIsGeofenceDrawerOpen(!isGeofenceDrawerOpen)}
              title="Manage Safe Zones & Geofences"
              style={{ width: '38px', height: '38px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <MapPin size={18} />
            </button>
          </div>

          {/* Map rendered with replayHistory and replayIndex passed to show route layers */}
          <LiveMap
            selectedMemberId={selectedMember?.id}
            onSelectMember={handleSelectMember}
            focusedCoord={focusedCoord}
            onMapClick={handleMapClick}
            isPickingLocation={isPickingLocation}
            replayHistory={replayHistory}
            replayIndex={replayIndex}
            activeJourneys={activeJourneys}
          />

          {/* Floating Route Replay Controller */}
          {replayHistory && (
            <RouteReplayControls
              historyPoints={replayHistory}
              currentIndex={replayIndex}
              onIndexChange={setReplayIndex}
              onClose={handleCloseRouteReplay}
              memberName={replayMemberName}
            />
          )}

          {/* Safe Zone Drawer */}
          <GeofenceDrawer
            isOpen={isGeofenceDrawerOpen}
            onClose={() => {
              setIsGeofenceDrawerOpen(false);
              setIsPickingLocation(false);
            }}
            pickedLocation={pickedLocation}
            isPickingLocation={isPickingLocation}
            setIsPickingLocation={setIsPickingLocation}
          />

          {/* Emergency SOS Panic Button */}
          <PanicButton />
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <MobileBottomNav
        activeTab={activeTab}
        sidebarOpen={sidebarOpen}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          setSidebarOpen(true);
          setIsGeofenceDrawerOpen(false);
        }}
        onToggleMap={() => {
          setSidebarOpen(false);
          setIsGeofenceDrawerOpen(false);
        }}
        unreadAlertsCount={unreadAlertsCount}
        onToggleGeofences={() => {
          setIsGeofenceDrawerOpen((prev) => !prev);
          setSidebarOpen(false);
        }}
        isGeofenceDrawerOpen={isGeofenceDrawerOpen}
      />

      {/* Family Circle Management Modal */}
      <FamilyManagementModal
        isOpen={isFamilyManagementOpen}
        onClose={() => setIsFamilyManagementOpen(false)}
        onOpenSwitch={() => setIsSwitchFamilyOpen(true)}
        onOpenLeave={() => setIsLeaveFamilyOpen(true)}
      />

      {/* Switch Family Modal */}
      <SwitchFamilyModal
        isOpen={isSwitchFamilyOpen}
        onClose={() => setIsSwitchFamilyOpen(false)}
        currentFamily={familyDetails?.family}
        otherMembers={familyDetails?.otherMembers || []}
        isOwner={familyDetails?.userRole === 'owner'}
      />

      {/* Leave Family Modal */}
      <LeaveFamilyModal
        isOpen={isLeaveFamilyOpen}
        onClose={() => setIsLeaveFamilyOpen(false)}
        currentFamily={familyDetails?.family}
        otherMembers={familyDetails?.otherMembers || []}
        isOwner={familyDetails?.userRole === 'owner'}
      />

      {/* Location Audience Consent Modal (Post-Switch) */}
      <LocationConsentModal
        isOpen={!!pendingConsentFamily}
        newFamily={pendingConsentFamily}
        onClose={() => setPendingConsentFamily(null)}
      />

      {/* In-App Update Modal */}
      <AppUpdateModal
        isOpen={isUpdateModalOpen}
        onClose={() => setIsUpdateModalOpen(false)}
        updateData={updateInfo}
      />

      <Toast />
    </div>
  );
}
