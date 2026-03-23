"""Actions router - Workers add actions to order positions with concurrency control."""

from datetime import date, datetime
from math import ceil
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload, selectinload

from ..action_workers import (
    action_type_value,
    get_action_cost_share,
    get_action_worker_ids,
    get_action_worker_names,
    normalize_assigned_worker_ids,
    user_can_perform_action,
)
from ..database import get_db
from ..models import (
    ActionType,
    Order,
    OrderPosition,
    OrderPositionAction,
    OrderPositionActionWorker,
    OrderStatus,
    Product,
    User,
)
from ..schemas import (
    ActionCreate,
    ActionResponse,
    OrderPositionWithActionsResponse,
    ProductResponse,
)
from ..services.costs import calculate_action_cost, get_or_create_config

router = APIRouter(prefix="/api", tags=["actions"])


class ActionUpdate(BaseModel):
    quantity: int


def get_action_totals(position: OrderPosition) -> dict[str, int]:
    """Calculate total quantities per action type for a position."""
    totals: dict[str, int] = {}
    for action in position.actions:
        action_type = action_type_value(action.action_type)
        totals[action_type] = totals.get(action_type, 0) + action.quantity
    return totals


def validate_action_permission(user: User, action_type: ActionType) -> None:
    """Check if user is allowed to perform this action type."""
    if user_can_perform_action(user, action_type):
        return

    raise HTTPException(
        status_code=403,
        detail=f"Nie masz uprawnień do wykonywania akcji „{action_type_value(action_type)}”",
    )


def normalize_shared_worker_ids(shared_worker_ids: list[int] | None) -> list[int]:
    normalized_ids: list[int] = []
    seen_ids: set[int] = set()

    for worker_id in shared_worker_ids or []:
        if worker_id <= 0:
            raise HTTPException(status_code=400, detail="Nieprawidłowy identyfikator pracownika")
        if worker_id in seen_ids:
            continue
        seen_ids.add(worker_id)
        normalized_ids.append(worker_id)

    return normalized_ids


def validate_shared_workers(
    db: Session,
    action_type: ActionType,
    shared_worker_ids: list[int] | None,
) -> list[User]:
    normalized_ids = normalize_shared_worker_ids(shared_worker_ids)
    if not normalized_ids:
        return []

    if action_type_value(action_type) != ActionType.cutting.value:
        raise HTTPException(
            status_code=400,
            detail="Dodatkowych pracowników można przypisać tylko do akcji „Krojenie”",
        )

    workers = (
        db.query(User)
        .filter(User.id.in_(normalized_ids), User.role == "worker")
        .all()
    )
    workers_by_id = {worker.id: worker for worker in workers}

    missing_ids = [worker_id for worker_id in normalized_ids if worker_id not in workers_by_id]
    if missing_ids:
        raise HTTPException(status_code=404, detail="Nie znaleziono wybranych pracowników")

    invalid_workers = [
        worker.name
        for worker in workers
        if not user_can_perform_action(worker, action_type)
    ]
    if invalid_workers:
        worker_names = ", ".join(invalid_workers)
        raise HTTPException(
            status_code=400,
            detail=f"Wybrani pracownicy nie mają uprawnień do tej akcji: {worker_names}",
        )

    return [workers_by_id[worker_id] for worker_id in normalized_ids]


def is_position_complete(position: OrderPosition) -> bool:
    """Check if a position has all action types filled to full quantity."""
    action_totals = get_action_totals(position)
    for action_type in ActionType:
        total = action_totals.get(action_type.value, 0)
        if total < position.quantity:
            return False
    return True


def is_order_complete(order: Order) -> bool:
    """Check if all positions in the order are complete."""
    if not order.positions:
        return False
    return all(is_position_complete(position) for position in order.positions)


