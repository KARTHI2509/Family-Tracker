import React, { useState, useEffect, useCallback } from 'react';
import { useFamily } from '../../context/FamilyContext';
import { nativeLocationService, TRACKING_MODES } from '../../services/nativeLocationService';
import { appUpdateService } from '../../services/appUpdateService';
import { APP_VERSION, APP_VERSION_CODE } from '../../version';
import { App } from '@capacitor/app';
import {
  Shield, MapPin, Battery, Smartphone, CheckCircle, AlertTriangle,
  XCircle, Info, ExternalLink, X, RefreshCw, Globe, Navigation, Radio,
  Sparkles, CheckCircle2, Zap
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default function LocationSettingsModal({ isOpen, onClose }) {
  const { isTrackingEnabled, toggleTracking, trackingMode, setTrackingMode } = useFamily();
  const [permInfo, setPermInfo] = useState({
    platform: 'web',
    envType: 'web',
    foreground: false,
    background: false,
    backgroundSupported: false,
    locationServicesEnabled: true,
    serviceRunning: false,
    isTrackingActive: false,
    lastLocation: null,
  });
  const [requesting, setRequesting] = useState(false);
  const [showRationale, setShowRationale] = useState(false);
  const [showBatteryNotice, setShowBatteryNotice] = useState(false);

  // Application Updates State
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateStatus, setUpdateStatus] = useState(null);
  const [lastCheckedTime, setLastCheckedTime] = useState(() => localStorage.getItem('ft_last_update_check'));

  const handleCheckForUpdates = async () => {
    setCheckingUpdate(true);
    setUpdateStatus(null);
    try {
      const res = await appUpdateService.checkForUpdate({ manual: true });
      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setLastCheckedTime(nowStr);
      localStorage.setItem('ft_last_update_check', nowStr);
      if (res && res.updateAvailable) {
        setUpdateStatus({
          upToDate: false,
          message: `New version v${res.latestRelease?.latestVersion} is available!`
        });
      } else {
        setUpdateStatus({
          upToDate: true,
          message: `You're using the latest version of FamilyTracker (v${APP_VERSION}).`
        });
      }
    } catch (err) {
      setUpdateStatus({
        upToDate: false,
        isError: true,
        message: 'Could not reach update server. Please check your network connection.'
      });
    } finally {
      setCheckingUpdate(false);
    }
  };

  const refreshPermissions = useCallback(async () => {
    try {
      const info = await nativeLocationService.checkPermissions();
      setPermInfo(info);
    } catch (err) {
      console.warn('Failed to refresh permissions:', err);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      refreshPermissions();

      // Listen for window focus to automatically refresh when user returns from Android Settings
      const handleFocus = () => {
        refreshPermissions();
      };
      window.addEventListener('focus', handleFocus);

      // Capacitor App state change listener (when returning from Settings back to app)
      let appListener = null;
      try {
        appListener = App.addListener('appStateChange', (state) => {
          if (state.isActive) {
            refreshPermissions();
          }
        });
      } catch (_) {}

      return () => {
        window.removeEventListener('focus', handleFocus);
        if (appListener && typeof appListener.remove === 'function') {
          appListener.remove();
        }
      };
    }
  }, [isOpen, refreshPermissions]);

  if (!isOpen) return null;

  const isAndroid = permInfo.envType === 'android';
  const isIOS = permInfo.envType === 'ios';
  const isPWA = permInfo.envType === 'pwa';
  const isWeb = permInfo.envType === 'web' || isPWA;

  const handleRequestForeground = async () => {
    setRequesting(true);
    try {
      await nativeLocationService.requestForegroundPermissions();
      await refreshPermissions();
    } finally {
      setRequesting(false);
    }
  };

  const handleEnableBackgroundLocation = async () => {
    if (isAndroid) {
      // Show educational rationale first if not already visible
      if (!showRationale) {
        setShowRationale(true);
        return;
      }
      setRequesting(true);
      try {
        await nativeLocationService.requestBackgroundPermissions();
        await refreshPermissions();
      } finally {
        setRequesting(false);
      }
    }
  };

  const handleOpenSettings = async () => {
    await nativeLocationService.openAppSettings();
  };

  const handleOpenLocationSource = async () => {
    await nativeLocationService.openLocationSettings();
  };

  const handleOpenAutostart = async () => {
    await nativeLocationService.openAutostartSettings();
  };

  const handleRequestIgnoreBattery = async () => {
    await nativeLocationService.requestIgnoreBatteryOptimizations();
    await refreshPermissions();
  };

  const handleSelectMode = (modeId) => {
    if (modeId === 'high_accuracy') {
      setShowBatteryNotice(true);
    }
    setTrackingMode(modeId);
  };

  const getPlatformLabel = () => {
    if (isAndroid) return 'Native Android App';
    if (isIOS) return 'Native iOS App';
    if (isPWA) return 'Installed Web PWA';
    return 'Web Browser';
  };

  const lastFix = permInfo.lastLocation;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1200 }}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '560px' }}
      >
        {/* Header */}
        <div className="modal-header" style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: 'rgba(99, 102, 241, 0.15)', padding: '8px', borderRadius: '10px' }}>
              <Shield size={22} className="text-primary" />
            </div>
            <div>
              <h2 style={{ fontSize: '18px', margin: 0 }}>Location & OS Permissions</h2>
              <div style={{ fontSize: '12px', color: 'var(--text-400)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>Platform:</span>
                <span
                  style={{
                    fontWeight: 700,
                    color: isAndroid ? '#34D399' : isIOS ? '#60A5FA' : '#FBBF24',
                    background: 'var(--bg-900)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    border: '1px solid var(--glass-border)'
                  }}
                >
                  {getPlatformLabel()}
                </span>
              </div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        {/* 5-Status Granular Grid */}
        <div style={{ background: 'var(--bg-900)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-200)' }}>System Permission & Service Status</span>
            <button
              className="btn btn-ghost"
              onClick={refreshPermissions}
              style={{ padding: '4px 8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
              title="Refresh permissions from OS"
            >
              <RefreshCw size={13} />
              <span>Refresh</span>
            </button>
          </div>

          <div className="location-status-grid">
            {/* 1. Foreground Permission */}
            <div style={{ background: 'var(--bg-800)', padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-400)', textTransform: 'uppercase' }}>1. While Using App</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', fontSize: '13px', fontWeight: 700 }}>
                {permInfo.foreground ? (
                  <>
                    <CheckCircle size={16} color="var(--success-500)" />
                    <span style={{ color: 'var(--success-500)' }}>Granted</span>
                  </>
                ) : (
                  <>
                    <XCircle size={16} color="var(--danger-500)" />
                    <span style={{ color: 'var(--danger-500)' }}>Denied / Prompt</span>
                  </>
                )}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-400)', marginTop: '2px' }}>
                {isAndroid ? 'ACCESS_FINE_LOCATION' : 'Browser Geolocation'}
              </div>
            </div>

            {/* 2. Background Permission */}
            <div style={{ background: 'var(--bg-800)', padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-400)', textTransform: 'uppercase' }}>2. Background & Locked</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', fontSize: '13px', fontWeight: 700 }}>
                {isWeb ? (
                  <>
                    <AlertTriangle size={16} color="var(--warning-500)" />
                    <span style={{ color: 'var(--warning-500)' }}>Not Supported</span>
                  </>
                ) : permInfo.background ? (
                  <>
                    <CheckCircle size={16} color="var(--success-500)" />
                    <span style={{ color: 'var(--success-500)' }}>Always Allowed</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle size={16} color="var(--warning-500)" />
                    <span style={{ color: 'var(--warning-500)' }}>Standard Only</span>
                  </>
                )}
              </div>
              <div style={{ fontSize: '10px', color: isWeb ? 'var(--warning-400)' : 'var(--text-400)', marginTop: '2px' }}>
                {isWeb ? 'Browser sandbox limit' : 'ACCESS_BACKGROUND_LOCATION'}
              </div>
            </div>

            {/* 3. Location Services (GPS Hardware) */}
            <div style={{ background: 'var(--bg-800)', padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-400)', textTransform: 'uppercase' }}>3. Location Services (GPS)</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', fontSize: '13px', fontWeight: 700 }}>
                {permInfo.locationServicesEnabled ? (
                  <>
                    <CheckCircle size={16} color="var(--success-500)" />
                    <span style={{ color: 'var(--success-500)' }}>Enabled</span>
                  </>
                ) : (
                  <>
                    <XCircle size={16} color="var(--danger-500)" />
                    <span style={{ color: 'var(--danger-500)' }}>Disabled</span>
                  </>
                )}
              </div>
              {!permInfo.locationServicesEnabled && isAndroid && (
                <button
                  onClick={handleOpenLocationSource}
                  style={{ fontSize: '10px', color: '#60a5fa', background: 'none', border: 'none', padding: 0, cursor: 'pointer', marginTop: '2px', textDecoration: 'underline' }}
                >
                  Turn On Location Services
                </button>
              )}
            </div>

            {/* 4. Native Foreground Tracking Service */}
            <div style={{ background: 'var(--bg-800)', padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-400)', textTransform: 'uppercase' }}>4. Native Tracking Service</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', fontSize: '13px', fontWeight: 700 }}>
                {permInfo.serviceRunning ? (
                  <>
                    <Radio size={16} color="var(--success-500)" />
                    <span style={{ color: 'var(--success-500)' }}>Active (Foreground Service)</span>
                  </>
                ) : (
                  <>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--text-400)' }}></span>
                    <span style={{ color: 'var(--text-400)' }}>Inactive</span>
                  </>
                )}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-400)', marginTop: '2px' }}>
                {isAndroid ? 'Status bar ongoing notification' : 'Browser loop'}
              </div>
            </div>
          </div>

          {!permInfo.foreground && (
            <button
              className="btn btn-primary w-full mt-3"
              onClick={handleRequestForeground}
              disabled={requesting}
              style={{ fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              <MapPin size={16} />
              <span>{requesting ? 'Requesting Permission...' : 'Grant While Using App Permission'}</span>
            </button>
          )}
        </div>

        {/* WEB & PWA LIMITATION NOTICE (Requirement 2 & 8: Never claim background permission on Web) */}
        {isWeb && (
          <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <div style={{ background: 'rgba(245, 158, 11, 0.2)', padding: '6px', borderRadius: '8px', marginTop: '2px' }}>
                <Globe size={18} color="#FBBF24" />
              </div>
              <div>
                <h4 style={{ margin: '0 0 6px', fontSize: '14px', color: '#FCD34D' }}>
                  Background Tracking Not Supported on Web/PWA
                </h4>
                <p style={{ margin: '0 0 10px', fontSize: '12px', color: 'var(--text-300)', lineHeight: '1.5' }}>
                  Web browsers (including installed PWAs) run inside an operating system security sandbox. Web browsers <strong>cannot</strong> run continuous background services when minimized, closed, or when the phone screen is locked.
                </p>
                <div style={{ background: 'var(--bg-900)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '12px', marginBottom: '10px' }}>
                  <div style={{ color: '#fff', fontSize: '13px', fontWeight: 600, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Smartphone size={16} color="#34d399" />
                    <span>Install the Native Android Application</span>
                  </div>
                  <div style={{ color: 'var(--text-400)', fontSize: '12px', lineHeight: '1.4', marginBottom: '10px' }}>
                    Guarantees 24/7 continuous background tracking with phone locked in your pocket. Includes Android Foreground Service with live status bar notification.
                  </div>
                  <a
                    href="/FamilyTracker.apk"
                    download="FamilyTracker.apk"
                    className="btn btn-primary"
                    style={{ fontSize: '13px', padding: '10px 16px', display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'center', gap: '6px', textDecoration: 'none', boxSizing: 'border-box' }}
                  >
                    <span>📲 Download Android APK (24.4 MB)</span>
                  </a>
                  <div style={{ marginTop: '8px', textAlign: 'center', fontSize: '11px', color: 'var(--text-400)' }}>
                    Backup server download: <a href="https://family-tracker-fidw.onrender.com/FamilyTracker.apk" target="_blank" rel="noopener noreferrer" style={{ color: '#60A5FA', textDecoration: 'underline' }}>Mirror Link</a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* NATIVE ANDROID BACKGROUND LOCATION CONFIGURATION (Requirement 3 & 4) */}
        {isAndroid && (
          <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#60A5FA', fontSize: '14px', fontWeight: 700, marginBottom: '8px' }}>
              <Smartphone size={18} />
              <span>Android Background Location Support</span>
            </div>

            {permInfo.background ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--success-400)', fontSize: '13px', fontWeight: 600 }}>
                <CheckCircle size={16} />
                <span>"Allow all the time" is granted! Background location sharing is fully supported.</span>
              </div>
            ) : (
              <div>
                {/* Educational Rationale Box (Required before requesting background location) */}
                <div style={{ background: 'var(--bg-900)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>
                    Why Background Location is Needed
                  </div>
                  <p style={{ fontSize: '11px', color: 'var(--text-300)', lineHeight: '1.5', margin: 0 }}>
                    FamilyTracker requires <strong>"Allow all the time"</strong> permission so your emergency contacts and family members can view your live location when your phone is in your pocket, screen is locked, or during an active SOS emergency.
                  </p>
                </div>

                {/* Android 11+ Guidance (Requirement 4) */}
                <div style={{ background: 'rgba(0, 0, 0, 0.2)', padding: '10px 12px', borderRadius: '8px', fontSize: '11px', color: '#93C5FD', marginBottom: '12px', lineHeight: '1.5' }}>
                  <strong>Android 11+ Requirement:</strong> Modern Android requires selecting "Allow all the time" manually in system settings.
                  <div style={{ marginTop: '4px', fontWeight: 600 }}>
                    Settings ➔ Apps ➔ FamilyTracker ➔ Permissions ➔ Location ➔ Select "Allow all the time"
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    className="btn btn-primary"
                    onClick={handleEnableBackgroundLocation}
                    disabled={requesting}
                    style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Shield size={15} />
                    <span>Enable Background Location</span>
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={handleOpenSettings}
                    style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid var(--glass-border)' }}
                  >
                    <ExternalLink size={15} />
                    <span>Open App Settings</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* NATIVE ANDROID AUTOSTART & 24/7 BACKGROUND RELIABILITY */}
        {isAndroid && (
          <div style={{ background: 'rgba(168, 85, 247, 0.08)', border: '1px solid rgba(168, 85, 247, 0.3)', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#C084FC', fontSize: '14px', fontWeight: 700 }}>
                <Zap size={18} />
                <span>24/7 Tracking & Autostart Settings</span>
              </div>
              <span style={{ fontSize: '10px', fontWeight: 600, color: '#C084FC', background: 'rgba(168, 85, 247, 0.2)', padding: '2px 8px', borderRadius: '6px', textTransform: 'uppercase' }}>
                {permInfo.manufacturer ? `${permInfo.manufacturer.toUpperCase()}` : 'OEM OPTIMIZATION'}
              </span>
            </div>

            <p style={{ fontSize: '12px', color: 'var(--text-300)', lineHeight: '1.5', margin: '0 0 12px' }}>
              To ensure your location updates continuously <strong>even when the app is swiped away from Recent Apps</strong> or when your phone is locked, configure Autostart and Battery permissions:
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px', marginBottom: '12px' }}>
              {/* Autostart Card */}
              <div style={{ background: 'var(--bg-900)', border: '1px solid var(--glass-border)', borderRadius: '10px', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Zap size={15} color="#FBBF24" />
                    <span>Autostart Permission</span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-400)', marginTop: '2px' }}>
                    Keeps GPS running when swiped from recent apps
                  </div>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={handleOpenAutostart}
                  style={{ fontSize: '12px', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px', background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)' }}
                >
                  <ExternalLink size={14} />
                  <span>Open Autostart Settings</span>
                </button>
              </div>

              {/* Battery Optimization Card */}
              <div style={{ background: 'var(--bg-900)', border: '1px solid var(--glass-border)', borderRadius: '10px', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Battery size={15} color={permInfo.ignoringBatteryOptimizations ? '#34D399' : '#F87171'} />
                    <span>Battery Saver: No Restrictions</span>
                  </div>
                  <div style={{ fontSize: '11px', color: permInfo.ignoringBatteryOptimizations ? 'var(--success-400)' : 'var(--text-400)', marginTop: '2px' }}>
                    {permInfo.ignoringBatteryOptimizations ? '✓ Whitelisted (No restrictions)' : 'Action recommended: Set to "No restrictions"'}
                  </div>
                </div>
                <button
                  className="btn btn-ghost"
                  onClick={handleRequestIgnoreBattery}
                  style={{ fontSize: '12px', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid var(--glass-border)', color: '#60A5FA' }}
                >
                  <ExternalLink size={14} />
                  <span>{permInfo.ignoringBatteryOptimizations ? 'Re-check Battery Settings' : 'Set to No Restrictions'}</span>
                </button>
              </div>
            </div>

            <div style={{ background: 'rgba(0, 0, 0, 0.25)', borderRadius: '8px', padding: '8px 12px', fontSize: '11px', color: '#E9D5FF', lineHeight: '1.4' }}>
              💡 <strong>Tip for Xiaomi / Redmi / POCO users:</strong> In the Recent Apps screen, tap & hold FamilyTracker and tap the <strong>🔒 Lock icon</strong> so it is never cleared by memory cleaners.
            </div>
          </div>
        )}

        {/* DISTINCTION: PERMISSION GRANTED vs ACTUAL TRACKING ACTIVE (Requirement 6 & 9) */}
        <div style={{ background: 'var(--bg-900)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-200)' }}>Live Location Broadcasting</div>
              <div style={{ fontSize: '11px', color: 'var(--text-400)' }}>
                {isTrackingEnabled ? 'Transmitting coordinates to your family circle' : 'Location sharing is currently stopped'}
              </div>
            </div>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: isTrackingEnabled ? 'var(--success-400)' : 'var(--text-400)',
                background: isTrackingEnabled ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-800)',
                padding: '4px 10px',
                borderRadius: '9999px',
                border: '1px solid ' + (isTrackingEnabled ? 'rgba(16, 185, 129, 0.3)' : 'var(--glass-border)')
              }}
            >
              {isTrackingEnabled ? '● BROADCASTING ACTIVE' : '○ STOPPED'}
            </span>
          </div>

          {/* 5. Last Successful Location Update (Requirement 5) */}
          <div className="location-telemetry-grid">
            <div style={{ background: 'var(--bg-800)', padding: '10px 8px', borderRadius: '8px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-400)' }}>5. Last Update</div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#fff', marginTop: '2px' }}>
                {lastFix ? formatDistanceToNow(new Date(lastFix.timestamp), { addSuffix: true }) : 'Pending'}
              </div>
            </div>

            <div style={{ background: 'var(--bg-800)', padding: '10px 8px', borderRadius: '8px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-400)' }}>GPS Accuracy</div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#fff', marginTop: '2px' }}>
                {lastFix?.accuracy != null ? `±${lastFix.accuracy}m` : '±10m'}
              </div>
            </div>

            <div style={{ background: 'var(--bg-800)', padding: '10px 8px', borderRadius: '8px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-400)' }}>Battery Level</div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--success-400)', marginTop: '2px' }}>
                {lastFix?.battery_level != null ? `${lastFix.battery_level}%` : 'Normal'}
              </div>
            </div>
          </div>
        </div>

        {/* Tracking Frequency & Battery Modes */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-200)', marginBottom: '8px' }}>
            Refresh & Battery Frequency Modes
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {Object.values(TRACKING_MODES).map((mode) => {
              const isSelected = trackingMode === mode.id;
              return (
                <div
                  key={mode.id}
                  onClick={() => handleSelectMode(mode.id)}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: '1px solid ' + (isSelected ? 'var(--primary-500)' : 'var(--glass-border)'),
                    background: isSelected ? 'rgba(79, 70, 229, 0.12)' : 'var(--bg-900)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'all 0.15s'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '13px', color: isSelected ? '#fff' : 'var(--text-200)' }}>
                      {mode.name}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-400)', marginTop: '2px' }}>
                      {mode.description}
                    </div>
                  </div>
                  <input
                    type="radio"
                    name="trackingMode"
                    checked={isSelected}
                    onChange={() => handleSelectMode(mode.id)}
                    style={{ accentColor: 'var(--primary-500)', cursor: 'pointer' }}
                  />
                </div>
              );
            })}
          </div>

          {showBatteryNotice && trackingMode === 'high_accuracy' && (
            <div style={{ marginTop: '8px', padding: '10px 12px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', color: '#FCD34D', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertTriangle size={15} />
              <span>High Accuracy mode updates GPS every 60s and will consume more battery. Recommended during active commutes or journeys.</span>
            </div>
          )}
        </div>

        {/* Application Updates Section (Requirement 2: Manual Update Check) */}
        <div style={{ background: 'var(--bg-900)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: updateStatus ? '10px' : '0', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ background: 'rgba(99, 102, 241, 0.15)', padding: '6px', borderRadius: '8px' }}>
                <Sparkles size={16} color="#818CF8" />
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>
                  Application Updates
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-400)' }}>
                  Installed: v{APP_VERSION} (Build {APP_VERSION_CODE}) {lastCheckedTime ? `• Checked ${lastCheckedTime}` : ''}
                </div>
              </div>
            </div>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleCheckForUpdates}
              disabled={checkingUpdate}
              style={{ fontSize: '12px', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={13} className={checkingUpdate ? 'spin' : ''} />
              <span>{checkingUpdate ? 'Checking...' : 'Check for Updates'}</span>
            </button>
          </div>

          {updateStatus && (
            <div
              style={{
                background: updateStatus.upToDate ? 'rgba(16, 185, 129, 0.12)' : updateStatus.isError ? 'rgba(239, 68, 68, 0.12)' : 'rgba(59, 130, 246, 0.12)',
                border: `1px solid ${updateStatus.upToDate ? 'rgba(16, 185, 129, 0.3)' : updateStatus.isError ? 'rgba(239, 68, 68, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`,
                borderRadius: '8px',
                padding: '10px 12px',
                fontSize: '12px',
                color: updateStatus.upToDate ? '#A7F3D0' : updateStatus.isError ? '#FCA5A5' : '#93C5FD',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {updateStatus.upToDate ? <CheckCircle size={15} color="#10B981" /> : updateStatus.isError ? <AlertTriangle size={15} color="#EF4444" /> : <Sparkles size={15} color="#60A5FA" />}
              <span>{updateStatus.message}</span>
            </div>
          )}
        </div>

        {/* Master Location Sharing Consent Button (Requirement 9) */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
          <button
            className={`btn ${isTrackingEnabled ? 'btn-danger' : 'btn-primary'} w-full`}
            onClick={() => toggleTracking(!isTrackingEnabled)}
            style={{ height: '46px', fontSize: '14px', fontWeight: 700 }}
          >
            {isTrackingEnabled ? 'Stop Location Sharing' : 'Start Location Sharing'}
          </button>
        </div>
      </div>
    </div>
  );
}
