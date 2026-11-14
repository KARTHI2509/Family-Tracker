import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { Heart, Users, Key, Calendar } from 'lucide-react';
import { format } from 'date-fns';

export default function AdminFamilies() {
  const [families, setFamilies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchFamilies = async () => {
      try {
        setLoading(true);
        const res = await api.get('/admin/families');
        setFamilies(res.families || []);
      } catch (err) {
        console.error('Failed to load families:', err);
        setError(err.message || 'Failed to load families');
      } finally {
        setLoading(false);
      }
    };

    fetchFamilies();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#fff', margin: 0 }}>Family Circles</h1>
        <p style={{ color: '#9CA3AF', fontSize: '13px', margin: '4px 0 0 0' }}>
          Overview of registered family units, invite codes, and membership distribution.
        </p>
      </div>

      {error && (
        <div style={{ background: '#7F1D1D', color: '#FECACA', padding: '12px 16px', borderRadius: '8px', fontSize: '13px' }}>
          {error}
        </div>
      )}

      <div style={{ background: '#111827', borderRadius: '12px', border: '1px solid #1F2937', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1F2937', color: '#9CA3AF', background: '#0F172A' }}>
              <th style={{ padding: '14px 16px' }}>Family Name</th>
              <th style={{ padding: '14px 16px' }}>Invite Code</th>
              <th style={{ padding: '14px 16px' }}>Created By</th>
              <th style={{ padding: '14px 16px' }}>Members</th>
              <th style={{ padding: '14px 16px' }}>Created Date</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', padding: '32px', color: '#6B7280' }}>
                  Loading families...
                </td>
              </tr>
            ) : families.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', padding: '32px', color: '#6B7280' }}>
                  No families created yet.
                </td>
              </tr>
            ) : (
              families.map(f => (
                <tr key={f.id} style={{ borderBottom: '1px solid #1F2937' }}>
                  <td style={{ padding: '14px 16px', fontWeight: 600, color: '#fff' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Heart size={16} color="#F472B6" />
                      <span>{f.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, letterSpacing: '1px', background: '#1F2937', padding: '3px 8px', borderRadius: '4px', color: '#60A5FA' }}>
                      {f.invite_code}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px', color: '#D1D5DB' }}>
                    {f.creator_name || 'System Admin'}
                    <div style={{ fontSize: '11px', color: '#6B7280' }}>{f.creator_email}</div>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#34D399', fontWeight: 600 }}>
                      <Users size={14} />
                      {f.member_count} member(s)
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px', color: '#9CA3AF' }}>
                    {f.created_at ? format(new Date(f.created_at), 'PP') : 'Unknown'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

