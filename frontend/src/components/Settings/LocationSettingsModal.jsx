import React, { useState, useEffect } from 'react';
import { useFamily } from '../../context/FamilyContext';
import { nativeLocationService, TRACKING_MODES } from '../../services/nativeLocationService';
import {
  Shield, MapPin, Battery, BatteryCharging, Zap, Smartphone,
  CheckCircle, AlertTriangle, XCircle, Info, ExternalLink, X, RefreshCw, Globe, ChevronDown, ChevronUp
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default function LocationSettingsModal({ isOpen, onClose }) {
  const { isTrackingEnabled, toggleTracking, trackingMode, setTrackingMode } = useFamily();
  const [permInfo, setPermInfo] = useState({
    status: 'checking',
    foreground: false,
    background: false,
    desired: 'always',
    platform: 'web',
    hasWakeLock: false
  });
  const [desiredPermission, setDesiredPermission] = useState('always');
  const [lastFix, setLastFix] = useState(null);
  const [requesting, setRequesting] = useState(false);
  const [showBatteryNotice, setShowBatteryNotice] = useState(false);
  const [showNativeGuide, setShowNativeGuide] = useState(false);

  const refreshPermissions = async () => {
    const info = await nativeLocationService.checkPermissions();
    setPermInfo(info);
    setDesiredPermission(info.desired || 'always');
    const loc = await nativeLocationService.getLastKnownLocation();
    setLastFix(loc);
  };

  useEffect(() => {
    if (isOpen) {
      refreshPermissions();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectPermission = async (level) => {
    setDesiredPermission(level);
    setRequesting(true);
    try {
      if (level === 'denied') {
        await nativeLocationService.setDesiredPermission('denied');
        if (isTrackingEnabled) {
          toggleTracking(false);
        }
      } else {
        await nativeLocationService.requestPermissions(level);
        if (!isTrackingEnabled) {
          toggleTracking(true);
        }
      }
      await refreshPermissions();
    } finally {
      setRequesting(false);
    }
  };

  const handleSelectMode = (modeId) => {
    if (modeId === 'high_accuracy') {
      setShowBatteryNotice(true);
    }
    setTrackingMode(modeId);
  };

  const isAndroid = permInfo.platform === 'android';
  const isIOS = permInfo.platform === 'ios';
  const isWeb = permInfo.platform === 'web';

  const isBackgroundActive = permInfo.foreground && desiredPermission === 'always';

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1200 }}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '540px', width: '100%', maxHeight: '90dvh', overflowY: 'auto' }}
      >
        {/* Modal Header */}
        <div className="modal-header" style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: 'rgba(99, 102, 241, 0.15)', padding: '8px', borderRadius: '10px' }}>
              <Shield size={22} className="text-primary" />
            </div>
            <div>
              <h2 style={{ fontSize: '18px', margin: 0 }}>Location Permissions</h2>
              <div style={{ fontSize: '12px', color: 'var(--text-400)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>Platform:</span>
                <span style={{ textTransform: 'capitalize', color: 'var(--primary-400)', fontWeight: 600 }}>
                  {permInfo.platform === 'web' ? 'Web Browser' : permInfo.platform}
                </span>
                {isWeb && (
                  <span style={{ fontSize: '11px', background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', padding: '1px 6px', borderRadius: '4px' }}>
                    Screen WakeLock Active
                  </span>
                )}
              </div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        {/* Operating System Permission Card */}
        <div style={{ background: 'var(--bg-900)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-200)' }}>OS Permission Status</span>
            <button
              className="btn btn-ghost"
              onClick={refreshPermissions}
              style={{ padding: '4px 8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
              title="Refresh permissions status"
            >
              <RefreshCw size={13} />
              <span>Refresh</span>
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
            {/* Foreground Status */}
            <div style={{ background: 'var(--bg-800)', padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-400)', textTransform: 'uppercase' }}>While Using App</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', fontSize: '14px', fontWeight: 700 }}>
                {permInfo.foreground ? (
                  <>
                    <CheckCircle size={16} color="var(--success-500)" />
                    <span style={{ color: 'var(--success-500)' }}>Granted</span>
                  </>
                ) : (
                  <>
                    <XCircle size={16} color="var(--danger-500)" />
                    <span style={{ color: 'var(--danger-500)' }}>Prompt / Denied</span>
                  </>
                )}
              </div>
            </div>

            {/* Background Status */}
            <div style={{ background: 'var(--bg-800)', padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-400)', textTransform: 'uppercase' }}>Background & Locked</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', fontSize: '14px', fontWeight: 700 }}>
                {isBackgroundActive ? (
                  <>
                    <CheckCircle size={16} color="var(--success-500)" />
                    <span style={{ color: 'var(--success-500)' }}>Always Allowed</span>
                  </>
                ) : desiredPermission === 'while_using' ? (
                  <>
                    <Info size={16} color="var(--primary-400)" />
                    <span style={{ color: 'var(--primary-400)' }}>Foreground Only</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle size={16} color="var(--warning-500)" />
                    <span style={{ color: 'var(--warning-500)' }}>Standard / App Only</span>
                  </>
                )}
              </div>
              <div style={{ fontSize: '10px', color: isBackgroundActive ? 'var(--success-400)' : 'var(--text-400)', marginTop: '2px' }}>
                {isBackgroundActive
                  ? (isWeb ? 'WakeLock Active (Tab Awake)' : 'Android Background Active')
                  : (desiredPermission === 'while_using' ? 'Paused when minimized' : 'Select Always Allow below')}
              </div>
            </div>
          </div>

          {!permInfo.foreground && (
            <button
              className="btn btn-primary w-full mt-3"
              onClick={() => handleSelectPermission('always')}
              disabled={requesting}
              style={{ fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              <MapPin size={16} />
              <span>{requesting ? 'Requesting OS Permission...' : 'Allow Location in OS'}</span>
            </button>
          )}
        </div>

        {/* Permission Level Selector (3-Tier Options) */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-200)', marginBottom: '8px' }}>
            Location Permission Preference
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* Always Allow in Background */}
            <div
              onClick={() => handleSelectPermission('always')}
              style={{
                padding: '12px 14px',
                borderRadius: '10px',
                border: '1px solid ' + (desiredPermission === 'always' ? 'var(--primary-500)' : 'var(--glass-border)'),
                background: desiredPermission === 'always' ? 'rgba(79, 70, 229, 0.12)' : 'var(--bg-900)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                transition: 'all 0.15s'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontWeight: 700, fontSize: '13px', color: desiredPermission === 'always' ? '#fff' : 'var(--text-200)' }}>
                    Always allow in background
                  </span>
                  <span style={{ fontSize: '10px', fontWeight: 700, background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', padding: '2px 6px', borderRadius: '4px' }}>
                    Recommended
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-400)', marginTop: '2px' }}>
                  {isWeb
                    ? 'Continuous live tracking with Screen WakeLock preventing sleep'
                    : 'Continuous tracking even when phone is locked or app is minimized'}
                </div>
              </div>
              <input
                type="radio"
                name="desiredPermission"
                checked={desiredPermission === 'always'}
                onChange={() => handleSelectPermission('always')}
                style={{ accentColor: 'var(--primary-500)', cursor: 'pointer' }}
              />
            </div>

            {/* While using the app */}
            <div
              onClick={() => handleSelectPermission('while_using')}
              style={{
                padding: '12px 14px',
                borderRadius: '10px',
                border: '1px solid ' + (desiredPermission === 'while_using' ? 'var(--primary-500)' : 'var(--glass-border)'),
                background: desiredPermission === 'while_using' ? 'rgba(79, 70, 229, 0.12)' : 'var(--bg-900)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                transition: 'all 0.15s'
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: '13px', color: desiredPermission === 'while_using' ? '#fff' : 'var(--text-200)' }}>
                  While using the app
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-400)', marginTop: '2px' }}>
                  Only updates your location when FamilyTracker is open on screen
                </div>
              </div>
              <input
                type="radio"
                name="desiredPermission"
                checked={desiredPermission === 'while_using'}
                onChange={() => handleSelectPermission('while_using')}
                style={{ accentColor: 'var(--primary-500)', cursor: 'pointer' }}
              />
            </div>

            {/* Don't allow */}
            <div
              onClick={() => handleSelectPermission('denied')}
              style={{
                padding: '12px 14px',
                borderRadius: '10px',
                border: '1px solid ' + (desiredPermission === 'denied' ? 'var(--danger-500)' : 'var(--glass-border)'),
                background: desiredPermission === 'denied' ? 'rgba(239, 68, 68, 0.1)' : 'var(--bg-900)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                transition: 'all 0.15s'
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: '13px', color: desiredPermission === 'denied' ? 'var(--danger-400)' : 'var(--text-200)' }}>
                  Don't allow
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-400)', marginTop: '2px' }}>
                  Disables GPS location tracking completely
                </div>
              </div>
              <input
                type="radio"
                name="desiredPermission"
                checked={desiredPermission === 'denied'}
                onChange={() => handleSelectPermission('denied')}
                style={{ accentColor: 'var(--danger-500)', cursor: 'pointer' }}
              />
            </div>
          </div>
        </div>

        {/* Informational Web vs Mobile Guide Banner */}
        <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)', borderRadius: '12px', padding: '14px', marginBottom: '16px' }}>
          <div
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
            onClick={() => setShowNativeGuide(!showNativeGuide)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#60A5FA', fontSize: '13px', fontWeight: 700 }}>
              {isWeb ? <Globe size={16} /> : <Smartphone size={16} />}
              <span>{isWeb ? 'How Background Tracking Works on Web vs Android' : 'Mobile Background Location Settings'}</span>
            </div>
            {showNativeGuide ? <ChevronUp size={16} color="#60A5FA" /> : <ChevronDown size={16} color="#60A5FA" />}
          </div>

          <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-300)', lineHeight: '1.6' }}>
            {isWeb ? (
              <>
                <p style={{ margin: '0 0 6px' }}>
                  You are viewing FamilyTracker in a <strong>Web Browser</strong>. Web security sandboxes don't have an OS background daemon when the browser is closed.
                </p>
                <div style={{ background: 'var(--bg-900)', padding: '10px', borderRadius: '8px', marginBottom: '6px' }}>
                  <div style={{ color: 'var(--success-400)', fontWeight: 600, marginBottom: '2px' }}>
                    ⚡ What's active on Web right now:
                  </div>
                  <div>Screen WakeLock prevents your laptop/phone display from sleeping, guaranteeing continuous live GPS broadcasts while this browser tab stays open.</div>
                </div>
                {showNativeGuide && (
                  <div style={{ background: 'var(--bg-900)', padding: '10px', borderRadius: '8px', marginTop: '6px' }}>
                    <div style={{ color: '#93C5FD', fontWeight: 600, marginBottom: '2px' }}>
                      📲 For 24/7 background tracking with screen locked in pocket:
                    </div>
                    <div>
                      Install our native Android APK. On Android, go to <strong>Settings ➔ Apps ➔ FamilyTracker ➔ Permissions ➔ Location ➔ Select "Allow all the time"</strong>. The Android Foreground Service will track 24/7 with a persistent status bar notification.
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p style={{ margin: 0 }}>
                {isAndroid
                  ? 'To ensure continuous location sharing when your screen is locked, go to your phone Settings ➔ Apps ➔ FamilyTracker ➔ Permissions ➔ Location ➔ Select "Allow all the time".'
                  : 'To maintain emergency tracking while minimized, open iPhone Settings ➔ FamilyTracker ➔ Location ➔ Select "Always".'}
              </p>
            )}
          </div>
        </div>

        {/* Live Tracking Status & Telemetry */}
        <div style={{ background: 'var(--bg-900)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-200)' }}>Live Tracking Status</span>
            <span
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: isTrackingEnabled ? 'var(--success-400)' : 'var(--text-400)',
                background: isTrackingEnabled ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-800)',
                padding: '3px 10px',
                borderRadius: '9999px',
                border: '1px solid ' + (isTrackingEnabled ? 'rgba(16, 185, 129, 0.3)' : 'var(--glass-border)')
              }}
            >
              {isTrackingEnabled ? '● BROADCASTING LIVE' : '○ TRACKING OFF'}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', textAlign: 'center', marginTop: '10px' }}>
            <div style={{ background: 'var(--bg-800)', padding: '10px 8px', borderRadius: '8px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-400)' }}>Last Update</div>
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
            Battery & Refresh Modes
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

        {/* Master Location Sharing Toggle */}
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