def update_order_status_if_needed(db: Session, order: Order) -> None:
    """Update order status based on position completion."""
    order_complete = is_order_complete(order)

    if order_complete and order.status != OrderStatus.done:
        order.status = OrderStatus.done
    elif not order_complete and order.status == OrderStatus.done:
        order.status = OrderStatus.in_progress


def calculate_cost_snapshot(
    db: Session,
    action_type: ActionType,
    position: OrderPosition,
    quantity: int,
) -> float:
    """Calculate the persisted cost snapshot for an action entry."""
    config = get_or_create_config(db)
    return calculate_action_cost(action_type, position.product, quantity, config)


def set_action_workers(action: OrderPositionAction, worker_ids: list[int]) -> None:
    action.worker_assignments[:] = [
        OrderPositionActionWorker(user_id=worker_id)
        for worker_id in worker_ids
    ]


def get_action_query(db: Session):
    return db.query(OrderPositionAction).options(
        joinedload(OrderPositionAction.actor),
        selectinload(OrderPositionAction.worker_assignments).joinedload(OrderPositionActionWorker.user),
    )


def get_action_or_404(db: Session, action_id: int) -> OrderPositionAction:
    action = get_action_query(db).filter(OrderPositionAction.id == action_id).first()
    if not action:
        raise HTTPException(status_code=404, detail="Nie znaleziono akcji")
    return action


def serialize_action_response(
    action: OrderPositionAction,
    cost_override: float | None = None,
) -> ActionResponse:
    actor_name = action.actor.name if action.actor else f"User {action.actor_id}"
    worker_ids = get_action_worker_ids(action) or [action.actor_id]
    worker_names = get_action_worker_names(action) or [actor_name]

    return ActionResponse(
        id=action.id,
        order_position_id=action.order_position_id,
        action_type=action.action_type,
        quantity=action.quantity,
        cost=action.cost if cost_override is None else cost_override,
        actor_id=action.actor_id,
        actor_name=actor_name,
        worker_ids=worker_ids,
        worker_names=worker_names,
        timestamp=action.timestamp,
    )


def validate_action_quantity_limit(
    db: Session,
    position: OrderPosition,
    action_type: ActionType,
    quantity: int,
    exclude_action_id: int | None = None,
) -> None:
    total_query = db.query(func.coalesce(func.sum(OrderPositionAction.quantity), 0)).filter(
        OrderPositionAction.order_position_id == position.id,
        OrderPositionAction.action_type == action_type,
    )
    if exclude_action_id is not None:
        total_query = total_query.filter(OrderPositionAction.id != exclude_action_id)

    current_total = total_query.scalar() or 0
    new_total = current_total + quantity
    if new_total > position.quantity:
        raise HTTPException(
            status_code=400,
            detail=f"Przekroczono limit. Maksymalnie można: {position.quantity - current_total}",
        )


