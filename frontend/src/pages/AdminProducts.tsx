import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { Product, ProductCreate, ProductUpdate, ShapeType } from '../types';
import { getProducts, createProduct, updateProduct, deleteProduct, getShapes } from '../api';

const SHAPE_LABELS: Record<ShapeType, string> = {
    rectangular: 'Prostokątny',
    round: 'Okrągły',
    oval: 'Owalny',
};

export default function AdminProducts() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [products, setProducts] = useState<Product[]>([]);
    const [shapes, setShapes] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [formData, setFormData] = useState<ProductCreate>({
        sku: '',
        fabric: '',
        pattern: '',
        shape: 'rectangular',
        width: null,
        height: null,
        diameter: null,
    });

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        try {
            setLoading(true);
            const [productsData, shapesData] = await Promise.all([
                getProducts(search || undefined),
                getShapes(),
            ]);
            setProducts(productsData);
            setShapes(shapesData);
        } catch (err) {
            setError('Nie udało się załadować produktów');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        const timer = setTimeout(() => loadData(), 300);
        return () => clearTimeout(timer);
    }, [search]);

    function openCreateModal() {
        setEditingProduct(null);
        setFormData({
            sku: '',
            fabric: '',
            pattern: '',
            shape: 'rectangular',
            width: null,
            height: null,
            diameter: null,
        });
        setShowModal(true);
    }

    function openEditModal(product: Product) {
        setEditingProduct(product);
        setFormData({
            sku: product.sku,
            fabric: product.fabric,
            pattern: product.pattern,
            shape: product.shape,
            width: product.width,
            height: product.height,
            diameter: product.diameter,
        });
        setShowModal(true);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!user) return;

        try {
            if (editingProduct) {
                const updateData: ProductUpdate = {};
                if (formData.sku !== editingProduct.sku) updateData.sku = formData.sku;
                if (formData.fabric !== editingProduct.fabric) updateData.fabric = formData.fabric;
                if (formData.pattern !== editingProduct.pattern) updateData.pattern = formData.pattern;
                if (formData.shape !== editingProduct.shape) updateData.shape = formData.shape;
                if (formData.width !== editingProduct.width) updateData.width = formData.width;
                if (formData.height !== editingProduct.height) updateData.height = formData.height;
                if (formData.diameter !== editingProduct.diameter) updateData.diameter = formData.diameter;

                await updateProduct(user.id, editingProduct.id, updateData);
            } else {
                await createProduct(user.id, formData);
            }
            setShowModal(false);
            loadData();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Nie udało się zapisać produktu');
        }
    }

    async function handleDelete(product: Product) {
        if (!user) return;
        if (!confirm(`Czy na pewno chcesz usunąć produkt "${product.sku}"?`)) return;

        try {
            await deleteProduct(user.id, product.id);
            loadData();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Nie udało się usunąć produktu');
        }
    }

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    function formatDimensions(product: Product): string {
        if (product.shape === 'round' && product.diameter) {
            return `⌀${product.diameter}`;
        }
        if (product.width && product.height) {
            return `${product.width}x${product.height}`;
        }
        return '-';
    }

    return (
        <div className="app-container">
            <header className="header">
                <div className="header-content">
                    <h1>Produkty</h1>
                    <div className="header-user">
                        <span>{user?.name}</span>
                        <button onClick={handleLogout} className="btn-secondary btn-sm">Wyloguj</button>
                    </div>
                </div>
            </header>

            <nav className="admin-nav">
                <Link to="/admin" className="nav-link">Dashboard</Link>
                <Link to="/admin/orders" className="nav-link">Zamówienia</Link>
                <Link to="/admin/products" className="nav-link active">Produkty</Link>
                <Link to="/admin/workers" className="nav-link">Pracownicy</Link>
                <Link to="/admin/stats" className="nav-link">Statystyki</Link>
            </nav>

            <main className="main-content">
                {error && <div className="error-message" onClick={() => setError(null)}>{error}</div>}

                <div className="card">
                    <div className="card-header">
                        <h2>Produkty ({products.length})</h2>
                        <div className="card-header-actions">
                            <input
                                type="text"
                                placeholder="Szukaj produktu..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="search-input"
                            />
                            <button onClick={openCreateModal} className="btn-primary">
                                + Dodaj produkt
                            </button>
                        </div>
                    </div>

                    {loading ? (
                        <p>Ładowanie...</p>
                    ) : products.length === 0 ? (
                        <div className="empty-state">
                            <p>Brak produktów</p>
                            <p className="text-muted">Produkty są automatycznie tworzone podczas synchronizacji z Baselinker lub możesz je dodać ręcznie.</p>
                        </div>
                    ) : (
                        <div className="table-wrapper">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>SKU</th>
                                        <th>Tkanina</th>
                                        <th>Wzór</th>
                                        <th>Wykończenie</th>
                                        <th>Kształt</th>
                                        <th>Wymiary</th>
                                        <th>Akcje</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {products.map((product) => (
                                        <tr key={product.id}>
                                            <td><strong>{product.sku}</strong></td>
                                            <td>{product.fabric}</td>
                                            <td>{product.pattern}</td>
                                            <td>{product.edge_type || '-'}</td>
                                            <td>{SHAPE_LABELS[product.shape] || product.shape}</td>
                                            <td>{formatDimensions(product)}</td>
                                            <td>
                                                <button
                                                    onClick={() => openEditModal(product)}
                                                    className="btn-secondary btn-sm"
                                                >
                                                    Edytuj
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(product)}
                                                    className="btn-danger btn-sm"
                                                    style={{ marginLeft: '0.5rem' }}
                                                >
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
            </main>

            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <h2>{editingProduct ? 'Edytuj produkt' : 'Dodaj produkt'}</h2>
                        <form onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label>SKU</label>
                                <input
                                    type="text"
                                    value={formData.sku}
                                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                                    required
                                    placeholder="np. O5-Ares-2000-140x200"
                                />
                            </div>
                            <div className="form-group">
                                <label>Tkanina</label>
                                <input
                                    type="text"
                                    value={formData.fabric}
                                    onChange={(e) => setFormData({ ...formData, fabric: e.target.value })}
                                    required
                                    placeholder="np. O5"
                                />
                            </div>
                            <div className="form-group">
                                <label>Wzór</label>
                                <input
                                    type="text"
                                    value={formData.pattern}
                                    onChange={(e) => setFormData({ ...formData, pattern: e.target.value })}
                                    required
                                    placeholder="np. Ares-2000"
                                />
                            </div>
                            <div className="form-group">
                                <label>Kształt</label>
                                <select
                                    value={formData.shape}
                                    onChange={(e) => setFormData({
                                        ...formData,
                                        shape: e.target.value as ShapeType,
                                        ...(e.target.value === 'round'
                                            ? { width: null, height: null }
                                            : { diameter: null })
                                    })}
                                >
                                    {shapes.map((shape) => (
                                        <option key={shape} value={shape}>
                                            {SHAPE_LABELS[shape as ShapeType] || shape}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {formData.shape === 'round' ? (
                                <div className="form-group">
                                    <label>Średnica (cm)</label>
                                    <input
                                        type="number"
                                        value={formData.diameter || ''}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            diameter: e.target.value ? parseInt(e.target.value) : null
                                        })}
                                        min="1"
                                        placeholder="np. 200"
                                    />
                                </div>
                            ) : (
                                <>
                                    <div className="form-group">
                                        <label>Szerokość (cm)</label>
                                        <input
                                            type="number"
                                            value={formData.width || ''}
                                            onChange={(e) => setFormData({
                                                ...formData,
                                                width: e.target.value ? parseInt(e.target.value) : null
                                            })}
                                            min="1"
                                            placeholder="np. 140"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Wysokość (cm)</label>
                                        <input
                                            type="number"
                                            value={formData.height || ''}
                                            onChange={(e) => setFormData({
                                                ...formData,
                                                height: e.target.value ? parseInt(e.target.value) : null
                                            })}
                                            min="1"
                                            placeholder="np. 200"
                                        />
                                    </div>
                                </>
                            )}

                            <div className="modal-actions">
                                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">
                                    Anuluj
                                </button>
                                <button type="submit" className="btn-primary">
                                    {editingProduct ? 'Zapisz zmiany' : 'Dodaj produkt'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
