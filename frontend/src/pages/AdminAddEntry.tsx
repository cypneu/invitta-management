import { useState, useEffect, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { createProductionEntry, getProductTypes, getWorkers } from '../api';
import type { User } from '../types';

export default function AdminAddEntry() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [workers, setWorkers] = useState<User[]>([]);
    const [productTypes, setProductTypes] = useState<string[]>([]);

    const [selectedWorker, setSelectedWorker] = useState('');
    const [productType, setProductType] = useState('');
    const [widthCm, setWidthCm] = useState('');
    const [heightCm, setHeightCm] = useState('');
    const [quantity, setQuantity] = useState('');

    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        Promise.all([
            getWorkers(),
            getProductTypes()
        ]).then(([w, t]) => {
            setWorkers(w);
            setProductTypes(t);
        });
    }, []);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setLoading(true);

        try {
            await createProductionEntry(parseInt(selectedWorker), {
                product_type: productType,
                width_cm: parseInt(widthCm),
                height_cm: parseInt(heightCm),
                quantity: parseInt(quantity),
            });

            setSuccess('Wpis został dodany pomyślnie!');

            // Reset form
            setProductType('');
            setWidthCm('');
            setHeightCm('');
            setQuantity('');

            setTimeout(() => {
                navigate('/admin/history');
            }, 1500);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Wystąpił błąd');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="admin-container">
            <header className="header">
                <h1>Dodaj Wpis Produkcji</h1>
                <nav className="nav">
                    <Link to="/admin" className="nav-link">Podsumowanie</Link>
                    <Link to="/admin/history" className="nav-link">Historia</Link>
                    <Link to="/admin/add" className="nav-link active">Dodaj wpis</Link>
                    <Link to="/admin/workers" className="nav-link">Pracownicy</Link>
                    <Link to="/admin/settings" className="nav-link">Ustawienia</Link>
                </nav>
                <div className="user-info">
                    <span>{user?.name}</span>
                    <button onClick={logout} className="btn-secondary">Wyloguj</button>
                </div>
            </header>

            <main className="admin-main">
                <div className="add-entry-card">
                    <form onSubmit={handleSubmit} className="production-form">
                        <h3>Nowy wpis dla pracownika</h3>

                        <div className="form-group">
                            <label htmlFor="worker">Pracownik</label>
                            <select
                                id="worker"
                                value={selectedWorker}
                                onChange={(e) => setSelectedWorker(e.target.value)}
                                required
                            >
                                <option value="">Wybierz pracownika...</option>
                                {workers.map(w => (
                                    <option key={w.id} value={w.id}>{w.name} ({w.user_code})</option>
                                ))}
                            </select>
                        </div>

                        <div className="form-group">
                            <label htmlFor="productType">Rodzaj wykończenia</label>
                            <select
                                id="productType"
                                value={productType}
                                onChange={(e) => setProductType(e.target.value)}
                                required
                            >
                                <option value="">Wybierz rodzaj...</option>
                                {productTypes.map(type => (
                                    <option key={type} value={type}>{type}</option>
                                ))}
                            </select>
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label htmlFor="widthCm">Szerokość (cm)</label>
                                <input
                                    type="number"
                                    id="widthCm"
                                    value={widthCm}
                                    onChange={(e) => setWidthCm(e.target.value)}
                                    min="10"
                                    max="2000"
                                    placeholder="10-2000"
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="heightCm">Wysokość (cm)</label>
                                <input
                                    type="number"
                                    id="heightCm"
                                    value={heightCm}
                                    onChange={(e) => setHeightCm(e.target.value)}
                                    min="10"
                                    max="2000"
                                    placeholder="10-2000"
                                    required
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label htmlFor="quantity">Ilość</label>
                            <input
                                type="number"
                                id="quantity"
                                value={quantity}
                                onChange={(e) => setQuantity(e.target.value)}
                                min="1"
                                placeholder="Podaj ilość"
                                required
                            />
                        </div>

                        {error && <div className="error-message">{error}</div>}
                        {success && <div className="success-message">{success}</div>}

                        <button type="submit" disabled={loading} className="btn-primary btn-large">
                            {loading ? 'Zapisywanie...' : 'Dodaj wpis'}
                        </button>
                    </form>
                </div>
            </main>
        </div>
    );
}
