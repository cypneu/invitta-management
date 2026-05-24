from dataclasses import dataclass
from datetime import date, datetime, timedelta
import logging
import re
from typing import Iterable

logger = logging.getLogger(__name__)

from sqlalchemy.orm import Session

from ..models import EdgeType, Order, OrderPosition, OrderStatus, Product, ShapeType, SyncState

MAX_ORDERS_PER_SYNC = 200


@dataclass(slots=True)
class SyncItem:
    sku: str
    quantity: int


@dataclass(slots=True)
class SyncOrder:
    integration: str
    external_id: str
    created_timestamp: int
    source: str | None
    fullname: str | None
    company: str | None
    expected_shipment_date: date | None
    items: list[SyncItem]
    sync_warning: str | None = None


def initial_sync_timestamp() -> int:
    return int((datetime.now() - timedelta(days=1)).timestamp())


def get_sync_state(db: Session, integration: str) -> SyncState:
    state = db.query(SyncState).filter(SyncState.integration == integration).first()
    if state is None:
        state = SyncState(integration=integration, last_sync_timestamp=initial_sync_timestamp())
        db.add(state)
        db.flush()
    return state


def sync_normalized_orders(
    db: Session,
    state: SyncState,
    orders: list[SyncOrder],
    sync_started_at: int,
    all_fetched: bool = True,
) -> dict[str, int | str]:
    orders_synced = 0
    products_created = 0

    for payload in orders:
        created, product_count = upsert_order(db, payload)
        orders_synced += int(created)
        products_created += product_count

    if all_fetched:
        # Normal case: use server time with safety buffer.
        # This ensures orders created during sync are never skipped.
        new_timestamp = sync_started_at - 120  # 2 minute safety buffer
    else:
        # Capped case (catching up): advance to the latest order's timestamp
        # so the next cycle continues from where we left off.
        if orders:
            new_timestamp = max(o.created_timestamp for o in orders)
        else:
            new_timestamp = state.last_sync_timestamp
        logger.info(
            "Batch cap reached for %s (%d orders), will continue from timestamp %d next cycle",
            state.integration, len(orders), new_timestamp,
        )

    if new_timestamp > state.last_sync_timestamp:
        state.last_sync_timestamp = new_timestamp

    db.commit()

    return {
        "integration": state.integration,
        "orders_synced": orders_synced,
        "products_created": products_created,
    }


def upsert_order(db: Session, payload: SyncOrder) -> tuple[bool, int]:
    order = (
        db.query(Order)
        .filter(Order.integration == payload.integration, Order.external_id == payload.external_id)
        .first()
    )

    if order is None and payload.integration == "baselinker" and payload.external_id.isdigit():
        order = db.query(Order).filter(Order.baselinker_id == int(payload.external_id)).first()

    created = order is None

    if order is None:
        order = Order(
            integration=payload.integration,
            external_id=payload.external_id,
            baselinker_id=int(payload.external_id) if payload.integration == "baselinker" and payload.external_id.isdigit() else None,
            source=payload.source,
            expected_shipment_date=payload.expected_shipment_date,
            fullname=payload.fullname,
            company=payload.company,
            status=OrderStatus.in_progress,
            sync_warning=payload.sync_warning,
        )
        db.add(order)
    else:
        order.integration = payload.integration
        order.external_id = payload.external_id
        if payload.integration == "baselinker" and payload.external_id.isdigit():
            order.baselinker_id = int(payload.external_id)
        order.source = payload.source
        order.fullname = payload.fullname
        order.company = payload.company
        if payload.expected_shipment_date is not None:
            order.expected_shipment_date = payload.expected_shipment_date
        order.sync_warning = payload.sync_warning

    db.flush()

    product_totals: dict[str, int] = {}
    for item in payload.items:
        if not item.sku:
            continue
        product_totals[item.sku] = product_totals.get(item.sku, 0) + item.quantity

    products_created = 0

    for sku, quantity in product_totals.items():
        product, was_created = upsert_product(db, sku)
        products_created += int(was_created)
        position = (
            db.query(OrderPosition)
            .filter(OrderPosition.order_id == order.id, OrderPosition.product_id == product.id)
            .first()
        )
        if position is None:
            db.add(OrderPosition(order_id=order.id, product_id=product.id, quantity=quantity))
        else:
            position.quantity = quantity

    return created, products_created


