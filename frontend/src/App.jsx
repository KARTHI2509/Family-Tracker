import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { FamilyProvider } from './context/FamilyContext';
import Login from './components/Auth/Login';
import Register from './components/Auth/Register';
import FamilySetup from './components/Auth/FamilySetup';
import Dashboard from './components/Dashboard/Dashboard';
import AdminLayout from './components/Admin/AdminLayout';
import AdminDashboard from './components/Admin/AdminDashboard';
import AdminUsers from './components/Admin/AdminUsers';
import AdminFamilies from './components/Admin/AdminFamilies';
import AdminEmergencies from './components/Admin/AdminEmergencies';
import AdminAuditLogs from './components/Admin/AdminAuditLogs';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Loading...</p>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (user && !user.family_id) return <Navigate to="/setup" replace />;
  return children;
}

function SetupRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Loading...</p>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (user && user.family_id) return <Navigate to="/" replace />;
  return children;
}

function GuestRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Loading...</p>
      </div>
    );
  }
  if (user && user.family_id) return <Navigate to="/" replace />;
  if (user && !user.family_id) return <Navigate to="/setup" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
      <Route path="/register" element={<GuestRoute><Register /></GuestRoute>} />
      <Route path="/setup" element={<SetupRoute><FamilySetup /></SetupRoute>} />
      {/* Super Admin Portal */}
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="families" element={<AdminFamilies />} />
        <Route path="emergencies" element={<AdminEmergencies />} />
        <Route path="audit-logs" element={<AdminAuditLogs />} />
      </Route>

      <Route path="/" element={
        <ProtectedRoute>
          <FamilyProvider>
            <Dashboard />
          </FamilyProvider>
        </ProtectedRoute>
      } />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
