from datetime import datetime, date
from pydantic import BaseModel, Field
from enum import Enum


class ShapeType(str, Enum):
    rectangular = "rectangular"
    round = "round"
    oval = "oval"


class ActionType(str, Enum):
    cutting = "cutting"
    sewing = "sewing"
    ironing = "ironing"
    packing = "packing"


class EdgeType(str, Enum):
    U3 = "U3"
    U4 = "U4"
    U5 = "U5"
    O1 = "O1"
    O3 = "O3"
    O5 = "O5"
    OGK = "OGK"
    LA = "LA"


class OrderStatus(str, Enum):
    fetched = "fetched"
    in_progress = "in_progress"
    done = "done"
    cancelled = "cancelled"


# User schemas
class UserBase(BaseModel):
    first_name: str
    last_name: str
    code: str
    role: str
    allowed_action_types: list[ActionType] = []


class UserCreate(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=50)
    last_name: str = Field(..., min_length=1, max_length=50)
    code: str = Field(..., min_length=3, max_length=20)
    allowed_action_types: list[ActionType] = []


class UserUpdate(BaseModel):
    first_name: str | None = Field(None, min_length=1, max_length=50)
    last_name: str | None = Field(None, min_length=1, max_length=50)
    code: str | None = Field(None, min_length=3, max_length=20)
    allowed_action_types: list[ActionType] | None = None


class UserResponse(BaseModel):
    id: int
    first_name: str
    last_name: str
    name: str
    code: str
    role: str
    allowed_action_types: list[str]

    class Config:
        from_attributes = True


class LoginRequest(BaseModel):
    code: str


# Product schemas
class ProductResponse(BaseModel):
    id: int
    sku: str
    fabric: str
    pattern: str
    shape: ShapeType
    width: int | None
    height: int | None
    diameter: int | None
    edge_type: EdgeType | None

    class Config:
        from_attributes = True


class ProductCreate(BaseModel):
    sku: str = Field(..., min_length=1, max_length=100)
    fabric: str = Field(..., min_length=1, max_length=100)
    pattern: str = Field(..., min_length=1, max_length=100)
    shape: ShapeType
    width: int | None = Field(None, gt=0)
    height: int | None = Field(None, gt=0)
    diameter: int | None = Field(None, gt=0)
    edge_type: EdgeType | None = None


class ProductUpdate(BaseModel):
    sku: str | None = Field(None, min_length=1, max_length=100)
    fabric: str | None = Field(None, min_length=1, max_length=100)
    pattern: str | None = Field(None, min_length=1, max_length=100)
    shape: ShapeType | None = None
    width: int | None = Field(None, gt=0)
    height: int | None = Field(None, gt=0)
    diameter: int | None = Field(None, gt=0)
    edge_type: EdgeType | None = None


# Order schemas
class OrderPositionCreate(BaseModel):
    product_id: int
    quantity: int = Field(..., gt=0)


class OrderPositionResponse(BaseModel):
    id: int
    order_id: int
    product_id: int
    product: ProductResponse
    quantity: int

    class Config:
        from_attributes = True


class OrderCreate(BaseModel):
    expected_shipment_date: date | None = None
    fullname: str | None = Field(None, max_length=200)
    company: str | None = Field(None, max_length=200)
    positions: list[OrderPositionCreate] = []


class OrderUpdate(BaseModel):
    expected_shipment_date: date | None = None
    fullname: str | None = Field(None, max_length=200)
    company: str | None = Field(None, max_length=200)


class OrderResponse(BaseModel):
    id: int
    baselinker_id: int | None
    source: str | None
    expected_shipment_date: date | None
    fullname: str | None
    company: str | None
    status: OrderStatus
    positions: list[OrderPositionResponse] = []

    class Config:
        from_attributes = True


class OrderListResponse(BaseModel):
    """Lightweight order response without nested positions."""
    id: int
    baselinker_id: int | None
    source: str | None
    expected_shipment_date: date | None
    fullname: str | None
    company: str | None
    status: OrderStatus
    position_count: int = 0

    class Config:
        from_attributes = True


class OrderPositionBrief(BaseModel):
    """Position with action totals but without full action list."""
    id: int
    product_id: int
    product: ProductResponse
    quantity: int
    action_totals: dict[str, int] = {}

    class Config:
        from_attributes = True


class OrderWithPositionsListResponse(BaseModel):
    """Order with embedded positions for efficient list view."""
    id: int
    baselinker_id: int | None
    source: str | None
    expected_shipment_date: date | None
    fullname: str | None
    company: str | None
    status: OrderStatus
    position_count: int = 0
    positions: list[OrderPositionBrief] = []

    class Config:
        from_attributes = True


# Order Position Action schemas
class ActionCreate(BaseModel):
    action_type: ActionType
    quantity: int = Field(..., gt=0)


class ActionResponse(BaseModel):
    id: int
    order_position_id: int
    action_type: ActionType
    quantity: int
    cost: float | None = None
    actor_id: int
    actor_name: str
    timestamp: datetime

    class Config:
        from_attributes = True


class OrderPositionWithActionsResponse(BaseModel):
    id: int
    order_id: int
    product_id: int
    product: ProductResponse
    quantity: int
    actions: list[ActionResponse] = []
    action_totals: dict[str, int] = {}  # action_type -> total quantity

    class Config:
        from_attributes = True


# Sync schemas
class SyncStatusResponse(BaseModel):
    last_sync_timestamp: int
    last_sync_at: datetime | None
    shipment_date_field_id: int | None


class SyncTriggerResponse(BaseModel):
    success: bool
    orders_synced: int
    products_created: int
    message: str


# Cost Config schemas
class CostConfigResponse(BaseModel):
    id: int
    lag_factor: float
    cutting_factor: float
    ironing_factor: float
    prepacking_factor: float
    packing_factor: float
    depreciation_factor: float
    packaging_materials_price: float
    corner_sewing_factors: dict[str, float]
    sewing_factors: dict[str, float]
    material_waste: dict[str, int]

    class Config:
        from_attributes = True


class CostConfigUpdate(BaseModel):
    lag_factor: float | None = None
    cutting_factor: float | None = None
    ironing_factor: float | None = None
    prepacking_factor: float | None = None
    packing_factor: float | None = None
    depreciation_factor: float | None = None
    packaging_materials_price: float | None = None
    corner_sewing_factors: dict[str, float] | None = None
    sewing_factors: dict[str, float] | None = None
    material_waste: dict[str, int] | None = None


class CostSummary(BaseModel):
    total_cost: float
    by_action_type: dict[str, float]
    by_worker: dict[str, float]


class WorkerCostDetail(BaseModel):
    worker_id: int
    worker_name: str
    total_cost: float
    by_action_type: dict[str, float]
    quantity_by_action_type: dict[str, int]
