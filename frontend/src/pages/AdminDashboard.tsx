import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AdminTopBar from '../AdminTopBar';
import { getOrders, getSyncStatus, triggerSync } from '../api';
import type { OrderListItem, SyncStatus } from '../types';
import { ORDER_STATUS_LABELS } from '../types';

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

  const orderCounts = useMemo(() => ({
    all: orders.length,
    in_progress: orders.filter(order => order.status === 'in_progress').length,
    done: orders.filter(order => order.status === 'done').length,
  }), [orders]);

  const orderSummaryItems = [
    { key: 'all', label: 'Wszystkie', value: orderCounts.all },
    { key: 'in_progress', label: ORDER_STATUS_LABELS.in_progress, value: orderCounts.in_progress },
    { key: 'done', label: ORDER_STATUS_LABELS.done, value: orderCounts.done },
  ];

  const upcomingOrders = orders
    .filter(o => o.expected_shipment_date)
    .sort((a, b) => new Date(a.expected_shipment_date!).getTime() - new Date(b.expected_shipment_date!).getTime())
    .slice(0, 5);

  return (
    <div className="app-container">
      <AdminTopBar userName={user?.name} onLogout={handleLogout} />

      <main className="main-content">
        {loading ? (
          <p>Ładowanie...</p>
        ) : (
          <>
            <div className="dashboard-grid">
              <div className="card dashboard-orders-card">
                <div className="dashboard-orders-header">
                  <h3>Zamówienia</h3>
                  <Link to="/admin/orders" className="stat-link">Zobacz wszystkie →</Link>
                </div>
                <div className="dashboard-orders-summary">
                  {orderSummaryItems.map(item => (
                    <div key={item.key} className="dashboard-orders-summary-item">
                      <span className="dashboard-orders-summary-label">{item.label}</span>
                      <span className="dashboard-orders-summary-value">{item.value}</span>
                    </div>
                  ))}
                </div>
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
