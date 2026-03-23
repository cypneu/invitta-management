"""Stats router - Production statistics and analytics."""

from collections import defaultdict
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload, selectinload

from ..action_workers import action_type_value, get_action_workers
from ..database import get_db
from ..models import ActionType, OrderPosition, OrderPositionAction, OrderPositionActionWorker

router = APIRouter(prefix="/api/stats", tags=["stats"])


def get_stats_actions_query(db: Session):
    return db.query(OrderPositionAction).options(
        joinedload(OrderPositionAction.actor),
        selectinload(OrderPositionAction.worker_assignments).joinedload(OrderPositionActionWorker.user),
    )


def apply_stats_filters(
    query,
    action_type: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
):
    if action_type:
        try:
            query = query.filter(OrderPositionAction.action_type == ActionType(action_type))
        except ValueError:
            pass
    if date_from:
        query = query.filter(func.date(OrderPositionAction.timestamp) >= date_from)
    if date_to:
        query = query.filter(func.date(OrderPositionAction.timestamp) <= date_to)
    return query


@router.get("/worker-actions")
def get_worker_action_stats(
    worker_id: Optional[int] = None,
    action_type: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
):
    """Get aggregated action statistics by worker."""
    actions = apply_stats_filters(
        get_stats_actions_query(db),
        action_type=action_type,
        date_from=date_from,
        date_to=date_to,
    ).all()

    grouped: dict[tuple[int, str], dict] = {}

    for action in actions:
        for worker in get_action_workers(action):
            if worker_id and worker.id != worker_id:
                continue

            key = (worker.id, action_type_value(action.action_type))
            if key not in grouped:
                grouped[key] = {
                    "worker_id": worker.id,
                    "worker_name": worker.name,
                    "action_type": action_type_value(action.action_type),
                    "total_quantity": 0,
                    "action_count": 0,
                }

            grouped[key]["total_quantity"] += action.quantity
            grouped[key]["action_count"] += 1

    return sorted(
        grouped.values(),
        key=lambda item: (item["worker_name"], item["action_type"]),
    )


@router.get("/worker-summary")
def get_worker_summary(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
):
    """Get summary statistics per worker (total across all action types)."""
    actions = apply_stats_filters(
        get_stats_actions_query(db),
        date_from=date_from,
        date_to=date_to,
    ).all()

    grouped: dict[int, dict] = {}

    for action in actions:
        for worker in get_action_workers(action):
            if worker.id not in grouped:
                grouped[worker.id] = {
                    "worker_id": worker.id,
                    "worker_name": worker.name,
                    "total_quantity": 0,
                    "action_count": 0,
                }

            grouped[worker.id]["total_quantity"] += action.quantity
            grouped[worker.id]["action_count"] += 1

    return sorted(
        grouped.values(),
        key=lambda item: (-item["total_quantity"], item["worker_name"]),
    )


@router.get("/daily-production")
def get_daily_production(
    worker_id: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
):
    """Get daily production quantities with action type breakdown."""
    actions = apply_stats_filters(
        get_stats_actions_query(db),
        date_from=date_from,
        date_to=date_to,
    ).all()

    totals: dict[str, int] = defaultdict(int)
    by_date: dict[str, dict[str, int]] = defaultdict(
        lambda: {"cutting": 0, "sewing": 0, "ironing": 0, "packing": 0}
    )

    for action in actions:
        if worker_id and worker_id not in {worker.id for worker in get_action_workers(action)}:
            continue

        date_key = str(action.timestamp.date())
        action_key = action_type_value(action.action_type)
        totals[date_key] += action.quantity
        by_date[date_key][action_key] += action.quantity

    sorted_dates = sorted(by_date.keys(), reverse=True)
    return [
        {
            "date": date_key,
            "total_quantity": totals.get(date_key, 0),
            "cutting": by_date[date_key]["cutting"],
            "sewing": by_date[date_key]["sewing"],
            "ironing": by_date[date_key]["ironing"],
            "packing": by_date[date_key]["packing"],
        }
        for date_key in sorted_dates
    ]


@router.get("/action-breakdown")
def get_action_breakdown(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
):
    """Get breakdown of quantities by action type."""
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
            "action_type": action_type_value(result.action_type),
            "total_quantity": result.total_quantity,
            "action_count": result.action_count,
        }
        for result in results
    ]


@router.get("/order-progress")
def get_order_progress(
    order_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """Get progress statistics for orders (how much of each action type is complete)."""
    positions_query = db.query(
        OrderPosition.order_id,
        func.sum(OrderPosition.quantity).label("total_required"),
    ).group_by(OrderPosition.order_id)

    if order_id:
        positions_query = positions_query.filter(OrderPosition.order_id == order_id)

    actions_query = db.query(
        OrderPosition.order_id,
        OrderPositionAction.action_type,
        func.sum(OrderPositionAction.quantity).label("total_done"),
    ).join(
        OrderPositionAction, OrderPositionAction.order_position_id == OrderPosition.id
    ).group_by(OrderPosition.order_id, OrderPositionAction.action_type)

    if order_id:
        actions_query = actions_query.filter(OrderPosition.order_id == order_id)

    positions = {result.order_id: result.total_required for result in positions_query.all()}
    actions: dict[int, dict[str, int]] = {}
    for result in actions_query.all():
        actions.setdefault(result.order_id, {})
        actions[result.order_id][action_type_value(result.action_type)] = result.total_done

    return [
        {
            "order_id": current_order_id,
            "total_required": required,
            "actions": actions.get(current_order_id, {}),
        }
        for current_order_id, required in positions.items()
    ]
