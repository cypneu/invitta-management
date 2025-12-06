// API response types

export interface User {
    id: number;
    name: string;
    user_code: string;
    role: 'admin' | 'worker';
}

export interface ProductionEntry {
    id: number;
    worker_id: number;
    worker_name: string;
    product_type: string;
    width_cm: number;
    height_cm: number;
    quantity: number;
    production_cost: number;
    created_at: string;
}

export interface ProductionSummary {
    worker_id: number;
    worker_name: string;
    product_type: string;
    total_quantity: number;
    total_cost: number;
    entry_count: number;
}

export interface ProductionEntryCreate {
    product_type: string;
    width_cm: number;
    height_cm: number;
    quantity: number;
}

export interface ProductionEntryUpdate {
    product_type?: string;
    width_cm?: number;
    height_cm?: number;
    quantity?: number;
}

export interface ProductionFilters {
    workerId?: number | string;
    productType?: string;
    dateFrom?: string;
    dateTo?: string;
}
