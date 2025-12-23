"""
Baselinker synchronization service.

Fetches orders from Baselinker API and syncs them to the local database.
"""

import json
import logging
import re
from datetime import datetime
from typing import Any

import requests
from sqlalchemy.orm import Session

from ..config import settings
from ..models import Order, OrderPosition, Product, ShapeType, SyncState, OrderStatus

logger = logging.getLogger(__name__)

BASELINKER_ENDPOINT = "https://api.baselinker.com/connector.php"


class BaselinkerClient:
    """Client for Baselinker API."""

    def __init__(self, token: str):
        self.token = token

    def _call(self, method: str, parameters: dict[str, Any] | None = None) -> dict:
        """Make a call to the Baselinker API."""
        payload = {
            "token": self.token,
            "method": method,
            "parameters": json.dumps(parameters or {}),
        }
        response = requests.post(BASELINKER_ENDPOINT, data=payload, timeout=30)
        response.raise_for_status()
        data = response.json()

        if data.get("status") != "SUCCESS":
            raise RuntimeError(f"Baselinker API error: {data.get('error_message', 'Unknown error')}")

        return data

    def get_order_extra_fields(self) -> list[dict]:
        """Get list of custom extra fields defined for orders."""
        data = self._call("getOrderExtraFields")
        return data.get("extra_fields", [])

    def get_orders(
        self,
        date_from: int,
        include_custom_extra_fields: bool = True,
        get_unconfirmed_orders: bool = False,
    ) -> list[dict]:
        """Fetch all orders from Baselinker since the given timestamp.
        
        Handles pagination - Baselinker returns max 100 orders per call.
        We keep fetching until we get fewer than 100 orders.
        """
        all_orders = []
        current_date_from = date_from
        
        while True:
            params = {
                "date_from": current_date_from,
                "get_unconfirmed_orders": get_unconfirmed_orders,
                "include_custom_extra_fields": include_custom_extra_fields,
            }
            data = self._call("getOrders", params)
            orders = data.get("orders", [])
            
            if not orders:
                break
                
            all_orders.extend(orders)
            
            # If we got fewer than 100 orders, we've got them all
            if len(orders) < 100:
                break
            
            # Get the last order's timestamp and add 1 to avoid duplicates
            last_order_timestamp = max(o.get("date_add", 0) for o in orders)
            current_date_from = last_order_timestamp + 1
            
            logger.info(f"Fetched {len(orders)} orders, continuing from timestamp {current_date_from}")
        
        return all_orders

    def get_order_transaction_data(self, order_id: int) -> dict:
        """Get transaction data for an order, including ship_date_to."""
        params = {"order_id": order_id}
        data = self._call("getOrderTransactionData", params)
        return data

    def get_order_sources(self) -> dict[int, str]:
        """Get order sources mapping (source_id -> source name).
        
        Returns a dict mapping order_source_id to the full source name 
        including account name (e.g., "allegro - Invitta").
        """
        data = self._call("getOrderSources")
        sources_map = {}
        
        for source_type, accounts in data.get("sources", {}).items():
            if isinstance(accounts, dict):
                for source_id_str, account_name in accounts.items():
                    try:
                        source_id = int(source_id_str)
                        # Combine source type with account name
                        sources_map[source_id] = f"{source_type} - {account_name}"
                    except (ValueError, TypeError):
                        continue
        
        return sources_map


