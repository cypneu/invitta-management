import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getProductionSummary, getWorkers } from '../api';
import type { User, ProductionSummary } from '../types';

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [summary, setSummary] = useState<ProductionSummary[]>([]);
  const [workers, setWorkers] = useState<User[]>([]);
  const [selectedWorker, setSelectedWorker] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [selectedWorker, dateFrom, dateTo]);

  useEffect(() => {
    getWorkers().then(setWorkers);
  }, []);

  async function loadData() {
    setLoading(true);
    const data = await getProductionSummary({
      workerId: selectedWorker || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    });
    setSummary(data);
    setLoading(false);
  }

  const totalQuantity = summary.reduce((acc, s) => acc + s.total_quantity, 0);
  const totalEntries = summary.reduce((acc, s) => acc + s.entry_count, 0);

  return (
    <div className="admin-container">
      <header className="header">
        <h1>Admin Dashboard</h1>
        <nav className="nav">
          <Link to="/admin" className="nav-link active">Dashboard</Link>
          <Link to="/admin/history" className="nav-link">History</Link>
        </nav>
        <div className="user-info">
          <span>{user?.name}</span>
          <button onClick={logout} className="btn-secondary">Logout</button>
        </div>
      </header>

      <main className="admin-main">
        <div className="filters-card">
          <h3>Filters</h3>
          <div className="filters-row">
            <div className="form-group">
              <label>Worker</label>
              <select value={selectedWorker} onChange={(e) => setSelectedWorker(e.target.value)}>
                <option value="">All Workers</option>
                {workers.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>From</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="form-group">
              <label>To</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="stats-row">
          <div className="stat-card">
            <span className="stat-value">{totalQuantity}</span>
            <span className="stat-label">Total Items Produced</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{totalEntries}</span>
            <span className="stat-label">Total Entries</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{workers.length}</span>
            <span className="stat-label">Active Workers</span>
          </div>
        </div>

        <div className="summary-card">
          <h3>Production Summary</h3>
          {loading ? (
            <p className="loading">Loading...</p>
          ) : summary.length === 0 ? (
            <p className="empty">No production data found</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Worker</th>
                  <th>Product Type</th>
                  <th>Size</th>
                  <th>Total Qty</th>
                  <th>Entries</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((s, i) => (
                  <tr key={i}>
                    <td>{s.worker_name}</td>
                    <td>{s.product_type}</td>
                    <td>{s.product_size}</td>
                    <td className="num">{s.total_quantity}</td>
                    <td className="num">{s.entry_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