def load_order_for_status(db: Session, order_id: int) -> Order:
    order = (
        db.query(Order)
        .options(joinedload(Order.positions).joinedload(OrderPosition.actions))
        .filter(Order.id == order_id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Nie znaleziono zamówienia")
    return order


def action_belongs_to_user(worker_id: int):
    return or_(
        OrderPositionAction.actor_id == worker_id,
        OrderPositionAction.worker_assignments.any(OrderPositionActionWorker.user_id == worker_id),
    )


def can_manage_action(user: User, action: OrderPositionAction) -> bool:
    if user.role == "admin":
        return True
    return user.id in get_action_worker_ids(action)


@router.post("/order-positions/{position_id}/actions", response_model=ActionResponse)
def add_action(
    position_id: int,
    action_data: ActionCreate,
    user_id: int = Query(..., description="ID of the worker performing the action"),
    db: Session = Depends(get_db),
):
    """Add an action to an order position with write skew prevention."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Nie znaleziono użytkownika")

    if user.role != "admin":
        validate_action_permission(user, action_data.action_type)

    shared_workers = validate_shared_workers(db, action_data.action_type, action_data.shared_worker_ids)

    position = (
        db.query(OrderPosition)
        .options(joinedload(OrderPosition.product))
        .filter(OrderPosition.id == position_id)
        .with_for_update()
        .first()
    )
    if not position:
        raise HTTPException(status_code=404, detail="Nie znaleziono pozycji zamówienia")

    order = db.query(Order).filter(Order.id == position.order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Nie znaleziono zamówienia")

    validate_action_quantity_limit(db, position, action_data.action_type, action_data.quantity)

    action = OrderPositionAction(
        order_position_id=position_id,
        action_type=action_data.action_type,
        quantity=action_data.quantity,
        cost=calculate_cost_snapshot(db, action_data.action_type, position, action_data.quantity),
        actor_id=user_id,
        timestamp=datetime.now(),
    )
    db.add(action)
    db.flush()

    assigned_worker_ids = normalize_assigned_worker_ids(
        user_id,
        [worker.id for worker in shared_workers],
    )
    set_action_workers(action, assigned_worker_ids)
    db.flush()

    order = load_order_for_status(db, position.order_id)
    update_order_status_if_needed(db, order)

    db.commit()
    return serialize_action_response(get_action_or_404(db, action.id))


@router.patch("/actions/{action_id}", response_model=ActionResponse)
def patch_action(
    action_id: int,
    action_data: ActionCreate,
    user_id: int = Query(..., description="ID of the user updating the action"),
    db: Session = Depends(get_db),
):
    """Update an action quantity and optional worker assignments."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Nie znaleziono użytkownika")

    action = (
        get_action_query(db)
        .options(joinedload(OrderPositionAction.order_position).joinedload(OrderPosition.product))
        .filter(OrderPositionAction.id == action_id)
        .first()
    )
    if not action:
        raise HTTPException(status_code=404, detail="Nie znaleziono akcji")

    if not can_manage_action(user, action):
        raise HTTPException(
            status_code=403,
            detail="Możesz edytować tylko wpisy, w których uczestniczysz",
        )

    if action_type_value(action_data.action_type) != action_type_value(action.action_type):
        raise HTTPException(status_code=400, detail="Nie można zmienić typu akcji")

    if action_data.quantity <= 0:
        raise HTTPException(status_code=400, detail="Ilość musi być większa od 0")

    position = (
        db.query(OrderPosition)
        .options(joinedload(OrderPosition.product))
        .filter(OrderPosition.id == action.order_position_id)
        .with_for_update()
        .first()
    )
    if not position:
        raise HTTPException(status_code=404, detail="Nie znaleziono pozycji zamówienia")

    validate_action_quantity_limit(
        db,
        position,
        action.action_type,
        action_data.quantity,
        exclude_action_id=action.id,
    )

    if action_data.shared_worker_ids is not None:
        shared_workers = validate_shared_workers(db, action.action_type, action_data.shared_worker_ids)
        assigned_worker_ids = normalize_assigned_worker_ids(
            action.actor_id,
            [worker.id for worker in shared_workers],
        )
        set_action_workers(action, assigned_worker_ids)

    action.quantity = action_data.quantity
    action.cost = calculate_cost_snapshot(db, action.action_type, position, action_data.quantity)
    db.flush()

    order = load_order_for_status(db, position.order_id)
    update_order_status_if_needed(db, order)

    db.commit()
    return serialize_action_response(get_action_or_404(db, action.id))


@router.put("/actions/{action_id}")
def update_action(
    action_id: int,
    action_data: "ActionUpdate",
    user_id: int = Query(..., description="ID of the user updating the action"),
    db: Session = Depends(get_db),
):
    """Update action quantity. Workers can edit actions they participate in."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Nie znaleziono użytkownika")

    action = (
        get_action_query(db)
        .options(joinedload(OrderPositionAction.order_position).joinedload(OrderPosition.product))
        .filter(OrderPositionAction.id == action_id)
        .first()
    )
    if not action:
        raise HTTPException(status_code=404, detail="Nie znaleziono akcji")

    if not can_manage_action(user, action):
        raise HTTPException(
            status_code=403,
            detail="Możesz edytować tylko wpisy, w których uczestniczysz",
        )

    if action_data.quantity < 1:
        raise HTTPException(status_code=400, detail="Ilość musi wynosić co najmniej 1")

    position = (
        db.query(OrderPosition)
        .options(joinedload(OrderPosition.product))
        .filter(OrderPosition.id == action.order_position_id)
        .with_for_update()
        .first()
    )
    if not position:
        raise HTTPException(status_code=404, detail="Nie znaleziono pozycji zamówienia")

    validate_action_quantity_limit(
        db,
        position,
        action.action_type,
        action_data.quantity,
        exclude_action_id=action.id,
    )

    action.quantity = action_data.quantity
    action.cost = calculate_cost_snapshot(db, action.action_type, position, action_data.quantity)
    db.flush()

    order = load_order_for_status(db, position.order_id)
    update_order_status_if_needed(db, order)

    db.commit()
    return {
        "message": "Akcja została zaktualizowana",
        "id": action_id,
        "quantity": action_data.quantity,
        "cost": action.cost,
    }


@router.delete("/actions/{action_id}")
def delete_action(
    action_id: int,
    user_id: int = Query(..., description="ID of the user deleting the action"),
    db: Session = Depends(get_db),
):
    """Delete an action. Admins can delete any action, workers can delete actions they participate in."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Nie znaleziono użytkownika")

    action = (
        get_action_query(db)
        .options(joinedload(OrderPositionAction.order_position).joinedload(OrderPosition.order))
        .filter(OrderPositionAction.id == action_id)
        .first()
    )
    if not action:
        raise HTTPException(status_code=404, detail="Nie znaleziono akcji")

    if not can_manage_action(user, action):
        raise HTTPException(
            status_code=403,
            detail="Możesz usunąć tylko wpisy, w których uczestniczysz",
        )

    position = (
        db.query(OrderPosition)
        .filter(OrderPosition.id == action.order_position_id)
        .with_for_update()
        .first()
    )
    if not position:
        raise HTTPException(status_code=404, detail="Nie znaleziono pozycji zamówienia")

    order_id = position.order_id
    db.delete(action)
    db.flush()

    order = load_order_for_status(db, order_id)
    update_order_status_if_needed(db, order)

    db.commit()
    return {"message": "Akcja została usunięta", "id": action_id}


