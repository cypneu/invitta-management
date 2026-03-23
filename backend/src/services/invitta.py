import logging
from datetime import datetime
import re
from typing import Any
import unicodedata

import requests
from sqlalchemy.orm import Session

from ..config import settings
from ..order_sources import normalize_order_source
from .order_sync import SyncItem, SyncOrder, get_sync_state, sync_normalized_orders

logger = logging.getLogger(__name__)

INVITTA_BASE_URL = "https://www.invitta.pl"


class InvittaClient:
    def __init__(self, token: str, base_url: str = INVITTA_BASE_URL):
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
        self.session.headers.update(
            {
                "Authorization": f"Bearer {token}",
                "Accept": "application/json",
            }
        )

    def _get(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        response = self.session.get(f"{self.base_url}{path}", params=params, timeout=30)
        response.raise_for_status()
        payload = response.json()
        if payload.get("status") != "success":
            raise RuntimeError(payload.get("message", "Błąd API Invitta"))
        return payload.get("data") or {}

    def get_orders(self, date_from: str) -> list[dict[str, Any]]:
        orders: list[dict[str, Any]] = []
        page = 1

        while True:
            data = self._get(
                "/api/v1/orders",
                {
                    "page": page,
                    "limit": 100,
                    "date_from": date_from,
                    "include_details": 1,
                },
            )
            batch = data.get("orders", [])
            orders.extend(batch)
            pagination = data.get("pagination") or {}
            if not batch or page >= int(pagination.get("total_pages") or page):
                return orders
            page += 1

    def get_order(self, order_id: int) -> dict[str, Any]:
        return self._get(f"/api/v1/orders/{order_id}").get("order") or {}

    def get_order_items(self, order_id: int) -> list[dict[str, Any]]:
        return self._get(f"/api/v1/orders/{order_id}/items").get("items", [])


def sync_invitta_orders(db: Session) -> dict[str, int | str]:
    if not settings.invitta_api_token:
        return {"integration": "invitta", "orders_synced": 0, "products_created": 0}

    client = InvittaClient(settings.invitta_api_token)
    state = get_sync_state(db, "invitta")
    date_from = datetime.fromtimestamp(max(state.last_sync_timestamp - 86400, 0)).date().isoformat()

    def normalized_orders() -> list[SyncOrder]:
        items: list[SyncOrder] = []
        for order in client.get_orders(date_from):
            order_id = int(order["id"])
            details = order if order.get("payer") or order.get("delivery") else client.get_order(order_id)
            items.append(
                SyncOrder(
                    integration="invitta",
                    external_id=str(order_id),
                    created_timestamp=parse_timestamp(order.get("created_at")),
                    source=normalize_order_source(clean_text(order.get("source")), "invitta"),
                    fullname=extract_fullname(details),
                    company=extract_company(details),
                    expected_shipment_date=None,
                    items=[
                        SyncItem(
                            sku=sku,
                            quantity=int(float(item.get("quantity", 1) or 1)),
                        )
                        for item in client.get_order_items(order_id)
                        if (sku := resolve_item_sku(item))
                    ],
                )
            )
        return items

    return sync_normalized_orders(db, state, normalized_orders())


def extract_fullname(order: dict[str, Any]) -> str | None:
    for key in ("payer", "delivery"):
        person = order.get(key) or {}
        full_name = " ".join(
            part.strip()
            for part in [str(person.get("first_name") or ""), str(person.get("last_name") or "")]
            if part.strip()
        )
        if full_name:
            return full_name
    return None


def extract_company(order: dict[str, Any]) -> str | None:
    for key in ("payer", "delivery"):
        company = clean_text((order.get(key) or {}).get("company_name"))
        if company:
            return company
    return None


def parse_timestamp(value: Any) -> int:
    if not value:
        return 0
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        return int(datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp())
    raise TypeError(f"Unsupported timestamp value: {value!r}")


def clean_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def resolve_item_sku(item: dict[str, Any]) -> str:
    sku = clean_text(item.get("sku"))
    name = clean_text(item.get("name"))
    if sku and "kalkulator" in sku.lower() and name:
        return build_calculator_sku(name) or first_name_line(name) or sku
    if sku:
        return sku
    if name:
        return first_name_line(name) or ""
    return ""


def build_calculator_sku(name: str) -> str | None:
    lines = [line for line in (clean_text(part) for part in name.splitlines()) if line]
    if not lines:
        return None

    fields = parse_name_fields(lines[1:])
    fabric = parse_fabric(lines[0])
    edge_type = parse_edge_type(fields.get("sposob wykonczenia"))
    pattern = fields.get("kolor")
    shape = parse_shape(fields.get("ksztalt"))
    width = parse_measurement(fields.get("szerokosc"))
    length = parse_measurement(fields.get("dlugosc"))
    diameter = parse_measurement(fields.get("srednica")) or width or length
    size = format_size(shape, width, length, diameter)

    if not all([fabric, edge_type, pattern, size]):
        return None

    return "-".join([edge_type, fabric, pattern, size])


def parse_name_fields(lines: list[str]) -> dict[str, str]:
    fields: dict[str, str] = {}
    for line in lines:
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        normalized_key = normalize_text(key)
        cleaned_value = clean_text(value)
        if cleaned_value:
            fields[normalized_key] = cleaned_value
    return fields


def parse_fabric(first_line: str) -> str | None:
    if "-" not in first_line:
        return clean_text(first_line)
    return clean_text(first_line.rsplit("-", 1)[-1])


def parse_edge_type(value: str | None) -> str | None:
    if not value:
        return None

    normalized = normalize_text(value).replace(" ", "").replace("_", "-").upper()
    aliases = {
        "DRUKU3": "DRUK-U3",
        "DRUK-U3": "DRUK-U3",
        "LAMOWKA": "LA",
    }
    if normalized in aliases:
        return aliases[normalized]

    for token in ("OGK", "U3", "U4", "U5", "O1", "O3", "O5", "LA"):
        if token in normalized:
            return token

    return clean_text(value.upper())


def parse_shape(value: str | None) -> str | None:
    if not value:
        return None
    normalized = normalize_text(value)
    mapping = {
        "kwadrat": "rectangular",
        "prostokat": "rectangular",
        "kolo": "round",
        "owal": "oval",
    }
    return mapping.get(normalized)


def parse_measurement(value: str | None) -> int | None:
    if not value:
        return None
    match = re.search(r"(\d+)", value)
    return int(match.group(1)) if match else None


def format_size(shape: str | None, width: int | None, length: int | None, diameter: int | None) -> str | None:
    if shape == "round":
        return f"o{diameter}" if diameter else None
    if shape == "oval":
        first = width or diameter
        second = length or width
        return f"{first}v{second}" if first and second else None
    first = width or diameter
    second = length or width or diameter
    return f"{first}x{second}" if first and second else None


def first_name_line(name: str) -> str | None:
    return clean_text(name.splitlines()[0]) if name.splitlines() else None


def normalize_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    return " ".join(ascii_value.lower().split())
