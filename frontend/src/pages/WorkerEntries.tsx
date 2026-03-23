import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import WorkerTopBar from '../WorkerTopBar';
import { getActionHistoryPaginated, getOrdersForWorker, updateAction, deleteAction, type ActionHistoryItem } from '../api';
import { ACTION_TYPE_LABELS } from '../types';

const DAYS_PER_PAGE = 10;

function getVisiblePageNumbers(currentPage: number, totalPages: number): Array<number | string> {
    if (totalPages <= 7) {
        return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    const pages: Array<number | string> = [1];
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);

    if (start > 2) pages.push('left-ellipsis');
    for (let page = start; page <= end; page += 1) {
        pages.push(page);
    }
    if (end < totalPages - 1) pages.push('right-ellipsis');
    pages.push(totalPages);

    return pages;
}

function formatDayRange(firstDay: string | null, lastDay: string | null): string {
    if (!firstDay || !lastDay) return '';

    const firstLabel = new Date(firstDay).toLocaleDateString('pl-PL');
    const lastLabel = new Date(lastDay).toLocaleDateString('pl-PL');
    return firstDay === lastDay ? firstLabel : `${lastLabel} - ${firstLabel}`;
}

function formatEntryCount(count: number): string {
    if (count === 1) return '1 wpis';
    const mod10 = count % 10;
    const mod100 = count % 100;

    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
        return `${count} wpisy`;
    }

    return `${count} wpisów`;
}

