import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { FileText, Download, Filter, Search, Calendar } from 'lucide-react';
import { format } from 'date-fns';

export default function AdminAuditLogs() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [actionFilter, setActionFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const limit = 50;

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (actionFilter) params.set('action', actionFilter);
      params.set('limit', String(limit));
      params.set('offset', String(page * limit));

      const res = await api.get(`/admin/audit-logs?${params.toString()}`);
      setLogs(res.logs || []);
      setTotal(res.total || 0);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
      setError(err.message || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [actionFilter, page]);

  const handleExportCSV = () => {
    const token = localStorage.getItem('ft_token');
    const exportUrl = `${(import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '')}/admin/audit-logs/export`;
    
    // Fetch with Authorization header and trigger blob download
    fetch(exportUrl, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.blob())
      .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `familytracker-audit-logs-${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      })
      .catch(err => alert('Failed to export CSV: ' + err.message));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#fff', margin: 0 }}>Immutable Audit Trail</h1>
          <p style={{ color: '#9CA3AF', fontSize: '13px', margin: '4px 0 0 0' }}>
            Comprehensive security log of administrative actions, emergency location overrides, and state changes.
          </p>
        </div>
        <button
          onClick={handleExportCSV}
          className="btn btn-secondary"
          style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '8px 14px' }}
        >
          <Download size={15} />
          <span>Export CSV</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', gap: '12px', background: '#111827', padding: '16px', borderRadius: '12px', border: '1px solid #1F2937' }}>
        <select
          className="form-input"
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(0); }}
          style={{ width: '280px' }}
        >
          <option value="">All Administrative Actions</option>
          <option value="USER_SUSPENDED">USER_SUSPENDED</option>
          <option value="USER_ACTIVATED">USER_ACTIVATED</option>
          <option value="USER_ROLE_CHANGED">USER_ROLE_CHANGED</option>
          <option value="EMERGENCY_LOCATION_ACCESS_GRANTED">EMERGENCY_LOCATION_ACCESS_GRANTED</option>
          <option value="ADMIN_CREATED_CLI">ADMIN_CREATED_CLI</option>
          <option value="ADMIN_PROMOTED_CLI">ADMIN_PROMOTED_CLI</option>
        </select>
        <div style={{ display: 'flex', alignItems: 'center', color: '#9CA3AF', fontSize: '13px' }}>
          Total logged records: <strong>{total}</strong>
        </div>
      </div>

      {error && (
        <div style={{ background: '#7F1D1D', color: '#FECACA', padding: '12px 16px', borderRadius: '8px', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {/* Audit Logs Table */}
      <div style={{ background: '#111827', borderRadius: '12px', border: '1px solid #1F2937', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1F2937', color: '#9CA3AF', background: '#0F172A' }}>
              <th style={{ padding: '12px 16px' }}>Timestamp</th>
              <th style={{ padding: '12px 16px' }}>Action</th>
              <th style={{ padding: '12px 16px' }}>Actor</th>
              <th style={{ padding: '12px 16px' }}>Target</th>
              <th style={{ padding: '12px 16px' }}>Reason & Justification</th>
              <th style={{ padding: '12px 16px' }}>IP</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: '#6B7280' }}>
                  Loading audit logs...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: '#6B7280' }}>
                  No audit log entries matching this filter.
                </td>
              </tr>
            ) : (
              logs.map(log => (
                <tr key={log.id} style={{ borderBottom: '1px solid #1F2937' }}>
                  <td style={{ padding: '12px 16px', color: '#9CA3AF', fontSize: '12px', whiteSpace: 'nowrap' }}>
                    {log.timestamp ? format(new Date(log.timestamp), 'PP pp') : 'N/A'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '6px',
                        background: log.action.includes('EMERGENCY') ? 'rgba(239, 68, 68, 0.2)' : (log.action.includes('SUSPENDED') ? 'rgba(245, 158, 11, 0.2)' : 'rgba(59, 130, 246, 0.2)'),
                        color: log.action.includes('EMERGENCY') ? '#F87171' : (log.action.includes('SUSPENDED') ? '#FCD34D' : '#60A5FA')
                      }}
                    >
                      {log.action}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#E5E7EB', fontSize: '12px' }}>
                    ID: {log.actor_id || 'System'} ({log.actor_role})
                  </td>
                  <td style={{ padding: '12px 16px', color: '#D1D5DB', fontSize: '12px' }}>
                    {log.target_type} {log.target_id ? `#${log.target_id}` : ''}
                  </td>
                  <td style={{ padding: '12px 16px', color: '#D1D5DB', maxWidth: '300px' }}>
                    {log.reason || 'None specified'}
                  </td>
                  <td style={{ padding: '12px 16px', color: '#6B7280', fontSize: '11px', fontFamily: 'monospace' }}>
                    {log.ip_address || 'local'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination controls */}
      {total > limit && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button
            className="btn btn-secondary"
            disabled={page === 0}
            onClick={() => setPage(p => Math.max(0, p - 1))}
            style={{ fontSize: '12px', padding: '6px 12px' }}
          >
            Previous
          </button>
          <span style={{ display: 'flex', alignItems: 'center', fontSize: '12px', color: '#9CA3AF', padding: '0 8px' }}>
            Page {page + 1} of {Math.ceil(total / limit)}
          </span>
          <button
            className="btn btn-secondary"
            disabled={(page + 1) * limit >= total}
            onClick={() => setPage(p => p + 1)}
            style={{ fontSize: '12px', padding: '6px 12px' }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

