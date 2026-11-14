import React, { useState } from 'react';
import { useFamily } from '../../context/FamilyContext';
import { Navigation, Clock, MapPin, X, CheckCircle, AlertTriangle } from 'lucide-react';

export default function JourneyModal({ isOpen, onClose }) {
  const { startJourney, activeJourneys, confirmArrival, sendCheckIn, cancelJourney } = useFamily();
  const [destinationName, setDestinationName] = useState('');
  const [destinationLat, setDestinationLat] = useState('');
  const [destinationLng, setDestinationLng] = useState('');
  const [estimatedDurationMin, setEstimatedDurationMin] = useState(30);
  const [checkInMessage, setCheckInMessage] = useState('Please check on me');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('new'); // 'new' | 'active' | 'checkin'

  if (!isOpen) return null;

  const handleStart = async (e) => {
    e.preventDefault();
    if (!destinationName.trim() || !destinationLat || !destinationLng) {
      alert('Please enter destination name and valid coordinates.');
      return;
    }

    setIsSubmitting(true);
    try {
      await startJourney({
        destinationName: destinationName.trim(),
        destinationLat: Number(destinationLat),
        destinationLng: Number(destinationLng),
        estimatedDurationMin: Number(estimatedDurationMin) || 30
      });
      setDestinationName('');
      setDestinationLat('');
      setDestinationLng('');
      onClose();
    } catch (err) {
      alert(err.message || 'Failed to start journey');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCheckInSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await sendCheckIn(checkInMessage);
      onClose();
    } catch (err) {
      alert(err.message || 'Failed to send check-in');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: '440px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Navigation size={20} color="var(--primary-400)" />
            <h3>Journey Safety & Check-In</h3>
          </div>
          <button className="modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: '6px', padding: '0 16px 12px 16px', borderBottom: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={() => setActiveTab('new')}
            style={{
              flex: 1,
              padding: '8px',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: activeTab === 'new' ? 'var(--primary-600)' : 'transparent',
              color: activeTab === 'new' ? '#fff' : 'var(--text-300)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Start Journey
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('checkin')}
            style={{
              flex: 1,
              padding: '8px',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: activeTab === 'checkin' ? 'var(--warning-600)' : 'transparent',
              color: activeTab === 'checkin' ? '#fff' : 'var(--text-300)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Emergency Check-In
          </button>
          {activeJourneys.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab('active')}
              style={{
                flex: 1,
                padding: '8px',
                borderRadius: 'var(--radius-md)',
                border: 'none',
                background: activeTab === 'active' ? 'var(--primary-600)' : 'transparent',
                color: activeTab === 'active' ? '#fff' : 'var(--text-300)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Active ({activeJourneys.length})
            </button>
          )}
        </div>

        <div className="modal-body" style={{ padding: '16px' }}>
          {activeTab === 'new' && (
            <form onSubmit={handleStart} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label className="form-label" style={{ fontSize: '12px' }}>Destination Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Home, Office, Grand Central Station"
                  value={destinationName}
                  onChange={(e) => setDestinationName(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label className="form-label" style={{ fontSize: '12px' }}>Latitude</label>
                  <input
                    type="number"
                    step="any"
                    className="form-input"
                    placeholder="e.g. 17.3850"
                    value={destinationLat}
                    onChange={(e) => setDestinationLat(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontSize: '12px' }}>Longitude</label>
                  <input
                    type="number"
                    step="any"
                    className="form-input"
                    placeholder="e.g. 78.4867"
                    value={destinationLng}
                    onChange={(e) => setDestinationLng(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="form-label" style={{ fontSize: '12px' }}>Estimated Duration (Minutes)</label>
                <input
                  type="number"
                  min="5"
                  max="720"
                  className="form-input"
                  value={estimatedDurationMin}
                  onChange={(e) => setEstimatedDurationMin(e.target.value)}
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary w-full"
                disabled={isSubmitting}
                style={{ marginTop: '8px' }}
              >
                {isSubmitting ? 'Starting...' : 'Share Journey with Family'}
              </button>
            </form>
          )}

          {activeTab === 'checkin' && (
            <form onSubmit={handleCheckInSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '8px', padding: '12px', fontSize: '13px', color: '#FCD34D' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, marginBottom: '4px' }}>
                  <AlertTriangle size={16} />
                  <span>"Please Check On Me"</span>
                </div>
                Send a quick safety notification to all family members along with your current GPS coordinates.
              </div>

              <div>
                <label className="form-label" style={{ fontSize: '12px' }}>Message to Family</label>
                <textarea
                  className="form-input"
                  rows="3"
                  value={checkInMessage}
                  onChange={(e) => setCheckInMessage(e.target.value)}
                  placeholder="Please check on me..."
                  required
                />
              </div>

              <button
                type="submit"
                className="btn btn-warning w-full"
                disabled={isSubmitting}
                style={{ background: '#D97706', color: '#fff' }}
              >
                {isSubmitting ? 'Sending...' : 'Send Check-In to Family'}
              </button>
            </form>
          )}

          {activeTab === 'active' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {activeJourneys.map((j) => (
                <div
                  key={j.id}
                  style={{
                    background: 'var(--bg-700)',
                    borderRadius: '8px',
                    padding: '12px',
                    border: '1px solid var(--border)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 700, fontSize: '14px' }}>{j.destination_name}</div>
                    <span style={{ fontSize: '11px', background: 'rgba(16,185,129,0.2)', color: '#34D399', padding: '2px 8px', borderRadius: '12px' }}>
                      In Progress
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-300)', marginTop: '4px' }}>
                    Member: <strong>{j.user_name}</strong> | ETA: ~{j.estimated_duration_min} min
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                    <button
                      className="btn btn-primary"
                      onClick={() => confirmArrival(j.id)}
                      style={{ flex: 1, padding: '6px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                    >
                      <CheckCircle size={14} />
                      <span>Arrived Safely</span>
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={cancelJourney}
                      style={{ padding: '6px 12px', fontSize: '12px' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

