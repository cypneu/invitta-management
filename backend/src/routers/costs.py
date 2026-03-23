"""Costs router - Cost configuration and summary endpoints."""

from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload, selectinload
from sqlalchemy import func

from ..action_workers import get_action_cost_share, get_action_workers
from ..database import get_db
from ..models import CostConfig, OrderPositionAction, OrderPositionActionWorker, User
from ..schemas import (
    CostConfigResponse,
    CostConfigUpdate,
    CostSummary,
    WorkerCostDetail,
)
from ..services.costs import get_or_create_config

router = APIRouter(prefix="/api/costs", tags=["costs"])


def get_cost_actions_query(db: Session):
    return db.query(OrderPositionAction).options(
        joinedload(OrderPositionAction.actor),
        selectinload(OrderPositionAction.worker_assignments).joinedload(OrderPositionActionWorker.user),
    )


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
        raise HTTPException(status_code=403, detail="Tylko administrator może zaktualizować konfigurację kosztów")
    
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
    query = get_cost_actions_query(db).filter(OrderPositionAction.cost.isnot(None))
    
    if date_from:
        query = query.filter(OrderPositionAction.timestamp >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        query = query.filter(OrderPositionAction.timestamp <= datetime.combine(date_to, datetime.max.time()))
    
    actions = query.all()
    
    total_cost = 0.0
    by_action_type: dict[str, float] = {}
    by_worker: dict[str, float] = {}

    for action in actions:
        cost = action.cost or 0
        total_cost += cost

        action_type = action.action_type.value
        by_action_type[action_type] = by_action_type.get(action_type, 0) + cost

        shared_cost = get_action_cost_share(action)
        for worker in get_action_workers(action):
            by_worker[worker.name] = by_worker.get(worker.name, 0) + shared_cost
    
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
    query = get_cost_actions_query(db).filter(OrderPositionAction.cost.isnot(None))
    
    if date_from:
        query = query.filter(OrderPositionAction.timestamp >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        query = query.filter(OrderPositionAction.timestamp <= datetime.combine(date_to, datetime.max.time()))
    
    actions = query.all()
    
    # Group by worker
    worker_data: dict[int, dict] = {}
    
    for action in actions:
        cost = get_action_cost_share(action)
        quantity = action.quantity or 0
        action_type = action.action_type.value

        for worker in get_action_workers(action):
            worker_id = worker.id
            if worker_id not in worker_data:
                worker_data[worker_id] = {
                    "worker_id": worker_id,
                    "worker_name": worker.name,
                    "total_cost": 0.0,
                    "by_action_type": {},
                    "quantity_by_action_type": {},
                }

            worker_data[worker_id]["total_cost"] += cost
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
