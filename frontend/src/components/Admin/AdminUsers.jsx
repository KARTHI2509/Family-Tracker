import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Search, UserCheck, UserX, Shield, ShieldAlert, ArrowUpDown, Filter } from 'lucide-react';
import { format } from 'date-fns';

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      if (roleFilter) params.set('role', roleFilter);
      params.set('limit', '100');

      const res = await api.get(`/admin/users?${params.toString()}`);
      setUsers(res.users || []);
      setTotal(res.total || 0);
    } catch (err) {
      console.error('Failed to load users:', err);
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchUsers();
    }, 250);
    return () => clearTimeout(timeout);
  }, [search, statusFilter, roleFilter]);

  const handleToggleStatus = async (user) => {
    const newStatus = user.status === 'active' ? 'suspended' : 'active';
    const reason = prompt(`Enter reason for ${newStatus === 'suspended' ? 'suspending' : 'activating'} ${user.name}:`, `${newStatus} by admin`);
    if (reason === null) return; // User cancelled

    setActionLoadingId(user.id);
    try {
      await api.put(`/admin/users/${user.id}/status`, { status: newStatus, reason });
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, status: newStatus } : u));
    } catch (err) {
      alert(err.message || 'Failed to update user status');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleChangeRole = async (user, newRole) => {
    if (user.role === newRole) return;
    const confirmChange = window.confirm(`Change ${user.name}'s role to "${newRole}"?`);
    if (!confirmChange) return;

    setActionLoadingId(user.id);
    try {
      await api.put(`/admin/users/${user.id}/role`, { role: newRole, reason: `Role changed to ${newRole}` });
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, role: newRole } : u));
    } catch (err) {
      alert(err.message || 'Failed to update user role');
    } finally {
      setActionLoadingId(null);
    }
  };

  const isSuperAdmin = currentUser?.role === 'super_admin';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#fff', margin: 0 }}>User Management</h1>
          <p style={{ color: '#9CA3AF', fontSize: '13px', margin: '4px 0 0 0' }}>
            Manage registered accounts, role elevation, account suspension, and location metadata.
          </p>
        </div>
        <div style={{ fontSize: '13px', color: '#9CA3AF' }}>
          Total registered: <strong>{total}</strong>
        </div>
      </div>

      {/* Filters & Search */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', background: '#111827', padding: '16px', borderRadius: '12px', border: '1px solid #1F2937' }}>
        <div style={{ flex: '1', minWidth: '220px', position: 'relative' }}>
          <Search size={16} color="#6B7280" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            className="form-input"
            placeholder="Search by name, email, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: '36px', width: '100%' }}
          />
        </div>

        <select
          className="form-input"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ width: '150px' }}
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>

        <select
          className="form-input"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          style={{ width: '150px' }}
        >
          <option value="">All Roles</option>
          <option value="user">User</option>
          <option value="admin">Admin</option>
          <option value="super_admin">Super Admin</option>
        </select>
      </div>

      {error && (
        <div style={{ background: '#7F1D1D', color: '#FECACA', padding: '12px 16px', borderRadius: '8px', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {/* Users Table */}
      <div style={{ background: '#111827', borderRadius: '12px', border: '1px solid #1F2937', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1F2937', color: '#9CA3AF', background: '#0F172A' }}>
              <th style={{ padding: '14px 16px' }}>User</th>
              <th style={{ padding: '14px 16px' }}>Family</th>
              <th style={{ padding: '14px 16px' }}>Role</th>
              <th style={{ padding: '14px 16px' }}>Status</th>
              <th style={{ padding: '14px 16px' }}>Last Seen</th>
              <th style={{ padding: '14px 16px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: '#6B7280' }}>
                  Loading users...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: '#6B7280' }}>
                  No matching users found.
                </td>
              </tr>
            ) : (
              users.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid #1F2937', transition: 'background 0.15s' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          backgroundColor: u.avatar_color || '#4F46E5',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          color: '#fff',
                          fontSize: '13px'
                        }}
                      >
                        {u.name ? u.name.charAt(0).toUpperCase() : 'U'}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: '#fff' }}>{u.name}</div>
                        <div style={{ fontSize: '11px', color: '#9CA3AF' }}>{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', color: u.family_name ? '#E5E7EB' : '#6B7280' }}>
                    {u.family_name || 'None'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {isSuperAdmin ? (
                      <select
                        value={u.role || 'user'}
                        onChange={(e) => handleChangeRole(u, e.target.value)}
                        style={{
                          background: '#1F2937',
                          color: u.role === 'super_admin' ? '#F59E0B' : (u.role === 'admin' ? '#60A5FA' : '#D1D5DB'),
                          border: '1px solid #374151',
                          borderRadius: '4px',
                          padding: '4px 8px',
                          fontSize: '11px',
                          fontWeight: 600
                        }}
                      >
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                        <option value="super_admin">Super Admin</option>
                      </select>
                    ) : (
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: '10px',
                        background: u.role === 'super_admin' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(55, 65, 81, 0.5)',
                        color: u.role === 'super_admin' ? '#F59E0B' : '#9CA3AF'
                      }}>
                        {u.role}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '3px 8px',
                        borderRadius: '10px',
                        background: u.status === 'active' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        color: u.status === 'active' ? '#34D399' : '#F87171'
                      }}
                    >
                      {u.status === 'active' ? 'Active' : 'Suspended'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#9CA3AF', fontSize: '12px' }}>
                    {u.last_location_time ? format(new Date(u.last_location_time), 'PP p') : 'Never'}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <button
                      onClick={() => handleToggleStatus(u)}
                      disabled={actionLoadingId === u.id || (u.role === 'super_admin' && !isSuperAdmin)}
                      style={{
                        background: u.status === 'active' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                        color: u.status === 'active' ? '#F87171' : '#34D399',
                        border: '1px solid transparent',
                        borderRadius: '6px',
                        padding: '5px 10px',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {actionLoadingId === u.id ? 'Updating...' : (u.status === 'active' ? 'Suspend' : 'Activate')}
                    </button>
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

