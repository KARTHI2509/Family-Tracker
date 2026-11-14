import React, { useState, useEffect } from 'react';
import { useFamily } from '../../context/FamilyContext';
import { nativeLocationService, TRACKING_MODES } from '../../services/nativeLocationService';
import {
  Shield, MapPin, Battery, BatteryCharging, Zap, Smartphone,
  CheckCircle, AlertTriangle, XCircle, Info, ExternalLink, X, RefreshCw
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default function LocationSettingsModal({ isOpen, onClose }) {
  const { isTrackingEnabled, toggleTracking, trackingMode, setTrackingMode } = useFamily();
  const [permInfo, setPermInfo] = useState({ status: 'checking', foreground: false, background: false, platform: 'web' });
  const [lastFix, setLastFix] = useState(null);
  const [requesting, setRequesting] = useState(false);
  const [showBatteryNotice, setShowBatteryNotice] = useState(false);

  const refreshPermissions = async () => {
    const info = await nativeLocationService.checkPermissions();
    setPermInfo(info);
    const loc = await nativeLocationService.getLastKnownLocation();
    setLastFix(loc);
  };

  useEffect(() => {
    if (isOpen) {
      refreshPermissions();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRequestOSPermission = async () => {
    setRequesting(true);
    try {
      await nativeLocationService.requestPermissions();
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
              <div style={{ fontSize: '12px', color: 'var(--text-400)' }}>
                Platform: <span style={{ textTransform: 'capitalize', color: 'var(--primary-400)', fontWeight: 600 }}>{permInfo.platform}</span>
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
                    <span style={{ color: 'var(--danger-500)' }}>Denied / Prompt</span>
                  </>
                )}
              </div>
            </div>

            {/* Background Status */}
            <div style={{ background: 'var(--bg-800)', padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-400)', textTransform: 'uppercase' }}>Background & Locked</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', fontSize: '14px', fontWeight: 700 }}>
                {permInfo.background ? (
                  <>
                    <CheckCircle size={16} color="var(--success-500)" />
                    <span style={{ color: 'var(--success-500)' }}>Always Allowed</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle size={16} color="var(--warning-500)" />
                    <span style={{ color: 'var(--warning-500)' }}>Standard / App Only</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {!permInfo.foreground && (
            <button
              className="btn btn-primary w-full mt-3"
              onClick={handleRequestOSPermission}
              disabled={requesting}
              style={{ fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              <MapPin size={16} />
              <span>{requesting ? 'Requesting OS Permission...' : 'Allow Location in OS'}</span>
            </button>
          )}
        </div>

        {/* Platform-Specific Native Instructions */}
        {(isAndroid || isIOS) && (
          <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)', borderRadius: '12px', padding: '14px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#60A5FA', fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>
              <Smartphone size={16} />
              <span>{isAndroid ? 'Android Background Setup' : 'iOS Core Location Setup'}</span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-300)', lineHeight: '1.5', margin: 0 }}>
              {isAndroid
                ? 'To ensure continuous location sharing when your screen is locked, go to your phone Settings ➔ Apps ➔ FamilyTracker ➔ Permissions ➔ Location ➔ Select "Allow all the time".'
                : 'To maintain emergency tracking while minimized, open iPhone Settings ➔ FamilyTracker ➔ Location ➔ Select "Always".'}
            </p>
          </div>
        )}

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
