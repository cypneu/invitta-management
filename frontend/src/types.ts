// API response types

export type ActionType = 'cutting' | 'sewing' | 'ironing' | 'packing';
export type ShapeType = 'rectangular' | 'round' | 'oval';
export type OrderStatus = 'in_progress' | 'done' | 'cancelled';
export type EdgeType = 'U3' | 'U4' | 'U5' | 'O1' | 'O3' | 'O5' | 'OGK' | 'LA';
export type SyncIntegration = 'baselinker' | 'invitta';

export interface User {
    id: number;
    first_name: string;
    last_name: string;
    name: string;
    code: string;
    role: 'admin' | 'worker';
    allowed_action_types: ActionType[];
}

export interface UserCreate {
    first_name: string;
    last_name: string;
    code: string;
    allowed_action_types?: ActionType[];
}

export interface UserUpdate {
    first_name?: string;
    last_name?: string;
    code?: string;
    allowed_action_types?: ActionType[];
}

export interface Product {
    id: number;
    sku: string;
    fabric: string;
    pattern: string;
    shape: ShapeType;
    width: number | null;
    height: number | null;
    diameter: number | null;
    edge_type: EdgeType | null;
}

export interface ProductCreate {
    sku: string;
    fabric: string;
    pattern: string;
    shape: ShapeType;
    width?: number | null;
    height?: number | null;
    diameter?: number | null;
    edge_type?: EdgeType | null;
}

export interface ProductUpdate {
    sku?: string;
    fabric?: string;
    pattern?: string;
    shape?: ShapeType;
    width?: number | null;
    height?: number | null;
    diameter?: number | null;
    edge_type?: EdgeType | null;
}

export interface PaginatedProductFilters {
    search?: string;
    page?: number;
    pageSize?: number;
}

export interface PaginatedProductListResponse {
    items: Product[];
    total: number;
    page: number;
    page_size: number;
    total_pages: number;
}

export interface OrderPosition {
    id: number;
    order_id: number;
    product_id: number;
    product: Product;
    quantity: number;
}

export interface Order {
    id: number;
    integration: string | null;
    external_id: string | null;
    source: string | null;
    expected_shipment_date: string | null;
    fullname: string | null;
    company: string | null;
    status: OrderStatus;
    positions: OrderPosition[];
}

export interface OrderPositionBrief {
    id: number;
    product_id: number;
    product: Product;
    quantity: number;
    action_totals: Record<ActionType, number>;
}

export interface OrderListItem {
    id: number;
    integration: string | null;
    external_id: string | null;
    source: string | null;
    expected_shipment_date: string | null;
    fullname: string | null;
    company: string | null;
    status: OrderStatus;
    position_count: number;
    positions: OrderPositionBrief[];
}

export interface OrderCreate {
    expected_shipment_date?: string;
    fullname?: string;
    company?: string;
    positions?: { product_id: number; quantity: number }[];
}

export interface OrderUpdate {
    expected_shipment_date?: string;
    fullname?: string;
    company?: string;
}

export interface Action {
    id: number;
    order_position_id: number;
    action_type: ActionType;
    quantity: number;
    cost?: number | null;
    actor_id: number;
    actor_name: string;
    worker_ids: number[];
    worker_names: string[];
    timestamp: string;
}

export interface OrderPositionWithActions {
    id: number;
    order_id: number;
    product_id: number;
    product: Product;
    quantity: number;
    actions: Action[];
    action_totals: Record<ActionType, number>;
}

export interface ActionCreate {
    action_type: ActionType;
    quantity: number;
    shared_worker_ids?: number[];
}

export interface SyncSourceStatus {
    integration: SyncIntegration;
    label: string;
    configured: boolean;
    last_sync_timestamp: number;
    last_sync_at: string | null;
    shipment_date_field_id: number | null;
}

export interface SyncStatus {
    last_sync_timestamp: number;
    last_sync_at: string | null;
    sources: SyncSourceStatus[];
}

export interface SyncSourceResult {
    integration: SyncIntegration;
    label: string;
    success: boolean;
    orders_synced: number;
    products_created: number;
    message: string;
}

export interface SyncResult {
    success: boolean;
    orders_synced: number;
    products_created: number;
    message: string;
    sources: SyncSourceResult[];
}

export interface OrderFilters {
    source?: string;
    status?: OrderStatus;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
}

export interface PaginatedOrderFilters extends OrderFilters {
    page?: number;
    pageSize?: number;
}

export interface OrderStatusCounts {
    all: number;
    in_progress: number;
    done: number;
    cancelled: number;
}

export interface PaginatedOrderListResponse {
    items: OrderListItem[];
    total: number;
    page: number;
    page_size: number;
    total_pages: number;
    status_counts: OrderStatusCounts;
}

export const ACTION_TYPE_LABELS: Record<ActionType, string> = {
    cutting: 'Krojenie',
    sewing: 'Szycie',
    ironing: 'Prasowanie',
    packing: 'Pakowanie',
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
    in_progress: 'W realizacji',
    done: 'Gotowe',
    cancelled: 'Anulowane',
};

export const SYNC_LABELS: Record<SyncIntegration, string> = {
    baselinker: 'Baselinker',
    invitta: 'Invitta',
};