@router.get("/order-positions/{position_id}/actions", response_model=list[ActionResponse])
def list_position_actions(position_id: int, db: Session = Depends(get_db)):
    """List all actions for an order position."""
    position = db.query(OrderPosition).filter(OrderPosition.id == position_id).first()
    if not position:
        raise HTTPException(status_code=404, detail="Nie znaleziono pozycji zamówienia")

    actions = (
        get_action_query(db)
        .filter(OrderPositionAction.order_position_id == position_id)
        .order_by(OrderPositionAction.timestamp.desc())
        .all()
    )

    return [serialize_action_response(action) for action in actions]


@router.get("/order-positions/{position_id}", response_model=OrderPositionWithActionsResponse)
def get_position_with_actions(position_id: int, db: Session = Depends(get_db)):
    """Get an order position with all its actions and totals."""
    position = (
        db.query(OrderPosition)
        .options(
            joinedload(OrderPosition.product),
            selectinload(OrderPosition.actions).joinedload(OrderPositionAction.actor),
            selectinload(OrderPosition.actions)
            .selectinload(OrderPositionAction.worker_assignments)
            .joinedload(OrderPositionActionWorker.user),
        )
        .filter(OrderPosition.id == position_id)
        .first()
    )
    if not position:
        raise HTTPException(status_code=404, detail="Nie znaleziono pozycji zamówienia")

    actions = sorted(position.actions, key=lambda item: item.timestamp, reverse=True)

    return OrderPositionWithActionsResponse(
        id=position.id,
        order_id=position.order_id,
        product_id=position.product_id,
        product=ProductResponse.model_validate(position.product),
        quantity=position.quantity,
        actions=[serialize_action_response(action) for action in actions],
        action_totals=get_action_totals(position),
    )


