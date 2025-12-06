from datetime import datetime
from pydantic import BaseModel, Field


# User schemas
class UserBase(BaseModel):
    name: str
    user_code: str
    role: str


class UserResponse(UserBase):
    id: int
    
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
    total_cost: float
    entry_count: int
