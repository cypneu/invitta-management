import logging
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ..config import settings
from ..models import SyncState
from .baselinker import sync_baselinker_orders
from .invitta import sync_invitta_orders

logger = logging.getLogger(__name__)

SYNC_PROVIDERS = (
    {
        "integration": "baselinker",
        "label": "Baselinker",
        "configured": lambda: bool(settings.baselinker_api_token),
        "sync": sync_baselinker_orders,
    },
    {
        "integration": "invitta",
        "label": "Invitta",
        "configured": lambda: bool(settings.invitta_api_token),
        "sync": sync_invitta_orders,
    },
)


def has_sync_providers() -> bool:
    return any(provider["configured"]() for provider in SYNC_PROVIDERS)


def enabled_sync_provider_labels() -> list[str]:
    return [provider["label"] for provider in SYNC_PROVIDERS if provider["configured"]()]


def sync_all_orders(db: Session) -> dict[str, Any]:
    results = []
    orders_synced = 0
    products_created = 0
    success = True

    for provider in SYNC_PROVIDERS:
        if not provider["configured"]():
            continue

        try:
            result = provider["sync"](db)
            result.update({"label": provider["label"], "success": True, "message": "OK"})
            orders_synced += int(result["orders_synced"])
            products_created += int(result["products_created"])
        except Exception as exc:
            db.rollback()
            success = False
            logger.exception("Sync failed for %s", provider["integration"])
            result = {
                "integration": provider["integration"],
                "label": provider["label"],
                "success": False,
                "orders_synced": 0,
                "products_created": 0,
                "message": str(exc),
            }

        results.append(result)

    if not results:
        return {
            "success": False,
            "orders_synced": 0,
            "products_created": 0,
            "message": "No sync providers configured",
            "sources": [],
        }

    if success:
        message = "Sync completed successfully"
    else:
        failed = ", ".join(result["label"] for result in results if not result["success"])
        message = f"Sync finished with errors: {failed}"

    return {
        "success": success,
        "orders_synced": orders_synced,
        "products_created": products_created,
        "message": message,
        "sources": results,
    }


def get_sync_status(db: Session) -> dict[str, Any]:
    state_by_integration = {
        state.integration: state
        for state in db.query(SyncState).all()
        if state.integration
    }

    sources = []
    latest_timestamp = 0

    for provider in SYNC_PROVIDERS:
        state = state_by_integration.get(provider["integration"])
        last_sync_timestamp = state.last_sync_timestamp if state else 0
        latest_timestamp = max(latest_timestamp, last_sync_timestamp)
        sources.append(
            {
                "integration": provider["integration"],
                "label": provider["label"],
                "configured": provider["configured"](),
                "last_sync_timestamp": last_sync_timestamp,
                "last_sync_at": datetime.fromtimestamp(last_sync_timestamp) if last_sync_timestamp else None,
                "shipment_date_field_id": state.shipment_date_field_id if state else None,
            }
        )

    return {
        "last_sync_timestamp": latest_timestamp,
        "last_sync_at": datetime.fromtimestamp(latest_timestamp) if latest_timestamp else None,
        "sources": sources,
    }
