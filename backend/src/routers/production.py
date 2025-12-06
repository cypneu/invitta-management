from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..database import get_db
from ..models import User, ProductionEntry
from ..schemas import ProductionEntryCreate, ProductionEntryUpdate, ProductionEntryResponse, ProductionSummary
from ..cost_calculator import calculate_price_brutto, get_tablecloth_finish_values

router = APIRouter(prefix="/api/production", tags=["production"])


@router.post("/", response_model=ProductionEntryResponse)
def create_entry(
    entry: ProductionEntryCreate,
    worker_id: int = Query(..., description="ID of the worker creating the entry"),
    db: Session = Depends(get_db)
):
    """Create a new production entry"""
    worker = db.query(User).filter(User.id == worker_id).first()
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    
    # Calculate production cost
    production_cost = calculate_price_brutto(entry.product_type, entry.width_cm, entry.height_cm)
    
    db_entry = ProductionEntry(
        worker_id=worker_id,
        product_type=entry.product_type,
        width_cm=entry.width_cm,
        height_cm=entry.height_cm,
        quantity=entry.quantity,
        production_cost=production_cost
    )
    db.add(db_entry)
    db.commit()
    db.refresh(db_entry)
    
    return ProductionEntryResponse(
        id=db_entry.id,
        worker_id=db_entry.worker_id,
        worker_name=worker.name,
        product_type=db_entry.product_type,
        width_cm=db_entry.width_cm,
        height_cm=db_entry.height_cm,
        quantity=db_entry.quantity,
        production_cost=db_entry.production_cost,
        created_at=db_entry.created_at
    )


@router.put("/{entry_id}", response_model=ProductionEntryResponse)
def update_entry(
    entry_id: int,
    entry: ProductionEntryUpdate,
    user_id: int = Query(..., description="ID of the user making the update"),
    db: Session = Depends(get_db)
):
    """Update a production entry. Admin can update any, worker can update own."""
    db_entry = db.query(ProductionEntry).filter(ProductionEntry.id == entry_id).first()
    if not db_entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check permissions: admin can edit any, worker can only edit own
    if user.role == "worker" and db_entry.worker_id != user_id:
        raise HTTPException(status_code=403, detail="Cannot edit other worker's entries")
    
    # Update fields if provided
    if entry.product_type is not None:
        db_entry.product_type = entry.product_type
    if entry.width_cm is not None:
        db_entry.width_cm = entry.width_cm
    if entry.height_cm is not None:
        db_entry.height_cm = entry.height_cm
    if entry.quantity is not None:
        db_entry.quantity = entry.quantity
    
    # Recalculate production cost
    db_entry.production_cost = calculate_price_brutto(
        db_entry.product_type, db_entry.width_cm, db_entry.height_cm
    )
    
    db.commit()
    db.refresh(db_entry)
    
    worker = db.query(User).filter(User.id == db_entry.worker_id).first()
    
    return ProductionEntryResponse(
        id=db_entry.id,
        worker_id=db_entry.worker_id,
        worker_name=worker.name,
        product_type=db_entry.product_type,
        width_cm=db_entry.width_cm,
        height_cm=db_entry.height_cm,
        quantity=db_entry.quantity,
        production_cost=db_entry.production_cost,
        created_at=db_entry.created_at
    )


@router.delete("/{entry_id}")
def delete_entry(
    entry_id: int,
    user_id: int = Query(..., description="ID of the user making the delete"),
    db: Session = Depends(get_db)
):
    """Delete a production entry. Admin can delete any, worker can delete own."""
    db_entry = db.query(ProductionEntry).filter(ProductionEntry.id == entry_id).first()
    if not db_entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check permissions: admin can delete any, worker can only delete own
    if user.role == "worker" and db_entry.worker_id != user_id:
        raise HTTPException(status_code=403, detail="Cannot delete other worker's entries")
    
    db.delete(db_entry)
    db.commit()
    
    return {"message": "Entry deleted"}


@router.get("/", response_model=list[ProductionEntryResponse])
def list_entries(
    worker_id: Optional[int] = None,
    product_type: Optional[str] = None,
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
            width_cm=e.width_cm,
            height_cm=e.height_cm,
            quantity=e.quantity,
            production_cost=e.production_cost,
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
    """Get aggregated production summary by worker and type"""
    query = db.query(
        ProductionEntry.worker_id,
        User.name.label("worker_name"),
        ProductionEntry.product_type,
        func.sum(ProductionEntry.quantity).label("total_quantity"),
        func.sum(ProductionEntry.production_cost * ProductionEntry.quantity).label("total_cost"),
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
        ProductionEntry.product_type
    ).all()
    
    return [
        ProductionSummary(
            worker_id=r.worker_id,
            worker_name=r.worker_name,
            product_type=r.product_type,
            total_quantity=r.total_quantity,
            total_cost=round(r.total_cost, 2),
            entry_count=r.entry_count
        )
        for r in results
    ]


@router.get("/product-types")
def get_product_types():
    """Get available product types (TableclothFinish values)"""
    return get_tablecloth_finish_values()
