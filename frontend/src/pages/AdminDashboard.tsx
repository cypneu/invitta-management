import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getOrders, getSyncStatus, triggerSync } from '../api';
import type { OrderListItem, SyncStatus } from '../types';

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [ordersData, statusData] = await Promise.all([
        getOrders(),
        getSyncStatus(),
      ]);
      setOrders(ordersData);
      setSyncStatus(statusData);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    if (!user) return;
    setSyncing(true);
    setSyncMessage('');
    try {
      const result = await triggerSync(user.id);
      setSyncMessage(result.message);
      if (result.success) {
        await loadData();
      }
    } catch (err) {
      setSyncMessage('Synchronizacja nie powiodła się');
    } finally {
      setSyncing(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const upcomingOrders = orders
    .filter(o => o.expected_shipment_date)
    .sort((a, b) => new Date(a.expected_shipment_date!).getTime() - new Date(b.expected_shipment_date!).getTime())
    .slice(0, 5);

  return (
    <div className="app-container">
      <header className="header">
        <div className="header-content">
          <h1>Panel Administratora</h1>
          <div className="header-user">
            <span>{user?.name}</span>
            <button onClick={handleLogout} className="btn-secondary btn-sm">Wyloguj</button>
          </div>
        </div>
      </header>

      <nav className="admin-nav">
        <Link to="/admin" className="nav-link active">Dashboard</Link>
        <Link to="/admin/orders" className="nav-link">Zamówienia</Link>
        <Link to="/admin/products" className="nav-link">Produkty</Link>
        <Link to="/admin/workers" className="nav-link">Pracownicy</Link>
        <Link to="/admin/stats" className="nav-link">Statystyki</Link>
      </nav>

      <main className="main-content">
        {loading ? (
          <p>Ładowanie...</p>
        ) : (
          <>
            <div className="dashboard-grid">
              <div className="card stat-card">
                <h3>Zamówienia</h3>
                <div className="stat-value">{orders.length}</div>
                <Link to="/admin/orders" className="stat-link">Zobacz wszystkie →</Link>
              </div>

              <div className="card stat-card">
                <h3>Ostatnia synchronizacja</h3>
                <div className="stat-value">
                  {syncStatus?.last_sync_at
                    ? new Date(syncStatus.last_sync_at).toLocaleString('pl-PL')
                    : 'Nigdy'}
                </div>
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="btn-primary btn-sm stat-button"
                >
                  {syncing ? 'Synchronizacja...' : 'Synchronizuj teraz'}
                </button>
                {syncMessage && <p className="sync-message">{syncMessage}</p>}
              </div>
            </div>

            <div className="card">
              <h2>Nadchodzące wysyłki</h2>
              {upcomingOrders.length === 0 ? (
                <p className="text-muted">Brak zamówień z datą wysyłki</p>
              ) : (
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Klient</th>
                        <th>Źródło</th>
                        <th>Data wysyłki</th>
                        <th>Pozycje</th>
                      </tr>
                    </thead>
                    <tbody>
                      {upcomingOrders.map(order => (
                        <tr key={order.id}>
                          <td>
                            <Link to={`/admin/orders/${order.id}`}>#{order.id}</Link>
                          </td>
                          <td>{order.fullname || order.company || '-'}</td>
                          <td>{order.source || '-'}</td>
                          <td>{order.expected_shipment_date}</td>
                          <td>{order.position_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
