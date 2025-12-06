import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getProductionEntries, getWorkers, getProductTypes, getProductSizes } from '../api';
import type { User, ProductionEntry } from '../types';

export default function AdminHistory() {
    const { user, logout } = useAuth();
    const [entries, setEntries] = useState<ProductionEntry[]>([]);
    const [workers, setWorkers] = useState<User[]>([]);
    const [productTypes, setProductTypes] = useState<string[]>([]);
    const [productSizes, setProductSizes] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const [selectedWorker, setSelectedWorker] = useState('');
    const [selectedType, setSelectedType] = useState('');
    const [selectedSize, setSelectedSize] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    useEffect(() => {
        Promise.all([
            getWorkers(),
            getProductTypes(),
            getProductSizes()
        ]).then(([w, t, s]) => {
            setWorkers(w);
            setProductTypes(t);
            setProductSizes(s);
        });
    }, []);

    useEffect(() => {
        loadEntries();
    }, [selectedWorker, selectedType, selectedSize, dateFrom, dateTo]);

    async function loadEntries() {
        setLoading(true);
        const data = await getProductionEntries({
            workerId: selectedWorker || undefined,
            productType: selectedType || undefined,
            productSize: selectedSize || undefined,
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
        });
        setEntries(data);
        setLoading(false);
    }

    function formatDate(dateString: string): string {
        return new Date(dateString).toLocaleString();
    }

    return (
        <div className="admin-container">
            <header className="header">
                <h1>Production History</h1>
                <nav className="nav">
                    <Link to="/admin" className="nav-link">Dashboard</Link>
                    <Link to="/admin/history" className="nav-link active">History</Link>
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
                            <label>Type</label>
                            <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)}>
                                <option value="">All Types</option>
                                {productTypes.map(t => (
                                    <option key={t} value={t}>{t}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Size</label>
                            <select value={selectedSize} onChange={(e) => setSelectedSize(e.target.value)}>
                                <option value="">All Sizes</option>
                                {productSizes.map(s => (
                                    <option key={s} value={s}>{s}</option>
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

                <div className="history-card">
                    <h3>Entries ({entries.length})</h3>
                    {loading ? (
                        <p className="loading">Loading...</p>
                    ) : entries.length === 0 ? (
                        <p className="empty">No entries found</p>
                    ) : (
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Date/Time</th>
                                    <th>Worker</th>
                                    <th>Product Type</th>
                                    <th>Size</th>
                                    <th>Quantity</th>
                                </tr>
                            </thead>
                            <tbody>
                                {entries.map(entry => (
                                    <tr key={entry.id}>
                                        <td>{formatDate(entry.created_at)}</td>
                                        <td>{entry.worker_name}</td>
                                        <td>{entry.product_type}</td>
                                        <td>{entry.product_size}</td>
                                        <td className="num">{entry.quantity}</td>
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
