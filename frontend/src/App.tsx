import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import WorkerView from './pages/WorkerView';
import WorkerEntries from './pages/WorkerEntries';
import AdminDashboard from './pages/AdminDashboard';
import AdminOrders from './pages/AdminOrders';
import AdminProducts from './pages/AdminProducts';
import AdminWorkers from './pages/AdminWorkers';
import AdminSync from './pages/AdminSync';
import AdminCosts from './pages/AdminCosts';
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
      <Route path="/worker/entries" element={
        <ProtectedRoute requiredRole="worker">
          <WorkerEntries />
        </ProtectedRoute>
      } />
      <Route path="/admin" element={
        <ProtectedRoute requiredRole="admin">
          <AdminDashboard />
        </ProtectedRoute>
      } />
      <Route path="/admin/orders" element={
        <ProtectedRoute requiredRole="admin">
          <AdminOrders />
        </ProtectedRoute>
      } />
      <Route path="/admin/orders/:orderId" element={
        <ProtectedRoute requiredRole="admin">
          <AdminOrders />
        </ProtectedRoute>
      } />
      <Route path="/admin/products" element={
        <ProtectedRoute requiredRole="admin">
          <AdminProducts />
        </ProtectedRoute>
      } />
      <Route path="/admin/workers" element={
        <ProtectedRoute requiredRole="admin">
          <AdminWorkers />
        </ProtectedRoute>
      } />
      <Route path="/admin/sync" element={
        <ProtectedRoute requiredRole="admin">
          <AdminSync />
        </ProtectedRoute>
      } />
      <Route path="/admin/stats" element={
        <ProtectedRoute requiredRole="admin">
          <AdminCosts />
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
