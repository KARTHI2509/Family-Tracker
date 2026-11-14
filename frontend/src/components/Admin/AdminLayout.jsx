import React from 'react';
import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  ShieldCheck, LayoutDashboard, Users, Heart, AlertOctagon,
  FileText, ArrowLeft, LogOut, ShieldAlert
} from 'lucide-react';

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Guard: require admin or super_admin
  const isAuthorized = user && (user.role === 'admin' || user.role === 'super_admin');

  if (!user) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0B0F17', color: '#fff' }}>
        <div style={{ textAlign: 'center', padding: '32px', background: '#111827', borderRadius: '16px', border: '1px solid #1F2937' }}>
          <ShieldAlert size={48} color="#EF4444" style={{ margin: '0 auto 16px' }} />
          <h2>Super Admin Portal</h2>
          <p style={{ color: '#9CA3AF', margin: '8px 0 20px' }}>Please log in with administrator credentials.</p>
          <Link to="/login" className="btn btn-primary" style={{ textDecoration: 'none' }}>
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0B0F17', color: '#fff' }}>
        <div style={{ textAlign: 'center', padding: '32px', background: '#111827', borderRadius: '16px', border: '1px solid #1F2937', maxWidth: '400px' }}>
          <ShieldAlert size={48} color="#EF4444" style={{ margin: '0 auto 16px' }} />
          <h2>Access Denied</h2>
          <p style={{ color: '#9CA3AF', margin: '8px 0 20px' }}>
            Your account ({user.email}) does not have administrative privileges. Contact the system owner.
          </p>
          <Link to="/" className="btn btn-primary" style={{ textDecoration: 'none' }}>
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', background: '#0B0F17', color: '#F3F4F6' }}>
      {/* Admin Sidebar */}
      <aside
        style={{
          width: '260px',
          background: '#111827',
          borderRight: '1px solid #1F2937',
          display: 'flex',
          flexDirection: 'column',
          padding: '20px 16px',
          gap: '8px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '0 8px 16px', borderBottom: '1px solid #1F2937' }}>
          <div style={{ background: '#DC2626', borderRadius: '8px', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShieldCheck size={22} color="#fff" />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '15px', color: '#fff', letterSpacing: '0.5px' }}>SUPER ADMIN</div>
            <div style={{ fontSize: '11px', color: '#9CA3AF', textTransform: 'uppercase' }}>{user.role}</div>
          </div>
        </div>

        {/* Navigation Links */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '12px', flex: 1 }}>
          <NavLink
            to="/admin/dashboard"
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '10px 14px',
              borderRadius: '8px',
              color: isActive ? '#fff' : '#9CA3AF',
              background: isActive ? '#374151' : 'transparent',
              textDecoration: 'none',
              fontSize: '13px',
              fontWeight: 600,
              transition: 'background 0.15s'
            })}
          >
            <LayoutDashboard size={18} />
            <span>Overview</span>
          </NavLink>

          <NavLink
            to="/admin/users"
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '10px 14px',
              borderRadius: '8px',
              color: isActive ? '#fff' : '#9CA3AF',
              background: isActive ? '#374151' : 'transparent',
              textDecoration: 'none',
              fontSize: '13px',
              fontWeight: 600,
              transition: 'background 0.15s'
            })}
          >
            <Users size={18} />
            <span>Users Management</span>
          </NavLink>

          <NavLink
            to="/admin/families"
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '10px 14px',
              borderRadius: '8px',
              color: isActive ? '#fff' : '#9CA3AF',
              background: isActive ? '#374151' : 'transparent',
              textDecoration: 'none',
              fontSize: '13px',
              fontWeight: 600,
              transition: 'background 0.15s'
            })}
          >
            <Heart size={18} />
            <span>Families</span>
          </NavLink>

          <NavLink
            to="/admin/emergencies"
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '10px 14px',
              borderRadius: '8px',
              color: isActive ? '#fff' : '#9CA3AF',
              background: isActive ? '#DC2626' : 'transparent',
              textDecoration: 'none',
              fontSize: '13px',
              fontWeight: 600,
              transition: 'background 0.15s'
            })}
          >
            <AlertOctagon size={18} />
            <span>Live Emergencies</span>
          </NavLink>

          <NavLink
            to="/admin/audit-logs"
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '10px 14px',
              borderRadius: '8px',
              color: isActive ? '#fff' : '#9CA3AF',
              background: isActive ? '#374151' : 'transparent',
              textDecoration: 'none',
              fontSize: '13px',
              fontWeight: 600,
              transition: 'background 0.15s'
            })}
          >
            <FileText size={18} />
            <span>Audit Trail</span>
          </NavLink>
        </nav>

        {/* Bottom Actions */}
        <div style={{ borderTop: '1px solid #1F2937', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <Link
            to="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 12px',
              borderRadius: '6px',
              color: '#60A5FA',
              textDecoration: 'none',
              fontSize: '13px',
              fontWeight: 600
            }}
          >
            <ArrowLeft size={16} />
            <span>Back to Family App</span>
          </Link>

          <button
            onClick={logout}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 12px',
              borderRadius: '6px',
              background: 'transparent',
              border: 'none',
              color: '#EF4444',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              textAlign: 'left'
            }}
          >
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Admin Content Area */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
        <Outlet />
      </main>
    </div>
  );
}