def upsert_product(db: Session, sku: str) -> tuple[Product, bool]:
    product = db.query(Product).filter(Product.sku == sku).first()
    parsed = parse_sku(sku)
    created = product is None

    if product is None:
        product = Product(sku=sku, **parsed)
        db.add(product)
        db.flush()
    else:
        product.fabric = parsed["fabric"]
        product.pattern = parsed["pattern"]
        product.shape = parsed["shape"]
        product.width = parsed["width"]
        product.height = parsed["height"]
        product.diameter = parsed["diameter"]
        product.edge_type = parsed["edge_type"]

    return product, created


def parse_sku(sku: str) -> dict[str, object]:
    edge_type = None
    remaining = sku

    for value in ["Druk-U3", "OGK", "U3", "U4", "U5", "O1", "O3", "O5", "LA", "S2", "S4"]:
        if not remaining.upper().startswith(value.upper()):
            continue
        boundary = len(value)
        if boundary < len(remaining) and remaining[boundary] not in "-_ ":
            continue
        edge_type = EdgeType.U3 if value.upper() == "DRUK-U3" else EdgeType(value.upper())
        remaining = remaining[boundary:].lstrip("-_ ")
        break

    if edge_type is None:
        for value in ["Druk-U3", "OGK", "U3", "U4", "U5", "O1", "O3", "O5", "LA", "S2", "S4"]:
            suffixes = [f" {value.upper()}", f"-{value.upper()}"]
            normalized = remaining.upper()
            if not any(normalized.endswith(suffix) for suffix in suffixes):
                continue
            edge_type = EdgeType.U3 if value.upper() == "DRUK-U3" else EdgeType(value.upper())
            remaining = remaining[: -(len(value) + 1)].rstrip("-_ ")
            break

    parts = [part for part in remaining.replace(" ", "-").split("-") if part]
    fabric = parts[0] if parts else ""
    pattern = parts[1] if len(parts) > 1 else ""
    dimensions_part = None

    for index, part in enumerate(parts):
        lowered = part.lower()
        if not (
            re.search(r"\d+[xXvV]\d+", part)
            or re.search(r"[oO]\d+", part)
            or re.search(r"\d+[oO]", part)
        ):
            continue
        dimensions_part = lowered
        if index > 1:
            pattern = "-".join(parts[1:index])
        break

    if dimensions_part is None and parts:
        dimensions_part = parts[-1].lower()
        if len(parts) > 2:
            pattern = "-".join(parts[1:-1])

    shape = ShapeType.rectangular
    width = None
    height = None
    diameter = None

    if dimensions_part:
        if "x" in dimensions_part:
            match = re.search(r"(\d+)x(\d+)", dimensions_part)
            if match:
                width = int(match.group(1))
                height = int(match.group(2))
        elif "v" in dimensions_part:
            shape = ShapeType.oval
            match = re.search(r"(\d+)v(\d+)", dimensions_part)
            if match:
                width = int(match.group(1))
                height = int(match.group(2))
        elif "o" in dimensions_part:
            shape = ShapeType.round
            match = re.search(r"o(\d+)", dimensions_part) or re.search(r"(\d+)o", dimensions_part)
            if match:
                diameter = int(match.group(1))

    return {
        "edge_type": edge_type,
        "fabric": fabric,
        "pattern": pattern,
        "shape": shape,
        "width": width,
        "height": height,
        "diameter": diameter,
    }
