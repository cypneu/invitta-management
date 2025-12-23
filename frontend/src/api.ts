import type {
    User, UserCreate, UserUpdate,
    Product, ProductCreate, ProductUpdate,
    Order, OrderListItem, OrderCreate, OrderUpdate, OrderStatus,
    Action, ActionCreate, OrderPositionWithActions,
    SyncStatus, SyncResult, OrderFilters, ActionType
} from './types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Auth API
export async function login(code: string): Promise<User> {
    const response = await fetch(`${API_BASE}/api/users/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
    });
    if (!response.ok) {
        throw new Error('Nie znaleziono użytkownika');
    }
    return response.json();
}

// Users API
export async function getWorkers(): Promise<User[]> {
    const response = await fetch(`${API_BASE}/api/users/workers`);
    return response.json();
}

export async function getAllUsers(): Promise<User[]> {
    const response = await fetch(`${API_BASE}/api/users/`);
    return response.json();
}

export async function getUser(userId: number): Promise<User> {
    const response = await fetch(`${API_BASE}/api/users/${userId}`);
    if (!response.ok) {
        throw new Error('User not found');
    }
    return response.json();
}

export async function createWorker(userId: number, worker: UserCreate): Promise<User> {
    const response = await fetch(`${API_BASE}/api/users/workers?user_id=${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(worker),
    });
    if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Nie udało się utworzyć pracownika');
    }
    return response.json();
}

export async function updateWorker(userId: number, workerId: number, worker: UserUpdate): Promise<User> {
    const response = await fetch(`${API_BASE}/api/users/workers/${workerId}?user_id=${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(worker),
    });
    if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Nie udało się zaktualizować pracownika');
    }
    return response.json();
}

export async function deleteWorker(userId: number, workerId: number): Promise<void> {
    const response = await fetch(`${API_BASE}/api/users/workers/${workerId}?user_id=${userId}`, {
        method: 'DELETE',
    });
    if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Nie udało się usunąć pracownika');
    }
}

// Products API
export async function getProducts(search?: string): Promise<Product[]> {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    const response = await fetch(`${API_BASE}/api/products/?${params}`);
    return response.json();
}

export async function getProduct(productId: number): Promise<Product> {
    const response = await fetch(`${API_BASE}/api/products/${productId}`);
    if (!response.ok) {
        throw new Error('Product not found');
    }
    return response.json();
}

export async function getShapes(): Promise<string[]> {
    const response = await fetch(`${API_BASE}/api/products/shapes/`);
    return response.json();
}

export async function createProduct(userId: number, data: ProductCreate): Promise<Product> {
    const response = await fetch(`${API_BASE}/api/products/?user_id=${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!response.ok) {
        const result = await response.json();
        throw new Error(result.detail || 'Nie udało się utworzyć produktu');
    }
    return response.json();
}

export async function updateProduct(userId: number, productId: number, data: ProductUpdate): Promise<Product> {
    const response = await fetch(`${API_BASE}/api/products/${productId}?user_id=${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!response.ok) {
        const result = await response.json();
        throw new Error(result.detail || 'Nie udało się zaktualizować produktu');
    }
    return response.json();
}

export async function deleteProduct(userId: number, productId: number): Promise<void> {
    const response = await fetch(`${API_BASE}/api/products/${productId}?user_id=${userId}`, {
        method: 'DELETE',
    });
    if (!response.ok) {
        const result = await response.json();
        throw new Error(result.detail || 'Nie udało się usunąć produktu');
    }
}

// Orders API
export async function getOrders(filters: OrderFilters = {}): Promise<OrderListItem[]> {
    const params = new URLSearchParams();
    if (filters.source) params.append('source', filters.source);
    if (filters.status) params.append('status', filters.status);
    if (filters.dateFrom) params.append('date_from', filters.dateFrom);
    if (filters.dateTo) params.append('date_to', filters.dateTo);
    if (filters.search) params.append('search', filters.search);
    const response = await fetch(`${API_BASE}/api/orders/?${params}`);
    return response.json();
}

export async function getOrdersForWorker(): Promise<OrderListItem[]> {
    const response = await fetch(`${API_BASE}/api/orders/for-worker`);
    return response.json();
}

export async function getOrder(orderId: number): Promise<Order> {
    const response = await fetch(`${API_BASE}/api/orders/${orderId}`);
    if (!response.ok) {
        throw new Error('Order not found');
    }
    return response.json();
}

export async function createOrder(userId: number, order: OrderCreate): Promise<Order> {
    const response = await fetch(`${API_BASE}/api/orders/?user_id=${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order),
    });
    if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Nie udało się utworzyć zamówienia');
    }
    return response.json();
}

