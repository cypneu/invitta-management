"""Stats router - Production statistics and analytics."""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..database import get_db
from ..models import User, Order, OrderPosition, OrderPositionAction, Product, ActionType

router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.get("/worker-actions")
def get_worker_action_stats(
    worker_id: Optional[int] = None,
    action_type: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
):
    """
    Get aggregated action statistics by worker.
    
    Returns quantity sums grouped by worker and action type.
    """
    query = db.query(
        OrderPositionAction.actor_id,
        User.first_name,
        User.last_name,
        OrderPositionAction.action_type,
        func.sum(OrderPositionAction.quantity).label("total_quantity"),
        func.count(OrderPositionAction.id).label("action_count"),
    ).join(User, User.id == OrderPositionAction.actor_id)
    
    if worker_id:
        query = query.filter(OrderPositionAction.actor_id == worker_id)
    if action_type:
        try:
            action_enum = ActionType(action_type)
            query = query.filter(OrderPositionAction.action_type == action_enum)
        except ValueError:
            pass
    if date_from:
        query = query.filter(func.date(OrderPositionAction.timestamp) >= date_from)
    if date_to:
        query = query.filter(func.date(OrderPositionAction.timestamp) <= date_to)
    
    results = query.group_by(
        OrderPositionAction.actor_id,
        User.first_name,
        User.last_name,
        OrderPositionAction.action_type,
    ).all()
    
    return [
        {
            "worker_id": r.actor_id,
            "worker_name": f"{r.first_name} {r.last_name}",
            "action_type": r.action_type.value if hasattr(r.action_type, 'value') else r.action_type,
            "total_quantity": r.total_quantity,
            "action_count": r.action_count,
        }
        for r in results
    ]


@router.get("/worker-summary")
def get_worker_summary(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
):
    """
    Get summary statistics per worker (total across all action types).
    """
    query = db.query(
        OrderPositionAction.actor_id,
        User.first_name,
        User.last_name,
        func.sum(OrderPositionAction.quantity).label("total_quantity"),
        func.count(OrderPositionAction.id).label("action_count"),
    ).join(User, User.id == OrderPositionAction.actor_id)
    
    if date_from:
        query = query.filter(func.date(OrderPositionAction.timestamp) >= date_from)
    if date_to:
        query = query.filter(func.date(OrderPositionAction.timestamp) <= date_to)
    
    results = query.group_by(
        OrderPositionAction.actor_id,
        User.first_name,
        User.last_name,
    ).order_by(func.sum(OrderPositionAction.quantity).desc()).all()
    
    return [
        {
            "worker_id": r.actor_id,
            "worker_name": f"{r.first_name} {r.last_name}",
            "total_quantity": r.total_quantity,
            "action_count": r.action_count,
        }
        for r in results
    ]


@router.get("/daily-production")
def get_daily_production(
    worker_id: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
):
    """
    Get daily production quantities with action type breakdown.
    """
    date_col = func.date(OrderPositionAction.timestamp).label("date")
    
    # Get total per day
    totals_query = db.query(
        date_col,
        func.sum(OrderPositionAction.quantity).label("total_quantity"),
    )
    
    if worker_id:
        totals_query = totals_query.filter(OrderPositionAction.actor_id == worker_id)
    if date_from:
        totals_query = totals_query.filter(func.date(OrderPositionAction.timestamp) >= date_from)
    if date_to:
        totals_query = totals_query.filter(func.date(OrderPositionAction.timestamp) <= date_to)
    
    totals = {str(r.date): r.total_quantity for r in totals_query.group_by(date_col).all()}
    
    # Get breakdown by action type per day
    breakdown_query = db.query(
        date_col,
        OrderPositionAction.action_type,
        func.sum(OrderPositionAction.quantity).label("quantity"),
    )
    
    if worker_id:
        breakdown_query = breakdown_query.filter(OrderPositionAction.actor_id == worker_id)
    if date_from:
        breakdown_query = breakdown_query.filter(func.date(OrderPositionAction.timestamp) >= date_from)
    if date_to:
        breakdown_query = breakdown_query.filter(func.date(OrderPositionAction.timestamp) <= date_to)
    
    breakdown_results = breakdown_query.group_by(date_col, OrderPositionAction.action_type).all()
    
    # Group by date
    by_date = {}
    for r in breakdown_results:
        date_str = str(r.date)
        if date_str not in by_date:
            by_date[date_str] = {"cutting": 0, "sewing": 0, "ironing": 0, "packing": 0}
        action_type = r.action_type.value if hasattr(r.action_type, 'value') else r.action_type
        by_date[date_str][action_type] = r.quantity
    
    # Sort dates descending
    sorted_dates = sorted(by_date.keys(), reverse=True)
    
    return [
        {
            "date": d,
            "total_quantity": totals.get(d, 0),
            "cutting": by_date[d]["cutting"],
            "sewing": by_date[d]["sewing"],
            "ironing": by_date[d]["ironing"],
            "packing": by_date[d]["packing"],
        }
        for d in sorted_dates
    ]


@router.get("/action-breakdown")
def get_action_breakdown(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
):
    """
    Get breakdown of quantities by action type.
    """
    query = db.query(
        OrderPositionAction.action_type,
        func.sum(OrderPositionAction.quantity).label("total_quantity"),
        func.count(OrderPositionAction.id).label("action_count"),
    )
    
    if date_from:
        query = query.filter(func.date(OrderPositionAction.timestamp) >= date_from)
    if date_to:
        query = query.filter(func.date(OrderPositionAction.timestamp) <= date_to)
    
    results = query.group_by(OrderPositionAction.action_type).all()
    
    return [
        {
            "action_type": r.action_type.value if hasattr(r.action_type, 'value') else r.action_type,
            "total_quantity": r.total_quantity,
            "action_count": r.action_count,
        }
        for r in results
    ]


@router.get("/order-progress")
def get_order_progress(
    order_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """
    Get progress statistics for orders (how much of each action type is complete).
    """
    # Get all positions with their required quantities
    positions_query = db.query(
        OrderPosition.order_id,
        func.sum(OrderPosition.quantity).label("total_required"),
    ).group_by(OrderPosition.order_id)
    
    if order_id:
        positions_query = positions_query.filter(OrderPosition.order_id == order_id)
    
    # Get completed actions per order
    actions_query = db.query(
        OrderPosition.order_id,
        OrderPositionAction.action_type,
        func.sum(OrderPositionAction.quantity).label("total_done"),
    ).join(
        OrderPositionAction, OrderPositionAction.order_position_id == OrderPosition.id
    ).group_by(OrderPosition.order_id, OrderPositionAction.action_type)
    
    if order_id:
        actions_query = actions_query.filter(OrderPosition.order_id == order_id)
    
    # Process results
    positions = {r.order_id: r.total_required for r in positions_query.all()}
    actions = {}
    for r in actions_query.all():
        if r.order_id not in actions:
            actions[r.order_id] = {}
        action_type = r.action_type.value if hasattr(r.action_type, 'value') else r.action_type
        actions[r.order_id][action_type] = r.total_done
    
    result = []
    for oid, required in positions.items():
        order_actions = actions.get(oid, {})
        result.append({
            "order_id": oid,
            "total_required": required,
            "actions": order_actions,
        })
    
    return result
