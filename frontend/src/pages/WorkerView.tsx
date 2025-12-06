import { useState, useEffect, FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { createProductionEntry, getProductTypes, getProductSizes } from '../api';
import type { ProductionEntry } from '../types';

export default function WorkerView() {
    const { user, logout } = useAuth();
    const [productType, setProductType] = useState('');
    const [productSize, setProductSize] = useState('');
    const [quantity, setQuantity] = useState('');
    const [productTypes, setProductTypes] = useState<string[]>([]);
    const [productSizes, setProductSizes] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');
    const [recentEntries, setRecentEntries] = useState<ProductionEntry[]>([]);

    useEffect(() => {
        async function loadOptions() {
            const [types, sizes] = await Promise.all([
                getProductTypes(),
                getProductSizes()
            ]);
            setProductTypes(types);
            setProductSizes(sizes);
        }
        loadOptions();
    }, []);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setLoading(true);

        try {
            const entry = await createProductionEntry(user!.id, {
                product_type: productType,
                product_size: productSize,
                quantity: parseInt(quantity),
            });

            setRecentEntries(prev => [entry, ...prev.slice(0, 4)]);
            setSuccess(`Added ${quantity} × ${productType} (${productSize})`);
            setQuantity('');

            setTimeout(() => setSuccess(''), 3000);
        } catch {
            setError('Failed to log entry. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="worker-container">
            <header className="header">
                <h1>Log Production</h1>
                <div className="user-info">
                    <span>{user?.name}</span>
                    <button onClick={logout} className="btn-secondary">Logout</button>
                </div>
            </header>

            <main className="worker-main">
                <form onSubmit={handleSubmit} className="production-form">
                    <div className="form-group">
                        <label htmlFor="productType">Product Type</label>
                        <select
                            id="productType"
                            value={productType}
                            onChange={(e) => setProductType(e.target.value)}
                            required
                        >
                            <option value="">Select type...</option>
                            {productTypes.map(type => (
                                <option key={type} value={type}>{type}</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label htmlFor="productSize">Size</label>
                        <select
                            id="productSize"
                            value={productSize}
                            onChange={(e) => setProductSize(e.target.value)}
                            required
                        >
                            <option value="">Select size...</option>
                            {productSizes.map(size => (
                                <option key={size} value={size}>{size}</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label htmlFor="quantity">Quantity</label>
                        <input
                            type="number"
                            id="quantity"
                            value={quantity}
                            onChange={(e) => setQuantity(e.target.value)}
                            min="1"
                            placeholder="Enter quantity"
                            required
                        />
                    </div>

                    {error && <div className="error-message">{error}</div>}
                    {success && <div className="success-message">{success}</div>}

                    <button type="submit" disabled={loading} className="btn-primary btn-large">
                        {loading ? 'Logging...' : 'Log Production'}
                    </button>
                </form>

                {recentEntries.length > 0 && (
                    <div className="recent-entries">
                        <h3>Recent Entries</h3>
                        <ul>
                            {recentEntries.map(entry => (
                                <li key={entry.id}>
                                    <span className="entry-quantity">{entry.quantity}×</span>
                                    <span className="entry-type">{entry.product_type}</span>
                                    <span className="entry-size">({entry.product_size})</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </main>
        </div>
    );
}
