import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getSyncStatus, triggerSync } from '../api';
import type { SyncSourceResult, SyncStatus } from '../types';

export default function AdminSync() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [syncMessage, setSyncMessage] = useState('');
    const [syncDetails, setSyncDetails] = useState<SyncSourceResult[]>([]);

    useEffect(() => {
        loadStatus();
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
        setSyncDetails([]);
        try {
            const result = await triggerSync(user.id);
            setSyncMessage(result.message);
            setSyncDetails(result.sources);
            await loadStatus();
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
                    <h1>Synchronizacja zamówień</h1>
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
                        <>
                            <div className="sync-status-grid">
                                <div className="sync-stat">
                                    <label>Ostatnia synchronizacja ogółem:</label>
                                    <span>
                                        {syncStatus?.last_sync_at
                                            ? new Date(syncStatus.last_sync_at).toLocaleString('pl-PL')
                                            : 'Nigdy'}
                                    </span>
                                </div>
                                <div className="sync-stat">
                                    <label>Ostatni timestamp:</label>
                                    <span>{syncStatus?.last_sync_timestamp || 0}</span>
                                </div>
                            </div>

                            <div className="sync-status-grid">
                                {(syncStatus?.sources || []).map(source => (
                                    <div key={source.integration} className="sync-stat">
                                        <label>{source.label}</label>
                                        <span>{source.configured ? 'Aktywny' : 'Brak tokenu'}</span>
                                        <span>
                                            {source.last_sync_at
                                                ? new Date(source.last_sync_at).toLocaleString('pl-PL')
                                                : 'Nigdy'}
                                        </span>
                                        {source.shipment_date_field_id && (
                                            <span>Pole daty wysyłki: {source.shipment_date_field_id}</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                <div className="card">
                    <h2>Ręczna synchronizacja</h2>
                    <p className="text-muted">
                        Synchronizacja automatyczna uruchamia się co 5 minut dla wszystkich skonfigurowanych źródeł.
                    </p>

                    <button
                        onClick={handleSync}
                        disabled={syncing}
                        className="btn-primary btn-lg"
                    >
                        {syncing ? 'Synchronizacja w toku...' : 'Uruchom synchronizację'}
                    </button>

                    {syncMessage && (
                        <div className={`sync-result ${syncDetails.length > 0 && syncDetails.every(source => source.success) ? 'success' : 'error'}`}>
                            <p>{syncMessage}</p>
                            {syncDetails.length > 0 && (
                                <ul>
                                    {syncDetails.map(source => (
                                        <li key={source.integration}>
                                            {source.label}: zamówienia {source.orders_synced}, produkty {source.products_created}, {source.success ? 'OK' : source.message}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                </div>

                <div className="card">
                    <h2>Informacje</h2>
                    <ul className="info-list">
                        <li>Synchronizacja pobiera zamówienia z Baselinker i Invitta od ostatniego znacznika czasu każdego źródła</li>
                        <li>Produkty są tworzone automatycznie na podstawie SKU w zamówieniach</li>
                        <li>Data wysyłki jest pobierana z Baselinker; API Invitta nie dokumentuje równoważnego pola</li>
                        <li>Istniejące zamówienia są aktualizowane, nowe są dodawane</li>
                    </ul>
                </div>
            </main>
        </div>
    );
}