def parse_sku(sku: str) -> dict[str, Any]:
    """
    Parse a product SKU into its components.

    Edge type extraction:
    - Known edge types: U3, U4, U5, O1, O3, O5, OGK, LA
    - Druk-U3 → U3
    - Edge type is at the start of SKU, before rest of pattern

    Dimension extraction (case insensitive):
    - NxM → rectangular (width x height)
    - NvM → oval (width x height)
    - oN or No → round (diameter)

    Returns dict with: edge_type, fabric, pattern, shape, width, height, diameter
    """
    from ..models import EdgeType
    
    # Known edge types (order matters - check longer patterns first)
    EDGE_TYPES = ['Druk-U3', 'OGK', 'U3', 'U4', 'U5', 'O1', 'O3', 'O5', 'LA']
    
    edge_type = None
    remaining = sku
    
    # Try to extract edge_type from the beginning
    for et in EDGE_TYPES:
        # Match at start: "U3-..." or "U3 ..." or just "U3"
        if remaining.upper().startswith(et.upper()):
            next_char_idx = len(et)
            if next_char_idx >= len(remaining) or remaining[next_char_idx] in '-_ ':
                # Map Druk-U3 to U3
                if et.upper() == 'DRUK-U3':
                    edge_type = EdgeType.U3
                else:
                    try:
                        edge_type = EdgeType(et.upper())
                    except ValueError:
                        edge_type = None
                # Remove edge_type prefix from remaining
                remaining = remaining[next_char_idx:].lstrip('-_ ')
                break
    
    # Also check for edge_type at the end (e.g., "Mela U3")
    if edge_type is None:
        for et in EDGE_TYPES:
            if remaining.upper().endswith(' ' + et.upper()) or remaining.upper().endswith('-' + et.upper()):
                try:
                    edge_type = EdgeType(et.upper()) if et.upper() != 'DRUK-U3' else EdgeType.U3
                except ValueError:
                    edge_type = None
                # Remove edge_type suffix
                remaining = remaining[:-(len(et) + 1)].rstrip('-_ ')
                break
    
    # Split remaining into parts
    # Normalize separators: replace spaces with dashes for consistent splitting
    normalized = remaining.replace(' ', '-')
    parts = [p for p in normalized.split('-') if p]
    
    fabric = parts[0] if len(parts) > 0 else ""
    pattern = parts[1] if len(parts) > 1 else ""
    
    # If there are more parts, they might be pattern continuation until size
    # Find dimensions part - look for size patterns in parts
    dimensions_part = None
    for i, part in enumerate(parts):
        part_lower = part.lower()
        # Check for size patterns: NxM, NvM, oN, No, or just N (could be size)
        if re.search(r'\d+[xXvV]\d+', part) or re.search(r'[oO]\d+', part) or re.search(r'\d+[oO]', part):
            dimensions_part = part_lower
            # Everything before this is pattern continuation
            if i > 1:
                pattern = '-'.join(parts[1:i])
            break
    
    # If no dimensions found in parts, check last part
    if dimensions_part is None and parts:
        dimensions_part = parts[-1].lower()
        # If more than 2 parts, middle ones are pattern
        if len(parts) > 2:
            pattern = '-'.join(parts[1:-1])
    
    # Default values
    shape = ShapeType.rectangular
    width = None
    height = None
    diameter = None

    if dimensions_part:
        # Check for shape indicators (case insensitive) - already lowercased
        if 'x' in dimensions_part:
            shape = ShapeType.rectangular
            match = re.search(r'(\d+)x(\d+)', dimensions_part)
            if match:
                width = int(match.group(1))
                height = int(match.group(2))
        elif 'v' in dimensions_part:
            shape = ShapeType.oval
            match = re.search(r'(\d+)v(\d+)', dimensions_part)
            if match:
                width = int(match.group(1))
                height = int(match.group(2))
        elif 'o' in dimensions_part:
            shape = ShapeType.round
            # Extract diameter: oN or No
            match = re.search(r'o(\d+)', dimensions_part)
            if match:
                diameter = int(match.group(1))
            else:
                match = re.search(r'(\d+)o', dimensions_part)
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


def find_shipment_date_field_id(client: BaselinkerClient) -> int | None:
    """Find the extra field ID for expected shipment date."""
    try:
        fields = client.get_order_extra_fields()
        for field in fields:
            name = field.get("name", "").lower()
            # Look for fields matching the pattern *_data_wysylki_od
            if "data_wysylki" in name:
                return field.get("extra_field_id")
    except Exception as e:
        logger.warning(f"Failed to get order extra fields: {e}")
    return None


def upsert_product(db: Session, sku: str) -> Product:
    """Create or update a product from SKU."""
    product = db.query(Product).filter(Product.sku == sku).first()

    parsed = parse_sku(sku)

    if product is None:
        product = Product(
            sku=sku,
            fabric=parsed["fabric"],
            pattern=parsed["pattern"],
            shape=parsed["shape"],
            width=parsed["width"],
            height=parsed["height"],
            diameter=parsed["diameter"],
            edge_type=parsed["edge_type"],
        )
        db.add(product)
        db.flush()
        logger.info(f"Created product: {sku}")
    else:
        # Update existing product
        product.fabric = parsed["fabric"]
        product.pattern = parsed["pattern"]
        product.shape = parsed["shape"]
        product.width = parsed["width"]
        product.height = parsed["height"]
        product.diameter = parsed["diameter"]
        product.edge_type = parsed["edge_type"]

    return product


