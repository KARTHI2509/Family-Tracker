import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { Users, UserPlus, Copy, Check, AlertCircle } from 'lucide-react';

export default function FamilySetup() {
  const { refreshUser, logout } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState(null); // 'create' | 'join'
  const [familyName, setFamilyName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!familyName.trim()) {
      setError('Please enter a family name');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const data = await api.post('/family/create', { name: familyName });
      const code = data.family?.invite_code || data.invite_code || data.inviteCode;
      setGeneratedCode(code);
      await refreshUser();
    } catch (err) {
      setError(err.message || 'Failed to create family');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!inviteCode.trim()) {
      setError('Please enter an invite code');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await api.post('/family/join', { inviteCode: inviteCode.trim().toUpperCase() });
      await refreshUser();
      navigate('/');
    } catch (err) {
      setError(err.message || 'Invalid invite code');
    } finally {
      setLoading(false);
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(generatedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const goToDashboard = () => navigate('/');

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <h1>🛡️ FamilyTracker</h1>
          <p>Set up your family group</p>
        </div>

        {!mode && !generatedCode && (
          <>
            <div className="setup-options">
              <div
                className="setup-card"
                onClick={() => { setMode('create'); setError(''); }}
              >
                <span className="setup-card-icon">🏠</span>
                <h3>Create Family</h3>
                <p>Start a new family group</p>
              </div>
              <div
                className="setup-card"
                onClick={() => { setMode('join'); setError(''); }}
              >
                <span className="setup-card-icon">🔗</span>
                <h3>Join Family</h3>
                <p>Join with invite code</p>
              </div>
            </div>
            <button className="btn btn-ghost btn-block" onClick={logout}>
              Sign Out
            </button>
          </>
        )}

        {mode === 'create' && !generatedCode && (
          <form onSubmit={handleCreate}>
            {error && (
              <div className="error-text mb-4" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertCircle size={16} /> {error}
              </div>
            )}
            <div className="form-group">
              <label>Family Name</label>
              <input
                type="text"
                className="input"
                placeholder="The Smiths"
                value={familyName}
                onChange={(e) => setFamilyName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn btn-outline" onClick={() => setMode(null)}>
                Back
              </button>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={loading}>
                {loading ? 'Creating...' : (
                  <><Users size={18} /> Create Family</>
                )}
              </button>
            </div>
          </form>
        )}

        {generatedCode && (
          <div>
            <div className="text-center mb-4">
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Family Created! 🎉</h3>
              <p className="text-sm text-muted">Share this code with your family members</p>
            </div>
            <div className="invite-code-label">Invite Code</div>
            <div className="invite-code">
              <code>{generatedCode}</code>
              <button className="btn-icon" onClick={copyCode} title="Copy code">
                {copied ? <Check size={18} color="#10B981" /> : <Copy size={18} />}
              </button>
            </div>
            <button className="btn btn-primary btn-block mt-4" onClick={goToDashboard}>
              Go to Dashboard
            </button>
          </div>
        )}

        {mode === 'join' && (
          <form onSubmit={handleJoin}>
            {error && (
              <div className="error-text mb-4" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertCircle size={16} /> {error}
              </div>
            )}
            <div className="form-group">
              <label>Invite Code</label>
              <input
                type="text"
                className="input"
                placeholder="Enter 6-character code"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                maxLength={12}
                autoFocus
                style={{ textAlign: 'center', letterSpacing: 4, fontSize: 20, fontWeight: 700 }}
              />
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn btn-outline" onClick={() => setMode(null)}>
                Back
              </button>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={loading}>
                {loading ? 'Joining...' : (
                  <><UserPlus size={18} /> Join Family</>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
