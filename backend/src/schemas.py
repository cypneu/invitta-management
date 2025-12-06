from datetime import datetime
from pydantic import BaseModel


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
    product_size: str
    quantity: int


class ProductionEntryResponse(BaseModel):
    id: int
    worker_id: int
    worker_name: str
    product_type: str
    product_size: str
    quantity: int
    created_at: datetime
    
    class Config:
        from_attributes = True


class ProductionSummary(BaseModel):
    worker_id: int
    worker_name: str
    product_type: str
    product_size: str
    total_quantity: int
    entry_count: int
