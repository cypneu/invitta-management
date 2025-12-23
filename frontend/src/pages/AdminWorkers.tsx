import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getWorkers, createWorker, updateWorker, deleteWorker } from '../api';
import type { User, UserCreate, ActionType } from '../types';
import { ACTION_TYPE_LABELS } from '../types';

const ALL_ACTION_TYPES: ActionType[] = ['cutting', 'sewing', 'ironing', 'packing'];

export default function AdminWorkers() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [workers, setWorkers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Form state
    const [showForm, setShowForm] = useState(false);
    const [editingWorker, setEditingWorker] = useState<User | null>(null);
    const [formData, setFormData] = useState<UserCreate>({
        first_name: '',
        last_name: '',
        code: '',
        allowed_action_types: [],
    });

    useEffect(() => {
        loadWorkers();
    }, []);

    const loadWorkers = async () => {
        setLoading(true);
        try {
            const data = await getWorkers();
            setWorkers(data);
        } catch {
            setError('Nie udało się załadować pracowników');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setError('');
        setSuccess('');

        try {
            if (editingWorker) {
                await updateWorker(user.id, editingWorker.id, formData);
                setSuccess('Pracownik zaktualizowany');
            } else {
                await createWorker(user.id, formData);
                setSuccess('Pracownik utworzony');
            }
            resetForm();
            await loadWorkers();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Operacja nie powiodła się');
        }
    };

    const handleEdit = (worker: User) => {
        setEditingWorker(worker);
        setFormData({
            first_name: worker.first_name,
            last_name: worker.last_name,
            code: worker.code,
            allowed_action_types: worker.allowed_action_types || [],
        });
        setShowForm(true);
    };

    const handleDelete = async (workerId: number) => {
        if (!user || !confirm('Czy na pewno chcesz usunąć tego pracownika?')) return;
        setError('');
        try {
            await deleteWorker(user.id, workerId);
            setSuccess('Pracownik usunięty');
            await loadWorkers();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Nie udało się usunąć pracownika');
        }
    };

    const resetForm = () => {
        setShowForm(false);
        setEditingWorker(null);
        setFormData({
            first_name: '',
            last_name: '',
            code: '',
            allowed_action_types: [],
        });
    };

    const toggleActionType = (actionType: ActionType) => {
        const current = formData.allowed_action_types || [];
        if (current.includes(actionType)) {
            setFormData({
                ...formData,
                allowed_action_types: current.filter(at => at !== actionType),
            });
        } else {
            setFormData({
                ...formData,
                allowed_action_types: [...current, actionType],
            });
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
                    <h1>Zarządzanie pracownikami</h1>
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
                <Link to="/admin/workers" className="nav-link active">Pracownicy</Link>
                <Link to="/admin/stats" className="nav-link">Statystyki</Link>
            </nav>

            <main className="main-content">
                {error && <div className="error-message">{error}</div>}
                {success && <div className="success-message">{success}</div>}

                <div className="card">
                    <div className="card-header">
                        <h2>Pracownicy</h2>
                        <button className="btn-primary" onClick={() => setShowForm(true)}>
                            + Nowy pracownik
                        </button>
                    </div>

                    {loading ? (
                        <p>Ładowanie...</p>
                    ) : workers.length === 0 ? (
                        <p className="text-muted">Brak pracowników</p>
                    ) : (
                        <div className="table-wrapper">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Imię</th>
                                        <th>Nazwisko</th>
                                        <th>Kod</th>
                                        <th>Uprawnienia</th>
                                        <th>Akcje</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {workers.map(worker => (
                                        <tr key={worker.id}>
                                            <td>{worker.first_name}</td>
                                            <td>{worker.last_name}</td>
                                            <td><code>{worker.code}</code></td>
                                            <td>
                                                <div className="action-types-display">
                                                    {worker.allowed_action_types.length > 0 ? (
                                                        worker.allowed_action_types.map(at => (
                                                            <span key={at} className={`action-badge action-${at}`}>
                                                                {ACTION_TYPE_LABELS[at]}
                                                            </span>
                                                        ))
                                                    ) : (
                                                        <span className="text-muted">Brak</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td>
                                                <button className="btn-secondary btn-sm" onClick={() => handleEdit(worker)}>
                                                    Edytuj
                                                </button>
                                                <button className="btn-danger btn-sm" onClick={() => handleDelete(worker.id)}>
                                                    Usuń
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Worker form modal */}
                {showForm && (
                    <div className="modal-overlay">
                        <div className="modal">
                            <h3>{editingWorker ? 'Edytuj pracownika' : 'Nowy pracownik'}</h3>
                            <form onSubmit={handleSubmit}>
                                <div className="form-group">
                                    <label>Imię</label>
                                    <input
                                        type="text"
                                        value={formData.first_name}
                                        onChange={e => setFormData({ ...formData, first_name: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Nazwisko</label>
                                    <input
                                        type="text"
                                        value={formData.last_name}
                                        onChange={e => setFormData({ ...formData, last_name: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Kod logowania</label>
                                    <input
                                        type="text"
                                        value={formData.code}
                                        onChange={e => setFormData({ ...formData, code: e.target.value })}
                                        required
                                        minLength={3}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Uprawnienia (typy akcji)</label>
                                    <div className="action-types-selector">
                                        {ALL_ACTION_TYPES.map(at => (
                                            <label key={at} className="checkbox-label">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.allowed_action_types?.includes(at) || false}
                                                    onChange={() => toggleActionType(at)}
                                                />
                                                <span className={`action-badge action-${at}`}>{ACTION_TYPE_LABELS[at]}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                                <div className="modal-actions">
                                    <button type="button" className="btn-secondary" onClick={resetForm}>
                                        Anuluj
                                    </button>
                                    <button type="submit" className="btn-primary">
                                        {editingWorker ? 'Zapisz' : 'Utwórz'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
