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
    product_size: string;
    quantity: number;
    created_at: string;
}

export interface ProductionSummary {
    worker_id: number;
    worker_name: string;
    product_type: string;
    product_size: string;
    total_quantity: number;
    entry_count: number;
}

export interface ProductionEntryCreate {
    product_type: string;
    product_size: string;
    quantity: number;
}

export interface ProductionFilters {
    workerId?: number | string;
    productType?: string;
    productSize?: string;
    dateFrom?: string;
    dateTo?: string;
}