function formatEntryTimestamp(timestamp: string): string {
    return new Date(timestamp).toLocaleString('pl-PL', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export default function WorkerEntries() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [entries, setEntries] = useState<ActionHistoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalDays, setTotalDays] = useState(0);
    const [pageFirstDay, setPageFirstDay] = useState<string | null>(null);
    const [pageLastDay, setPageLastDay] = useState<string | null>(null);
    const [activeOrdersCount, setActiveOrdersCount] = useState(0);
    const [searchQuery, setSearchQuery] = useState('');

    // Edit state
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editQuantity, setEditQuantity] = useState('');

    useEffect(() => {
        if (!user) {
            navigate('/');
            return;
        }
        loadActiveOrdersCount();
    }, [user]);

    useEffect(() => {
        if (!user) {
            return;
        }

        const timer = setTimeout(() => {
            loadEntries(1);
        }, 300);

        return () => clearTimeout(timer);
    }, [user, searchQuery]);

    async function loadEntries(page = currentPage) {
        if (!user) return;
        setLoading(true);
        try {
            const data = await getActionHistoryPaginated(
                user.id,
                page,
                DAYS_PER_PAGE,
                undefined,
                searchQuery.trim() || undefined,
            );
            setEntries(data.items);
            setCurrentPage(data.page);
            setTotalPages(data.total_pages);
            setTotalDays(data.total_days);
            setPageFirstDay(data.first_day);
            setPageLastDay(data.last_day);
        } catch {
            setError('Nie udało się załadować wpisów');
        } finally {
            setLoading(false);
        }
    }

    async function loadActiveOrdersCount() {
        try {
            const orders = await getOrdersForWorker();
            setActiveOrdersCount(orders.filter(order => order.status === 'in_progress').length);
        } catch {
            console.error('Failed to load active orders count');
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
            loadEntries(currentPage);
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
            loadEntries(currentPage);
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

    const visiblePages = getVisiblePageNumbers(currentPage, totalPages);
    const pageRangeLabel = formatDayRange(pageFirstDay, pageLastDay);

    function handlePageChange(page: number) {
        if (page < 1 || page > totalPages || page === currentPage) return;
        loadEntries(page);
    }

    return (
        <div className="app-container">
            <WorkerTopBar
                activeOrdersCount={activeOrdersCount}
                userName={user?.name}
                onLogout={handleLogout}
            />

            <div className="worker-search-bar">
                <div className="worker-search-input-wrapper">
                    <input
                        type="text"
                        placeholder="Szukaj po SKU..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="search-input"
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            className="worker-search-clear"
                            onClick={() => setSearchQuery('')}
                            aria-label="Wyczyść wyszukiwanie"
                            title="Wyczyść"
                        >
                            ×
                        </button>
                    )}
                </div>
            </div>

            <main className="main-content">
                {error && <div className="error-message" onClick={() => setError(null)}>{error}</div>}
                {success && <div className="success-message" onClick={() => setSuccess(null)}>{success}</div>}

                <div className="card entries-list-card">
                    <div className="card-body entries-card-body">
                        {loading ? (
                            <p>Ładowanie...</p>
                        ) : entries.length === 0 ? (
                            <p className="text-muted">{searchQuery ? 'Brak wyników wyszukiwania' : 'Brak wpisów'}</p>
                        ) : (
                            <>
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
                                                    <td colSpan={6}>
                                                        <div className="entries-group-label">
                                                            <span className="entries-group-date">{group.label}</span>
                                                            <span className="entries-group-count">{formatEntryCount(group.items.length)}</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                                {group.items.map(entry => {
                                                    const canManageEntry = !!user && entry.worker_ids.includes(user.id);
                                                    return (
                                                        <tr key={entry.id}>
                                                            <td data-label="Data">
                                                                <span className="entry-value">{formatEntryTimestamp(entry.timestamp)}</span>
                                                            </td>
                                                            <td data-label="Produkt">
                                                                <span className="entry-value">{entry.product_sku}</span>
                                                            </td>
                                                            <td
                                                                data-label="Akcja"
                                                                className={entry.worker_names.length > 1 ? 'entry-action-cell entry-action-cell-with-workers' : 'entry-action-cell'}
                                                            >
                                                                <span className="entry-value">
                                                                    {ACTION_TYPE_LABELS[entry.action_type as keyof typeof ACTION_TYPE_LABELS] || entry.action_type}
                                                                </span>
                                                                {entry.worker_names.length > 1 && (
                                                                    <div className="entry-subvalue entry-workers-subvalue">
                                                                        Pracownicy: {entry.worker_names.join(', ')}
                                                                    </div>
                                                                )}
                                                                {entry.actor_id !== user?.id && (
                                                                    <div className="entry-subvalue">
                                                                        Wpis dodał: {entry.actor_name}
                                                                    </div>
                                                                )}
                                                            </td>
                                                            <td data-label="Ilość" className="num">
                                                                {editingId === entry.id ? (
                                                                    <span className="entry-value">
                                                                        <input
                                                                            type="number"
                                                                            min="1"
                                                                            value={editQuantity}
                                                                            onChange={(e) => setEditQuantity(e.target.value)}
                                                                            className="qty-input-small"
                                                                            autoFocus
                                                                        />
                                                                    </span>
                                                                ) : (
                                                                    <span className="entry-value">{entry.quantity}</span>
                                                                )}
                                                            </td>
                                                            <td data-label="Koszt" className="num">
                                                                <span className="entry-value">{entry.cost != null ? formatCurrency(entry.cost) : '-'}</span>
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
                                                                    ) : canManageEntry ? (
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
                                                                    ) : (
                                                                        <span className="text-muted">Tylko podgląd</span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        ))}
                                    </table>
                                </div>

                                <div className="pagination-bar">
                                    <div className="pagination-summary">
                                        {pageRangeLabel
                                            ? `Zakres strony: ${pageRangeLabel} • ${totalDays} dni łącznie`
                                            : `Łącznie dni: ${totalDays}`}
                                    </div>
                                    <div className="pagination-controls">
                                        <button
                                            className="pagination-btn"
                                            onClick={() => handlePageChange(currentPage - 1)}
                                            disabled={currentPage === 1}
                                        >
                                            Poprzednia
                                        </button>
                                        {visiblePages.map(page => (
                                            typeof page === 'number' ? (
                                                <button
                                                    key={page}
                                                    className={`pagination-btn pagination-page-btn ${page === currentPage ? 'active' : ''}`}
                                                    onClick={() => handlePageChange(page)}
                                                >
                                                    {page}
                                                </button>
                                            ) : (
                                                <span key={page} className="pagination-ellipsis">…</span>
                                            )
                                        ))}
                                        <button
                                            className="pagination-btn"
                                            onClick={() => handlePageChange(currentPage + 1)}
                                            disabled={currentPage === totalPages}
                                        >
                                            Następna
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
