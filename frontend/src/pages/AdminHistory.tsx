import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getProductionEntries, getWorkers, getProductTypes, updateProductionEntry, deleteProductionEntry } from '../api';
import type { User, ProductionEntry } from '../types';

export default function AdminHistory() {
    const { user, logout } = useAuth();
    const [entries, setEntries] = useState<ProductionEntry[]>([]);
    const [workers, setWorkers] = useState<User[]>([]);
    const [productTypes, setProductTypes] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Filters
    const [selectedWorker, setSelectedWorker] = useState('');
    const [selectedType, setSelectedType] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    // Editing
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editForm, setEditForm] = useState({ product_type: '', width_cm: '', height_cm: '', quantity: '' });

    useEffect(() => {
        Promise.all([
            getWorkers(),
            getProductTypes()
        ]).then(([w, t]) => {
            setWorkers(w);
            setProductTypes(t);
        });
    }, []);

    useEffect(() => {
        loadEntries();
    }, [selectedWorker, selectedType, dateFrom, dateTo]);

    async function loadEntries() {
        setLoading(true);
        const data = await getProductionEntries({
            workerId: selectedWorker || undefined,
            productType: selectedType || undefined,
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
        });
        setEntries(data);
        setLoading(false);
    }

    const handleEdit = (entry: ProductionEntry) => {
        setEditingId(entry.id);
        setEditForm({
            product_type: entry.product_type,
            width_cm: String(entry.width_cm),
            height_cm: String(entry.height_cm),
            quantity: String(entry.quantity)
        });
    };

    const handleSaveEdit = async () => {
        if (!editingId) return;
        setError('');

        try {
            await updateProductionEntry(editingId, user!.id, {
                product_type: editForm.product_type,
                width_cm: parseInt(editForm.width_cm),
                height_cm: parseInt(editForm.height_cm),
                quantity: parseInt(editForm.quantity)
            });
            setEditingId(null);
            loadEntries();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Błąd podczas zapisywania');
        }
    };

    const handleDelete = async (entryId: number) => {
        if (!confirm('Czy na pewno chcesz usunąć ten wpis?')) return;
        setError('');

        try {
            await deleteProductionEntry(entryId, user!.id);
            loadEntries();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Błąd podczas usuwania');
        }
    };

    return (
        <div className="admin-container">
            <header className="header">
                <h1>Historia Produkcji</h1>
                <nav className="nav">
                    <Link to="/admin" className="nav-link">Podsumowanie</Link>
                    <Link to="/admin/history" className="nav-link active">Historia</Link>
                    <Link to="/admin/add" className="nav-link">Dodaj wpis</Link>
                </nav>
                <div className="user-info">
                    <span>{user?.name}</span>
                    <button onClick={logout} className="btn-secondary">Wyloguj</button>
                </div>
            </header>

            <main className="admin-main">
                <div className="filters-card">
                    <h3>Filtry</h3>
                    <div className="filters-row">
                        <div className="form-group">
                            <label>Pracownik</label>
                            <select value={selectedWorker} onChange={(e) => setSelectedWorker(e.target.value)}>
                                <option value="">Wszyscy pracownicy</option>
                                {workers.map(w => (
                                    <option key={w.id} value={w.id}>{w.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Rodzaj</label>
                            <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)}>
                                <option value="">Wszystkie rodzaje</option>
                                {productTypes.map(t => (
                                    <option key={t} value={t}>{t}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Od</label>
                            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label>Do</label>
                            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                        </div>
                    </div>
                </div>

                {error && <div className="error-message">{error}</div>}

                <div className="history-card">
                    <h3>Wpisy ({entries.length})</h3>
                    {loading ? (
                        <p className="loading">Ładowanie...</p>
                    ) : entries.length === 0 ? (
                        <p className="empty">Brak wpisów</p>
                    ) : (
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Data</th>
                                    <th>Pracownik</th>
                                    <th>Rodzaj</th>
                                    <th>Wymiary</th>
                                    <th>Ilość</th>
                                    <th>Koszt/szt.</th>
                                    <th>Akcje</th>
                                </tr>
                            </thead>
                            <tbody>
                                {entries.map(entry => (
                                    <tr key={entry.id}>
                                        {editingId === entry.id ? (
                                            <>
                                                <td>{new Date(entry.created_at).toLocaleDateString('pl-PL')}</td>
                                                <td>{entry.worker_name}</td>
                                                <td>
                                                    <select value={editForm.product_type} onChange={(e) => setEditForm({ ...editForm, product_type: e.target.value })}>
                                                        {productTypes.map(t => <option key={t} value={t}>{t}</option>)}
                                                    </select>
                                                </td>
                                                <td>
                                                    <input type="number" value={editForm.width_cm} onChange={(e) => setEditForm({ ...editForm, width_cm: e.target.value })} min="10" max="2000" style={{ width: '60px' }} />
                                                    ×
                                                    <input type="number" value={editForm.height_cm} onChange={(e) => setEditForm({ ...editForm, height_cm: e.target.value })} min="10" max="2000" style={{ width: '60px' }} />
                                                </td>
                                                <td>
                                                    <input type="number" value={editForm.quantity} onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })} min="1" style={{ width: '60px' }} />
                                                </td>
                                                <td>-</td>
                                                <td className="actions">
                                                    <button onClick={handleSaveEdit} className="btn-icon" title="Zapisz">✅</button>
                                                    <button onClick={() => setEditingId(null)} className="btn-icon" title="Anuluj">❌</button>
                                                </td>
                                            </>
                                        ) : (
                                            <>
                                                <td>{new Date(entry.created_at).toLocaleDateString('pl-PL')}</td>
                                                <td>{entry.worker_name}</td>
                                                <td>{entry.product_type}</td>
                                                <td>{entry.width_cm}×{entry.height_cm} cm</td>
                                                <td className="num">{entry.quantity}</td>
                                                <td className="num">{entry.production_cost.toFixed(2)} zł</td>
                                                <td className="actions">
                                                    <button onClick={() => handleEdit(entry)} className="btn-icon" title="Edytuj">✏️</button>
                                                    <button onClick={() => handleDelete(entry.id)} className="btn-icon btn-danger" title="Usuń">🗑️</button>
                                                </td>
                                            </>
                                        )}
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
