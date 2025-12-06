import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import WorkerView from './pages/WorkerView';
import AdminDashboard from './pages/AdminDashboard';
import AdminHistory from './pages/AdminHistory';
import AdminAddEntry from './pages/AdminAddEntry';
import type { ReactNode } from 'react';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: 'admin' | 'worker';
}

function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (requiredRole && user.role !== requiredRole) {
    return <Navigate to={user.role === 'admin' ? '/admin' : '/worker'} replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/" element={
        user ? <Navigate to={user.role === 'admin' ? '/admin' : '/worker'} replace /> : <Login />
      } />
      <Route path="/worker" element={
        <ProtectedRoute requiredRole="worker">
          <WorkerView />
        </ProtectedRoute>
      } />
      <Route path="/admin" element={
        <ProtectedRoute requiredRole="admin">
          <AdminDashboard />
        </ProtectedRoute>
      } />
      <Route path="/admin/history" element={
        <ProtectedRoute requiredRole="admin">
          <AdminHistory />
        </ProtectedRoute>
      } />
      <Route path="/admin/add" element={
        <ProtectedRoute requiredRole="admin">
          <AdminAddEntry />
        </ProtectedRoute>
      } />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
