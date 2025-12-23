import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getSyncStatus, triggerSync } from '../api';
import type { SyncStatus } from '../types';

export default function AdminSync() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [syncMessage, setSyncMessage] = useState('');
    const [syncDetails, setSyncDetails] = useState<{ orders: number; products: number } | null>(null);

    useEffect(() => {
        loadStatus();
        // Refresh status every 30 seconds
        const interval = setInterval(loadStatus, 30000);
        return () => clearInterval(interval);
    }, []);

    const loadStatus = async () => {
        try {
            const data = await getSyncStatus();
            setSyncStatus(data);
        } catch {
            console.error('Failed to load sync status');
        } finally {
            setLoading(false);
        }
    };

    const handleSync = async () => {
        if (!user) return;
        setSyncing(true);
        setSyncMessage('');
        setSyncDetails(null);
        try {
            const result = await triggerSync(user.id);
            setSyncMessage(result.message);
            if (result.success) {
                setSyncDetails({ orders: result.orders_synced, products: result.products_created });
                await loadStatus();
            }
        } catch {
            setSyncMessage('Synchronizacja nie powiodła się');
        } finally {
            setSyncing(false);
        }
    };

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    return (
        <div className="app-container">
            <header className="header">
                <div className="header-content">
                    <h1>Synchronizacja Baselinker</h1>
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
                <Link to="/admin/stats" className="nav-link">Statystyki</Link>
                <Link to="/admin/sync" className="nav-link active">Synchronizacja</Link>
            </nav>

            <main className="main-content">
                <div className="card">
                    <h2>Status synchronizacji</h2>

                    {loading ? (
                        <p>Ładowanie...</p>
                    ) : (
                        <div className="sync-status-grid">
                            <div className="sync-stat">
                                <label>Ostatnia synchronizacja:</label>
                                <span>
                                    {syncStatus?.last_sync_at
                                        ? new Date(syncStatus.last_sync_at).toLocaleString('pl-PL')
                                        : 'Nigdy'}
                                </span>
                            </div>
                            <div className="sync-stat">
                                <label>Timestamp:</label>
                                <span>{syncStatus?.last_sync_timestamp || 0}</span>
                            </div>
                            <div className="sync-stat">
                                <label>ID pola daty wysyłki:</label>
                                <span>{syncStatus?.shipment_date_field_id || 'Nie wykryto'}</span>
                            </div>
                        </div>
                    )}
                </div>

                <div className="card">
                    <h2>Ręczna synchronizacja</h2>
                    <p className="text-muted">
                        Synchronizacja automatyczna uruchamia się co 15 minut. Możesz też uruchomić ją ręcznie.
                    </p>

                    <button
                        onClick={handleSync}
                        disabled={syncing}
                        className="btn-primary btn-lg"
                    >
                        {syncing ? 'Synchronizacja w toku...' : 'Uruchom synchronizację'}
                    </button>

                    {syncMessage && (
                        <div className={`sync-result ${syncDetails ? 'success' : 'error'}`}>
                            <p>{syncMessage}</p>
                            {syncDetails && (
                                <ul>
                                    <li>Zsynchronizowanych zamówień: {syncDetails.orders}</li>
                                    <li>Utworzonych produktów: {syncDetails.products}</li>
                                </ul>
                            )}
                        </div>
                    )}
                </div>

                <div className="card">
                    <h2>Informacje</h2>
                    <ul className="info-list">
                        <li>Synchronizacja pobiera zamówienia z Baselinker od ostatniego znacznika czasu</li>
                        <li>Produkty są tworzone automatycznie na podstawie SKU w zamówieniach</li>
                        <li>Data wysyłki jest pobierana z pól niestandardowych (szuka pola zawierającego "data_wysylki")</li>
                        <li>Istniejące zamówienia są aktualizowane, nowe są dodawane</li>
                    </ul>
                </div>
            </main>
        </div>
    );
}
