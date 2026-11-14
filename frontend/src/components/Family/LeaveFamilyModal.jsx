import React, { useState, useEffect } from 'react';
import { useFamily } from '../../context/FamilyContext';
import {
  LogOut, AlertTriangle, Shield, X, Users, ArrowRight, Trash2
} from 'lucide-react';

export default function LeaveFamilyModal({ isOpen, onClose, currentFamily, otherMembers = [], isOwner = false }) {
  const { leaveFamily, deleteFamily } = useFamily();
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState('');
  const [successorId, setSuccessorId] = useState('');

  useEffect(() => {
    if (otherMembers.length > 0) {
      setSuccessorId(String(otherMembers[0].id));
    }
  }, [otherMembers]);

  if (!isOpen) return null;

  const handleConfirmLeave = async () => {
    setLeaving(true);
    setError('');
    try {
      await leaveFamily(isOwner && otherMembers.length > 0 ? successorId : null);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to leave family.');
    } finally {
      setLeaving(false);
    }
  };

  const handleDeleteEmptyFamily = async () => {
    setLeaving(true);
    setError('');
    try {
      await deleteFamily();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to delete family.');
    } finally {
      setLeaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1250 }}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '480px', width: '100%', maxHeight: '90dvh', overflowY: 'auto' }}
      >
        {/* Header */}
        <div className="modal-header" style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: 'rgba(239, 68, 68, 0.15)', padding: '8px', borderRadius: '10px' }}>
              <LogOut size={22} color="#EF4444" />
            </div>
            <div>
              <h2 style={{ fontSize: '18px', margin: 0, color: '#EF4444' }}>Leave Family Circle</h2>
              <div style={{ fontSize: '12px', color: 'var(--text-400)' }}>
                {currentFamily?.name || 'Current Family'}
              </div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        {/* Warning Banner */}
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: '10px',
            padding: '14px',
            marginBottom: '18px',
            display: 'flex',
            gap: '12px',
            alignItems: 'flex-start'
          }}
        >
          <AlertTriangle size={20} color="#EF4444" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div style={{ fontSize: '13px', color: 'var(--text-200)', lineHeight: '1.5' }}>
            <strong>Are you sure you want to leave this family?</strong>
            <p style={{ margin: '4px 0 0', color: 'var(--text-400)', fontSize: '12px' }}>
              You will immediately stop sharing your location with members of this circle, and you will no longer have access to their real-time positions, alerts, history or geofences.
            </p>
          </div>
        </div>

        {/* Owner Succession Notice */}
        {isOwner && otherMembers.length > 0 && (
          <div
            style={{
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              borderRadius: '10px',
              padding: '14px',
              marginBottom: '18px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Shield size={16} color="#F59E0B" />
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#F59E0B' }}>
                Owner Transfer Required
              </span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-300)', margin: '0 0 10px', lineHeight: '1.4' }}>
              You created this family circle. Before leaving, choose a member to become the new owner:
            </p>
            <select
              value={successorId}
              onChange={(e) => setSuccessorId(e.target.value)}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '8px',
                background: 'var(--bg-800)',
                border: '1px solid var(--glass-border)',
                color: 'var(--text-100)',
                fontSize: '13px'
              }}
            >
              {otherMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.email})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Owner of empty family */}
        {isOwner && otherMembers.length === 0 && (
          <div
            style={{
              background: 'var(--bg-800)',
              border: '1px solid var(--glass-border)',
              borderRadius: '10px',
              padding: '12px',
              marginBottom: '18px',
              fontSize: '12px',
              color: 'var(--text-300)',
              lineHeight: '1.4'
            }}
          >
            You are the only member in <strong>{currentFamily?.name}</strong>. Leaving will remove the family circle.
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid #EF4444',
              borderRadius: '8px',
              padding: '10px',
              marginBottom: '16px',
              fontSize: '13px',
              color: '#FCA5A5'
            }}
          >
            {error}
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={leaving}
            style={{ padding: '10px 18px', fontSize: '14px' }}
          >
            Cancel
          </button>

          {isOwner && otherMembers.length === 0 ? (
            <button
              type="button"
              className="btn btn-danger"
              onClick={handleDeleteEmptyFamily}
              disabled={leaving}
              style={{
                padding: '10px 18px',
                fontSize: '14px',
                background: '#DC2626',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <Trash2 size={16} />
              {leaving ? 'Deleting...' : 'Delete & Leave Family'}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-danger"
              onClick={handleConfirmLeave}
              disabled={leaving}
              style={{
                padding: '10px 18px',
                fontSize: '14px',
                background: '#DC2626',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <LogOut size={16} />
              {leaving ? 'Leaving...' : 'Confirm & Leave'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

