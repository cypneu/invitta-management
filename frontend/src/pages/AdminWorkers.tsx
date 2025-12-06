import { useState, useEffect, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getWorkers, createWorker, updateWorker, deleteWorker } from '../api';
import type { User, UserCreate } from '../types';

export default function AdminWorkers() {
    const { user, logout } = useAuth();
    const [workers, setWorkers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Form state
    const [editingId, setEditingId] = useState<number | null>(null);
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [userCode, setUserCode] = useState('');
    const [showForm, setShowForm] = useState(false);

    useEffect(() => {
        loadWorkers();
    }, []);

    async function loadWorkers() {
        setLoading(true);
        try {
            const data = await getWorkers();
            setWorkers(data);
        } catch {
            setError('Nie udało się załadować pracowników');
        } finally {
            setLoading(false);
        }
    }

    const resetForm = () => {
        setEditingId(null);
        setFirstName('');
        setLastName('');
        setUserCode('');
        setShowForm(false);
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        try {
            if (editingId) {
                await updateWorker(editingId, {
                    first_name: firstName,
                    last_name: lastName,
                    user_code: userCode,
                });
                setSuccess('Pracownik zaktualizowany');
            } else {
                await createWorker({
                    first_name: firstName,
                    last_name: lastName,
                    user_code: userCode,
                });
                setSuccess('Pracownik dodany');
            }
            resetForm();
            loadWorkers();
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Wystąpił błąd');
        }
    };

    const handleEdit = (worker: User) => {
        setEditingId(worker.id);
        setFirstName(worker.first_name);
        setLastName(worker.last_name);
        setUserCode(worker.user_code);
        setShowForm(true);
    };

    const handleDelete = async (workerId: number) => {
        if (!confirm('Czy na pewno chcesz usunąć tego pracownika?')) return;
        setError('');

        try {
            await deleteWorker(workerId);
            loadWorkers();
            setSuccess('Pracownik usunięty');
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Nie udało się usunąć pracownika');
        }
    };

    return (
        <div className="admin-container">
            <header className="header">
                <h1>Pracownicy</h1>
                <nav className="nav">
                    <Link to="/admin" className="nav-link">Podsumowanie</Link>
                    <Link to="/admin/history" className="nav-link">Historia</Link>
                    <Link to="/admin/add" className="nav-link">Dodaj wpis</Link>
                    <Link to="/admin/workers" className="nav-link active">Pracownicy</Link>
                    <Link to="/admin/settings" className="nav-link">Ustawienia</Link>
                </nav>
                <div className="user-info">
                    <span>{user?.name}</span>
                    <button onClick={logout} className="btn-secondary">Wyloguj</button>
                </div>
            </header>

            <main className="admin-main">
                {error && <div className="error-message">{error}</div>}
                {success && <div className="success-message">{success}</div>}

                {showForm ? (
                    <div className="workers-card">
                        <h3>{editingId ? 'Edytuj pracownika' : 'Dodaj pracownika'}</h3>
                        <form onSubmit={handleSubmit} className="worker-form">
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Imię</label>
                                    <input
                                        type="text"
                                        value={firstName}
                                        onChange={(e) => setFirstName(e.target.value)}
                                        required
                                        maxLength={50}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Nazwisko</label>
                                    <input
                                        type="text"
                                        value={lastName}
                                        onChange={(e) => setLastName(e.target.value)}
                                        required
                                        maxLength={50}
                                    />
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Kod logowania</label>
                                <input
                                    type="text"
                                    value={userCode}
                                    onChange={(e) => setUserCode(e.target.value)}
                                    required
                                    minLength={3}
                                    maxLength={20}
                                    placeholder="np. WRK001"
                                />
                            </div>
                            <div className="form-actions">
                                <button type="submit" className="btn-primary">
                                    {editingId ? 'Zapisz zmiany' : 'Dodaj pracownika'}
                                </button>
                                <button type="button" onClick={resetForm} className="btn-secondary">
                                    Anuluj
                                </button>
                            </div>
                        </form>
                    </div>
                ) : (
                    <div className="workers-card">
                        <div className="card-header">
                            <h3>Lista pracowników ({workers.length})</h3>
                            <button onClick={() => setShowForm(true)} className="btn-primary">
                                + Dodaj pracownika
                            </button>
                        </div>

                        {loading ? (
                            <p className="loading">Ładowanie...</p>
                        ) : workers.length === 0 ? (
                            <p className="empty">Brak pracowników</p>
                        ) : (
                            <div className="table-wrapper">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>ID</th>
                                            <th>Imię</th>
                                            <th>Nazwisko</th>
                                            <th>Kod logowania</th>
                                            <th>Akcje</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {workers.map(worker => (
                                            <tr key={worker.id}>
                                                <td className="num">{worker.id}</td>
                                                <td>{worker.first_name}</td>
                                                <td>{worker.last_name}</td>
                                                <td><code>{worker.user_code}</code></td>
                                                <td className="actions">
                                                    <button onClick={() => handleEdit(worker)} className="btn-icon" title="Edytuj">✏️</button>
                                                    <button onClick={() => handleDelete(worker.id)} className="btn-icon btn-danger" title="Usuń">🗑️</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}
