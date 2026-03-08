import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getOrdersPaginated, getOrderSources, getOrder, createOrder, deleteOrder, updateOrder, getProducts, getOrderPositions, getPositionActions, addPosition, deletePosition, updateOrderStatus, bulkUpdateOrderStatus, updateAction, deleteAction, updateOrderShipmentDate } from '../api';
import type { OrderListItem, Order, Product, OrderPositionWithActions, ActionType, OrderStatus, Action, OrderStatusCounts } from '../types';
import { ACTION_TYPE_LABELS, ORDER_STATUS_LABELS, SYNC_LABELS } from '../types';

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

function formatIntegration(integration: string | null): string {
    if (!integration) return '-';
    return SYNC_LABELS[integration as keyof typeof SYNC_LABELS] || integration;
}

const PAGE_SIZE = 20;

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
    const [currentPage, setCurrentPage] = useState(1);
    const [totalOrders, setTotalOrders] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [statusCounts, setStatusCounts] = useState<OrderStatusCounts>({
        all: 0,
        fetched: 0,
        in_progress: 0,
        done: 0,
        cancelled: 0,
    });

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

    useEffect(() => {
        loadProducts();
        loadSources();
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            loadOrders(1);
        }, 300);
        return () => clearTimeout(timer);
    }, [search, dateFrom, dateTo, statusFilter, sourceFilter]);

    useEffect(() => {
        if (orderId) {
            loadOrderDetails(parseInt(orderId));
        } else {
            setSelectedOrder(null);
            setPositions([]);
            setPositionActions({});
        }
    }, [orderId]);

    const loadOrders = async (page = currentPage) => {
        setLoading(true);
        setSelectedOrderIds(new Set());
        try {
            const data = await getOrdersPaginated({
                search: search.trim() || undefined,
                dateFrom: dateFrom || undefined,
                dateTo: dateTo || undefined,
                status: statusFilter || undefined,
                source: sourceFilter || undefined,
                page,
                pageSize: PAGE_SIZE,
            });
            setOrders(data.items);
            setCurrentPage(data.page);
            setTotalOrders(data.total);
            setTotalPages(data.total_pages);
            setStatusCounts(data.status_counts);
        } catch {
            setError('Nie udało się załadować zamówień');
        } finally {
            setLoading(false);
        }
    };

    const loadSources = async () => {
        try {
            const sources = await getOrderSources();
            setAllSources(sources);
        } catch {
            console.error('Failed to load order sources');
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
            await loadOrders(currentPage);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Nie udało się utworzyć zamówienia');
        }
    };

    const handleDeleteOrder = async (id: number) => {
        if (!user || !confirm('Czy na pewno chcesz usunąć to zamówienie?')) return;
        try {
            await deleteOrder(user.id, id);
            await loadOrders(currentPage);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Nie udało się usunąć zamówienia');
        }
    };

    const handleChangeStatus = async (orderId: number, newStatus: OrderStatus) => {
        if (!user) return;
        try {
            await updateOrderStatus(user.id, orderId, newStatus);
            await loadOrders(currentPage);
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
        if (selectedOrderIds.size === orders.length && orders.length > 0) {
            setSelectedOrderIds(new Set());
        } else {
            setSelectedOrderIds(new Set(orders.map(o => o.id)));
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
            loadOrders(currentPage);
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

    const totalOrdersCount = orders.length;
    const selectedCount = selectedOrderIds.size;
    const statusTabs: Array<{ value: OrderStatus | ''; label: string; count: number }> = [
        { value: '', label: 'Wszystkie', count: statusCounts.all },
        { value: 'fetched', label: 'Pobrane', count: statusCounts.fetched },
        { value: 'in_progress', label: 'W realizacji', count: statusCounts.in_progress },
        { value: 'done', label: 'Gotowe', count: statusCounts.done },
    ];
    const pageStart = totalOrders === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
    const pageEnd = totalOrders === 0 ? 0 : pageStart + orders.length - 1;
    const visiblePages = getVisiblePageNumbers(currentPage, totalPages);

    const handlePageChange = (page: number) => {
        if (page < 1 || page > totalPages || page === currentPage) return;
        loadOrders(page);
    };

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
                                {statusTabs.map(tab => (
                                    <button
                                        key={tab.value || 'all'}
                                        className={`status-tab ${statusFilter === tab.value ? 'active' : ''}`}
                                        onClick={() => setStatusFilter(tab.value)}
                                    >
                                        <span className="status-tab-content">
                                            <span>{tab.label}</span>
                                            <span className="status-tab-count">{tab.count}</span>
                                        </span>
                                    </button>
                                ))}
                            </div>

                            <div className="filters-row">
                                <input
                                    type="text"
                                    placeholder="Szukaj po kliencie, ID lub ID zewnętrznym..."
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
                            ) : orders.length === 0 ? (
                                <p className="text-muted">Brak zamówień</p>
                            ) : (
                                <>
                                    <div className="orders-table-wrapper">
                                        <table className="data-table">
                                            <thead>
                                                <tr>
                                                    <th className="checkbox-col"></th>
                                                    <th>ID</th>
                                                    <th>ID zewn.</th>
                                                    <th>Klient</th>
                                                    <th className="hide-mobile">Źródło</th>
                                                    <th>Wysyłka</th>
                                                    <th className="hide-mobile">Poz.</th>
                                                    <th>Status</th>
                                                    <th>Akcje</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {orders.map(order => (
                                                    <React.Fragment key={order.id}>
                                                        <tr className="order-main-row">
                                                            <td className="checkbox-col">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedOrderIds.has(order.id)}
                                                                    onChange={() => toggleOrderSelection(order.id)}
                                                                />
                                                            </td>
                                                            <td className="order-id-cell">
                                                                <Link to={`/admin/orders/${order.id}`} className="order-id-link">
                                                                    #{order.id}
                                                                </Link>
                                                            </td>
                                                            <td className="order-external-id-cell">
                                                                <span className="order-secondary-text">{order.external_id || '-'}</span>
                                                            </td>
                                                            <td className="order-client-cell">
                                                                <span className="order-primary-text">{order.fullname || order.company || '-'}</span>
                                                            </td>
                                                            <td className="hide-mobile order-source-cell">
                                                                <span className="order-secondary-text">{order.source || '-'}</span>
                                                            </td>
                                                            <td className="editable-date-cell order-shipment-cell">
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
                                                            <td className="hide-mobile order-position-count-cell">
                                                                <span className="order-count-badge">{order.position_count}</span>
                                                            </td>
                                                            <td className="order-status-cell">
                                                                <span className={getStatusBadgeClass(order.status)}>
                                                                    {ORDER_STATUS_LABELS[order.status]}
                                                                </span>
                                                            </td>
                                                            <td className="actions-cell order-actions-cell">
                                                                <button
                                                                    className="btn-danger btn-sm"
                                                                    onClick={() => handleDeleteOrder(order.id)}
                                                                >
                                                                    ×
                                                                </button>
                                                            </td>
                                                        </tr>
                                                        {order.positions.map(pos => (
                                                            <tr key={`pos-${pos.id}`} className="position-subrow">
                                                                <td className="checkbox-col"></td>
                                                                <td colSpan={8} className="position-subrow-content-cell">
                                                                    <div className="position-subrow-content">
                                                                        <div className="position-subrow-main">
                                                                            <span className="subrow-marker">↳</span>
                                                                            <span className="position-sku-text">{pos.product.sku}</span>
                                                                            <span className="position-qty-badge">x{pos.quantity}</span>
                                                                        </div>
                                                                        <div className="action-pills-row position-subrow-pills">
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
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </React.Fragment>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    <div className="pagination-bar">
                                        <div className="pagination-summary">
                                            Pokazano {pageStart}-{pageEnd} z {totalOrders} zamówień
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
                                <p><strong>Integracja:</strong> {formatIntegration(selectedOrder.integration)}</p>
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
                                {selectedOrder.external_id && (
                                    <p><strong>ID zewnętrzne:</strong> {selectedOrder.external_id}</p>
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
