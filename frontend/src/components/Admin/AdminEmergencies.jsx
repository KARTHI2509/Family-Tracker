import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { ShieldAlert, AlertTriangle, ExternalLink, KeyRound, Clock, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';

export default function AdminEmergencies() {
  const [activeSOS, setActiveSOS] = useState([]);
  const [activeGrants, setActiveGrants] = useState([]);
  const [targetUserId, setTargetUserId] = useState('');
  const [caseType, setCaseType] = useState('missing_person');
  const [justification, setJustification] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [emergencyResult, setEmergencyResult] = useState(null);
  const [error, setError] = useState('');

  const fetchEmergencies = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/emergencies');
      setActiveSOS(res.activeSOS || []);
      setActiveGrants(res.activeGrants || []);
    } catch (err) {
      console.error('Failed to load emergencies:', err);
      setError(err.message || 'Failed to load emergencies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmergencies();
    const interval = setInterval(fetchEmergencies, 15000); // 15s refresh
    return () => clearInterval(interval);
  }, []);

  const handleRequestEmergencyAccess = async (e) => {
    e.preventDefault();
    if (!targetUserId || !justification.trim() || justification.trim().length < 10) {
      alert('Justification must be at least 10 characters explaining the life-safety or urgent concern.');
      return;
    }

    setSubmitting(true);
    setError('');
    setEmergencyResult(null);
    try {
      const res = await api.post('/admin/emergency-access', {
        targetUserId: Number(targetUserId),
        caseType,
        justification: justification.trim()
      });
      setEmergencyResult(res);
      setJustification('');
      fetchEmergencies();
    } catch (err) {
      setError(err.message || 'Failed to grant emergency access');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#fff', margin: 0 }}>
          Emergency Response Center & Location Override
        </h1>
        <p style={{ color: '#9CA3AF', fontSize: '13px', margin: '4px 0 0 0' }}>
          Real-time SOS emergencies and strict legal/safety emergency location access workflow with immutable audit logging.
        </p>
      </div>

      {error && (
        <div style={{ background: '#7F1D1D', color: '#FECACA', padding: '12px 16px', borderRadius: '8px', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {/* Live SOS Alerts Section */}
      <div style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: '12px', padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#EF4444', fontWeight: 800, fontSize: '16px', marginBottom: '16px' }}>
          <ShieldAlert size={22} />
          <span>Active SOS Broadcasts ({activeSOS.length})</span>
        </div>

        {activeSOS.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#9CA3AF', background: '#0F172A', borderRadius: '8px' }}>
            No active SOS distress signals on the network.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
            {activeSOS.map(sos => (
              <div key={sos.id} style={{ background: '#1F1315', border: '1px solid #DC2626', borderRadius: '10px', padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '16px', color: '#fff' }}>{sos.user_name}</div>
                    <div style={{ fontSize: '12px', color: '#FCA5A5', marginTop: '2px' }}>
                      Family: {sos.family_name || 'Independent'}
                    </div>
                  </div>
                  <span style={{ background: '#DC2626', color: '#fff', fontSize: '10px', fontWeight: 800, padding: '3px 8px', borderRadius: '6px' }}>
                    SOS ACTIVE
                  </span>
                </div>

                <div style={{ marginTop: '12px', fontSize: '12px', color: '#D1D5DB' }}>
                  <div><strong>Phone:</strong> {sos.user_phone || 'None'}</div>
                  <div><strong>Email:</strong> {sos.user_email}</div>
                  <div style={{ marginTop: '4px' }}>
                    <strong>Triggered:</strong> {sos.triggered_at ? format(new Date(sos.triggered_at), 'PPpp') : 'Now'}
                  </div>
                </div>

                {sos.latitude && sos.longitude ? (
                  <div style={{ marginTop: '14px', display: 'flex', gap: '10px' }}>
                    <a
                      href={`https://www.google.com/maps?q=${sos.latitude},${sos.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-primary"
                      style={{ fontSize: '12px', padding: '6px 12px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                      <span>Open in Google Maps</span>
                      <ExternalLink size={13} />
                    </a>
                  </div>
                ) : (
                  <div style={{ marginTop: '10px', fontSize: '12px', color: '#F87171' }}>
                    ⚠️ SOS triggered without GPS coordinates (location permission was denied on device).
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Emergency Location Override Access Form */}
      <div style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: '12px', padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#F59E0B', fontWeight: 700, fontSize: '15px', marginBottom: '8px' }}>
          <KeyRound size={20} />
          <span>Emergency Location Access Override</span>
        </div>
        <p style={{ color: '#9CA3AF', fontSize: '12px', margin: '0 0 16px 0', lineHeight: 1.5 }}>
          Authorized administrators may access a member's location during verified life-safety emergencies (e.g. missing child, non-responsive SOS, emergency services coordination). All overrides are permanently recorded in the immutable audit log.
        </p>

        <form onSubmit={handleRequestEmergencyAccess} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label className="form-label" style={{ fontSize: '12px' }}>Target User ID</label>
            <input
              type="number"
              className="form-input"
              placeholder="Enter User ID (e.g. 1)"
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="form-label" style={{ fontSize: '12px' }}>Emergency Case Type</label>
            <select
              className="form-input"
              value={caseType}
              onChange={(e) => setCaseType(e.target.value)}
            >
              <option value="missing_person">Missing Person / Child Safety</option>
              <option value="sos_unresponsive">Unresponsive SOS Distress Signal</option>
              <option value="medical_emergency">Medical Emergency / First Responders</option>
              <option value="welfare_check">Critical Welfare Check</option>
            </select>
          </div>

          <div style={{ gridColumn: 'span 2' }}>
            <label className="form-label" style={{ fontSize: '12px' }}>Urgent Justification (Required - min 10 characters)</label>
            <textarea
              className="form-input"
              rows="3"
              placeholder="Describe the urgent life-safety reason justifying access to this member's location..."
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              required
            />
          </div>

          <div style={{ gridColumn: 'span 2' }}>
            <button
              type="submit"
              className="btn btn-warning"
              disabled={submitting}
              style={{ background: '#D97706', color: '#fff', fontSize: '13px', fontWeight: 700 }}
            >
              {submitting ? 'Verifying & Granting...' : 'Authorize Emergency Access (Logged to Audit Trail)'}
            </button>
          </div>
        </form>

        {/* Display Emergency Result if Granted */}
        {emergencyResult && (
          <div style={{ marginTop: '20px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10B981', borderRadius: '8px', padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#34D399', fontWeight: 700, fontSize: '14px' }}>
              <CheckCircle size={18} />
              <span>{emergencyResult.message}</span>
            </div>
            <div style={{ fontSize: '12px', color: '#D1D5DB', marginTop: '8px' }}>
              Target: <strong>{emergencyResult.targetUser?.name}</strong> ({emergencyResult.targetUser?.email})
            </div>
            {emergencyResult.latestLocation ? (
              <div style={{ marginTop: '8px', fontSize: '13px' }}>
                <div>Coordinates: <strong>{emergencyResult.latestLocation.latitude}, {emergencyResult.latestLocation.longitude}</strong></div>
                <div>Recorded: {emergencyResult.latestLocation.timestamp}</div>
                <div style={{ marginTop: '8px' }}>
                  <a
                    href={`https://www.google.com/maps?q=${emergencyResult.latestLocation.latitude},${emergencyResult.latestLocation.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: '#60A5FA', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    <span>View Location on Google Maps</span>
                    <ExternalLink size={14} />
                  </a>
                </div>
              </div>
            ) : (
              <div style={{ marginTop: '6px', color: '#FCD34D', fontSize: '12px' }}>
                No location recorded yet for this user.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Active Grants List */}
      <div style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: '12px', padding: '20px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#fff', margin: '0 0 14px 0' }}>
          Active Emergency Override Grants ({activeGrants.length})
        </h3>
        {activeGrants.length === 0 ? (
          <div style={{ color: '#6B7280', fontSize: '13px' }}>No active emergency grants currently open.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {activeGrants.map(grant => (
              <div key={grant.id} style={{ background: '#0F172A', padding: '12px', borderRadius: '8px', border: '1px solid #1E293B', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, color: '#fff' }}>Target: {grant.target_user_name}</div>
                  <div style={{ fontSize: '12px', color: '#9CA3AF' }}>Case: {grant.case_type} | Reason: "{grant.justification}"</div>
                </div>
                <div style={{ textAlign: 'right', fontSize: '11px', color: '#6B7280' }}>
                  <div>Granted by: {grant.admin_name}</div>
                  <div style={{ color: '#F59E0B' }}>Expires: {grant.expires_at ? format(new Date(grant.expires_at), 'p') : 'Unknown'}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