export async function updateOrder(userId: number, orderId: number, order: OrderUpdate): Promise<Order> {
    const response = await fetch(`${API_BASE}/api/orders/${orderId}?user_id=${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order),
    });
    if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Nie udało się zaktualizować zamówienia');
    }
    return response.json();
}

export async function updateOrderStatus(userId: number, orderId: number, status: OrderStatus): Promise<Order> {
    const response = await fetch(`${API_BASE}/api/orders/${orderId}/status?user_id=${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
    });
    if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Nie udało się zmienić statusu zamówienia');
    }
    return response.json();
}

export async function bulkUpdateOrderStatus(userId: number, orderIds: number[], status: OrderStatus): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE}/api/orders/bulk-status?user_id=${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_ids: orderIds, status }),
    });
    if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Nie udało się zmienić statusów');
    }
    return response.json();
}

export async function updateOrderShipmentDate(userId: number, orderId: number, shipmentDate: string | null): Promise<Order> {
    const response = await fetch(`${API_BASE}/api/orders/${orderId}/shipment-date?user_id=${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expected_shipment_date: shipmentDate }),
    });
    if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Nie udało się zaktualizować daty wysyłki');
    }
    return response.json();
}

export async function deleteOrder(userId: number, orderId: number): Promise<void> {
    const response = await fetch(`${API_BASE}/api/orders/${orderId}?user_id=${userId}`, {
        method: 'DELETE',
    });
    if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Nie udało się usunąć zamówienia');
    }
}

// Order Positions API
export async function getOrderPositions(orderId: number): Promise<OrderPositionWithActions[]> {
    const response = await fetch(`${API_BASE}/api/orders/${orderId}/positions`);
    if (!response.ok) {
        throw new Error('Failed to get positions');
    }
    return response.json();
}

export async function getPosition(positionId: number): Promise<OrderPositionWithActions> {
    const response = await fetch(`${API_BASE}/api/order-positions/${positionId}`);
    if (!response.ok) {
        throw new Error('Position not found');
    }
    return response.json();
}

export async function addPosition(userId: number, orderId: number, productId: number, quantity: number): Promise<void> {
    const response = await fetch(`${API_BASE}/api/orders/${orderId}/positions?user_id=${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: productId, quantity }),
    });
    if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Nie udało się dodać pozycji');
    }
}

export async function deletePosition(userId: number, positionId: number): Promise<void> {
    const response = await fetch(`${API_BASE}/api/orders/positions/${positionId}?user_id=${userId}`, {
        method: 'DELETE',
    });
    if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Nie udało się usunąć pozycji');
    }
}

// Actions API
export async function addAction(userId: number, positionId: number, action: ActionCreate): Promise<Action> {
    const response = await fetch(`${API_BASE}/api/order-positions/${positionId}/actions?user_id=${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action),
    });
    if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Nie udało się dodać akcji');
    }
    return response.json();
}

export async function getPositionActions(positionId: number): Promise<Action[]> {
    const response = await fetch(`${API_BASE}/api/order-positions/${positionId}/actions`);
    return response.json();
}

export async function deleteAction(userId: number, actionId: number): Promise<void> {
    const response = await fetch(`${API_BASE}/api/actions/${actionId}?user_id=${userId}`, {
        method: 'DELETE',
    });
    if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Nie udało się usunąć akcji');
    }
}

export async function updateAction(userId: number, actionId: number, quantity: number): Promise<void> {
    const response = await fetch(`${API_BASE}/api/actions/${actionId}?user_id=${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity }),
    });
    if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Nie udało się zaktualizować akcji');
    }
}

export interface ActionHistoryItem {
    id: number;
    order_position_id: number;
    order_id: number;
    action_type: string;
    quantity: number;
    actor_id: number;
    actor_name: string;
    timestamp: string;
    product_sku: string;
    cost: number | null;
}

export async function getActionHistory(
    workerId?: number,
    dateFrom?: string,
    dateTo?: string,
    actionType?: ActionType
): Promise<ActionHistoryItem[]> {
    const params = new URLSearchParams();
    if (workerId) params.append('worker_id', String(workerId));
    if (dateFrom) params.append('date_from', dateFrom);
    if (dateTo) params.append('date_to', dateTo);
    if (actionType) params.append('action_type', actionType);
    const response = await fetch(`${API_BASE}/api/actions/history?${params}`);
    return response.json();
}

