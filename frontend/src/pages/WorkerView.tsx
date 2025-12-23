import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { OrderListItem, OrderPositionWithActions, ActionType, Action } from '../types';
import { ACTION_TYPE_LABELS } from '../types';
import { getOrdersForWorker, getOrderPositions, getPositionActions, addAction, updateAction, deleteAction } from '../api';

// Helper to format date as DD-MM-YYYY
function formatDate(dateStr: string | null): string {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
}

function formatDateTime(timestamp: string): string {
    const date = new Date(timestamp);
    return date.toLocaleString('pl-PL', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

interface OrderWithPositions extends Omit<OrderListItem, 'positions'> {
    // positions are converted from OrderPositionBrief to OrderPositionWithActions with empty actions
    positions: OrderPositionWithActions[];
}

interface PositionModalData {
    position: OrderPositionWithActions;
    order: OrderWithPositions;
    actions: Action[];
    loadingActions: boolean;
}

export default function WorkerView() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [ordersWithPositions, setOrdersWithPositions] = useState<OrderWithPositions[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    // Search
    const [searchQuery, setSearchQuery] = useState('');

    // Position modal
    const [modalData, setModalData] = useState<PositionModalData | null>(null);

    // Add action form
    const [selectedActionType, setSelectedActionType] = useState<ActionType | null>(null);
    const [actionQuantityStr, setActionQuantityStr] = useState('1');

    // Edit action
    const [editingActionId, setEditingActionId] = useState<number | null>(null);
    const [editQuantityStr, setEditQuantityStr] = useState('1');

    useEffect(() => {
        loadOrdersWithPositions();
    }, []);

    async function loadOrdersWithPositions() {
        try {
            setLoading(true);
            // Orders now include positions with action_totals - no N+1!
            const orders = await getOrdersForWorker();
            // Cast positions to OrderPositionWithActions (they have action_totals but actions will be loaded on demand in modal)
            setOrdersWithPositions(orders.map(o => ({
                ...o,
                positions: o.positions.map(p => ({
                    ...p,
                    order_id: o.id,
                    actions: [], // Actions loaded on demand when opening modal
                })),
            })));
        } catch {
            setError('Nie udało się załadować zamówień');
        } finally {
            setLoading(false);
        }
    }

    async function openPositionModal(position: OrderPositionWithActions, order: OrderWithPositions) {
        setModalData({
            position,
            order,
            actions: [],
            loadingActions: true,
        });
        setSelectedActionType(null);
        setEditingActionId(null);

        try {
            const actions = await getPositionActions(position.id);
            setModalData(prev => prev ? { ...prev, actions, loadingActions: false } : null);
        } catch {
            setModalData(prev => prev ? { ...prev, loadingActions: false } : null);
        }
    }

    async function refreshModalActions() {
        if (!modalData) return;

        try {
            const actions = await getPositionActions(modalData.position.id);
            const positions = await getOrderPositions(modalData.order.id);
            const updatedPosition = positions.find(p => p.id === modalData.position.id);

            if (updatedPosition) {
                setModalData(prev => prev ? {
                    ...prev,
                    actions,
                    position: updatedPosition
                } : null);

                setOrdersWithPositions(prev =>
                    prev.map(o =>
                        o.id === modalData.order.id
                            ? { ...o, positions }
                            : o
                    )
                );
            }

            // Refresh order status - map OrderPositionBrief to OrderPositionWithActions
            const orders = await getOrdersForWorker();
            setOrdersWithPositions(prev =>
                prev.map(o => {
                    const updated = orders.find(ord => ord.id === o.id);
                    if (updated) {
                        return {
                            ...o,
                            ...updated,
                            positions: updated.positions.map(p => ({
                                ...p,
                                order_id: updated.id,
                                actions: [], // Actions loaded on demand
                            })),
                        };
                    }
                    return o;
                })
            );
        } catch {
            // Ignore errors in refresh
        }
    }

    async function handleAddAction() {
        if (!user || !modalData || !selectedActionType || submitting) return;

        const actionQuantity = parseInt(actionQuantityStr) || 0;
        if (actionQuantity <= 0) {
            setError('Ilość musi być większa od 0');
            return;
        }

        const { position } = modalData;
        const currentTotal = position.action_totals[selectedActionType] || 0;
        const remaining = position.quantity - currentTotal;

        if (remaining <= 0) {
            setError('Ten etap jest już w pełni wykonany');
            return;
        }

        if (actionQuantity > remaining) {
            setError(`Przekroczono limit. Maksymalnie można dodać: ${remaining}`);
            return;
        }

        const quantityToAdd = actionQuantity;

        setSubmitting(true);
        setError(null);
        try {
            await addAction(user.id, position.id, { action_type: selectedActionType, quantity: quantityToAdd });
            setSuccess(`Dodano ${quantityToAdd}x ${ACTION_TYPE_LABELS[selectedActionType]}`);
            await refreshModalActions();
            setSelectedActionType(null);
            setActionQuantityStr('1');
            setTimeout(() => setSuccess(null), 2000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Nie udało się dodać akcji');
        } finally {
            setSubmitting(false);
        }
    }

    async function handleUpdateAction(actionId: number, actionType: ActionType) {
        if (!user || !modalData || submitting) return;

        const editQuantity = parseInt(editQuantityStr) || 0;
        if (editQuantity <= 0) {
            setError('Ilość musi być większa od 0');
            return;
        }

        setSubmitting(true);
        setError(null);
        try {
            await updateAction(user.id, actionId, editQuantity);
            setSuccess('Zaktualizowano');
            await refreshModalActions();
            setEditingActionId(null);
            setTimeout(() => setSuccess(null), 2000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Nie udało się zaktualizować akcji');
        } finally {
            setSubmitting(false);
        }
    }

    async function handleDeleteAction(actionId: number) {
        if (!user || submitting) return;

        setSubmitting(true);
        setError(null);
        try {
            await deleteAction(user.id, actionId);
            setSuccess('Usunięto');
            await refreshModalActions();
            setTimeout(() => setSuccess(null), 2000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Nie udało się usunąć akcji');
        } finally {
            setSubmitting(false);
        }
    }

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    // Filter orders by search query
    const filterOrders = (orders: OrderWithPositions[]) => {
        if (!searchQuery.trim()) return orders;
        const q = searchQuery.toLowerCase();
        return orders.filter(o => {
            const client = (o.fullname || o.company || '').toLowerCase();
            const date = formatDate(o.expected_shipment_date).toLowerCase();
            const skus = o.positions.map(p => p.product.sku.toLowerCase());
            const blId = o.baselinker_id ? String(o.baselinker_id) : '';
            return client.includes(q) || date.includes(q) || skus.some(sku => sku.includes(q)) || blId.includes(q);
        });
    };

    const filteredOrders = filterOrders(ordersWithPositions);
    const inProgressOrders = filteredOrders.filter(o => o.status === 'in_progress');
    const doneOrders = filteredOrders.filter(o => o.status === 'done');

    const allowedTypes = user?.allowed_action_types || [];

    function renderOrderCard(order: OrderWithPositions) {
        const displayId = order.baselinker_id || order.id;

        return (
            <div key={order.id} className="order-card">
                <div className="order-card-header-inline">
                    <span className="order-id">#{displayId}</span>
                    <span className="order-separator">•</span>
                    <span className="order-client">{order.fullname || order.company || '-'}</span>
                    <span className="order-separator">•</span>
                    <span className="order-date"><strong>{formatDate(order.expected_shipment_date)}</strong></span>
                </div>

                <div className="positions-list-compact">
                    {order.positions.length === 0 ? (
                        <p className="text-muted">Brak pozycji</p>
                    ) : (
                        order.positions.map(position => {
                            return (
                                <div
                                    key={position.id}
                                    className="position-row-clickable"
                                    onClick={() => openPositionModal(position, order)}
                                >
                                    <div className="position-row-left">
                                        <span className="position-sku">{position.product.sku}</span>
                                    </div>
                                    <div className="position-row-right">
                                        <div className="action-pills-row">
                                            {(['cutting', 'sewing', 'ironing', 'packing'] as ActionType[]).map(at => {
                                                const done = position.action_totals[at] || 0;
                                                const isComplete = done >= position.quantity;
                                                const shortLabel = ACTION_TYPE_LABELS[at].slice(0, 3);
                                                return (
                                                    <span
                                                        key={at}
                                                        className={`action-pill action-pill-${at} ${isComplete ? 'complete' : ''}`}
                                                        title={`${ACTION_TYPE_LABELS[at]}: ${done}/${position.quantity}`}
                                                    >
                                                        {shortLabel}: {done}/{position.quantity}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="app-container">
            <header className="header">
                <div className="header-content">
                    <h1 className="hide-mobile">Panel Pracownika</h1>
                    <div className="header-user">
                        <span>{user?.name}</span>
                        <button onClick={handleLogout} className="btn-secondary btn-sm">Wyloguj</button>
                    </div>
                </div>
            </header>

            <nav className="admin-nav">
                <Link to="/worker" className="nav-link active">Zamówienia</Link>
                <Link to="/worker/entries" className="nav-link">Moje wpisy</Link>
            </nav>

            {/* Search bar */}
            <div className="worker-search-bar">
                <input
                    type="text"
                    placeholder="Szukaj po kliencie, SKU lub dacie..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="search-input"
                />
            </div>

            <main className="main-content">
                {error && <div className="error-message" onClick={() => setError(null)}>{error}</div>}
                {success && <div className="success-message">{success}</div>}

                {loading ? (
                    <p>Ładowanie...</p>
                ) : filteredOrders.length === 0 ? (
                    <div className="card">
                        <p className="text-muted">{searchQuery ? 'Brak wyników wyszukiwania' : 'Brak zamówień do wyświetlenia'}</p>
                    </div>
                ) : (
                    <>
                        {inProgressOrders.length > 0 && (
                            <div className="orders-section">
                                <h2 className="section-title">W realizacji ({inProgressOrders.length})</h2>
                                <div className="orders-list">
                                    {inProgressOrders.map(renderOrderCard)}
                                </div>
                            </div>
                        )}

                        {doneOrders.length > 0 && (
                            <div className="orders-section done-section">
                                <h2 className="section-title">Gotowe ({doneOrders.length})</h2>
                                <div className="orders-list">
                                    {doneOrders.map(renderOrderCard)}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </main>

            {/* Position Modal */}
            {modalData && (
                <div className="modal-overlay" onClick={() => setModalData(null)}>
                    <div className="modal position-modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{modalData.position.product.sku}</h3>
                            <button className="modal-close" onClick={() => setModalData(null)}>×</button>
                        </div>

                        <div className="position-modal-info">
                            <span>{modalData.position.product.fabric} / {modalData.position.product.pattern}</span>
                            <span className="position-qty-tag">x{modalData.position.quantity}</span>
                        </div>

                        {/* Action Grid - 2 columns */}
                        <div className="modal-section">
                            <h4>Dodaj akcję</h4>
                            <div className="action-grid">
                                {(['cutting', 'sewing', 'ironing', 'packing'] as ActionType[]).map(actionType => {
                                    const done = modalData.position.action_totals[actionType] || 0;
                                    const total = modalData.position.quantity;
                                    const remaining = total - done;
                                    const isComplete = done >= total;
                                    const canPerform = allowedTypes.includes(actionType);
                                    const isSelected = selectedActionType === actionType;

                                    return (
                                        <div
                                            key={actionType}
                                            className={`action-square action-square-${actionType} ${isComplete ? 'complete' : ''} ${canPerform && !isComplete ? 'clickable' : 'disabled'} ${isSelected ? 'selected' : ''}`}
                                            onClick={() => {
                                                if (canPerform && !isComplete) {
                                                    setSelectedActionType(isSelected ? null : actionType);
                                                    setActionQuantityStr(String(remaining));
                                                }
                                            }}
                                        >
                                            <span className="action-square-label">{ACTION_TYPE_LABELS[actionType]}</span>
                                            <span className="action-square-count">{done}/{total}</span>

                                            {isSelected && (
                                                <div className="action-square-input" onClick={e => e.stopPropagation()}>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        max={remaining}
                                                        value={actionQuantityStr}
                                                        onChange={e => setActionQuantityStr(e.target.value)}
                                                        autoFocus
                                                    />
                                                    <button
                                                        className="btn-primary btn-xs"
                                                        onClick={handleAddAction}
                                                        disabled={submitting}
                                                    >
                                                        {submitting ? '...' : '✓'}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* All Actions */}
                        <div className="modal-section">
                            <h4>Wszystkie wpisy ({modalData.actions.length})</h4>
                            {modalData.loadingActions ? (
                                <p className="text-muted">Ładowanie...</p>
                            ) : modalData.actions.length === 0 ? (
                                <p className="text-muted">Brak wpisów dla tej pozycji</p>
                            ) : (
                                <div className="my-actions-list">
                                    {modalData.actions.map(action => {
                                        const isMyAction = action.actor_id === user?.id;

                                        return (
                                        <div key={action.id} className={`my-action-row ${isMyAction ? 'my-own' : ''}`}>
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
                                                        <span className="my-action-time">{formatDateTime(action.timestamp)}</span>
                                                    </>
                                                )}
                                            </div>
                                            <div className="my-action-right">
                                                {editingActionId === action.id ? (
                                                    <>
                                                        <button
                                                            className="btn-primary btn-xs"
                                                            onClick={() => handleUpdateAction(action.id, action.action_type)}
                                                            disabled={submitting}
                                                            title="Zapisz"
                                                        >
                                                            ✓
                                                        </button>
                                                        <button
                                                            className="btn-secondary btn-xs"
                                                            onClick={() => setEditingActionId(null)}
                                                            title="Anuluj"
                                                        >
                                                            ✕
                                                        </button>
                                                    </>
                                                ) : (
                                                    isMyAction && (
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
                                                                onClick={() => handleDeleteAction(action.id)}
                                                                disabled={submitting}
                                                                title="Usuń"
                                                            >
                                                                ×
                                                            </button>
                                                        </div>
                                                    )
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
