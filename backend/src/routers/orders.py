"""Orders router - Admin CRUD for orders with positions and status management."""

from datetime import date
from math import ceil
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import cast, func, or_, String

from ..database import get_db
from ..models import Order, OrderPosition, Product, User, OrderStatus
from ..order_sources import INVITTA_SHOP_SOURCE, is_invitta_shop_source, normalize_order_source, should_preserve_source_label
from ..order_statuses import normalize_order_status
from ..schemas import (
    OrderCreate,
    OrderUpdate,
    OrderResponse,
    OrderListResponse,
    OrderPositionCreate,
    OrderPositionResponse,
    OrderStatus as OrderStatusSchema,
    OrderWithPositionsListResponse,
    PaginatedOrderWithPositionsListResponse,
    OrderPositionBrief,
    OrderStatusCountsResponse,
    ProductResponse,
)

router = APIRouter(prefix="/api/orders", tags=["orders"])


def require_admin(user_id: int, db: Session) -> User:
    """Verify user is an admin."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Nie znaleziono użytkownika")
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Wymagane uprawnienia administratora")
    return user


class StatusUpdate(BaseModel):
    status: OrderStatusSchema


class BulkStatusUpdate(BaseModel):
    order_ids: list[int]
    status: OrderStatusSchema


class ShipmentDateUpdate(BaseModel):
    expected_shipment_date: date | None


def apply_order_filters(
    query,
    source: Optional[str] = None,
    status: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    search: Optional[str] = None,
):
    if source:
        if is_invitta_shop_source(source):
            query = query.filter(
                Order.integration == "invitta",
                Order.source.in_(["shop", INVITTA_SHOP_SOURCE]),
            )
        elif should_preserve_source_label(source):
            query = query.filter(Order.source == source)
        else:
            query = query.filter(
                or_(
                    Order.source == source,
                    Order.source.like(f"{source} - %"),
                )
            )
    if status:
        try:
            normalized_status = normalize_order_status(status)
            if normalized_status == OrderStatusSchema.in_progress.value:
                query = query.filter(Order.status.in_([OrderStatus.in_progress, OrderStatus.fetched]))
            else:
                status_enum = OrderStatus(normalized_status)
                query = query.filter(Order.status == status_enum)
        except ValueError:
            pass
    if date_from:
        query = query.filter(Order.expected_shipment_date >= date_from)
    if date_to:
        query = query.filter(Order.expected_shipment_date <= date_to)
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            (Order.fullname.ilike(search_term))
            | (Order.company.ilike(search_term))
            | (Order.external_id.ilike(search_term))
            | (cast(Order.id, String).ilike(search_term))
        )
    return query


def order_sorting():
    return (
        func.coalesce(Order.expected_shipment_date, "9999-12-31").asc(),
        Order.id.desc(),
    )


def serialize_order_list_item(order: Order) -> OrderWithPositionsListResponse:
    from .actions import get_action_totals

    positions_brief = []
    for pos in order.positions:
        positions_brief.append(
            OrderPositionBrief(
                id=pos.id,
                product_id=pos.product_id,
                product=ProductResponse.model_validate(pos.product),
                quantity=pos.quantity,
                action_totals=get_action_totals(pos),
            )
        )

    return OrderWithPositionsListResponse(
        id=order.id,
        integration=order.integration,
        external_id=order.external_id
        or (str(order.baselinker_id) if order.baselinker_id is not None else None),
        source=order.source,
        expected_shipment_date=order.expected_shipment_date,
        fullname=order.fullname,
        company=order.company,
        status=order.status,
        position_count=len(order.positions),
        positions=positions_brief,
    )


def get_order_status_counts(
    db: Session,
    source: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    search: Optional[str] = None,
) -> OrderStatusCountsResponse:
    counts = {
        "all": 0,
        "in_progress": 0,
        "done": 0,
        "cancelled": 0,
    }

    rows = (
        apply_order_filters(
            db.query(Order.status, func.count(Order.id)),
            source=source,
            date_from=date_from,
            date_to=date_to,
            search=search,
        )
        .group_by(Order.status)
        .all()
    )

    for status_value, count in rows:
        counts[normalize_order_status(status_value)] += int(count)
        counts["all"] += int(count)

    return OrderStatusCountsResponse(**counts)


@router.get("/", response_model=list[OrderWithPositionsListResponse])
def list_orders(
    source: Optional[str] = None,
    status: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """List all orders with positions and action totals in single query."""
    query = apply_order_filters(
        db.query(Order).options(
            joinedload(Order.positions).joinedload(OrderPosition.product),
            joinedload(Order.positions).joinedload(OrderPosition.actions),
        ),
        source=source,
        status=status,
        date_from=date_from,
        date_to=date_to,
        search=search,
    )

    orders = query.order_by(*order_sorting()).all()
    return [serialize_order_list_item(order) for order in orders]


@router.get("/paginated", response_model=PaginatedOrderWithPositionsListResponse)
def list_orders_paginated(
    source: Optional[str] = None,
    status: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """List orders for the admin table with backend pagination."""
    filtered_query = apply_order_filters(
        db.query(Order),
        source=source,
        status=status,
        date_from=date_from,
        date_to=date_to,
        search=search,
    )

    total = filtered_query.count()
    total_pages = max(1, ceil(total / page_size)) if total else 1
    current_page = min(page, total_pages)
    offset = (current_page - 1) * page_size

    page_order_ids = [
        order_id
        for order_id, in filtered_query.order_by(*order_sorting())
        .with_entities(Order.id)
        .offset(offset)
        .limit(page_size)
        .all()
    ]

    items: list[OrderWithPositionsListResponse] = []
    if page_order_ids:
        orders = (
            db.query(Order)
            .options(
                joinedload(Order.positions).joinedload(OrderPosition.product),
                joinedload(Order.positions).joinedload(OrderPosition.actions),
            )
            .filter(Order.id.in_(page_order_ids))
            .all()
        )
        orders_by_id = {order.id: order for order in orders}
        items = [
            serialize_order_list_item(orders_by_id[order_id])
            for order_id in page_order_ids
            if order_id in orders_by_id
        ]

    status_counts = get_order_status_counts(
        db,
        source=source,
        date_from=date_from,
        date_to=date_to,
        search=search,
    )

    return PaginatedOrderWithPositionsListResponse(
        items=items,
        total=total,
        page=current_page,
        page_size=page_size,
        total_pages=total_pages,
        status_counts=status_counts,
    )


@router.get("/sources", response_model=list[str])
def list_order_sources(db: Session = Depends(get_db)):
    """List distinct order sources for filters."""
    rows = (
        db.query(Order.source, Order.integration)
        .filter(Order.source.isnot(None))
        .distinct()
        .order_by(Order.source.asc())
        .all()
    )

    seen: set[str] = set()
    labels: list[str] = []

    for source, integration in rows:
        label = normalize_order_source(source, integration)
        if not label or label in seen:
            continue
        seen.add(label)
        labels.append(label)

    return labels


@router.get("/for-worker", response_model=list[OrderWithPositionsListResponse])
def list_orders_for_worker(
    db: Session = Depends(get_db),
):
    """List orders for workers - active orders + recently finished orders."""
    from .actions import get_action_totals
    from datetime import datetime, timedelta
    
    # Build query with eager loading of positions, products, and actions
    query = db.query(Order).options(
        joinedload(Order.positions)
        .joinedload(OrderPosition.product),
        joinedload(Order.positions)
        .joinedload(OrderPosition.actions),
    )

    # Workers can see:
    # - All active orders
    # - Done orders with expected_shipment_date within last 7 days
    week_ago = datetime.now().date() - timedelta(days=7)
    query = query.filter(
        (Order.status.in_([OrderStatus.in_progress, OrderStatus.fetched])) |
        ((Order.status == OrderStatus.done) & (Order.expected_shipment_date >= week_ago))
    )

    orders = query.order_by(
        # Orders with earlier shipment dates first
        func.coalesce(Order.expected_shipment_date, '9999-12-31').asc(),
        Order.id.desc()
    ).all()

    result = []
    for order in orders:
        positions_brief = []
        for pos in order.positions:
            positions_brief.append(OrderPositionBrief(
                id=pos.id,
                product_id=pos.product_id,
                product=ProductResponse.model_validate(pos.product),
                quantity=pos.quantity,
                action_totals=get_action_totals(pos),
            ))
        
        result.append(OrderWithPositionsListResponse(
            id=order.id,
            integration=order.integration,
            external_id=order.external_id or (str(order.baselinker_id) if order.baselinker_id is not None else None),
            source=order.source,
            expected_shipment_date=order.expected_shipment_date,
            fullname=order.fullname,
            company=order.company,
            status=order.status,
            position_count=len(order.positions),
            positions=positions_brief,
        ))
    
    return result


@router.get("/{order_id}", response_model=OrderResponse)
def get_order(order_id: int, db: Session = Depends(get_db)):
    """Get a single order with its positions."""
    order = (
        db.query(Order)
        .options(joinedload(Order.positions).joinedload(OrderPosition.product))
        .filter(Order.id == order_id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Nie znaleziono zamówienia")
    return order


@router.post("/", response_model=OrderResponse)
def create_order(
    order_data: OrderCreate,
    user_id: int = Query(..., description="ID of the admin creating the order"),
    db: Session = Depends(get_db),
):
    """Create a new order with positions (admin only)."""
    require_admin(user_id, db)

    order = Order(
        expected_shipment_date=order_data.expected_shipment_date,
        fullname=order_data.fullname,
        company=order_data.company,
        status=OrderStatus.in_progress,
    )
    db.add(order)
    db.flush()

    # Add positions
    for pos_data in order_data.positions:
        product = db.query(Product).filter(Product.id == pos_data.product_id).first()
        if not product:
            raise HTTPException(
                status_code=400, detail=f"Nie znaleziono produktu o ID {pos_data.product_id}"
            )
        position = OrderPosition(
            order_id=order.id,
            product_id=pos_data.product_id,
            quantity=pos_data.quantity,
        )
        db.add(position)

    db.commit()
    db.refresh(order)

    # Reload with relationships
    return get_order(order.id, db)


@router.patch("/{order_id}/status", response_model=OrderResponse)
def update_order_status(
    order_id: int,
    status_data: StatusUpdate,
    user_id: int = Query(..., description="ID of the admin changing the status"),
    db: Session = Depends(get_db),
):
    """Update order status (admin only).
    
    Note: in_progress <-> done transitions are automatic based on position completion.
    """
    require_admin(user_id, db)

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Nie znaleziono zamówienia")

    new_status = status_data.status
    current_status = order.status

    # Allow any status transition (admin can set any status)
    if new_status != current_status:
        order.status = new_status

    db.commit()
    return get_order(order_id, db)


@router.patch("/bulk-status")
def bulk_update_order_status(
    bulk_data: BulkStatusUpdate,
    user_id: int = Query(..., description="ID of the admin changing the status"),
    db: Session = Depends(get_db),
):
    """Bulk update order status (admin only).
    
    Used to start multiple orders at once.
    """
    require_admin(user_id, db)

    updated_count = 0
    new_status = bulk_data.status

    for order_id in bulk_data.order_ids:
        order = db.query(Order).filter(Order.id == order_id).first()
        if not order:
            continue
            
        # Allow any status change
        if order.status != new_status:
            order.status = new_status
            updated_count += 1

    db.commit()
    return {"message": f"Zaktualizowano {updated_count} zamówień"}


@router.patch("/{order_id}/shipment-date", response_model=OrderResponse)
def update_order_shipment_date(
    order_id: int,
    date_data: ShipmentDateUpdate,
    user_id: int = Query(..., description="ID of the admin updating the date"),
    db: Session = Depends(get_db),
):
    """Update order expected shipment date (admin only)."""
    require_admin(user_id, db)

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Nie znaleziono zamówienia")

    order.expected_shipment_date = date_data.expected_shipment_date
    db.commit()
    return get_order(order_id, db)


@router.put("/{order_id}", response_model=OrderResponse)
def update_order(
    order_id: int,
    order_data: OrderUpdate,
    user_id: int = Query(..., description="ID of the admin updating the order"),
    db: Session = Depends(get_db),
):
    """Update an order (admin only)."""
    require_admin(user_id, db)

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Nie znaleziono zamówienia")

    if order_data.expected_shipment_date is not None:
        order.expected_shipment_date = order_data.expected_shipment_date
    if order_data.fullname is not None:
        order.fullname = order_data.fullname
    if order_data.company is not None:
        order.company = order_data.company

    db.commit()
    return get_order(order_id, db)


@router.delete("/{order_id}")
def delete_order(
    order_id: int,
    user_id: int = Query(..., description="ID of the admin deleting the order"),
    db: Session = Depends(get_db),
):
    """Delete an order (admin only)."""
    require_admin(user_id, db)

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Nie znaleziono zamówienia")

    db.delete(order)
    db.commit()
    return {"message": "Zamówienie zostało usunięte"}


# Order Position endpoints
@router.post("/{order_id}/positions", response_model=OrderPositionResponse)
def add_position(
    order_id: int,
    position_data: OrderPositionCreate,
    user_id: int = Query(..., description="ID of the admin adding the position"),
    db: Session = Depends(get_db),
):
    """Add a position to an order (admin only)."""
    require_admin(user_id, db)

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Nie znaleziono zamówienia")

    product = db.query(Product).filter(Product.id == position_data.product_id).first()
    if not product:
        raise HTTPException(status_code=400, detail="Nie znaleziono produktu")

    # Check for duplicate
    existing = (
        db.query(OrderPosition)
        .filter(
            OrderPosition.order_id == order_id,
            OrderPosition.product_id == position_data.product_id,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=400, detail="Pozycja dla tego produktu już istnieje w zamówieniu"
        )

    position = OrderPosition(
        order_id=order_id,
        product_id=position_data.product_id,
        quantity=position_data.quantity,
    )
    db.add(position)
    
    # Adding new position may affect order completion status
    # If order was done, it should go back to in_progress
    if order.status == OrderStatus.done:
        order.status = OrderStatus.in_progress
    
    db.commit()
    db.refresh(position)

    return OrderPositionResponse(
        id=position.id,
        order_id=position.order_id,
        product_id=position.product_id,
        product=product,
        quantity=position.quantity,
    )


@router.put("/positions/{position_id}", response_model=OrderPositionResponse)
def update_position(
    position_id: int,
    position_data: OrderPositionCreate,
    user_id: int = Query(..., description="ID of the admin updating the position"),
    db: Session = Depends(get_db),
):
    """Update an order position (admin only)."""
    require_admin(user_id, db)

    position = (
        db.query(OrderPosition)
        .options(joinedload(OrderPosition.product), joinedload(OrderPosition.order))
        .filter(OrderPosition.id == position_id)
        .first()
    )
    if not position:
        raise HTTPException(status_code=404, detail="Nie znaleziono pozycji")

    position.quantity = position_data.quantity
    
    # Check if this affects order status (if was done, may need to go back)
    from .actions import is_position_complete, is_order_complete
    order = position.order
    if order.status == OrderStatus.done and not is_position_complete(position):
        order.status = OrderStatus.in_progress
    
    db.commit()
    db.refresh(position)

    return position


@router.delete("/positions/{position_id}")
def delete_position(
    position_id: int,
    user_id: int = Query(..., description="ID of the admin deleting the position"),
    db: Session = Depends(get_db),
):
    """Delete an order position (admin only)."""
    require_admin(user_id, db)

    position = (
        db.query(OrderPosition)
        .options(joinedload(OrderPosition.order))
        .filter(OrderPosition.id == position_id)
        .first()
    )
    if not position:
        raise HTTPException(status_code=404, detail="Nie znaleziono pozycji")

    order = position.order
    
    db.delete(position)
    db.flush()
    
    # Recalculate order status after position deletion
    # Reload order to get updated positions list
    db.refresh(order)
    
    # If order still has positions and was done, check if still complete
    from .actions import is_order_complete, update_order_status_if_needed
    if order.positions:
        update_order_status_if_needed(db, order)
    
    db.commit()
    return {"message": "Pozycja została usunięta"}
