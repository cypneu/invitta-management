"""Actions router - Workers add actions to order positions with concurrency control."""

from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func

from ..database import get_db
from ..models import OrderPosition, OrderPositionAction, User, ActionType, Order, OrderStatus
from ..schemas import (
    ActionCreate,
    ActionResponse,
    OrderPositionWithActionsResponse,
    ProductResponse,
)

router = APIRouter(prefix="/api", tags=["actions"])


def get_action_totals(position: OrderPosition) -> dict[str, int]:
    """Calculate total quantities per action type for a position."""
    totals: dict[str, int] = {}
    for action in position.actions:
        action_type = action.action_type.value if isinstance(action.action_type, ActionType) else action.action_type
        totals[action_type] = totals.get(action_type, 0) + action.quantity
    return totals


def validate_action_permission(user: User, action_type: ActionType) -> None:
    """Check if user is allowed to perform this action type."""
    allowed = user.allowed_action_types or []
    allowed_str = [a.value if isinstance(a, ActionType) else a for a in allowed]
    action_str = action_type.value if isinstance(action_type, ActionType) else action_type

    if action_str not in allowed_str:
        raise HTTPException(
            status_code=403,
            detail=f"You are not authorized to perform '{action_str}' actions",
        )


def is_position_complete(position: OrderPosition) -> bool:
    """Check if a position has all 4 action types filled to full quantity."""
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
    for position in order.positions:
        if not is_position_complete(position):
            return False
    return True