def parse_shipment_date_from_transaction(transaction_data: dict) -> datetime | None:
    """Extract expected shipment date from transaction data (ship_date_to)."""
    ship_date_to = transaction_data.get("ship_date_to")
    
    if not ship_date_to:
        return None
    
    try:
        # ship_date_to can be a date string or timestamp
        if isinstance(ship_date_to, int):
            return datetime.fromtimestamp(ship_date_to).date()
        elif isinstance(ship_date_to, str):
            if ship_date_to.isdigit():
                return datetime.fromtimestamp(int(ship_date_to)).date()
            # Try common date formats
            for fmt in ["%Y-%m-%d", "%d-%m-%Y", "%d.%m.%Y"]:
                try:
                    return datetime.strptime(ship_date_to, fmt).date()
                except ValueError:
                    continue
    except Exception as e:
        logger.warning(f"Failed to parse ship_date_to '{ship_date_to}': {e}")
    
    return None


def sync_orders(db: Session) -> dict[str, int]:
    """
    Sync orders from Baselinker to the local database.

    Returns dict with counts: orders_synced, products_created
    """
    if not settings.baselinker_api_token:
        logger.warning("Baselinker API token not configured, skipping sync")
        return {"orders_synced": 0, "products_created": 0}

    client = BaselinkerClient(settings.baselinker_api_token)

    # Get or create sync state
    sync_state = db.query(SyncState).first()
    if sync_state is None:
        # Start from yesterday instead of fetching all orders
        from datetime import timedelta
        yesterday = datetime.now() - timedelta(days=1)
        initial_timestamp = int(yesterday.timestamp())
        sync_state = SyncState(last_sync_timestamp=initial_timestamp)
        db.add(sync_state)
        db.flush()
        logger.info(f"Initialized sync state with timestamp from yesterday: {initial_timestamp}")

    # Find shipment date field ID if not already stored
    if sync_state.shipment_date_field_id is None:
        field_id = find_shipment_date_field_id(client)
        if field_id:
            sync_state.shipment_date_field_id = field_id
            logger.info(f"Found shipment date field ID: {field_id}")

    # Fetch order sources to get account names
    try:
        order_sources = client.get_order_sources()
        logger.info(f"Fetched {len(order_sources)} order sources")
    except Exception as e:
        logger.warning(f"Failed to fetch order sources: {e}")
        order_sources = {}

    # Fetch orders since last sync
    orders_data = client.get_orders(
        date_from=sync_state.last_sync_timestamp,
        include_custom_extra_fields=True,
    )

    orders_synced = 0
    products_created = 0
    max_timestamp = sync_state.last_sync_timestamp

    for order_data in orders_data:
        baselinker_id = order_data["order_id"]
        order_timestamp = order_data.get("date_add", 0)

        # Track the max timestamp for next sync
        if order_timestamp > max_timestamp:
            max_timestamp = order_timestamp

        # Upsert order
        order = db.query(Order).filter(Order.baselinker_id == baselinker_id).first()
        if order is None:
            order = Order(
                baselinker_id=baselinker_id,
                status=OrderStatus.fetched,  # New orders from Baselinker start as fetched
            )
            db.add(order)
            orders_synced += 1

        # Update order fields - use order_source_id to get detailed account name
        order_source_id = order_data.get("order_source_id")
        if order_source_id and order_source_id in order_sources:
            order.source = order_sources[order_source_id]
        else:
            order.source = order_data.get("order_source")
        order.fullname = order_data.get("invoice_fullname")
        order.company = order_data.get("invoice_company")
        
        # Fetch transaction data to get ship_date_to
        try:
            transaction_data = client.get_order_transaction_data(baselinker_id)
            order.expected_shipment_date = parse_shipment_date_from_transaction(transaction_data)
        except Exception as e:
            logger.warning(f"Failed to get transaction data for order {baselinker_id}: {e}")

        db.flush()

        # Process products in the order - aggregate quantities for same SKU
        product_quantities: dict[str, int] = {}
        for product_data in order_data.get("products", []):
            sku = product_data.get("sku")
            if not sku:
                continue
            quantity = int(product_data.get("quantity", 1))
            product_quantities[sku] = product_quantities.get(sku, 0) + quantity

        for sku, quantity in product_quantities.items():
            # Check if product existed before
            existing = db.query(Product).filter(Product.sku == sku).first()
            product = upsert_product(db, sku)
            if existing is None:
                products_created += 1

            # Upsert order position
            position = (
                db.query(OrderPosition)
                .filter(
                    OrderPosition.order_id == order.id,
                    OrderPosition.product_id == product.id,
                )
                .first()
            )
            if position is None:
                position = OrderPosition(
                    order_id=order.id,
                    product_id=product.id,
                    quantity=quantity,
                )
                db.add(position)
            else:
                position.quantity = quantity

    # Update sync state
    if max_timestamp > sync_state.last_sync_timestamp:
        sync_state.last_sync_timestamp = max_timestamp

    db.commit()

    logger.info(f"Sync complete: {orders_synced} orders, {products_created} products created")
    return {"orders_synced": orders_synced, "products_created": products_created}