@router.get("/my-actions", response_model=list[ActionResponse])
def list_my_actions(
    user_id: int = Query(..., description="ID of the current user"),
    action_type: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
):
    """List actions assigned to the current user."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Nie znaleziono użytkownika")

    query = get_action_query(db).filter(action_belongs_to_user(user_id))

    if action_type:
        try:
            query = query.filter(OrderPositionAction.action_type == ActionType(action_type))
        except ValueError:
            pass

    if date_from:
        query = query.filter(func.date(OrderPositionAction.timestamp) >= date_from)
    if date_to:
        query = query.filter(func.date(OrderPositionAction.timestamp) <= date_to)

    actions = query.order_by(OrderPositionAction.timestamp.desc()).all()

    return [
        serialize_action_response(action, cost_override=get_action_cost_share(action))
        for action in actions
    ]


@router.get("/action-types", response_model=list[str])
def list_action_types():
    """Get available action types."""
    return [action_type.value for action_type in ActionType]


@router.get("/orders/{order_id}/positions", response_model=list[OrderPositionWithActionsResponse])
def list_order_positions(order_id: int, db: Session = Depends(get_db)):
    """List all positions for an order with their actions."""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Nie znaleziono zamówienia")

    positions = (
        db.query(OrderPosition)
        .options(
            joinedload(OrderPosition.product),
            selectinload(OrderPosition.actions).joinedload(OrderPositionAction.actor),
            selectinload(OrderPosition.actions)
            .selectinload(OrderPositionAction.worker_assignments)
            .joinedload(OrderPositionActionWorker.user),
        )
        .filter(OrderPosition.order_id == order_id)
        .all()
    )

    response: list[OrderPositionWithActionsResponse] = []
    for position in positions:
        actions = sorted(position.actions, key=lambda item: item.timestamp, reverse=True)
        response.append(
            OrderPositionWithActionsResponse(
                id=position.id,
                order_id=position.order_id,
                product_id=position.product_id,
                product=ProductResponse.model_validate(position.product),
                quantity=position.quantity,
                actions=[serialize_action_response(action) for action in actions],
                action_totals=get_action_totals(position),
            )
        )

    return response

class ActionHistoryItem(BaseModel):
    id: int
    order_position_id: int
    order_id: int
    action_type: str
    quantity: int
    actor_id: int
    actor_name: str
    worker_ids: list[int] = []
    worker_names: list[str] = []
    timestamp: datetime
    product_sku: str
    cost: float | None = None

    class Config:
        from_attributes = True


class PaginatedActionHistoryResponse(BaseModel):
    items: list[ActionHistoryItem]
    total_days: int
    page: int
    days_per_page: int
    total_pages: int
    first_day: date | None = None
    last_day: date | None = None


def serialize_action_history_item(
    action: OrderPositionAction,
    worker_id: int | None = None,
) -> ActionHistoryItem:
    actor_name = action.actor.name if action.actor else f"User {action.actor_id}"
    worker_ids = get_action_worker_ids(action) or [action.actor_id]
    worker_names = get_action_worker_names(action) or [actor_name]
    cost = action.cost
    if worker_id is not None:
        cost = get_action_cost_share(action)

    return ActionHistoryItem(
        id=action.id,
        order_position_id=action.order_position_id,
        order_id=action.order_position.order_id if action.order_position else 0,
        action_type=action_type_value(action.action_type),
        quantity=action.quantity,
        actor_id=action.actor_id,
        actor_name=actor_name,
        worker_ids=worker_ids,
        worker_names=worker_names,
        timestamp=action.timestamp,
        product_sku=(
            action.order_position.product.sku
            if action.order_position and action.order_position.product
            else "N/A"
        ),
        cost=cost,
    )


def apply_action_history_filters(
    query,
    worker_id: Optional[int] = None,
    action_type: Optional[ActionType] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    product_sku: Optional[str] = None,
):
    if worker_id:
        query = query.filter(action_belongs_to_user(worker_id))
    if action_type:
        query = query.filter(OrderPositionAction.action_type == action_type)
    if date_from:
        query = query.filter(func.date(OrderPositionAction.timestamp) >= date_from)
    if date_to:
        query = query.filter(func.date(OrderPositionAction.timestamp) <= date_to)
    if product_sku:
        search_term = f"%{product_sku.strip()}%"
        query = query.filter(
            OrderPositionAction.order_position.has(
                OrderPosition.product.has(Product.sku.ilike(search_term))
            )
        )
    return query


def get_history_query(db: Session):
    return get_action_query(db).options(
        joinedload(OrderPositionAction.order_position).joinedload(OrderPosition.product),
        joinedload(OrderPositionAction.order_position).joinedload(OrderPosition.order),
    )


@router.get("/actions/history")
def list_action_history(
    worker_id: Optional[int] = None,
    action_type: Optional[ActionType] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    product_sku: Optional[str] = None,
    db: Session = Depends(get_db),
) -> list[ActionHistoryItem]:
    """Get action history with optional filters."""
    query = apply_action_history_filters(
        get_history_query(db),
        worker_id=worker_id,
        action_type=action_type,
        date_from=date_from,
        date_to=date_to,
        product_sku=product_sku,
    )

    actions = query.order_by(OrderPositionAction.timestamp.desc()).limit(500).all()
    return [serialize_action_history_item(action, worker_id) for action in actions]


@router.get("/actions/history/paginated", response_model=PaginatedActionHistoryResponse)
def list_action_history_paginated(
    worker_id: Optional[int] = None,
    action_type: Optional[ActionType] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    product_sku: Optional[str] = None,
    page: int = Query(1, ge=1),
    days_per_page: int = Query(10, ge=1, le=31),
    db: Session = Depends(get_db),
) -> PaginatedActionHistoryResponse:
    """Get action history paginated by unique days, not by row count."""
    day_expr = func.date(OrderPositionAction.timestamp).label("action_day")
    day_query = apply_action_history_filters(
        db.query(day_expr),
        worker_id=worker_id,
        action_type=action_type,
        date_from=date_from,
        date_to=date_to,
        product_sku=product_sku,
    )

    distinct_days_subquery = day_query.distinct().subquery()
    total_days = db.query(func.count()).select_from(distinct_days_subquery).scalar() or 0
    total_pages = max(1, ceil(total_days / days_per_page)) if total_days else 1
    current_page = min(page, total_pages)
    offset = (current_page - 1) * days_per_page

    selected_days = [
        action_day
        for action_day, in (
            db.query(distinct_days_subquery.c.action_day)
            .order_by(distinct_days_subquery.c.action_day.desc())
            .offset(offset)
            .limit(days_per_page)
            .all()
        )
    ]

    items: list[ActionHistoryItem] = []
    if selected_days:
        actions = apply_action_history_filters(
            get_history_query(db),
            worker_id=worker_id,
            action_type=action_type,
            date_from=date_from,
            date_to=date_to,
            product_sku=product_sku,
        ).filter(func.date(OrderPositionAction.timestamp).in_(selected_days))

        items = [
            serialize_action_history_item(action, worker_id)
            for action in actions.order_by(OrderPositionAction.timestamp.desc()).all()
        ]

    return PaginatedActionHistoryResponse(
        items=items,
        total_days=total_days,
        page=current_page,
        days_per_page=days_per_page,
        total_pages=total_pages,
        first_day=selected_days[0] if selected_days else None,
        last_day=selected_days[-1] if selected_days else None,
    )
