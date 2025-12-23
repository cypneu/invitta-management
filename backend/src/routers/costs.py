"""Costs router - Cost configuration and summary endpoints."""

from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..database import get_db
from ..models import OrderPositionAction, User, CostConfig
from ..schemas import (
    CostConfigResponse,
    CostConfigUpdate,
    CostSummary,
    WorkerCostDetail,
)
from ..services.costs import get_or_create_config

router = APIRouter(prefix="/api/costs", tags=["costs"])


@router.get("/config", response_model=CostConfigResponse)
def get_config(db: Session = Depends(get_db)):
    """Get current cost configuration."""
    config = get_or_create_config(db)
    return config


@router.put("/config", response_model=CostConfigResponse)
def update_config(
    config_data: CostConfigUpdate,
    user_id: int = Query(..., description="ID of the admin updating config"),
    db: Session = Depends(get_db),
):
    """Update cost configuration (admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user or user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can update cost config")
    
    config = get_or_create_config(db)
    
    update_data = config_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if value is not None:
            setattr(config, field, value)
    
    db.commit()
    db.refresh(config)
    return config


@router.get("/summary", response_model=CostSummary)
def get_cost_summary(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
):
    """Get overall cost summary with optional date range filter."""
    query = db.query(OrderPositionAction).filter(OrderPositionAction.cost.isnot(None))
    
    if date_from:
        query = query.filter(OrderPositionAction.timestamp >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        query = query.filter(OrderPositionAction.timestamp <= datetime.combine(date_to, datetime.max.time()))
    
    actions = query.all()
    
    total_cost = 0.0
    by_action_type: dict[str, float] = {}
    by_worker: dict[str, float] = {}
    
    # Get worker names
    worker_names = {}
    for action in actions:
        if action.actor_id not in worker_names:
            worker = db.query(User).filter(User.id == action.actor_id).first()
            worker_names[action.actor_id] = worker.name if worker else f"User {action.actor_id}"
    
    for action in actions:
        cost = action.cost or 0
        total_cost += cost
        
        action_type = action.action_type.value
        by_action_type[action_type] = by_action_type.get(action_type, 0) + cost
        
        worker_name = worker_names.get(action.actor_id, f"User {action.actor_id}")
        by_worker[worker_name] = by_worker.get(worker_name, 0) + cost
    
    return CostSummary(
        total_cost=round(total_cost, 2),
        by_action_type={k: round(v, 2) for k, v in by_action_type.items()},
        by_worker={k: round(v, 2) for k, v in by_worker.items()},
    )


@router.get("/by-worker", response_model=list[WorkerCostDetail])
def get_costs_by_worker(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
):
    """Get detailed cost breakdown by worker."""
    query = db.query(OrderPositionAction).filter(OrderPositionAction.cost.isnot(None))
    
    if date_from:
        query = query.filter(OrderPositionAction.timestamp >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        query = query.filter(OrderPositionAction.timestamp <= datetime.combine(date_to, datetime.max.time()))
    
    actions = query.all()
    
    # Group by worker
    worker_data: dict[int, dict] = {}
    
    for action in actions:
        worker_id = action.actor_id
        if worker_id not in worker_data:
            worker = db.query(User).filter(User.id == worker_id).first()
            worker_data[worker_id] = {
                "worker_id": worker_id,
                "worker_name": worker.name if worker else f"User {worker_id}",
                "total_cost": 0,
                "by_action_type": {},
                "quantity_by_action_type": {},
            }
        
        cost = action.cost or 0
        quantity = action.quantity or 0
        worker_data[worker_id]["total_cost"] += cost
        
        action_type = action.action_type.value
        worker_data[worker_id]["by_action_type"][action_type] = (
            worker_data[worker_id]["by_action_type"].get(action_type, 0) + cost
        )
        worker_data[worker_id]["quantity_by_action_type"][action_type] = (
            worker_data[worker_id]["quantity_by_action_type"].get(action_type, 0) + quantity
        )
    
    # Sort by total cost descending
    result = sorted(worker_data.values(), key=lambda x: x["total_cost"], reverse=True)
    
    return [
        WorkerCostDetail(
            worker_id=w["worker_id"],
            worker_name=w["worker_name"],
            total_cost=round(w["total_cost"], 2),
            by_action_type={k: round(v, 2) for k, v in w["by_action_type"].items()},
            quantity_by_action_type=w["quantity_by_action_type"],
        )
        for w in result
    ]
