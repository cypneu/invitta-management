from datetime import datetime
from pydantic import BaseModel, Field


# User schemas
class UserBase(BaseModel):
    first_name: str
    last_name: str
    user_code: str
    role: str


class UserCreate(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=50)
    last_name: str = Field(..., min_length=1, max_length=50)
    user_code: str = Field(..., min_length=3, max_length=20)


class UserUpdate(BaseModel):
    first_name: str | None = Field(None, min_length=1, max_length=50)
    last_name: str | None = Field(None, min_length=1, max_length=50)
    user_code: str | None = Field(None, min_length=3, max_length=20)


class UserResponse(BaseModel):
    id: int
    first_name: str
    last_name: str
    name: str  # Computed property
    user_code: str
    role: str
    
    class Config:
        from_attributes = True


class LoginRequest(BaseModel):
    user_code: str


# Production entry schemas
class ProductionEntryCreate(BaseModel):
    product_type: str
    width_cm: int = Field(..., ge=10, le=2000)
    height_cm: int = Field(..., ge=10, le=2000)
    quantity: int = Field(..., ge=1)


class ProductionEntryUpdate(BaseModel):
    product_type: str | None = None
    width_cm: int | None = Field(None, ge=10, le=2000)
    height_cm: int | None = Field(None, ge=10, le=2000)
    quantity: int | None = Field(None, ge=1)


class ProductionEntryResponse(BaseModel):
    id: int
    worker_id: int
    worker_name: str
    product_type: str
    width_cm: int
    height_cm: int
    quantity: int
    production_cost: float
    created_at: datetime
    
    class Config:
        from_attributes = True


class ProductionSummary(BaseModel):
    worker_id: int
    worker_name: str
    product_type: str
    total_quantity: int
    entry_count: int


# Cost config schemas
class CostConfigUpdate(BaseModel):
    corner_sewing_factors: dict[str, float]
    sewing_factors: dict[str, float]


class CostConfigResponse(BaseModel):
    id: int
    corner_sewing_factors: dict[str, float]
    sewing_factors: dict[str, float]
    updated_at: datetime
    
    class Config:
        from_attributes = True
