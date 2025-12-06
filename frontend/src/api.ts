import type { User, UserCreate, UserUpdate, ProductionEntry, ProductionEntryCreate, ProductionEntryUpdate, ProductionFilters, ProductionSummary } from './types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export async function login(userCode: string): Promise<User> {
    const response = await fetch(`${API_BASE}/api/users/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_code: userCode }),
    });
    if (!response.ok) {
        throw new Error('Nie znaleziono użytkownika');
    }
    return response.json();
}

export async function getWorkers(): Promise<User[]> {
    const response = await fetch(`${API_BASE}/api/users/workers`);
    return response.json();
}

export async function getAllUsers(): Promise<User[]> {
    const response = await fetch(`${API_BASE}/api/users/`);
    return response.json();
}

export async function createWorker(worker: UserCreate): Promise<User> {
    const response = await fetch(`${API_BASE}/api/users/workers`, {
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

export async function updateWorker(workerId: number, worker: UserUpdate): Promise<User> {
    const response = await fetch(`${API_BASE}/api/users/workers/${workerId}`, {
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

export async function deleteWorker(workerId: number): Promise<void> {
    const response = await fetch(`${API_BASE}/api/users/workers/${workerId}`, {
        method: 'DELETE',
    });
    if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Nie udało się usunąć pracownika');
    }
}

export async function createProductionEntry(workerId: number, entry: ProductionEntryCreate): Promise<ProductionEntry> {
    const response = await fetch(`${API_BASE}/api/production/?worker_id=${workerId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
    });
    if (!response.ok) {
        throw new Error('Failed to create entry');
    }
    return response.json();
}

export async function updateProductionEntry(entryId: number, userId: number, entry: ProductionEntryUpdate): Promise<ProductionEntry> {
    const response = await fetch(`${API_BASE}/api/production/${entryId}?user_id=${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
    });
    if (!response.ok) {
        if (response.status === 403) {
            throw new Error('Brak uprawnień do edycji tego wpisu');
        }
        throw new Error('Nie udało się zaktualizować wpisu');
    }
    return response.json();
}

export async function deleteProductionEntry(entryId: number, userId: number): Promise<void> {
    const response = await fetch(`${API_BASE}/api/production/${entryId}?user_id=${userId}`, {
        method: 'DELETE',
    });
    if (!response.ok) {
        if (response.status === 403) {
            throw new Error('Brak uprawnień do usunięcia tego wpisu');
        }
        throw new Error('Nie udało się usunąć wpisu');
    }
}

export async function getProductionEntries(filters: ProductionFilters = {}): Promise<ProductionEntry[]> {
    const params = new URLSearchParams();
    if (filters.workerId) params.append('worker_id', String(filters.workerId));
    if (filters.productType) params.append('product_type', filters.productType);
    if (filters.dateFrom) params.append('date_from', filters.dateFrom);
    if (filters.dateTo) params.append('date_to', filters.dateTo);

    const response = await fetch(`${API_BASE}/api/production/?${params}`);
    return response.json();
}

export async function getProductionSummary(filters: ProductionFilters = {}): Promise<ProductionSummary[]> {
    const params = new URLSearchParams();
    if (filters.workerId) params.append('worker_id', String(filters.workerId));
    if (filters.dateFrom) params.append('date_from', filters.dateFrom);
    if (filters.dateTo) params.append('date_to', filters.dateTo);

    const response = await fetch(`${API_BASE}/api/production/summary?${params}`);
    return response.json();
}

export async function getProductTypes(): Promise<string[]> {
    const response = await fetch(`${API_BASE}/api/production/product-types`);
    return response.json();
}

// Cost config API
export interface CostConfig {
    id: number;
    corner_sewing_factors: Record<string, number>;
    sewing_factors: Record<string, number>;
    updated_at: string;
}

export async function getCostConfig(): Promise<CostConfig> {
    const response = await fetch(`${API_BASE}/api/config/cost`);
    return response.json();
}

export async function updateCostConfig(config: { corner_sewing_factors: Record<string, number>; sewing_factors: Record<string, number> }): Promise<CostConfig> {
    const response = await fetch(`${API_BASE}/api/config/cost`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
    });
    if (!response.ok) {
        throw new Error('Nie udało się zapisać konfiguracji');
    }
    return response.json();
}
