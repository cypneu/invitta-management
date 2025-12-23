import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getWorkerStats, getWorkerSummary, getDailyProduction, getActionBreakdown } from '../api';
import type { ActionType } from '../types';
import { ACTION_TYPE_LABELS } from '../types';

interface WorkerActionStat {
    worker_id: number;
    worker_name: string;
    action_type: ActionType;
    total_quantity: number;
    action_count: number;
}

interface WorkerSummary {
    worker_id: number;
    worker_name: string;
    total_quantity: number;
    action_count: number;
}

interface DailyProduction {
    date: string;
    total_quantity: number;
    action_count: number;
}

interface ActionBreakdown {
    action_type: ActionType;
    total_quantity: number;
    action_count: number;
}

export default function AdminStats() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [workerStats, setWorkerStats] = useState<WorkerActionStat[]>([]);
    const [workerSummary, setWorkerSummary] = useState<WorkerSummary[]>([]);
    const [dailyProduction, setDailyProduction] = useState<DailyProduction[]>([]);
    const [actionBreakdown, setActionBreakdown] = useState<ActionBreakdown[]>([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    useEffect(() => {
        loadStats();
    }, []);

    const loadStats = async () => {
        setLoading(true);
        try {
            const [stats, summary, daily, breakdown] = await Promise.all([
                getWorkerStats(undefined, undefined, dateFrom || undefined, dateTo || undefined),
                getWorkerSummary(dateFrom || undefined, dateTo || undefined),
                getDailyProduction(undefined, dateFrom || undefined, dateTo || undefined),
                getActionBreakdown(dateFrom || undefined, dateTo || undefined),
            ]);
            setWorkerStats(stats);
            setWorkerSummary(summary);
            setDailyProduction(daily);
            setActionBreakdown(breakdown);
        } catch (err) {
            console.error('Failed to load stats:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleFilter = () => {
        loadStats();
    };

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    // Group worker stats by worker
    const workerStatsGrouped = workerStats.reduce((acc, stat) => {
        if (!acc[stat.worker_id]) {
            acc[stat.worker_id] = { name: stat.worker_name, actions: {} };
        }
        acc[stat.worker_id].actions[stat.action_type] = stat.total_quantity;
        return acc;
    }, {} as Record<number, { name: string; actions: Record<string, number> }>);

    const totalQuantity = actionBreakdown.reduce((sum, b) => sum + b.total_quantity, 0);

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
                <div className="card">
                    <h2>Filtry</h2>
                    <div className="filters-row">
                        <div className="form-group">
                            <label>Od daty</label>
                            <input
                                type="date"
                                value={dateFrom}
                                onChange={e => setDateFrom(e.target.value)}
                            />
                        </div>
                        <div className="form-group">
                            <label>Do daty</label>
                            <input
                                type="date"
                                value={dateTo}
                                onChange={e => setDateTo(e.target.value)}
                            />
                        </div>
                        <button className="btn-primary" onClick={handleFilter}>Filtruj</button>
                    </div>
                </div>

                {loading ? (
                    <p>Ładowanie...</p>
                ) : (
                    <>
                        {/* Summary cards */}
                        <div className="dashboard-grid">
                            <div className="card stat-card">
                                <h3>Łącznie wyprodukowano</h3>
                                <div className="stat-value">{totalQuantity}</div>
                                <span className="stat-label">sztuk</span>
                            </div>
                            <div className="card stat-card">
                                <h3>Aktywnych pracowników</h3>
                                <div className="stat-value">{workerSummary.length}</div>
                                <span className="stat-label">osób</span>
                            </div>
                        </div>

                        {/* Action breakdown */}
                        <div className="card">
                            <h2>Podział według typu akcji</h2>
                            <div className="action-breakdown-grid">
                                {actionBreakdown.map(b => (
                                    <div key={b.action_type} className="breakdown-item">
                                        <span className={`action-badge action-${b.action_type}`}>
                                            {ACTION_TYPE_LABELS[b.action_type]}
                                        </span>
                                        <div className="breakdown-value">{b.total_quantity}</div>
                                        <small className="text-muted">{b.action_count} akcji</small>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Worker summary table */}
                        <div className="card">
                            <h2>Ranking pracowników</h2>
                            {workerSummary.length === 0 ? (
                                <p className="text-muted">Brak danych</p>
                            ) : (
                                <div className="table-wrapper">
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th>#</th>
                                                <th>Pracownik</th>
                                                <th>Łącznie sztuk</th>
                                                <th>Liczba akcji</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {workerSummary.map((w, idx) => (
                                                <tr key={w.worker_id}>
                                                    <td>{idx + 1}</td>
                                                    <td>{w.worker_name}</td>
                                                    <td className="num">{w.total_quantity}</td>
                                                    <td className="num">{w.action_count}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Detailed breakdown by worker and action type */}
                        <div className="card">
                            <h2>Szczegóły według pracownika i typu akcji</h2>
                            {Object.keys(workerStatsGrouped).length === 0 ? (
                                <p className="text-muted">Brak danych</p>
                            ) : (
                                <div className="table-wrapper">
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th>Pracownik</th>
                                                <th>Krojenie</th>
                                                <th>Szycie</th>
                                                <th>Prasowanie</th>
                                                <th>Pakowanie</th>
                                                <th>Suma</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {Object.entries(workerStatsGrouped).map(([id, data]) => {
                                                const cutting = data.actions['cutting'] || 0;
                                                const sewing = data.actions['sewing'] || 0;
                                                const ironing = data.actions['ironing'] || 0;
                                                const packing = data.actions['packing'] || 0;
                                                const total = cutting + sewing + ironing + packing;
                                                return (
                                                    <tr key={id}>
                                                        <td>{data.name}</td>
                                                        <td className="num">{cutting}</td>
                                                        <td className="num">{sewing}</td>
                                                        <td className="num">{ironing}</td>
                                                        <td className="num">{packing}</td>
                                                        <td className="num"><strong>{total}</strong></td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Daily production */}
                        <div className="card">
                            <h2>Produkcja dzienna</h2>
                            {dailyProduction.length === 0 ? (
                                <p className="text-muted">Brak danych</p>
                            ) : (
                                <div className="table-wrapper">
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th>Data</th>
                                                <th>Ilość</th>
                                                <th>Akcje</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {dailyProduction.slice(0, 14).map(d => (
                                                <tr key={d.date}>
                                                    <td>{d.date}</td>
                                                    <td className="num">{d.total_quantity}</td>
                                                    <td className="num">{d.action_count}</td>
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
