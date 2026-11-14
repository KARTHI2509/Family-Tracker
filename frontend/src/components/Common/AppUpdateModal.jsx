import React, { useState } from 'react';
import { appUpdateService } from '../../services/appUpdateService';
import { nativeLocationService } from '../../services/nativeLocationService';
import {
  Sparkles, Download, CheckCircle, ArrowRight, X, Smartphone, AlertCircle, RefreshCw
} from 'lucide-react';

export default function AppUpdateModal({ isOpen, onClose, updateData }) {
  const [downloading, setDownloading] = useState(false);
  const [downloadStarted, setDownloadStarted] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !updateData?.updateAvailable) return null;

  const latest = updateData.latestRelease || {};
  const installed = updateData.installedVersion || {};
  const isMandatory = updateData.mandatory;
  const isAndroid = nativeLocationService.platform === 'android';

  const handleUpdateNow = async () => {
    setDownloading(true);
    setError('');
    try {
      const res = await appUpdateService.applyUpdate(latest.apkUrl || latest.downloadUrl);
      if (res?.status === 'permission_required') {
        setError('Please toggle "Allow from this source" in Android settings, then tap Update Now again.');
        setDownloading(false);
        return;
      }
      setDownloadStarted(true);
    } catch (err) {
      setError(err.message || 'Failed to start download.');
      setDownloading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={isMandatory ? undefined : onClose} style={{ zIndex: 1300 }}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '480px', width: '100%', maxHeight: '90dvh', overflowY: 'auto' }}
      >
        {/* Header */}
        <div className="modal-header" style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: 'rgba(16, 185, 129, 0.15)', padding: '8px', borderRadius: '10px' }}>
              <Sparkles size={22} color="#10B981" />
            </div>
            <div>
              <h2 style={{ fontSize: '18px', margin: 0, color: '#fff' }}>New Version Available!</h2>
              <div style={{ fontSize: '12px', color: 'var(--text-400)' }}>
                FamilyTracker v{latest.latestVersion}
              </div>
            </div>
          </div>
          {!isMandatory && (
            <button className="modal-close" onClick={onClose} aria-label="Close modal">
              <X size={20} />
            </button>
          )}
        </div>

        {/* Version Comparison Card */}
        <div
          style={{
            background: 'var(--bg-800)',
            border: '1px solid var(--glass-border)',
            borderRadius: '10px',
            padding: '14px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-400)', textTransform: 'uppercase' }}>Installed</div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-300)' }}>
              v{installed.versionName || '1.0.0'} (Build {installed.versionCode || 1})
            </div>
          </div>

          <ArrowRight size={18} color="var(--primary-400)" />

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '11px', color: 'var(--success-400)', textTransform: 'uppercase', fontWeight: 600 }}>
              New Release
            </div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#34D399' }}>
              v{latest.latestVersion} (Build {latest.latestVersionCode})
            </div>
          </div>
        </div>

        {/* Release Notes */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-200)', marginBottom: '8px' }}>
            What's New in this Update:
          </div>
          <div
            style={{
              background: 'var(--bg-900)',
              border: '1px solid var(--glass-border)',
              borderRadius: '8px',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}
          >
            {(latest.releaseNotes || []).map((note, idx) => (
              <div key={idx} style={{ fontSize: '12px', color: 'var(--text-300)', lineHeight: '1.4' }}>
                {note}
              </div>
            ))}
          </div>
        </div>

        {/* Download Started Alert */}
        {downloadStarted && (
          <div
            style={{
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}
          >
            <CheckCircle size={20} color="#10B981" style={{ flexShrink: 0 }} />
            <div style={{ fontSize: '12px', color: '#A7F3D0', lineHeight: '1.4' }}>
              <strong>Downloading update in background...</strong>
              <div style={{ marginTop: '2px' }}>
                {isAndroid
                  ? 'Check your Android notification shade. The system package installer will open automatically.'
                  : 'Your browser is downloading FamilyTracker.apk. Tap the file to install.'}
              </div>
            </div>
          </div>
        )}

        {/* Error Notice */}
        {error && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid #EF4444',
              borderRadius: '8px',
              padding: '10px',
              marginBottom: '16px',
              fontSize: '12px',
              color: '#FCA5A5',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <AlertCircle size={16} color="#EF4444" style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
          {!isMandatory && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={downloading}
              style={{ padding: '10px 16px', fontSize: '13px' }}
            >
              Later
            </button>
          )}

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleUpdateNow}
            disabled={downloading && downloadStarted}
            style={{
              padding: '10px 20px',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: '#10B981',
              borderColor: '#10B981'
            }}
          >
            {downloading && !downloadStarted ? (
              <>
                <RefreshCw size={16} className="spin" />
                <span>Preparing Update...</span>
              </>
            ) : (
              <>
                <Download size={16} />
                <span>{downloadStarted ? 'Downloading...' : 'Update Now (4.3 MB)'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