def update_order_status_if_needed(db: Session, order: Order) -> None:
    """Update order status based on position completion.
    
    - If all positions complete -> status = done
    - If any position incomplete and status was done -> status = in_progress
    """
    if order.status == OrderStatus.fetched:
        # Don't auto-transition from fetched - admin must start it
        return
    
    order_complete = is_order_complete(order)
    
    if order_complete and order.status != OrderStatus.done:
        order.status = OrderStatus.done
    elif not order_complete and order.status == OrderStatus.done:
        order.status = OrderStatus.in_progress


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
        raise HTTPException(status_code=404, detail="User not found")

    # Validate permissions first (before locking)
    if user.role != "admin":
        validate_action_permission(user, action_data.action_type)

    # Lock the position row to prevent concurrent modifications (write skew prevention)
    position = (
        db.query(OrderPosition)
        .filter(OrderPosition.id == position_id)
        .with_for_update()  # SELECT ... FOR UPDATE
        .first()
    )
    if not position:
        raise HTTPException(status_code=404, detail="Order position not found")

    # Check order status - workers can only add actions to in_progress or done orders
    order = db.query(Order).filter(Order.id == position.order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if user.role != "admin" and order.status == OrderStatus.fetched:
        raise HTTPException(
            status_code=400, 
            detail="Zamówienie nie zostało jeszcze rozpoczęte"
        )

    # Calculate current total for this action type with lock held
    action_type_str = action_data.action_type.value if isinstance(action_data.action_type, ActionType) else action_data.action_type
    current_total = db.query(func.coalesce(func.sum(OrderPositionAction.quantity), 0)).filter(
        OrderPositionAction.order_position_id == position_id,
        OrderPositionAction.action_type == action_data.action_type
    ).scalar()

    # Validate quantity limit
    if current_total + action_data.quantity > position.quantity:
        raise HTTPException(
            status_code=400,
            detail=f"Total quantity ({current_total + action_data.quantity}) would exceed position quantity ({position.quantity})",
        )

    # Calculate cost for this action
    from ..services.costs import calculate_action_cost, get_or_create_config
    from ..models import CostConfig
    
    config = get_or_create_config(db)
    product = position.product
    cost = calculate_action_cost(action_data.action_type, product, action_data.quantity, config)

    # Create the action with cost snapshot
    action = OrderPositionAction(
        order_position_id=position_id,
        action_type=action_data.action_type,
        quantity=action_data.quantity,
        cost=cost,
        actor_id=user_id,
        timestamp=datetime.now(),
    )
    db.add(action)
    db.flush()  # Persist action before checking status

    # Reload position with all actions to check completion
    db.refresh(position)
    position = (
        db.query(OrderPosition)
        .options(joinedload(OrderPosition.actions))
        .filter(OrderPosition.id == position_id)
        .first()
    )

    # Reload order with all positions to check if order is complete
    order = (
        db.query(Order)
        .options(joinedload(Order.positions).joinedload(OrderPosition.actions))
        .filter(Order.id == position.order_id)
        .first()
    )

    # Update order status if needed
    update_order_status_if_needed(db, order)

    db.commit()
    db.refresh(action)

    return ActionResponse(
        id=action.id,
        order_position_id=action.order_position_id,
        action_type=action.action_type,
        quantity=action.quantity,
        cost=action.cost,
        actor_id=action.actor_id,
        actor_name=user.name,
        timestamp=action.timestamp,
    )


@router.patch("/actions/{action_id}")
def update_action(
    action_id: int,
    action_data: ActionCreate,
    user_id: int = Query(..., description="ID of the user updating the action"),
    db: Session = Depends(get_db),
):
    """Update an action's quantity. Workers can update their own actions, admins can update any.
    
    Triggers status recalculation after update.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    action = db.query(OrderPositionAction).filter(OrderPositionAction.id == action_id).first()
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")

    # Workers can only update their own actions, admins can update any
    if user.role != "admin" and action.actor_id != user.id:
        raise HTTPException(status_code=403, detail="Możesz edytować tylko swoje akcje")

    position_id = action.order_position_id

    # Lock position to prevent concurrent modifications
    position = (
        db.query(OrderPosition)
        .filter(OrderPosition.id == position_id)
        .with_for_update()
        .first()
    )

    # Validate action type matches (can't change action type)
    action_type_str = action_data.action_type.value if isinstance(action_data.action_type, ActionType) else action_data.action_type
    if action_type_str != action.action_type:
        raise HTTPException(status_code=400, detail="Nie można zmienić typu akcji")

    # Calculate what the new total would be
    current_total = sum(
        a.quantity for a in position.actions 
        if a.action_type == action.action_type and a.id != action.id
    )
    new_total = current_total + action_data.quantity
    
    if new_total > position.quantity:
        raise HTTPException(
            status_code=400,
            detail=f"Przekroczono limit. Maksymalnie można: {position.quantity - current_total}"
        )

    if action_data.quantity <= 0:
        raise HTTPException(status_code=400, detail="Ilość musi być większa od 0")

    # Update the action
    action.quantity = action_data.quantity
    db.flush()

    # Reload order with positions to recalculate status
    order = (
        db.query(Order)
        .options(joinedload(Order.positions).joinedload(OrderPosition.actions))
        .filter(Order.id == position.order_id)
        .first()
    )

    # Update status
    update_order_status_if_needed(db, order)

    db.commit()
    db.refresh(action)
    
    return ActionResponse(
        id=action.id,
        order_position_id=action.order_position_id,
        action_type=action.action_type,
        quantity=action.quantity,
        actor_id=action.actor_id,
        actor_name=user.name,
        timestamp=action.timestamp,
    )


@router.delete("/actions/{action_id}")
def delete_action(
    action_id: int,
    user_id: int = Query(..., description="ID of the user deleting the action"),
    db: Session = Depends(get_db),
):
    """Delete an action. Admins can delete any action, workers can delete their own. Triggers status recalculation."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    action = db.query(OrderPositionAction).filter(OrderPositionAction.id == action_id).first()
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    
    # Admins can delete any action, workers can only delete their own
    if user.role != "admin" and action.actor_id != user.id:
        raise HTTPException(status_code=403, detail="Możesz usunąć tylko swoje wpisy")

    position_id = action.order_position_id

    # Lock position to prevent concurrent modifications
    position = (
        db.query(OrderPosition)
        .filter(OrderPosition.id == position_id)
        .with_for_update()
        .first()
    )

    # Delete the action
    db.delete(action)
    db.flush()

    # Reload order with positions to recalculate status
    order = (
        db.query(Order)
        .options(joinedload(Order.positions).joinedload(OrderPosition.actions))
        .filter(Order.id == position.order_id)
        .first()
    )

    # Update status (may go from done -> in_progress)
    update_order_status_if_needed(db, order)

    db.commit()
    return {"message": "Action deleted successfully"}


@router.get("/order-positions/{position_id}/actions", response_model=list[ActionResponse])
def list_position_actions(position_id: int, db: Session = Depends(get_db)):
    """List all actions for an order position."""
    position = db.query(OrderPosition).filter(OrderPosition.id == position_id).first()
    if not position:
        raise HTTPException(status_code=404, detail="Order position not found")

    actions = (
        db.query(OrderPositionAction)
        .options(joinedload(OrderPositionAction.actor))
        .filter(OrderPositionAction.order_position_id == position_id)
        .order_by(OrderPositionAction.timestamp.desc())
        .all()
    )

    return [
        ActionResponse(
            id=a.id,
            order_position_id=a.order_position_id,
            action_type=a.action_type,
            quantity=a.quantity,
            actor_id=a.actor_id,
            actor_name=a.actor.name,
            timestamp=a.timestamp,
        )
        for a in actions
    ]


@router.get("/order-positions/{position_id}", response_model=OrderPositionWithActionsResponse)
def get_position_with_actions(position_id: int, db: Session = Depends(get_db)):
    """Get an order position with all its actions and totals."""
    position = (
        db.query(OrderPosition)
        .options(
            joinedload(OrderPosition.product),
            joinedload(OrderPosition.actions).joinedload(OrderPositionAction.actor),
        )
        .filter(OrderPosition.id == position_id)
        .first()
    )
    if not position:
        raise HTTPException(status_code=404, detail="Order position not found")

    action_totals = get_action_totals(position)

    return OrderPositionWithActionsResponse(
        id=position.id,
        order_id=position.order_id,
        product_id=position.product_id,
        product=ProductResponse.model_validate(position.product),
        quantity=position.quantity,
        actions=[
            ActionResponse(
                id=a.id,
                order_position_id=a.order_position_id,
                action_type=a.action_type,
                quantity=a.quantity,
                actor_id=a.actor_id,
                actor_name=a.actor.name,
                timestamp=a.timestamp,
            )
            for a in position.actions
        ],
        action_totals=action_totals,
    )


@router.get("/my-actions", response_model=list[ActionResponse])
def list_my_actions(
    user_id: int = Query(..., description="ID of the current user"),
    action_type: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
):
    """List actions performed by the current user."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    query = (
        db.query(OrderPositionAction)
        .options(joinedload(OrderPositionAction.actor))
        .filter(OrderPositionAction.actor_id == user_id)
    )

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

    actions = query.order_by(OrderPositionAction.timestamp.desc()).all()

    return [
        ActionResponse(
            id=a.id,
            order_position_id=a.order_position_id,
            action_type=a.action_type,
            quantity=a.quantity,
            actor_id=a.actor_id,
            actor_name=a.actor.name,
            timestamp=a.timestamp,
        )
        for a in actions
    ]


@router.get("/action-types", response_model=list[str])
def list_action_types():
    """Get available action types."""
    return [a.value for a in ActionType]


@router.get("/orders/{order_id}/positions", response_model=list[OrderPositionWithActionsResponse])
def list_order_positions(order_id: int, db: Session = Depends(get_db)):
    """List all positions for an order with their actions."""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    positions = (
        db.query(OrderPosition)
        .options(
            joinedload(OrderPosition.product),
            joinedload(OrderPosition.actions).joinedload(OrderPositionAction.actor),
        )
        .filter(OrderPosition.order_id == order_id)
        .all()
    )

    return [
        OrderPositionWithActionsResponse(
            id=p.id,
            order_id=p.order_id,
            product_id=p.product_id,
            product=ProductResponse.model_validate(p.product),
            quantity=p.quantity,
            actions=[
                ActionResponse(
                    id=a.id,
                    order_position_id=a.order_position_id,
                    action_type=a.action_type,
                    quantity=a.quantity,
                    actor_id=a.actor_id,
                    actor_name=a.actor.name,
                    timestamp=a.timestamp,
                )
                for a in p.actions
            ],
            action_totals=get_action_totals(p),
        )
        for p in positions
    ]


# ============================================================
# Action History Endpoints
# ============================================================

from pydantic import BaseModel

class ActionUpdate(BaseModel):
    quantity: int


class ActionHistoryItem(BaseModel):
    id: int
    order_position_id: int
    order_id: int
    action_type: str
    quantity: int
    actor_id: int
    actor_name: str
    timestamp: datetime
    product_sku: str
    cost: float | None = None

    class Config:
        from_attributes = True


@router.get("/actions/history")
def list_action_history(
    worker_id: Optional[int] = None,
    action_type: Optional[ActionType] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
) -> list[ActionHistoryItem]:
    """Get action history with optional filters.
    
    - If worker_id is provided, only returns that worker's actions
    - Results are sorted by timestamp descending (most recent first)
    """
    query = (
        db.query(OrderPositionAction)
        .options(
            joinedload(OrderPositionAction.actor),
            joinedload(OrderPositionAction.order_position).joinedload(OrderPosition.product),
            joinedload(OrderPositionAction.order_position).joinedload(OrderPosition.order),
        )
    )
    
    if worker_id:
        query = query.filter(OrderPositionAction.actor_id == worker_id)
    if action_type:
        query = query.filter(OrderPositionAction.action_type == action_type)
    if date_from:
        query = query.filter(func.date(OrderPositionAction.timestamp) >= date_from)
    if date_to:
        query = query.filter(func.date(OrderPositionAction.timestamp) <= date_to)
    
    actions = query.order_by(OrderPositionAction.timestamp.desc()).limit(500).all()
    
    return [
        ActionHistoryItem(
            id=a.id,
            order_position_id=a.order_position_id,
            order_id=a.order_position.order_id if a.order_position else 0,
            action_type=a.action_type.value if hasattr(a.action_type, 'value') else a.action_type,
            quantity=a.quantity,
            actor_id=a.actor_id,
            actor_name=a.actor.name if a.actor else f"User {a.actor_id}",
            timestamp=a.timestamp,
            product_sku=a.order_position.product.sku if a.order_position and a.order_position.product else "N/A",
            cost=a.cost,
        )
        for a in actions
    ]


@router.put("/actions/{action_id}")
def update_action(
    action_id: int,
    action_data: ActionUpdate,
    user_id: int = Query(..., description="ID of the user updating the action"),
    db: Session = Depends(get_db),
):
    """Update action quantity.
    
    Workers can only update their own actions.
    Admins can update any action.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    action = (
        db.query(OrderPositionAction)
        .options(joinedload(OrderPositionAction.order_position))
        .filter(OrderPositionAction.id == action_id)
        .first()
    )
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    
    # Permission check: workers can only edit their own actions
    if user.role != "admin" and action.actor_id != user.id:
        raise HTTPException(status_code=403, detail="You can only edit your own actions")
    
    # Validate quantity
    if action_data.quantity < 1:
        raise HTTPException(status_code=400, detail="Quantity must be at least 1")
    
    position = action.order_position
    if not position:
        raise HTTPException(status_code=400, detail="Position not found")
    
    # Check quantity doesn't exceed position total
    current_total = sum(
        a.quantity for a in position.actions
        if a.action_type == action.action_type and a.id != action_id
    )
    if current_total + action_data.quantity > position.quantity:
        max_allowed = position.quantity - current_total
        raise HTTPException(
            status_code=400,
            detail=f"Quantity exceeds limit. Maximum allowed: {max_allowed}"
        )
    
    action.quantity = action_data.quantity
    
    # Update order status if needed
    order = position.order
    if order:
        update_order_status_if_needed(db, order)
    
    db.commit()
    return {"message": "Action updated", "id": action_id, "quantity": action_data.quantity}


@router.delete("/actions/{action_id}")
def delete_action(
    action_id: int,
    user_id: int = Query(..., description="ID of the user deleting the action"),
    db: Session = Depends(get_db),
):
    """Delete an action.
    
    Workers can only delete their own actions.
    Admins can delete any action.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    action = (
        db.query(OrderPositionAction)
        .options(
            joinedload(OrderPositionAction.order_position).joinedload(OrderPosition.order)
        )
        .filter(OrderPositionAction.id == action_id)
        .first()
    )
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    
    # Permission check: workers can only delete their own actions
    if user.role != "admin" and action.actor_id != user.id:
        raise HTTPException(status_code=403, detail="You can only delete your own actions")
    
    position = action.order_position
    order = position.order if position else None
    
    db.delete(action)
    
    # Update order status if needed
    if order:
        update_order_status_if_needed(db, order)
    
    db.commit()
    return {"message": "Action deleted", "id": action_id}
