from datetime import date, datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..database import get_db
from ..models import User, ProductionEntry
from ..schemas import ProductionEntryCreate, ProductionEntryResponse, ProductionSummary

router = APIRouter(prefix="/api/production", tags=["production"])


@router.post("/", response_model=ProductionEntryResponse)
def create_entry(
    entry: ProductionEntryCreate,
    worker_id: int = Query(..., description="ID of the worker creating the entry"),
    db: Session = Depends(get_db)
):
    """Create a new production entry"""
    worker = db.query(User).filter(User.id == worker_id, User.role == "worker").first()
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    
    db_entry = ProductionEntry(
        worker_id=worker_id,
        product_type=entry.product_type,
        product_size=entry.product_size,
        quantity=entry.quantity
    )
    db.add(db_entry)
    db.commit()
    db.refresh(db_entry)
    
    return ProductionEntryResponse(
        id=db_entry.id,
        worker_id=db_entry.worker_id,
        worker_name=worker.name,
        product_type=db_entry.product_type,
        product_size=db_entry.product_size,
        quantity=db_entry.quantity,
        created_at=db_entry.created_at
    )


@router.get("/", response_model=list[ProductionEntryResponse])
def list_entries(
    worker_id: Optional[int] = None,
    product_type: Optional[str] = None,
    product_size: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db)
):
    """List production entries with optional filters"""
    query = db.query(ProductionEntry).join(User)
    
    if worker_id:
        query = query.filter(ProductionEntry.worker_id == worker_id)
    if product_type:
        query = query.filter(ProductionEntry.product_type == product_type)
    if product_size:
        query = query.filter(ProductionEntry.product_size == product_size)
    if date_from:
        query = query.filter(func.date(ProductionEntry.created_at) >= date_from)
    if date_to:
        query = query.filter(func.date(ProductionEntry.created_at) <= date_to)
    
    entries = query.order_by(ProductionEntry.created_at.desc()).all()
    
    return [
        ProductionEntryResponse(
            id=e.id,
            worker_id=e.worker_id,
            worker_name=e.worker.name,
            product_type=e.product_type,
            product_size=e.product_size,
            quantity=e.quantity,
            created_at=e.created_at
        )
        for e in entries
    ]


@router.get("/summary", response_model=list[ProductionSummary])
def get_summary(
    worker_id: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db)
):
    """Get aggregated production summary by worker, type, and size"""
    query = db.query(
        ProductionEntry.worker_id,
        User.name.label("worker_name"),
        ProductionEntry.product_type,
        ProductionEntry.product_size,
        func.sum(ProductionEntry.quantity).label("total_quantity"),
        func.count(ProductionEntry.id).label("entry_count")
    ).join(User)
    
    if worker_id:
        query = query.filter(ProductionEntry.worker_id == worker_id)
    if date_from:
        query = query.filter(func.date(ProductionEntry.created_at) >= date_from)
    if date_to:
        query = query.filter(func.date(ProductionEntry.created_at) <= date_to)
    
    results = query.group_by(
        ProductionEntry.worker_id,
        User.name,
        ProductionEntry.product_type,
        ProductionEntry.product_size
    ).all()
    
    return [
        ProductionSummary(
            worker_id=r.worker_id,
            worker_name=r.worker_name,
            product_type=r.product_type,
            product_size=r.product_size,
            total_quantity=r.total_quantity,
            entry_count=r.entry_count
        )
        for r in results
    ]


@router.get("/product-types")
def get_product_types():
    """Get available product types"""
    return ["Type A", "Type B", "Type C", "Type D"]


@router.get("/product-sizes")
def get_product_sizes():
    """Get available product sizes"""
    return ["XS", "S", "M", "L", "XL"]
