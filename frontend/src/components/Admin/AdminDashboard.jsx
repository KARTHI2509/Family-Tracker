import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import {
  Users, UserCheck, UserX, Heart, ShieldAlert,
  MapPin, Activity, ArrowRight, ExternalLink
} from 'lucide-react';

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchStats = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/stats');
      setData(res.stats || res);
    } catch (err) {
      console.error('Failed to load admin stats:', err);
      setError(err.message || 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, []);

  if (loading && !data) {
    return <div style={{ color: '#9CA3AF', padding: '32px' }}>Loading platform telemetry...</div>;
  }

  if (error) {
    return (
      <div style={{ background: '#7F1D1D', color: '#FECACA', padding: '16px', borderRadius: '8px' }}>
        Error loading admin dashboard: {error}
      </div>
    );
  }

  const stats = data || {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#fff', margin: 0 }}>System Overview & Telemetry</h1>
          <p style={{ color: '#9CA3AF', fontSize: '13px', margin: '4px 0 0 0' }}>
            Production platform monitoring, family metrics, and emergency operations.
          </p>
        </div>
        <button
          onClick={fetchStats}
          className="btn btn-secondary"
          style={{ fontSize: '12px', padding: '6px 14px' }}
        >
          Refresh Now
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        {/* Total Users */}
        <div style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: '12px', padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#9CA3AF', fontWeight: 600 }}>TOTAL USERS</span>
            <Users size={18} color="#60A5FA" />
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#fff', marginTop: '10px' }}>
            {stats.totalUsers || 0}
          </div>
          <div style={{ fontSize: '12px', color: '#10B981', marginTop: '4px' }}>
            {stats.activeUsers || 0} active ({stats.suspendedUsers || 0} suspended)
          </div>
        </div>

        {/* Families */}
        <div style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: '12px', padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#9CA3AF', fontWeight: 600 }}>FAMILY CIRCLES</span>
            <Heart size={18} color="#F472B6" />
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#fff', marginTop: '10px' }}>
            {stats.totalFamilies || 0}
          </div>
          <div style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '4px' }}>
            {stats.totalGeofences || 0} active safe zones
          </div>
        </div>

        {/* Active Emergencies */}
        <div style={{ background: stats.activeSOS > 0 ? '#450A0A' : '#111827', border: `1px solid ${stats.activeSOS > 0 ? '#EF4444' : '#1F2937'}`, borderRadius: '12px', padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: stats.activeSOS > 0 ? '#FCA5A5' : '#9CA3AF', fontWeight: 600 }}>ACTIVE SOS ALERTS</span>
            <ShieldAlert size={18} color={stats.activeSOS > 0 ? '#EF4444' : '#6B7280'} />
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: stats.activeSOS > 0 ? '#EF4444' : '#fff', marginTop: '10px' }}>
            {stats.activeSOS || 0}
          </div>
          <div style={{ fontSize: '12px', color: stats.activeSOS > 0 ? '#FCA5A5' : '#9CA3AF', marginTop: '4px' }}>
            {stats.activeSOS > 0 ? 'Immediate action required' : 'No active emergencies'}
          </div>
        </div>

        {/* Locations Today */}
        <div style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: '12px', padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#9CA3AF', fontWeight: 600 }}>LOCATIONS LOGGED (TODAY)</span>
            <Activity size={18} color="#34D399" />
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#fff', marginTop: '10px' }}>
            {stats.locationsToday || 0}
          </div>
          <div style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '4px' }}>
            7-day automated retention active
          </div>
        </div>
      </div>

      {/* Active Emergencies Action Section */}
      {stats.activeSOSEvents && stats.activeSOSEvents.length > 0 && (
        <div style={{ background: '#1F1315', border: '1px solid #DC2626', borderRadius: '12px', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#EF4444', fontWeight: 800, fontSize: '15px' }}>
              <ShieldAlert size={20} />
              <span>LIVE SOS EMERGENCIES IN PROGRESS</span>
            </div>
            <Link to="/admin/emergencies" style={{ color: '#F87171', fontSize: '13px', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span>Open Emergency Center</span>
              <ArrowRight size={14} />
            </Link>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
            {stats.activeSOSEvents.map(sos => (
              <div key={sos.id} style={{ background: '#111827', borderRadius: '8px', padding: '12px', border: '1px solid #374151' }}>
                <div style={{ fontWeight: 700, fontSize: '14px', color: '#fff' }}>{sos.user_name}</div>
                <div style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '2px' }}>
                  Family: {sos.family_name || 'Independent'} | Phone: {sos.user_phone || 'None'}
                </div>
                {sos.latitude && sos.longitude && (
                  <div style={{ marginTop: '8px' }}>
                    <a
                      href={`https://www.google.com/maps?q=${sos.latitude},${sos.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: '11px', color: '#60A5FA', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                      <span>Coordinates: {sos.latitude.toFixed(4)}, {sos.longitude.toFixed(4)}</span>
                      <ExternalLink size={11} />
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 7-Day Activity Trend Bar */}
      <div style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: '12px', padding: '20px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#fff', margin: '0 0 16px 0' }}>
          7-Day Platform Activity Volume
        </h3>
        {stats.sevenDayTrend && stats.sevenDayTrend.length > 0 ? (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', height: '140px', paddingTop: '20px' }}>
            {stats.sevenDayTrend.map(day => {
              const maxCount = Math.max(...stats.sevenDayTrend.map(d => d.count), 1);
              const heightPct = Math.max(12, Math.round((day.count / maxCount) * 100));
              return (
                <div key={day.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
                  <div style={{ fontSize: '11px', color: '#9CA3AF', marginBottom: '6px' }}>{day.count}</div>
                  <div
                    style={{
                      width: '100%',
                      maxWidth: '48px',
                      height: `${heightPct}%`,
                      background: 'linear-gradient(180deg, #6366F1 0%, #4338CA 100%)',
                      borderRadius: '6px 6px 0 0'
                    }}
                  />
                  <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '8px' }}>
                    {day.day.slice(5)}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ color: '#6B7280', fontSize: '13px' }}>No location activity logged in the past 7 days.</div>
        )}
      </div>
    </div>
  );
}

