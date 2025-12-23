import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getCostConfig,
  updateCostConfig,
  getCostSummary,
  getCostsByWorker,
  getActionHistory,
  getWorkers,
  type CostConfig,
  type CostSummary,
  type WorkerCostDetail,
  type ActionHistoryItem,
} from '../api';
import { ACTION_TYPE_LABELS, type ActionType, type User } from '../types';

const EDGE_TYPES = ['U3', 'U4', 'U5', 'O1', 'O3', 'O5', 'OGK', 'LA'];
const ACTION_TYPES: ActionType[] = ['cutting', 'sewing', 'ironing', 'packing'];

// Helper to get current week's Monday and Sunday
function getCurrentWeekDates(): { monday: string; sunday: string } {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, ...
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    monday: monday.toISOString().split('T')[0],
    sunday: sunday.toISOString().split('T')[0],
  };
}

export default function AdminCosts() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'summary' | 'history' | 'settings'>('summary');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Date filters - default to current week
  const weekDates = getCurrentWeekDates();
  const [dateFrom, setDateFrom] = useState(weekDates.monday);
  const [dateTo, setDateTo] = useState(weekDates.sunday);

  // Summary data
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [workerCosts, setWorkerCosts] = useState<WorkerCostDetail[]>([]);

  // Config
  const [config, setConfig] = useState<CostConfig | null>(null);
  const [saving, setSaving] = useState(false);

  // History
  const [historyItems, setHistoryItems] = useState<ActionHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [workers, setWorkers] = useState<User[]>([]);
  const [workerFilter, setWorkerFilter] = useState('');
  const [actionFilter, setActionFilter] = useState<ActionType | ''>('');

  useEffect(() => {
    loadData();
    loadWorkers();
  }, []);

  useEffect(() => {
    if (activeTab === 'summary') {
      loadSummary();
    } else if (activeTab === 'history') {
      loadHistory();
    }
  }, [dateFrom, dateTo, activeTab, workerFilter, actionFilter]);

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const workerId = workerFilter ? parseInt(workerFilter, 10) : undefined;
      const items = await getActionHistory(workerId, dateFrom || undefined, dateTo || undefined, actionFilter || undefined);
      setHistoryItems(items);
    } catch {
      // Ignore
    } finally {
      setLoadingHistory(false);
    }
  }

  async function loadWorkers() {
    try {
      const workerData = await getWorkers();
      setWorkers(workerData);
    } catch {
      // Ignore
    }
  }

  async function loadData() {
    try {
      setLoading(true);
      const [configData, summaryData, workerData] = await Promise.all([
        getCostConfig(),
        getCostSummary(dateFrom || undefined, dateTo || undefined),
        getCostsByWorker(dateFrom || undefined, dateTo || undefined),
      ]);
      setConfig(configData);
      setSummary(summaryData);
      setWorkerCosts(workerData);
    } catch (err) {
      setError('Nie udało się załadować danych');
    } finally {
      setLoading(false);
    }
  }

  async function loadSummary() {
    try {
      const [summaryData, workerData] = await Promise.all([
        getCostSummary(dateFrom || undefined, dateTo || undefined),
        getCostsByWorker(dateFrom || undefined, dateTo || undefined),
      ]);
      setSummary(summaryData);
      setWorkerCosts(workerData);
    } catch {
      // Ignore refresh errors
    }
  }

  async function handleSaveConfig() {
    if (!user || !config) return;

    setSaving(true);
    setError(null);
    try {
      const updated = await updateCostConfig(user.id, config);
      setConfig(updated);
      setSuccess('Konfiguracja zapisana');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się zapisać');
    } finally {
      setSaving(false);
    }
  }

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const formatCurrency = (value: number) => `${value.toFixed(2)} zł`;

  return (
    <div className="app-container">
      <header className="header">
        <div className="header-content">
          <h1>Statystyki produkcji</h1>
          <div className="header-user">
            <span>{user?.name}</span>
            <button onClick={handleLogout} className="btn-secondary btn-sm">Wyloguj</button>
          </div>
        </div>
      </header>

      <nav className="admin-nav">
        <Link to="/admin" className="nav-link">Dashboard</Link>
        <Link to="/admin/orders" className="nav-link">Zamówienia</Link>
        <Link to="/admin/products" className="nav-link">Produkty</Link>
        <Link to="/admin/workers" className="nav-link">Pracownicy</Link>
        <Link to="/admin/stats" className="nav-link active">Statystyki</Link>
      </nav>

      <main className="main-content">
        {error && <div className="error-message" onClick={() => setError(null)}>{error}</div>}
        {success && <div className="success-message" onClick={() => setSuccess(null)}>{success}</div>}

        <div className="status-tabs">
          <button
            className={`status-tab ${activeTab === 'summary' ? 'active' : ''}`}
            onClick={() => setActiveTab('summary')}
          >
            Podsumowanie
          </button>
          <button
            className={`status-tab ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            Historia wpisów
          </button>
          <button
            className={`status-tab ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            Ustawienia
          </button>
        </div>

        {loading ? (
          <p>Ładowanie...</p>
        ) : activeTab === 'summary' ? (
          <div className="costs-summary">
            <div className="card">
              <div className="card-header">
                <h2>Filtry</h2>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Od daty</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Do daty</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {summary && (
              <div className="card">
                <h2>Koszty ogólne</h2>
                <div className="stat-value" style={{ fontSize: '2rem', color: 'var(--color-primary)' }}>
                  {formatCurrency(summary.total_cost)}
                </div>

                <h3>Według typu akcji</h3>
                <div className="action-breakdown-grid">
                  {Object.entries(summary.by_action_type).map(([type, cost]) => (
                    <div key={type} className="breakdown-item">
                      <span>{ACTION_TYPE_LABELS[type as keyof typeof ACTION_TYPE_LABELS] || type}</span>
                      <span className="breakdown-value">{formatCurrency(cost)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {workerCosts.length > 0 && (
              <div className="card">
                <h2>Koszty według pracowników</h2>
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th rowSpan={2}>Pracownik</th>
                        <th colSpan={4}>Sztuki</th>
                        <th colSpan={5}>Koszty (zł)</th>
                      </tr>
                      <tr>
                        <th>Kroj.</th>
                        <th>Szycie</th>
                        <th>Pras.</th>
                        <th>Pak.</th>
                        <th>Kroj.</th>
                        <th>Szycie</th>
                        <th>Pras.</th>
                        <th>Pak.</th>
                        <th>Suma</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workerCosts.map((worker) => (
                        <tr key={worker.worker_id}>
                          <td><strong>{worker.worker_name}</strong></td>
                          <td className="num">{worker.quantity_by_action_type.cutting || 0}</td>
                          <td className="num">{worker.quantity_by_action_type.sewing || 0}</td>
                          <td className="num">{worker.quantity_by_action_type.ironing || 0}</td>
                          <td className="num">{worker.quantity_by_action_type.packing || 0}</td>
                          <td className="num">{formatCurrency(worker.by_action_type.cutting || 0)}</td>
                          <td className="num">{formatCurrency(worker.by_action_type.sewing || 0)}</td>
                          <td className="num">{formatCurrency(worker.by_action_type.ironing || 0)}</td>
                          <td className="num">{formatCurrency(worker.by_action_type.packing || 0)}</td>
                          <td className="num"><strong>{formatCurrency(worker.total_cost)}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td><strong>RAZEM</strong></td>
                        <td className="num"><strong>{workerCosts.reduce((s, w) => s + (w.quantity_by_action_type.cutting || 0), 0)}</strong></td>
                        <td className="num"><strong>{workerCosts.reduce((s, w) => s + (w.quantity_by_action_type.sewing || 0), 0)}</strong></td>
                        <td className="num"><strong>{workerCosts.reduce((s, w) => s + (w.quantity_by_action_type.ironing || 0), 0)}</strong></td>
                        <td className="num"><strong>{workerCosts.reduce((s, w) => s + (w.quantity_by_action_type.packing || 0), 0)}</strong></td>
                        <td className="num"><strong>{formatCurrency(workerCosts.reduce((s, w) => s + (w.by_action_type.cutting || 0), 0))}</strong></td>
                        <td className="num"><strong>{formatCurrency(workerCosts.reduce((s, w) => s + (w.by_action_type.sewing || 0), 0))}</strong></td>
                        <td className="num"><strong>{formatCurrency(workerCosts.reduce((s, w) => s + (w.by_action_type.ironing || 0), 0))}</strong></td>
                        <td className="num"><strong>{formatCurrency(workerCosts.reduce((s, w) => s + (w.by_action_type.packing || 0), 0))}</strong></td>
                        <td className="num"><strong>{formatCurrency(summary?.total_cost || 0)}</strong></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : activeTab === 'history' ? (
          <div className="costs-summary">
            <div className="card">
              <div className="card-header">
                <h2>Filtry</h2>
              </div>
              <div className="card-body">
                <div className="filters-row">
                  <div className="form-group">
                    <label>Od</label>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Do</label>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Pracownik</label>
                    <select
                      value={workerFilter}
                      onChange={(e) => setWorkerFilter(e.target.value)}
                    >
                      <option value="">Wszyscy</option>
                      {workers.map((worker) => (
                        <option key={worker.id} value={worker.id}>
                          {worker.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Akcja</label>
                    <select
                      value={actionFilter}
                      onChange={(e) => setActionFilter(e.target.value as ActionType | '')}
                    >
                      <option value="">Wszystkie</option>
                      {ACTION_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {ACTION_TYPE_LABELS[type]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <h2>Historia wpisów ({historyItems.length})</h2>
              </div>
              <div className="card-body">
                {loadingHistory ? (
                  <p>Ładowanie...</p>
                ) : historyItems.length === 0 ? (
                  <p className="text-muted">Brak wpisów w wybranym okresie</p>
                ) : (
                  <div className="table-responsive">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Data</th>
                          <th>Pracownik</th>
                          <th>Produkt</th>
                          <th>Akcja</th>
                          <th className="num">Ilość</th>
                          <th className="num">Koszt</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historyItems.map(item => (
                          <tr key={item.id}>
                            <td>{new Date(item.timestamp).toLocaleString('pl-PL')}</td>
                            <td>{item.actor_name}</td>
                            <td>{item.product_sku}</td>
                            <td>{ACTION_TYPE_LABELS[item.action_type as keyof typeof ACTION_TYPE_LABELS] || item.action_type}</td>
                            <td className="num">{item.quantity}</td>
                            <td className="num">{item.cost ? formatCurrency(item.cost) : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : config && (
          <div className="costs-settings">
            <div className="card">
              <h2>Współczynniki podstawowe</h2>
              <div className="form-grid">
                <div className="form-group">
                  <label>Lag factor</label>
                  <input
                    type="number"
                    step="0.001"
                    value={config.lag_factor}
                    onChange={(e) => setConfig({ ...config, lag_factor: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="form-group">
                  <label>Cutting factor</label>
                  <input
                    type="number"
                    step="0.001"
                    value={config.cutting_factor}
                    onChange={(e) => setConfig({ ...config, cutting_factor: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="form-group">
                  <label>Ironing factor</label>
                  <input
                    type="number"
                    step="0.001"
                    value={config.ironing_factor}
                    onChange={(e) => setConfig({ ...config, ironing_factor: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="form-group">
                  <label>Prepacking factor</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={config.prepacking_factor}
                    onChange={(e) => setConfig({ ...config, prepacking_factor: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="form-group">
                  <label>Packing factor</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={config.packing_factor}
                    onChange={(e) => setConfig({ ...config, packing_factor: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>
            </div>

            <div className="card">
              <h2>Szycie narożników</h2>
              <div className="form-grid">
                {EDGE_TYPES.map((et) => (
                  <div key={et} className="form-group">
                    <label>{et}</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={config.corner_sewing_factors[et] || 0}
                      onChange={(e) => setConfig({
                        ...config,
                        corner_sewing_factors: {
                          ...config.corner_sewing_factors,
                          [et]: parseFloat(e.target.value) || 0,
                        },
                      })}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <h2>Szycie brzegów</h2>
              <div className="form-grid">
                {EDGE_TYPES.map((et) => (
                  <div key={et} className="form-group">
                    <label>{et}</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={config.sewing_factors[et] || 0}
                      onChange={(e) => setConfig({
                        ...config,
                        sewing_factors: {
                          ...config.sewing_factors,
                          [et]: parseFloat(e.target.value) || 0,
                        },
                      })}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <h2>Odpady materiałowe [cm]</h2>
              <div className="form-grid">
                {EDGE_TYPES.map((et) => (
                  <div key={et} className="form-group">
                    <label>{et}</label>
                    <input
                      type="number"
                      value={config.material_waste[et] || 0}
                      onChange={(e) => setConfig({
                        ...config,
                        material_waste: {
                          ...config.material_waste,
                          [et]: parseInt(e.target.value) || 0,
                        },
                      })}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="form-actions">
              <button
                onClick={handleSaveConfig}
                disabled={saving}
                className="btn-primary"
              >
                {saving ? 'Zapisywanie...' : 'Zapisz konfigurację'}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
