import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import WorkerTopBar from '../WorkerTopBar';
import type {
  Action,
  ActionType,
  OrderListItem,
  OrderPositionWithActions,
  User as WorkerUser,
} from '../types';
import { ACTION_TYPE_LABELS } from '../types';
import {
  addAction,
  deleteAction,
  getOrderPositions,
  getOrdersForWorker,
  getPositionActions,
  getWorkers,
  updateAction,
} from '../api';

const ACTION_TYPES: ActionType[] = ['cutting', 'sewing', 'ironing', 'packing'];

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
  positions: OrderPositionWithActions[];
}

interface PositionModalData {
  position: OrderPositionWithActions;
  order: OrderWithPositions;
  actions: Action[];
  loadingActions: boolean;
}

function normalizeOrders(orders: OrderListItem[]): OrderWithPositions[] {
  return orders.map(order => ({
    ...order,
    positions: order.positions.map(position => ({
      ...position,
      order_id: order.id,
      actions: [],
    })),
  }));
}

export default function WorkerView() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [ordersWithPositions, setOrdersWithPositions] = useState<OrderWithPositions[]>([]);
  const [workers, setWorkers] = useState<WorkerUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingWorkers, setLoadingWorkers] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [modalData, setModalData] = useState<PositionModalData | null>(null);
  const [selectedActionType, setSelectedActionType] = useState<ActionType | null>(null);
  const [selectedSharedWorkerIds, setSelectedSharedWorkerIds] = useState<number[]>([]);
  const [lastUsedCuttingWorkerIds, setLastUsedCuttingWorkerIds] = useState<number[]>([]);
  const [actionQuantityStr, setActionQuantityStr] = useState('1');
  const [editingActionId, setEditingActionId] = useState<number | null>(null);
  const [editQuantityStr, setEditQuantityStr] = useState('1');

  useEffect(() => {
    loadOrdersWithPositions();
    loadWorkers();
  }, []);

  async function loadOrdersWithPositions() {
    try {
      setLoading(true);
      const orders = await getOrdersForWorker();
      setOrdersWithPositions(normalizeOrders(orders));
    } catch {
      setError('Nie udało się załadować zamówień');
    } finally {
      setLoading(false);
    }
  }

  async function loadWorkers() {
    try {
      setLoadingWorkers(true);
      const workerList = await getWorkers();
      setWorkers(workerList);
    } catch {
      setWorkers([]);
    } finally {
      setLoadingWorkers(false);
    }
  }

  function closePositionModal() {
    setModalData(null);
    setSelectedActionType(null);
    setSelectedSharedWorkerIds([]);
    setEditingActionId(null);
    setActionQuantityStr('1');
  }

  async function openPositionModal(position: OrderPositionWithActions, order: OrderWithPositions) {
    setModalData({
      position,
      order,
      actions: [],
      loadingActions: true,
    });
    setSelectedActionType(null);
    setSelectedSharedWorkerIds([]);
    setEditingActionId(null);

    try {
      const actions = await getPositionActions(position.id);
      setModalData(prev => (prev ? { ...prev, actions, loadingActions: false } : null));
    } catch {
      setModalData(prev => (prev ? { ...prev, loadingActions: false } : null));
    }
  }

  async function refreshModalActions() {
    if (!modalData) return;

    try {
      const [actions, positions, orders] = await Promise.all([
        getPositionActions(modalData.position.id),
        getOrderPositions(modalData.order.id),
        getOrdersForWorker(),
      ]);

      const normalizedOrders = normalizeOrders(orders);
      const updatedPosition = positions.find(position => position.id === modalData.position.id);
      const updatedOrder = normalizedOrders.find(order => order.id === modalData.order.id);

      setOrdersWithPositions(normalizedOrders);
      if (updatedPosition && updatedOrder) {
        setModalData(prev => (
          prev
            ? {
              ...prev,
              actions,
              position: updatedPosition,
              order: updatedOrder,
              loadingActions: false,
            }
            : null
        ));
      }
    } catch {
      // Ignore refresh errors
    }
  }

  async function handleAddAction() {
    if (!user || !modalData || !selectedActionType || submitting) return;

    const actionQuantity = parseInt(actionQuantityStr, 10) || 0;
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

    setSubmitting(true);
    setError(null);
    try {
      await addAction(user.id, position.id, {
        action_type: selectedActionType,
        quantity: actionQuantity,
        shared_worker_ids: selectedActionType === 'cutting' ? selectedSharedWorkerIds : undefined,
      });
      if (selectedActionType === 'cutting') {
        setLastUsedCuttingWorkerIds(selectedSharedWorkerIds);
      }
      setSuccess(`Dodano ${actionQuantity}x ${ACTION_TYPE_LABELS[selectedActionType]}`);
      await refreshModalActions();
      setSelectedActionType(null);
      setSelectedSharedWorkerIds([]);
      setActionQuantityStr('1');
      setTimeout(() => setSuccess(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się dodać akcji');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdateAction(actionId: number) {
    if (!user || submitting) return;

    const editQuantity = parseInt(editQuantityStr, 10) || 0;
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

  function toggleSharedWorker(workerId: number) {
    setSelectedSharedWorkerIds(prev =>
      prev.includes(workerId)
        ? prev.filter(id => id !== workerId)
        : [...prev, workerId]
    );
  }

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const allowedTypes = user?.allowed_action_types || [];
  const visibleActionTypes = ACTION_TYPES.filter(actionType => allowedTypes.includes(actionType));
  const selectableCuttingWorkers = workers.filter(worker =>
    worker.id !== user?.id && worker.allowed_action_types.includes('cutting')
  );
  const rememberedCuttingWorkerIds = lastUsedCuttingWorkerIds.filter(workerId =>
    selectableCuttingWorkers.some(worker => worker.id === workerId)
  );

  const filteredOrders = ordersWithPositions.filter(order => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const client = (order.fullname || order.company || '').toLowerCase();
    const date = formatDate(order.expected_shipment_date).toLowerCase();
    const source = (order.source || '').toLowerCase();
    const skus = order.positions.map(position => position.product.sku.toLowerCase());
    return (
      client.includes(query) ||
      date.includes(query) ||
      source.includes(query) ||
      skus.some(sku => sku.includes(query))
    );
  });

  const visibleOrders = filteredOrders.filter(order => order.status === 'in_progress');
  const activeOrdersCount = ordersWithPositions.filter(order => order.status === 'in_progress').length;

  function renderOrderCard(order: OrderWithPositions) {
    const displaySource = order.source || '-';

    return (
      <div key={order.id} className="order-card order-card-minimal">
        <div className="order-card-header-inline order-card-header-inline-minimal">
          <span className="order-id">{displaySource}</span>
          <span className="order-separator" aria-hidden="true">•</span>
          <span className="order-client">{order.fullname || order.company || '-'}</span>
          <span className="order-separator" aria-hidden="true">•</span>
          <span className="order-date"><strong>{formatDate(order.expected_shipment_date)}</strong></span>
        </div>

        <div className="positions-list-compact positions-list-compact-minimal">
          {order.positions.length === 0 ? (
            <p className="text-muted">Brak pozycji</p>
          ) : (
            order.positions.map(position => (
              <div
                key={position.id}
                className="position-row-clickable position-row-clickable-minimal"
                onClick={() => openPositionModal(position, order)}
              >
                <div className="position-row-left">
                  <span className="position-sku">{position.product.sku}</span>
                </div>
                <div className="position-row-right">
                  {visibleActionTypes.length === 0 ? (
                    <span className="no-permission-text">Brak przypisanych akcji</span>
                  ) : (
                    <div className="position-action-bars">
                      {visibleActionTypes.map(actionType => {
                        const done = position.action_totals[actionType] || 0;
                        const isComplete = done >= position.quantity;
                        return (
                          <span
                            key={actionType}
                            className={`position-action-bar position-action-bar-${actionType} ${isComplete ? 'complete' : ''}`}
                            title={`${ACTION_TYPE_LABELS[actionType]}: ${done}/${position.quantity}`}
                          >
                            <span className="position-action-bar-label">{ACTION_TYPE_LABELS[actionType]}</span>
                            <span className="position-action-bar-count">{done}/{position.quantity}</span>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <WorkerTopBar
        activeOrdersCount={activeOrdersCount}
        userName={user?.name}
        onLogout={handleLogout}
      />

      <div className="worker-search-bar">
        <div className="worker-search-input-wrapper">
          <input
            type="text"
            placeholder="Szukaj po kliencie, SKU, źródle lub dacie..."
            value={searchQuery}
            onChange={event => setSearchQuery(event.target.value)}
            className="search-input"
          />
          {searchQuery && (
            <button
              type="button"
              className="worker-search-clear"
              onClick={() => setSearchQuery('')}
              aria-label="Wyczyść wyszukiwanie"
              title="Wyczyść"
            >
              ×
            </button>
          )}
        </div>
      </div>

      <main className="main-content worker-main-content">
        {error && <div className="error-message" onClick={() => setError(null)}>{error}</div>}
        {success && <div className="success-message">{success}</div>}

        {loading ? (
          <p>Ładowanie...</p>
        ) : visibleOrders.length === 0 ? (
          <div className="card">
            <p className="text-muted">
              {searchQuery ? 'Brak wyników wyszukiwania' : 'Brak zamówień do wyświetlenia'}
            </p>
          </div>
        ) : (
          <div className="orders-section orders-section-minimal">
            <div className="orders-list orders-list-minimal">
              {visibleOrders.map(renderOrderCard)}
            </div>
          </div>
        )}
      </main>

      {modalData && (
        <div className="modal-overlay" onClick={closePositionModal}>
          <div className="modal position-modal" onClick={event => event.stopPropagation()}>
            <div className="modal-header">
              <h3>{modalData.position.product.sku}</h3>
              <button className="modal-close" onClick={closePositionModal}>×</button>
            </div>

            <div className="position-modal-info">
              <span>{modalData.position.product.fabric} / {modalData.position.product.pattern}</span>
              <span className="position-qty-tag">x{modalData.position.quantity}</span>
            </div>

            <div className="modal-section">
              <h4>Dodaj akcję</h4>
              {visibleActionTypes.length === 0 ? (
                <p className="text-muted">Nie masz przypisanych akcji do wykonania.</p>
              ) : (
                <div className="action-stack">
                  {visibleActionTypes.map(actionType => {
                    const done = modalData.position.action_totals[actionType] || 0;
                    const total = modalData.position.quantity;
                    const remaining = total - done;
                    const isComplete = done >= total;
                    const isSelected = selectedActionType === actionType;

                    return (
                      <div
                        key={actionType}
                        className={`action-bar action-bar-${actionType} ${isComplete ? 'complete' : ''} ${isSelected ? 'selected' : ''}`}
                      >
                        <button
                          type="button"
                          className="action-bar-button"
                          disabled={isComplete}
                          onClick={() => {
                            if (isComplete) return;
                            const nextSelected = isSelected ? null : actionType;
                            setSelectedActionType(nextSelected);
                            setSelectedSharedWorkerIds(
                              nextSelected === 'cutting' ? rememberedCuttingWorkerIds : []
                            );
                            if (nextSelected) {
                              setActionQuantityStr(String(remaining));
                            }
                          }}
                        >
                          <div className="action-bar-top">
                            <span className="action-bar-label">{ACTION_TYPE_LABELS[actionType]}</span>
                            <span className="action-bar-count">{done}/{total}</span>
                          </div>
                          <div className="action-bar-bottom">
                            {isComplete ? 'Etap zakończony' : `Pozostało: ${remaining}`}
                          </div>
                        </button>

                        {isSelected && (
                          <div className="action-bar-form" onClick={event => event.stopPropagation()}>
                            <div className="action-bar-form-row">
                              <label htmlFor={`action-qty-${actionType}`}>Ilość</label>
                              <input
                                id={`action-qty-${actionType}`}
                                type="number"
                                min="1"
                                max={remaining}
                                value={actionQuantityStr}
                                onChange={event => setActionQuantityStr(event.target.value)}
                                autoFocus
                              />
                              <button
                                className="btn-primary"
                                onClick={handleAddAction}
                                disabled={submitting}
                              >
                                {submitting ? 'Zapisywanie...' : 'Dodaj wpis'}
                              </button>
                            </div>

                            {actionType === 'cutting' && (
                              <div className="shared-workers-panel">
                                <span className="shared-workers-label">
                                  Dodatkowi pracownicy do tego wpisu
                                </span>
                                {loadingWorkers ? (
                                  <p className="text-muted">Ładowanie pracowników...</p>
                                ) : selectableCuttingWorkers.length === 0 ? (
                                  <p className="text-muted">
                                    Brak innych pracowników z uprawnieniem do krojenia.
                                  </p>
                                ) : (
                                  <div className="shared-workers-list">
                                    {selectableCuttingWorkers.map(worker => {
                                      const isSelectedWorker = selectedSharedWorkerIds.includes(worker.id);
                                      return (
                                        <button
                                          key={worker.id}
                                          type="button"
                                          className={`shared-worker-chip ${isSelectedWorker ? 'selected' : ''}`}
                                          onClick={() => toggleSharedWorker(worker.id)}
                                        >
                                          {worker.name}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="modal-section">
              <h4>Wszystkie wpisy ({modalData.actions.length})</h4>
              {modalData.loadingActions ? (
                <p className="text-muted">Ładowanie...</p>
              ) : modalData.actions.length === 0 ? (
                <p className="text-muted">Brak wpisów dla tej pozycji</p>
              ) : (
                <div className="my-actions-list">
                  {modalData.actions.map(action => {
                    const isAssignedToMe = !!user && action.worker_ids.includes(user.id);
                    const workerLabel = action.worker_names.join(', ');

                    return (
                      <div key={action.id} className={`my-action-row ${isAssignedToMe ? 'my-own' : ''}`}>
                        <div className="my-action-left">
                          <span className="my-action-type">{ACTION_TYPE_LABELS[action.action_type]}</span>
                        </div>
                        <div className="my-action-center">
                          {editingActionId === action.id ? (
                            <input
                              type="number"
                              min="1"
                              value={editQuantityStr}
                              onChange={event => setEditQuantityStr(event.target.value)}
                              className="qty-input-small"
                            />
                          ) : (
                            <>
                              <span className="my-action-qty">x{action.quantity}</span>
                              <span className="my-action-author">{action.actor_name}</span>
                              {action.worker_names.length > 1 && (
                                <span className="my-action-workers">Pracownicy: {workerLabel}</span>
                              )}
                              <span className="my-action-time">{formatDateTime(action.timestamp)}</span>
                            </>
                          )}
                        </div>
                        <div className="my-action-right">
                          {editingActionId === action.id ? (
                            <>
                              <button
                                className="btn-primary btn-xs"
                                onClick={() => handleUpdateAction(action.id)}
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
                            isAssignedToMe && (
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
