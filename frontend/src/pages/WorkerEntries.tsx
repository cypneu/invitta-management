import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getActionHistory, updateAction, deleteAction, type ActionHistoryItem } from '../api';
import { ACTION_TYPE_LABELS } from '../types';

// Helper to get current week's Monday and Sunday
function getCurrentWeekDates(): { monday: string; sunday: string } {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    return {
        monday: monday.toISOString().split('T')[0],
        sunday: sunday.toISOString().split('T')[0],
    };
}

export default function WorkerEntries() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const weekDates = getCurrentWeekDates();
    const [dateFrom, setDateFrom] = useState(weekDates.monday);
    const [dateTo, setDateTo] = useState(weekDates.sunday);
    const [entries, setEntries] = useState<ActionHistoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    // Edit state
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editQuantity, setEditQuantity] = useState('');

    useEffect(() => {
        if (!user) {
            navigate('/');
            return;
        }
        loadEntries();
    }, [user, dateFrom, dateTo]);

    async function loadEntries() {
        if (!user) return;
        setLoading(true);
        try {
            const items = await getActionHistory(user.id, dateFrom || undefined, dateTo || undefined);
            setEntries(items);
        } catch {
            setError('Nie udało się załadować wpisów');
        } finally {
            setLoading(false);
        }
    }

    async function handleUpdate(entryId: number) {
        if (!user || submitting) return;
        const qty = parseInt(editQuantity);
        if (qty <= 0) {
            setError('Ilość musi być większa od 0');
            return;
        }

        setSubmitting(true);
        try {
            await updateAction(user.id, entryId, qty);
            setEditingId(null);
            setSuccess('Zaktualizowano');
            loadEntries();
            setTimeout(() => setSuccess(null), 2000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Błąd aktualizacji');
        } finally {
            setSubmitting(false);
        }
    }

    async function handleDelete(entryId: number) {
        if (!user || submitting) return;
        if (!confirm('Czy na pewno chcesz usunąć ten wpis?')) return;

        setSubmitting(true);
        try {
            await deleteAction(user.id, entryId);
            setSuccess('Usunięto');
            loadEntries();
            setTimeout(() => setSuccess(null), 2000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Błąd usuwania');
        } finally {
            setSubmitting(false);
        }
    }

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    const formatCurrency = (value: number) => `${value.toFixed(2)} zł`;
    const formatDayKey = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const groupedEntries = (() => {
        const groups: { key: string; label: string; items: ActionHistoryItem[] }[] = [];
        for (const entry of entries) {
            const date = new Date(entry.timestamp);
            const key = formatDayKey(date);
            const label = date.toLocaleDateString('pl-PL');
            const lastGroup = groups[groups.length - 1];
            if (lastGroup && lastGroup.key === key) {
                lastGroup.items.push(entry);
            } else {
                groups.push({ key, label, items: [entry] });
            }
        }
        return groups;
    })();

    return (
        <div className="app-container">
            <header className="header">
                <div className="header-content">
                    <h1 className="hide-mobile">Moje wpisy</h1>
                    <div className="header-user">
                        <span>{user?.name}</span>
                        <button onClick={handleLogout} className="btn-secondary btn-sm">Wyloguj</button>
                    </div>
                </div>
            </header>

            <nav className="admin-nav">
                <Link to="/worker" className="nav-link">Zamówienia</Link>
                <Link to="/worker/entries" className="nav-link active">Moje wpisy</Link>
            </nav>

            <main className="main-content">
                {error && <div className="error-message" onClick={() => setError(null)}>{error}</div>}
                {success && <div className="success-message" onClick={() => setSuccess(null)}>{success}</div>}

                <div className="card entries-filters-card">
                    <div className="card-header">
                        <h2>Filtry</h2>
                    </div>
                    <div className="card-body">
                        <div className="filters-row entries-filters">
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
                        </div>
                    </div>
                </div>

                <div className="card entries-list-card">
                    <div className="card-header">
                        <h2>Wpisy ({entries.length})</h2>
                    </div>
                    <div className="card-body">
                        {loading ? (
                            <p>Ładowanie...</p>
                        ) : entries.length === 0 ? (
                            <p className="text-muted">Brak wpisów w wybranym okresie</p>
                        ) : (
                            <div className="table-responsive">
                                <table className="data-table entries-table">
                                    <thead>
                                        <tr>
                                            <th>Data</th>
                                            <th>Produkt</th>
                                            <th>Akcja</th>
                                            <th className="num">Ilość</th>
                                            <th className="num">Koszt</th>
                                            <th>Akcje</th>
                                        </tr>
                                    </thead>
                                    {groupedEntries.map((group) => (
                                        <tbody key={group.key}>
                                            <tr className="entries-group-row">
                                                <td colSpan={6}>{group.label}</td>
                                            </tr>
                                            {group.items.map(entry => (
                                                <tr key={entry.id}>
                                                    <td data-label="Data">
                                                        <span className="entry-value">{new Date(entry.timestamp).toLocaleString('pl-PL')}</span>
                                                    </td>
                                                    <td data-label="Produkt">
                                                        <span className="entry-value">{entry.product_sku}</span>
                                                    </td>
                                                    <td data-label="Akcja">
                                                        <span className="entry-value">
                                                            {ACTION_TYPE_LABELS[entry.action_type as keyof typeof ACTION_TYPE_LABELS] || entry.action_type}
                                                        </span>
                                                    </td>
                                                    <td data-label="Ilość" className="num">
                                                        {editingId === entry.id ? (
                                                            <span className="entry-value">
                                                                <input
                                                                    type="number"
                                                                    min="1"
                                                                    value={editQuantity}
                                                                    onChange={(e) => setEditQuantity(e.target.value)}
                                                                    className="qty-input-sm"
                                                                    autoFocus
                                                                />
                                                            </span>
                                                        ) : (
                                                            <span className="entry-value">{entry.quantity}</span>
                                                        )}
                                                    </td>
                                                    <td data-label="Koszt" className="num">
                                                        <span className="entry-value">{entry.cost ? formatCurrency(entry.cost) : '-'}</span>
                                                    </td>
                                                    <td data-label="Akcje" className="actions-cell">
                                                        <div className="entry-actions">
                                                            {editingId === entry.id ? (
                                                                <>
                                                                    <button
                                                                        className="btn-primary btn-xs"
                                                                        onClick={() => handleUpdate(entry.id)}
                                                                        disabled={submitting}
                                                                    >
                                                                        ✓
                                                                    </button>
                                                                    <button
                                                                        className="btn-secondary btn-xs"
                                                                        onClick={() => setEditingId(null)}
                                                                    >
                                                                        ×
                                                                    </button>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <button
                                                                        className="btn-secondary btn-xs"
                                                                        onClick={() => {
                                                                            setEditingId(entry.id);
                                                                            setEditQuantity(String(entry.quantity));
                                                                        }}
                                                                    >
                                                                        ✎
                                                                    </button>
                                                                    <button
                                                                        className="btn-danger btn-xs"
                                                                        onClick={() => handleDelete(entry.id)}
                                                                        disabled={submitting}
                                                                    >
                                                                        ×
                                                                    </button>
                                                                </>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    ))}
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
