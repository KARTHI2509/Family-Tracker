import React, { useState, useEffect } from 'react';
import { useFamily } from '../../context/FamilyContext';
import {
  RefreshCw, CheckCircle, AlertTriangle, ArrowRight, Shield, X, Users, Check, Lock
} from 'lucide-react';

export default function SwitchFamilyModal({ isOpen, onClose, currentFamily, otherMembers = [], isOwner = false }) {
  const { validateInviteCode, switchFamily } = useFamily();
  const [inviteCode, setInviteCode] = useState('');
  const [targetPreview, setTargetPreview] = useState(null);
  const [validating, setValidating] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [successorId, setSuccessorId] = useState('');

  useEffect(() => {
    if (otherMembers.length > 0) {
      setSuccessorId(String(otherMembers[0].id));
    }
  }, [otherMembers]);

  if (!isOpen) return null;

  const handleCodeChange = async (e) => {
    const code = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    setInviteCode(code);
    setValidationError('');
    setTargetPreview(null);

    if (code.length === 6) {
      setValidating(true);
      try {
        const preview = await validateInviteCode(code);
        setTargetPreview(preview);
      } catch (err) {
        setValidationError(err.message || 'Invalid invite code.');
      } finally {
        setValidating(false);
      }
    }
  };

  const handleManualValidate = async () => {
    if (!inviteCode.trim()) {
      setValidationError('Please enter a 6-character invite code.');
      return;
    }
    setValidating(true);
    setValidationError('');
    try {
      const preview = await validateInviteCode(inviteCode);
      setTargetPreview(preview);
    } catch (err) {
      setValidationError(err.message || 'Invalid invite code.');
      setTargetPreview(null);
    } finally {
      setValidating(false);
    }
  };

  const handleConfirmSwitch = async () => {
    if (!inviteCode || inviteCode.length < 6) {
      setValidationError('Please enter a valid 6-character invite code.');
      return;
    }

    setSwitching(true);
    setValidationError('');
    try {
      await switchFamily(inviteCode, isOwner && otherMembers.length > 0 ? successorId : null);
      onClose();
    } catch (err) {
      setValidationError(err.message || 'Failed to switch family.');
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1250 }}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '500px', width: '100%', maxHeight: '90dvh', overflowY: 'auto' }}
      >
        {/* Header */}
        <div className="modal-header" style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: 'rgba(99, 102, 241, 0.15)', padding: '8px', borderRadius: '10px' }}>
              <RefreshCw size={22} className="text-primary" />
            </div>
            <div>
              <h2 style={{ fontSize: '18px', margin: 0 }}>Switch Family Circle</h2>
              <div style={{ fontSize: '12px', color: 'var(--text-400)' }}>
                Move securely between family groups
              </div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        {/* Current Family Read-Only Card */}
        <div style={{ background: 'var(--bg-900)', border: '1px solid var(--glass-border)', borderRadius: '10px', padding: '12px 14px', marginBottom: '16px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-400)', textTransform: 'uppercase', marginBottom: '2px' }}>
            Current Family Circle
          </div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>{currentFamily?.name || 'My Family Circle'}</span>
            <span style={{ fontSize: '11px', background: 'var(--bg-800)', padding: '2px 8px', borderRadius: '4px', color: 'var(--text-300)' }}>
              Code: {currentFamily?.invite_code || currentFamily?.inviteCode}
            </span>
          </div>
        </div>

        {/* Input for New Invite Code */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-200)', marginBottom: '6px' }}>
            New Family Invite Code
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. ABC123"
              value={inviteCode}
              onChange={handleCodeChange}
              maxLength={6}
              style={{
                textTransform: 'uppercase',
                letterSpacing: '4px',
                fontSize: '18px',
                fontWeight: 700,
                textAlign: 'center'
              }}
            />
            <button
              className="btn btn-secondary"
              onClick={handleManualValidate}
              disabled={validating || inviteCode.length < 3}
              style={{ minWidth: '90px', fontSize: '13px' }}
            >
              {validating ? 'Checking...' : 'Check'}
            </button>
          </div>

          {validationError && (
            <div style={{ color: 'var(--danger-400)', fontSize: '12px', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <AlertTriangle size={14} />
              <span>{validationError}</span>
            </div>
          )}
        </div>

        {/* Target Family Preview Card */}
        {targetPreview && targetPreview.valid && (
          <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '10px', padding: '14px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#34d399', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
              <CheckCircle size={15} />
              <span>Verified Destination Family:</span>
            </div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#FFFFFF', marginBottom: '2px' }}>
              {targetPreview.familyName}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-400)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Users size={13} />
              <span>{targetPreview.memberCount} existing member(s)</span>
            </div>
          </div>
        )}

        {/* Owner Succession Notice (if current user is owner) */}
        {isOwner && otherMembers.length > 0 && (
          <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: '10px', padding: '14px', marginBottom: '16px' }}>
            <div style={{ color: '#FCD34D', fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>
              👑 Owner Succession Required
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-300)', lineHeight: '1.5', margin: '0 0 10px' }}>
              You created <strong>{currentFamily?.name}</strong>. Before you leave for the new circle, choose which member will take over as the owner:
            </p>
            <select
              className="form-control"
              value={successorId}
              onChange={(e) => setSuccessorId(e.target.value)}
              style={{ fontSize: '13px' }}
            >
              {otherMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.email})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Privacy & Location Consent Notice */}
        <div style={{ background: 'var(--bg-900)', border: '1px solid var(--glass-border)', borderRadius: '10px', padding: '12px', marginBottom: '20px', fontSize: '12px', color: 'var(--text-300)', lineHeight: '1.5' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#60A5FA', fontWeight: 600, marginBottom: '4px' }}>
            <Lock size={14} />
            <span>Privacy Boundaries & Consent:</span>
          </div>
          <div>
            Switching families will immediately disconnect your previous family from receiving your location updates. Live location broadcasting will be paused until you explicitly confirm sharing with the new family circle.
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            className="btn btn-ghost w-full"
            onClick={onClose}
            disabled={switching}
            style={{ border: '1px solid var(--glass-border)', fontSize: '13px' }}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary w-full"
            onClick={handleConfirmSwitch}
            disabled={switching || !targetPreview || !targetPreview.valid}
            style={{ fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 700 }}
          >
            {switching ? 'Switching...' : 'Confirm Switch'}
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
