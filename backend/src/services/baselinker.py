import json
import logging
from datetime import datetime
from typing import Any

import requests
from sqlalchemy.orm import Session

from ..config import settings
from .order_sync import SyncItem, SyncOrder, get_sync_state, sync_normalized_orders

logger = logging.getLogger(__name__)

BASELINKER_ENDPOINT = "https://api.baselinker.com/connector.php"


class BaselinkerClient:
    def __init__(self, token: str):
        self.token = token

    def _call(self, method: str, parameters: dict[str, Any] | None = None) -> dict[str, Any]:
        response = requests.post(
            BASELINKER_ENDPOINT,
            data={
                "token": self.token,
                "method": method,
                "parameters": json.dumps(parameters or {}),
            },
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()
        if data.get("status") != "SUCCESS":
            raise RuntimeError(data.get("error_message", "Baselinker API error"))
        return data

    def get_order_extra_fields(self) -> list[dict[str, Any]]:
        return self._call("getOrderExtraFields").get("extra_fields", [])

    def get_orders(self, date_from: int) -> list[dict[str, Any]]:
        orders: list[dict[str, Any]] = []
        cursor = date_from

        while True:
            batch = self._call(
                "getOrders",
                {
                    "date_from": cursor,
                    "get_unconfirmed_orders": False,
                    "include_custom_extra_fields": True,
                },
            ).get("orders", [])

            if not batch:
                return orders

            orders.extend(batch)

            if len(batch) < 100:
                return orders

            cursor = max(order.get("date_add", 0) for order in batch) + 1

    def get_order_transaction_data(self, order_id: int) -> dict[str, Any]:
        return self._call("getOrderTransactionData", {"order_id": order_id})

    def get_order_sources(self) -> dict[int, str]:
        result: dict[int, str] = {}
        for source_type, accounts in self._call("getOrderSources").get("sources", {}).items():
            if not isinstance(accounts, dict):
                continue
            for source_id, account_name in accounts.items():
                try:
                    result[int(source_id)] = f"{source_type} - {account_name}"
                except (TypeError, ValueError):
                    continue
        return result


def sync_baselinker_orders(db: Session) -> dict[str, int | str]:
    if not settings.baselinker_api_token:
        return {"integration": "baselinker", "orders_synced": 0, "products_created": 0}

    client = BaselinkerClient(settings.baselinker_api_token)
    state = get_sync_state(db, "baselinker")

    if state.shipment_date_field_id is None:
        state.shipment_date_field_id = find_shipment_date_field_id(client)

    try:
        order_sources = client.get_order_sources()
    except Exception as exc:
        logger.warning("Failed to fetch Baselinker order sources: %s", exc)
        order_sources = {}

    def normalized_orders() -> list[SyncOrder]:
        items: list[SyncOrder] = []
        for order in client.get_orders(state.last_sync_timestamp):
            order_id = int(order["order_id"])
            items.append(
                SyncOrder(
                    integration="baselinker",
                    external_id=str(order_id),
                    created_timestamp=int(order.get("date_add", 0)),
                    source=order_sources.get(order.get("order_source_id")) or order.get("order_source"),
                    fullname=clean_text(order.get("invoice_fullname")),
                    company=clean_text(order.get("invoice_company")),
                    expected_shipment_date=load_expected_shipment_date(client, order_id),
                    items=[
                        SyncItem(
                            sku=product.get("sku", ""),
                            quantity=int(product.get("quantity", 1) or 1),
                        )
                        for product in order.get("products", [])
                        if product.get("sku")
                    ],
                )
            )
        return items

    return sync_normalized_orders(db, state, normalized_orders())


def find_shipment_date_field_id(client: BaselinkerClient) -> int | None:
    try:
        for field in client.get_order_extra_fields():
            if "data_wysylki" in field.get("name", "").lower():
                return field.get("extra_field_id")
    except Exception as exc:
        logger.warning("Failed to fetch Baselinker extra fields: %s", exc)
    return None


def load_expected_shipment_date(client: BaselinkerClient, order_id: int):
    try:
        return parse_shipment_date(client.get_order_transaction_data(order_id).get("ship_date_to"))
    except Exception as exc:
        logger.warning("Failed to fetch Baselinker transaction data for %s: %s", order_id, exc)
        return None


def parse_shipment_date(value: Any):
    if value in (None, ""):
        return None
    try:
        if isinstance(value, int):
            return datetime.fromtimestamp(value).date()
        if isinstance(value, str) and value.isdigit():
            return datetime.fromtimestamp(int(value)).date()
        if isinstance(value, str):
            for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d.%m.%Y"):
                try:
                    return datetime.strptime(value, fmt).date()
                except ValueError:
                    continue
    except Exception as exc:
        logger.warning("Failed to parse Baselinker shipment date %r: %s", value, exc)
    return None


def clean_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None