export async function getMyActions(userId: number, actionType?: ActionType, dateFrom?: string, dateTo?: string): Promise<Action[]> {
    const params = new URLSearchParams();
    params.append('user_id', String(userId));
    if (actionType) params.append('action_type', actionType);
    if (dateFrom) params.append('date_from', dateFrom);
    if (dateTo) params.append('date_to', dateTo);
    const response = await fetch(`${API_BASE}/api/my-actions?${params}`);
    return response.json();
}

export async function getActionTypes(): Promise<string[]> {
    const response = await fetch(`${API_BASE}/api/action-types`);
    return response.json();
}

// Sync API
export async function getSyncStatus(): Promise<SyncStatus> {
    const response = await fetch(`${API_BASE}/api/sync/status`);
    return response.json();
}

export async function triggerSync(userId: number): Promise<SyncResult> {
    const response = await fetch(`${API_BASE}/api/sync/trigger?user_id=${userId}`, {
        method: 'POST',
    });
    return response.json();
}

// Stats API
export async function getWorkerStats(
    workerId?: number,
    actionType?: string,
    dateFrom?: string,
    dateTo?: string
): Promise<any[]> {
    const params = new URLSearchParams();
    if (workerId) params.append('worker_id', String(workerId));
    if (actionType) params.append('action_type', actionType);
    if (dateFrom) params.append('date_from', dateFrom);
    if (dateTo) params.append('date_to', dateTo);
    const response = await fetch(`${API_BASE}/api/stats/worker-actions?${params}`);
    return response.json();
}

export async function getWorkerSummary(dateFrom?: string, dateTo?: string): Promise<any[]> {
    const params = new URLSearchParams();
    if (dateFrom) params.append('date_from', dateFrom);
    if (dateTo) params.append('date_to', dateTo);
    const response = await fetch(`${API_BASE}/api/stats/worker-summary?${params}`);
    return response.json();
}

export async function getDailyProduction(
    workerId?: number,
    dateFrom?: string,
    dateTo?: string
): Promise<any[]> {
    const params = new URLSearchParams();
    if (workerId) params.append('worker_id', String(workerId));
    if (dateFrom) params.append('date_from', dateFrom);
    if (dateTo) params.append('date_to', dateTo);
    const response = await fetch(`${API_BASE}/api/stats/daily-production?${params}`);
    return response.json();
}

export async function getActionBreakdown(dateFrom?: string, dateTo?: string): Promise<any[]> {
    const params = new URLSearchParams();
    if (dateFrom) params.append('date_from', dateFrom);
    if (dateTo) params.append('date_to', dateTo);
    const response = await fetch(`${API_BASE}/api/stats/action-breakdown?${params}`);
    return response.json();
}

// Costs API
export interface CostConfig {
    id: number;
    lag_factor: number;
    cutting_factor: number;
    ironing_factor: number;
    prepacking_factor: number;
    packing_factor: number;
    depreciation_factor: number;
    packaging_materials_price: number;
    corner_sewing_factors: Record<string, number>;
    sewing_factors: Record<string, number>;
    material_waste: Record<string, number>;
}

export interface CostSummary {
    total_cost: number;
    by_action_type: Record<string, number>;
    by_worker: Record<string, number>;
}

export interface WorkerCostDetail {
    worker_id: number;
    worker_name: string;
    total_cost: number;
    by_action_type: Record<string, number>;
    quantity_by_action_type: Record<string, number>;
}

export async function getCostConfig(): Promise<CostConfig> {
    const response = await fetch(`${API_BASE}/api/costs/config`);
    return response.json();
}

export async function updateCostConfig(userId: number, config: Partial<CostConfig>): Promise<CostConfig> {
    const response = await fetch(`${API_BASE}/api/costs/config?user_id=${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
    });
    if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to update config');
    }
    return response.json();
}

export async function getCostSummary(dateFrom?: string, dateTo?: string): Promise<CostSummary> {
    const params = new URLSearchParams();
    if (dateFrom) params.append('date_from', dateFrom);
    if (dateTo) params.append('date_to', dateTo);
    const response = await fetch(`${API_BASE}/api/costs/summary?${params}`);
    return response.json();
}

export async function getCostsByWorker(dateFrom?: string, dateTo?: string): Promise<WorkerCostDetail[]> {
    const params = new URLSearchParams();
    if (dateFrom) params.append('date_from', dateFrom);
    if (dateTo) params.append('date_to', dateTo);
    const response = await fetch(`${API_BASE}/api/costs/by-worker?${params}`);
    return response.json();
}
