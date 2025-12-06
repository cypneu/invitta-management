import { useState, useEffect, FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { createProductionEntry, getProductTypes, updateProductionEntry, deleteProductionEntry, getProductionEntries } from '../api';
import type { ProductionEntry } from '../types';

export default function WorkerView() {
    const { user, logout } = useAuth();
    const [productType, setProductType] = useState('');
    const [widthCm, setWidthCm] = useState('');
    const [heightCm, setHeightCm] = useState('');
    const [quantity, setQuantity] = useState('');
    const [productTypes, setProductTypes] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');
    const [entries, setEntries] = useState<ProductionEntry[]>([]);
    const [editingId, setEditingId] = useState<number | null>(null);

    useEffect(() => {
        loadData();
    }, [user]);

    async function loadData() {
        const [types, userEntries] = await Promise.all([
            getProductTypes(),
            user ? getProductionEntries({ workerId: user.id }) : Promise.resolve([])
        ]);
        setProductTypes(types);
        setEntries(userEntries);
    }

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setLoading(true);

        try {
            if (editingId) {
                await updateProductionEntry(editingId, user!.id, {
                    product_type: productType,
                    width_cm: parseInt(widthCm),
                    height_cm: parseInt(heightCm),
                    quantity: parseInt(quantity),
                });
                setSuccess('Wpis zaktualizowany pomyślnie');
                setEditingId(null);
            } else {
                await createProductionEntry(user!.id, {
                    product_type: productType,
                    width_cm: parseInt(widthCm),
                    height_cm: parseInt(heightCm),
                    quantity: parseInt(quantity),
                });
                setSuccess(`Dodano ${quantity} × ${productType} (${widthCm}×${heightCm} cm)`);
            }

            // Reset form
            setProductType('');
            setWidthCm('');
            setHeightCm('');
            setQuantity('');

            // Reload entries
            loadData();

            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Wystąpił błąd');
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (entry: ProductionEntry) => {
        setEditingId(entry.id);
        setProductType(entry.product_type);
        setWidthCm(String(entry.width_cm));
        setHeightCm(String(entry.height_cm));
        setQuantity(String(entry.quantity));
    };

    const handleDelete = async (entryId: number) => {
        if (!confirm('Czy na pewno chcesz usunąć ten wpis?')) return;

        try {
            await deleteProductionEntry(entryId, user!.id);
            loadData();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Nie udało się usunąć wpisu');
        }
    };

    const cancelEdit = () => {
        setEditingId(null);
        setProductType('');
        setWidthCm('');
        setHeightCm('');
        setQuantity('');
    };

    return (
        <div className="worker-container">
            <header className="header">
                <h1>Rejestracja Produkcji</h1>
                <div className="user-info">
                    <span>{user?.name}</span>
                    <button onClick={logout} className="btn-secondary">Wyloguj</button>
                </div>
            </header>

            <main className="worker-main">
                <form onSubmit={handleSubmit} className="production-form">
                    <h3>{editingId ? 'Edytuj wpis' : 'Nowy wpis'}</h3>

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

                    <div className="form-actions">
                        <button type="submit" disabled={loading} className="btn-primary btn-large">
                            {loading ? 'Zapisywanie...' : (editingId ? 'Zapisz zmiany' : 'Dodaj produkcję')}
                        </button>
                        {editingId && (
                            <button type="button" onClick={cancelEdit} className="btn-secondary">
                                Anuluj
                            </button>
                        )}
                    </div>
                </form>

                {entries.length > 0 && (
                    <div className="entries-card">
                        <h3>Twoje wpisy</h3>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Data</th>
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
                                        <td>{new Date(entry.created_at).toLocaleDateString('pl-PL')}</td>
                                        <td>{entry.product_type}</td>
                                        <td>{entry.width_cm}×{entry.height_cm} cm</td>
                                        <td className="num">{entry.quantity}</td>
                                        <td className="num">{entry.production_cost.toFixed(2)} zł</td>
                                        <td className="actions">
                                            <button onClick={() => handleEdit(entry)} className="btn-icon" title="Edytuj">✏️</button>
                                            <button onClick={() => handleDelete(entry.id)} className="btn-icon btn-danger" title="Usuń">🗑️</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </main>
        </div>
    );
}
