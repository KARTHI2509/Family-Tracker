import React, { useState } from 'react';
import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  ShieldCheck, LayoutDashboard, Users, Heart, AlertOctagon,
  FileText, ArrowLeft, LogOut, ShieldAlert, Menu, X
} from 'lucide-react';

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Guard: require admin or super_admin
  const isAuthorized = user && (user.role === 'admin' || user.role === 'super_admin');

  if (!user) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', background: '#0B0F17', color: '#fff', padding: '16px' }}>
        <div style={{ textAlign: 'center', padding: '32px 24px', background: '#111827', borderRadius: '16px', border: '1px solid #1F2937', maxWidth: '400px', width: '100%' }}>
          <ShieldAlert size={48} color="#EF4444" style={{ margin: '0 auto 16px' }} />
          <h2>Super Admin Portal</h2>
          <p style={{ color: '#9CA3AF', margin: '8px 0 20px' }}>Please log in with administrator credentials.</p>
          <Link to="/login" className="btn btn-primary" style={{ textDecoration: 'none', display: 'inline-block', width: '100%' }}>
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', background: '#0B0F17', color: '#fff', padding: '16px' }}>
        <div style={{ textAlign: 'center', padding: '32px 24px', background: '#111827', borderRadius: '16px', border: '1px solid #1F2937', maxWidth: '400px', width: '100%' }}>
          <ShieldAlert size={48} color="#EF4444" style={{ margin: '0 auto 16px' }} />
          <h2>Access Denied</h2>
          <p style={{ color: '#9CA3AF', margin: '8px 0 20px' }}>
            Your account ({user.email}) does not have administrative privileges. Contact the system owner.
          </p>
          <Link to="/" className="btn btn-primary" style={{ textDecoration: 'none', display: 'inline-block', width: '100%' }}>
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const closeMenu = () => setMobileMenuOpen(false);

  return (
    <div className="admin-root-layout">
      {/* Mobile Admin Header */}
      <header className="admin-mobile-header">
        <button
          className="btn btn-ghost"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle admin menu"
          style={{ padding: '8px', color: '#fff' }}
        >
          {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldCheck size={18} color="#EF4444" />
          <span style={{ fontWeight: 800, fontSize: '15px', color: '#fff', letterSpacing: '0.5px' }}>SUPER ADMIN</span>
        </div>
        <Link to="/" style={{ color: '#9CA3AF', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <ArrowLeft size={14} />
          <span>Exit</span>
        </Link>
      </header>

      {/* Mobile Backdrop */}
      {mobileMenuOpen && (
        <div className="admin-sidebar-backdrop" onClick={closeMenu} />
      )}

      {/* Admin Sidebar */}
      <aside className={`admin-sidebar ${mobileMenuOpen ? 'open' : ''}`}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px 16px', borderBottom: '1px solid #1F2937' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: '#DC2626', borderRadius: '8px', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShieldCheck size={22} color="#fff" />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '15px', color: '#fff', letterSpacing: '0.5px' }}>SUPER ADMIN</div>
              <div style={{ fontSize: '11px', color: '#9CA3AF', textTransform: 'uppercase' }}>{user.role}</div>
            </div>
          </div>
          <button
            className="admin-mobile-close-btn"
            onClick={closeMenu}
            aria-label="Close admin menu"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Links */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '12px', flex: 1 }}>
          <NavLink
            to="/admin/dashboard"
            onClick={closeMenu}
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
            onClick={closeMenu}
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
            onClick={closeMenu}
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
            <span>Families Management</span>
          </NavLink>

          <NavLink
            to="/admin/emergencies"
            onClick={closeMenu}
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
            <AlertOctagon size={18} />
            <span>Emergency Operations</span>
          </NavLink>

          <NavLink
            to="/admin/audit-logs"
            onClick={closeMenu}
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
            <span>Security Audit Trail</span>
          </NavLink>
        </nav>

        {/* Footer actions */}
        <div style={{ borderTop: '1px solid #1F2937', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <Link
            to="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 12px',
              borderRadius: '6px',
              color: '#9CA3AF',
              textDecoration: 'none',
              fontSize: '13px',
              fontWeight: 500
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
      <main className="admin-main-content">
        <Outlet />
      </main>
    </div>
  );
}
