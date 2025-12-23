import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getOrders, getOrder, createOrder, deleteOrder, updateOrder, getProducts, getOrderPositions, getPositionActions, addPosition, deletePosition, updateOrderStatus, bulkUpdateOrderStatus, updateAction, deleteAction, updateOrderShipmentDate } from '../api';
import type { OrderListItem, Order, Product, OrderPositionWithActions, ActionType, OrderStatus, Action } from '../types';
import { ACTION_TYPE_LABELS, ORDER_STATUS_LABELS } from '../types';

// Helper to format date as DD-MM-YYYY
function formatDate(dateStr: string | null): string {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
}

function formatTime(timestamp: string): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
}

export default function AdminOrders() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const { orderId } = useParams<{ orderId?: string }>();

    const [orders, setOrders] = useState<OrderListItem[]>([]);
    const [allSources, setAllSources] = useState<string[]>([]);
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [positions, setPositions] = useState<OrderPositionWithActions[]>([]);
    const [positionActions, setPositionActions] = useState<Record<number, Action[]>>({});
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Filters
    const [search, setSearch] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('');
    const [sourceFilter, setSourceFilter] = useState('');

    // Selection for bulk actions
    const [selectedOrderIds, setSelectedOrderIds] = useState<Set<number>>(new Set());

    // New order form
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [newOrder, setNewOrder] = useState({ fullname: '', company: '', expected_shipment_date: '' });

    // Add position form
    const [showAddPosition, setShowAddPosition] = useState(false);
    const [selectedProductId, setSelectedProductId] = useState<number | ''>('');
    const [positionQuantity, setPositionQuantity] = useState(1);

    // Edit shipment date (details only)
    const [editingShipmentDate, setEditingShipmentDate] = useState(false);
    const [newShipmentDate, setNewShipmentDate] = useState('');

    // Edit action
    const [editingActionId, setEditingActionId] = useState<number | null>(null);
    const [editQuantityStr, setEditQuantityStr] = useState('1');

    // Inline date editing in table
    const [editingDateOrderId, setEditingDateOrderId] = useState<number | null>(null);
    const [editingDateValue, setEditingDateValue] = useState('');

    // Track if sources have been loaded
    const sourcesLoaded = useRef(false);

    useEffect(() => {
        loadProducts();
        loadOrders();
    }, []);

    // Real-time filtering with debounce
    useEffect(() => {
        const timer = setTimeout(() => {
            loadOrders();
        }, 300);
        return () => clearTimeout(timer);
    }, [dateFrom, dateTo, statusFilter, sourceFilter]);

    useEffect(() => {
        if (orderId) {
            loadOrderDetails(parseInt(orderId));
        } else {
            setSelectedOrder(null);
            setPositions([]);
            setPositionActions({});
        }
    }, [orderId]);

    const loadOrders = async () => {
        setLoading(true);
        setSelectedOrderIds(new Set());
        try {
            // Orders now include positions with action_totals - no N+1!
            const data = await getOrders({
                dateFrom,
                dateTo,
                status: statusFilter || undefined,
                source: sourceFilter || undefined,
            });
            setOrders(data);

            // Store all unique sources on first load only
            if (!sourcesLoaded.current) {
                const sources = new Set(data.filter(o => o.source).map(o => o.source!));
                setAllSources(Array.from(sources).sort());
                sourcesLoaded.current = true;
            }
        } catch {
            setError('Nie udało się załadować zamówień');
        } finally {
            setLoading(false);
        }
    };

    const loadProducts = async () => {
        try {
            const data = await getProducts();
            setProducts(data);
        } catch {
            console.error('Failed to load products');
        }
    };

    const loadOrderDetails = async (id: number) => {
        try {
            const [orderData, positionsData] = await Promise.all([
                getOrder(id),
                getOrderPositions(id),
            ]);
            setSelectedOrder(orderData);
            setPositions(positionsData);

            // Load actions for each position
            const actionsMap: Record<number, Action[]> = {};
            for (const pos of positionsData) {
                const actions = await getPositionActions(pos.id);
                actionsMap[pos.id] = actions;
            }
            setPositionActions(actionsMap);
        } catch {
            setError('Nie udało się załadować szczegółów zamówienia');
        }
    };

    // Client-side filter for search
    const filteredOrders = useMemo(() => {
        if (!search.trim()) return orders;
        const q = search.toLowerCase();
        return orders.filter(o => {
            const client = (o.fullname || o.company || '').toLowerCase();
            const blId = o.baselinker_id ? String(o.baselinker_id) : '';
            const id = String(o.id);
            return client.includes(q) || blId.includes(q) || id.includes(q);
        });
    }, [orders, search]);

    const handleCreateOrder = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        try {
            await createOrder(user.id, {
                fullname: newOrder.fullname || undefined,
                company: newOrder.company || undefined,
                expected_shipment_date: newOrder.expected_shipment_date || undefined,
            });
            setShowCreateForm(false);
            setNewOrder({ fullname: '', company: '', expected_shipment_date: '' });
            await loadOrders();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Nie udało się utworzyć zamówienia');
        }
    };

    const handleDeleteOrder = async (id: number) => {
        if (!user || !confirm('Czy na pewno chcesz usunąć to zamówienie?')) return;
        try {
            await deleteOrder(user.id, id);
            await loadOrders();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Nie udało się usunąć zamówienia');
        }
    };

    const handleChangeStatus = async (orderId: number, newStatus: OrderStatus) => {
        if (!user) return;
        try {
            await updateOrderStatus(user.id, orderId, newStatus);
            await loadOrders();
            if (selectedOrder?.id === orderId) {
                await loadOrderDetails(orderId);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Nie udało się zmienić statusu');
        }
    };

    const handleBulkStatusChange = async (newStatus: OrderStatus) => {
        if (!user || selectedOrderIds.size === 0) return;
        try {
            const result = await bulkUpdateOrderStatus(user.id, Array.from(selectedOrderIds), newStatus);
            setSuccess(result.message);
            setSelectedOrderIds(new Set());
            await loadOrders();
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Nie udało się zmienić statusu zamówień');
        }
    };

    const handleUpdateShipmentDate = async () => {
        if (!user || !selectedOrder) return;
        try {
            await updateOrder(user.id, selectedOrder.id, { expected_shipment_date: newShipmentDate || undefined });
            setEditingShipmentDate(false);
            await loadOrderDetails(selectedOrder.id);
            await loadOrders();
            setSuccess('Zaktualizowano datę wysyłki');
            setTimeout(() => setSuccess(''), 2000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Nie udało się zaktualizować daty');
        }
    };

    const toggleOrderSelection = (orderId: number) => {
        setSelectedOrderIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(orderId)) {
                newSet.delete(orderId);
            } else {
                newSet.add(orderId);
            }
            return newSet;
        });
    };

    const toggleSelectAll = () => {
        if (selectedOrderIds.size === filteredOrders.length && filteredOrders.length > 0) {
            setSelectedOrderIds(new Set());
        } else {
            setSelectedOrderIds(new Set(filteredOrders.map(o => o.id)));
        }
    };

    const handleUpdateAction = async (actionId: number, actionType: ActionType, positionId: number) => {
        if (!user) return;
        const qty = parseInt(editQuantityStr) || 0;
        if (qty <= 0) {
            setError('Ilość musi być większa od 0');
            return;
        }
        try {
            await updateAction(user.id, actionId, qty);
            // Refresh
            const actions = await getPositionActions(positionId);
            setPositionActions(prev => ({ ...prev, [positionId]: actions }));
            const positionsData = await getOrderPositions(selectedOrder!.id);
            setPositions(positionsData);
            setEditingActionId(null);
            setSuccess('Zaktualizowano');
            setTimeout(() => setSuccess(''), 2000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Błąd');
        }
    };

    const handleDeleteAction = async (actionId: number, positionId: number) => {
        if (!user || !confirm('Usunąć wpis?')) return;
        try {
            await deleteAction(user.id, actionId);
            const actions = await getPositionActions(positionId);
            setPositionActions(prev => ({ ...prev, [positionId]: actions }));
            const positionsData = await getOrderPositions(selectedOrder!.id);
            setPositions(positionsData);
            setSuccess('Usunięto');
            setTimeout(() => setSuccess(''), 2000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Błąd');
        }
    };

    const handleInlineDateSave = async (orderId: number) => {
        if (!user) return;
        try {
            await updateOrderShipmentDate(user.id, orderId, editingDateValue || null);
            setEditingDateOrderId(null);
            loadOrders();
            setSuccess('Data zaktualizowana');
            setTimeout(() => setSuccess(''), 2000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Błąd zapisu daty');
        }
    };

    const handleAddPosition = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !selectedOrder || !selectedProductId) return;
        try {
            await addPosition(user.id, selectedOrder.id, Number(selectedProductId), positionQuantity);
            setShowAddPosition(false);
            setSelectedProductId('');
            setPositionQuantity(1);
            await loadOrderDetails(selectedOrder.id);
            await loadOrders();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Nie udało się dodać pozycji');
        }
    };

    const handleDeletePosition = async (positionId: number) => {
        if (!user || !selectedOrder || !confirm('Czy na pewno chcesz usunąć tę pozycję?')) return;
        try {
            await deletePosition(user.id, positionId);
            await loadOrderDetails(selectedOrder.id);
            await loadOrders();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Nie udało się usunąć pozycji');
        }
    };

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    const getStatusBadgeClass = (status: OrderStatus): string => {
        switch (status) {
            case 'fetched': return 'status-badge status-fetched';
            case 'in_progress': return 'status-badge status-in-progress';
            case 'done': return 'status-badge status-done';
            case 'cancelled': return 'status-badge status-cancelled';
            default: return 'status-badge';
        }
    };

    const totalOrdersCount = filteredOrders.length;
    const selectedCount = selectedOrderIds.size;

    return (
        <div className="app-container">
            <header className="header">
                <div className="header-content">
                    <h1>{orderId ? `Zamówienie #${orderId}` : 'Zamówienia'}</h1>
                    <div className="header-user">
                        <span>{user?.name}</span>
                        <button onClick={handleLogout} className="btn-secondary btn-sm">Wyloguj</button>
                    </div>
                </div>
            </header>

            <nav className="admin-nav">
                <Link to="/admin" className="nav-link">Dashboard</Link>
                <Link to="/admin/orders" className="nav-link active">Zamówienia</Link>
                <Link to="/admin/products" className="nav-link">Produkty</Link>
                <Link to="/admin/workers" className="nav-link">Pracownicy</Link>
                <Link to="/admin/stats" className="nav-link">Statystyki</Link>
            </nav>

            <main className="main-content">
                {error && <div className="error-message" onClick={() => setError('')}>{error}</div>}
                {success && <div className="success-message">{success}</div>}

                {!orderId ? (
                    <>
                        {/* Orders list */}
                        <div className="card">
                            <div className="card-header">
                                <h2>Zamówienia</h2>
                                <button className="btn-primary" onClick={() => setShowCreateForm(true)}>
                                    + Nowe zamówienie
                                </button>
                            </div>

                            {/* Status filter tabs */}
                            <div className="status-tabs">
                                <button
                                    className={`status-tab ${statusFilter === '' ? 'active' : ''}`}
                                    onClick={() => setStatusFilter('')}
                                >
                                    Wszystkie
                                </button>
                                <button
                                    className={`status-tab ${statusFilter === 'fetched' ? 'active' : ''}`}
                                    onClick={() => setStatusFilter('fetched')}
                                >
                                    Pobrane
                                </button>
                                <button
                                    className={`status-tab ${statusFilter === 'in_progress' ? 'active' : ''}`}
                                    onClick={() => setStatusFilter('in_progress')}
                                >
                                    W realizacji
                                </button>
                                <button
                                    className={`status-tab ${statusFilter === 'done' ? 'active' : ''}`}
                                    onClick={() => setStatusFilter('done')}
                                >
                                    Gotowe
                                </button>
                            </div>

                            <div className="filters-row">
                                <input
                                    type="text"
                                    placeholder="Szukaj po kliencie, ID, Baselinker ID..."
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    className="search-input-admin"
                                />
                                <select
                                    value={sourceFilter}
                                    onChange={e => setSourceFilter(e.target.value)}
                                    className="filter-select"
                                >
                                    <option value="">Wszystkie źródła</option>
                                    {allSources.map(src => (
                                        <option key={src} value={src}>{src}</option>
                                    ))}
                                </select>
                                <input
                                    type="date"
                                    value={dateFrom}
                                    onChange={e => setDateFrom(e.target.value)}
                                    placeholder="Od"
                                />
                                <input
                                    type="date"
                                    value={dateTo}
                                    onChange={e => setDateTo(e.target.value)}
                                    placeholder="Do"
                                />
                            </div>

                            {/* Bulk actions bar */}
                            {totalOrdersCount > 0 && (
                                <div className="bulk-actions-bar">
                                    <label className="checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={selectedOrderIds.size === totalOrdersCount && totalOrdersCount > 0}
                                            onChange={toggleSelectAll}
                                        />
                                        Zaznacz wszystkie ({totalOrdersCount})
                                    </label>
                                    {selectedCount > 0 && (
                                        <>
                                            <span className="status-change-label">Zmień status ({selectedCount}):</span>
                                            <select
                                                className="status-dropdown"
                                                value=""
                                                onChange={(e) => {
                                                    if (e.target.value) {
                                                        handleBulkStatusChange(e.target.value as OrderStatus);
                                                    }
                                                }}
                                            >
                                                <option value="">-- wybierz --</option>
                                                <option value="fetched">{ORDER_STATUS_LABELS['fetched']}</option>
                                                <option value="in_progress">{ORDER_STATUS_LABELS['in_progress']}</option>
                                                <option value="done">{ORDER_STATUS_LABELS['done']}</option>
                                                <option value="cancelled">{ORDER_STATUS_LABELS['cancelled']}</option>
                                            </select>
                                        </>
                                    )}
                                </div>
                            )}

                            {loading ? (
                                <p>Ładowanie...</p>
                            ) : filteredOrders.length === 0 ? (
                                <p className="text-muted">Brak zamówień</p>
                            ) : (
                                <div className="orders-table-wrapper">
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th className="checkbox-col"></th>
                                                <th>ID</th>
                                                <th>BL ID</th>
                                                <th>Klient</th>
                                                <th className="hide-mobile">Źródło</th>
                                                <th>Wysyłka</th>
                                                <th className="hide-mobile">Poz.</th>
                                                <th>Status</th>
                                                <th>Akcje</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredOrders.map(order => (
                                                <React.Fragment key={order.id}>
                                                    <tr>
                                                        <td className="checkbox-col">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedOrderIds.has(order.id)}
                                                                onChange={() => toggleOrderSelection(order.id)}
                                                            />
                                                        </td>
                                                        <td>
                                                            <Link to={`/admin/orders/${order.id}`} className="order-id-link">
                                                                #{order.id}
                                                            </Link>
                                                        </td>
                                                        <td>{order.baselinker_id || '-'}</td>
                                                        <td>{order.fullname || order.company || '-'}</td>
                                                        <td className="hide-mobile">{order.source || '-'}</td>
                                                        <td className="editable-date-cell">
                                                            {editingDateOrderId === order.id ? (
                                                                <div className="inline-date-edit">
                                                                    <input
                                                                        type="date"
                                                                        value={editingDateValue}
                                                                        onChange={(e) => setEditingDateValue(e.target.value)}
                                                                        autoFocus
                                                                    />
                                                                    <button className="btn-primary btn-xs" onClick={() => handleInlineDateSave(order.id)}>✓</button>
                                                                    <button className="btn-secondary btn-xs" onClick={() => setEditingDateOrderId(null)}>×</button>
                                                                </div>
                                                            ) : (
                                                                <span
                                                                    className="clickable-date"
                                                                    onClick={() => {
                                                                        setEditingDateOrderId(order.id);
                                                                        setEditingDateValue(order.expected_shipment_date || '');
                                                                    }}
                                                                >
                                                                    {formatDate(order.expected_shipment_date)}
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="hide-mobile">{order.position_count}</td>
                                                        <td>
                                                            <span className={getStatusBadgeClass(order.status)}>
                                                                {ORDER_STATUS_LABELS[order.status]}
                                                            </span>
                                                        </td>
                                                        <td className="actions-cell">
                                                            <button
                                                                className="btn-danger btn-sm"
                                                                onClick={() => handleDeleteOrder(order.id)}
                                                            >
                                                                ×
                                                            </button>
                                                        </td>
                                                    </tr>
                                                    {/* Position sub-rows */}
                                                    {order.positions.map(pos => (
                                                        <tr key={`pos-${pos.id}`} className="position-subrow">
                                                            <td></td>
                                                            <td colSpan={2} className="position-sku-cell">
                                                                <span className="subrow-marker">↳</span>
                                                                {pos.product.sku}
                                                            </td>
                                                            <td colSpan={2}>
                                                                <div className="action-pills-row">
                                                                    {(['cutting', 'sewing', 'ironing', 'packing'] as ActionType[]).map(at => {
                                                                        const done = pos.action_totals[at] || 0;
                                                                        const isComplete = done >= pos.quantity;
                                                                        const shortLabel = ACTION_TYPE_LABELS[at].slice(0, 3);
                                                                        return (
                                                                            <span key={at} className={`action-pill action-pill-${at} ${isComplete ? 'complete' : ''}`}>
                                                                                {shortLabel}: {done}/{pos.quantity}
                                                                            </span>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </td>
                                                            <td colSpan={4}></td>
                                                        </tr>
                                                    ))}
                                                </React.Fragment>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Create order modal */}
                        {showCreateForm && (
                            <div className="modal-overlay">
                                <div className="modal">
                                    <h3>Nowe zamówienie</h3>
                                    <form onSubmit={handleCreateOrder}>
                                        <div className="form-group">
                                            <label>Imię i nazwisko</label>
                                            <input
                                                type="text"
                                                value={newOrder.fullname}
                                                onChange={e => setNewOrder({ ...newOrder, fullname: e.target.value })}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>Firma</label>
                                            <input
                                                type="text"
                                                value={newOrder.company}
                                                onChange={e => setNewOrder({ ...newOrder, company: e.target.value })}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>Planowana wysyłka</label>
                                            <input
                                                type="date"
                                                value={newOrder.expected_shipment_date}
                                                onChange={e => setNewOrder({ ...newOrder, expected_shipment_date: e.target.value })}
                                            />
                                        </div>
                                        <div className="modal-actions">
                                            <button type="button" className="btn-secondary" onClick={() => setShowCreateForm(false)}>
                                                Anuluj
                                            </button>
                                            <button type="submit" className="btn-primary">Utwórz</button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    /* Order details view */
                    <div className="card">
                        <div className="card-header">
                            <div>
                                <Link to="/admin/orders" className="back-link">← Wszystkie zamówienia</Link>
                                {selectedOrder && (
                                    <div className="status-change-section">
                                        <span className={getStatusBadgeClass(selectedOrder.status)}>
                                            {ORDER_STATUS_LABELS[selectedOrder.status]}
                                        </span>
                                        <span className="status-change-label">Zmień status:</span>
                                        <select
                                            className="status-dropdown"
                                            value={selectedOrder.status}
                                            onChange={(e) => {
                                                if (e.target.value && e.target.value !== selectedOrder.status) {
                                                    handleChangeStatus(selectedOrder.id, e.target.value as OrderStatus);
                                                }
                                            }}
                                        >
                                            <option value="fetched">{ORDER_STATUS_LABELS['fetched']}</option>
                                            <option value="in_progress">{ORDER_STATUS_LABELS['in_progress']}</option>
                                            <option value="done">{ORDER_STATUS_LABELS['done']}</option>
                                            <option value="cancelled">{ORDER_STATUS_LABELS['cancelled']}</option>
                                        </select>
                                    </div>
                                )}
                            </div>
                            <button className="btn-primary" onClick={() => setShowAddPosition(true)}>
                                + Dodaj pozycję
                            </button>
                        </div>

                        {selectedOrder && (
                            <div className="order-meta">
                                <p><strong>Klient:</strong> {selectedOrder.fullname || '-'}</p>
                                <p><strong>Firma:</strong> {selectedOrder.company || '-'}</p>
                                <p>
                                    <strong>Planowana wysyłka:</strong>{' '}
                                    {editingShipmentDate ? (
                                        <span className="inline-edit">
                                            <input
                                                type="date"
                                                value={newShipmentDate}
                                                onChange={e => setNewShipmentDate(e.target.value)}
                                            />
                                            <button className="icon-btn" onClick={handleUpdateShipmentDate}>✓</button>
                                            <button className="icon-btn" onClick={() => setEditingShipmentDate(false)}>✕</button>
                                        </span>
                                    ) : (
                                        <span
                                            className="editable-date"
                                            onClick={() => {
                                                setEditingShipmentDate(true);
                                                setNewShipmentDate(selectedOrder.expected_shipment_date || '');
                                            }}
                                        >
                                            {formatDate(selectedOrder.expected_shipment_date)} ✎
                                        </span>
                                    )}
                                </p>
                                {selectedOrder.baselinker_id && (
                                    <p><strong>Baselinker ID:</strong> {selectedOrder.baselinker_id}</p>
                                )}
                            </div>
                        )}

                        <h3>Pozycje ({positions.length})</h3>
                        {positions.length === 0 ? (
                            <p className="text-muted">Brak pozycji w zamówieniu</p>
                        ) : (
                            <div className="positions-grid-admin">
                                {positions.map(pos => (
                                    <div key={pos.id} className="position-card-admin">
                                        <div className="position-header-admin">
                                            <strong>{pos.product.sku}</strong>
                                            <span className="position-qty-admin">x{pos.quantity}</span>
                                        </div>
                                        <div className="position-details-admin">
                                            {pos.product.fabric} / {pos.product.pattern}
                                        </div>
                                        <div className="position-actions-grid">
                                            {(['cutting', 'sewing', 'ironing', 'packing'] as ActionType[]).map(actionType => {
                                                const done = pos.action_totals[actionType] || 0;
                                                const isComplete = done >= pos.quantity;
                                                return (
                                                    <div key={actionType} className={`position-action-cell ${isComplete ? 'complete' : ''}`}>
                                                        <span className="action-type-label">{ACTION_TYPE_LABELS[actionType]}</span>
                                                        <span className="action-count">{done}/{pos.quantity}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Actions list - only in details */}
                                        <div className="position-actions-list">
                                            <strong>Wpisy:</strong>
                                            {(positionActions[pos.id] || []).length === 0 ? (
                                                <span className="text-muted"> Brak</span>
                                            ) : (
                                                <div className="my-actions-list">
                                                    {(positionActions[pos.id] || []).map(action => (
                                                        <div key={action.id} className="my-action-row">
                                                            <div className="my-action-left">
                                                                <span className="my-action-type">{ACTION_TYPE_LABELS[action.action_type]}</span>
                                                            </div>
                                                            <div className="my-action-center">
                                                                {editingActionId === action.id ? (
                                                                    <input
                                                                        type="number"
                                                                        min="1"
                                                                        value={editQuantityStr}
                                                                        onChange={e => setEditQuantityStr(e.target.value)}
                                                                        className="qty-input-small"
                                                                    />
                                                                ) : (
                                                                    <>
                                                                        <span className="my-action-qty">x{action.quantity}</span>
                                                                        <span className="my-action-author">{action.actor_name}</span>
                                                                        <span className="my-action-time">{formatTime(action.timestamp)}</span>
                                                                    </>
                                                                )}
                                                            </div>
                                                            <div className="my-action-right">
                                                                {editingActionId === action.id ? (
                                                                    <>
                                                                        <button className="icon-btn" onClick={() => handleUpdateAction(action.id, action.action_type, pos.id)}>✓</button>
                                                                        <button className="icon-btn" onClick={() => setEditingActionId(null)}>✕</button>
                                                                    </>
                                                                ) : (
                                                                    <div className="action-icons">
                                                                        <button
                                                                            className="icon-btn"
                                                                            onClick={() => {
                                                                                setEditingActionId(action.id);
                                                                                setEditQuantityStr(String(action.quantity));
                                                                            }}
                                                                            title="Edytuj"
                                                                        >
                                                                            ✎
                                                                        </button>
                                                                        <button
                                                                            className="icon-btn icon-btn-danger"
                                                                            onClick={() => handleDeleteAction(action.id, pos.id)}
                                                                            title="Usuń"
                                                                        >
                                                                            ×
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        <button
                                            className="btn-danger btn-sm"
                                            onClick={() => handleDeletePosition(pos.id)}
                                            style={{ marginTop: '0.5rem' }}
                                        >
                                            Usuń pozycję
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Add position modal */}
                {showAddPosition && (
                    <div className="modal-overlay">
                        <div className="modal">
                            <h3>Dodaj pozycję</h3>
                            <form onSubmit={handleAddPosition}>
                                <div className="form-group">
                                    <label>Produkt</label>
                                    <select
                                        value={selectedProductId}
                                        onChange={e => setSelectedProductId(Number(e.target.value) || '')}
                                        required
                                    >
                                        <option value="">Wybierz produkt...</option>
                                        {products.map(p => (
                                            <option key={p.id} value={p.id}>
                                                {p.sku} ({p.fabric} / {p.pattern})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Ilość</label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={positionQuantity}
                                        onChange={e => setPositionQuantity(parseInt(e.target.value) || 1)}
                                        required
                                    />
                                </div>
                                <div className="modal-actions">
                                    <button type="button" className="btn-secondary" onClick={() => setShowAddPosition(false)}>
                                        Anuluj
                                    </button>
                                    <button type="submit" className="btn-primary">Dodaj</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
