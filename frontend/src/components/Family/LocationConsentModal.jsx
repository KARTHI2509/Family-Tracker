import React from 'react';
import { useFamily } from '../../context/FamilyContext';
import { Shield, Navigation, NavigationOff, CheckCircle } from 'lucide-react';

export default function LocationConsentModal({ family, onClose }) {
  const { toggleTracking } = useFamily();

  if (!family) return null;

  const handleConsent = (enable) => {
    toggleTracking(enable);
    onClose();
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 1300 }}>
      <div className="modal" style={{ maxWidth: '460px', width: '100%', textAlign: 'center' }}>
        <div style={{ background: 'rgba(99, 102, 241, 0.15)', width: '56px', height: '56px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <Shield size={28} className="text-primary" />
        </div>

        <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 8px', color: '#FFFFFF' }}>
          Location Sharing with New Family
        </h3>

        <p style={{ fontSize: '13px', color: 'var(--text-300)', lineHeight: '1.5', margin: '0 0 16px' }}>
          You have securely joined <strong>{family.name}</strong>. Because your location audience has changed, live location broadcasting was paused for your privacy.
        </p>

        <div style={{ background: 'var(--bg-900)', border: '1px solid var(--glass-border)', borderRadius: '10px', padding: '14px', marginBottom: '20px', textAlign: 'left', fontSize: '12px', color: 'var(--text-300)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--success-400)', fontWeight: 600, marginBottom: '4px' }}>
            <CheckCircle size={15} />
            <span>Privacy Isolation Enforced:</span>
          </div>
          <div>Your previous family can no longer view your location or alerts. You must explicitly confirm to share location with <strong>{family.name}</strong>.</div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            className="btn btn-ghost w-full"
            onClick={() => handleConsent(false)}
            style={{ fontSize: '13px', border: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
          >
            <NavigationOff size={16} />
            <span>Keep Paused</span>
          </button>
          <button
            className="btn btn-primary w-full"
            onClick={() => handleConsent(true)}
            style={{ fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 700 }}
          >
            <Navigation size={16} />
            <span>Share Location</span>
          </button>
        </div>
      </div>
    </div>
  );
}

