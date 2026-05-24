import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session

from ..config import settings
from ..database import SessionLocal
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

LOCK_TIMEOUT_SECONDS = 600  # 10 minutes — consider stale after this


def has_sync_providers() -> bool:
    return any(provider["configured"]() for provider in SYNC_PROVIDERS)


def enabled_sync_provider_labels() -> list[str]:
    return [provider["label"] for provider in SYNC_PROVIDERS if provider["configured"]()]


def _acquire_sync_lock(db: Session) -> bool:
    """Try to acquire the sync lock. Returns True if acquired, False if already locked."""
    lock_row = db.query(SyncState).filter(SyncState.integration == "__lock__").first()
    if lock_row is None:
        lock_row = SyncState(integration="__lock__", last_sync_timestamp=0)
        db.add(lock_row)
        db.flush()

    if lock_row.sync_in_progress:
        # Check if lock is stale (sync has been running for too long)
        if lock_row.sync_started_at and lock_row.sync_started_at > datetime.now() - timedelta(seconds=LOCK_TIMEOUT_SECONDS):
            return False  # Lock is fresh, another sync is running
        logger.warning("Stale sync lock detected (started at %s), forcing release", lock_row.sync_started_at)

    lock_row.sync_in_progress = True
    lock_row.sync_started_at = datetime.now()
    db.commit()
    return True


def _release_sync_lock(db: Session) -> None:
    """Release the sync lock."""
    lock_row = db.query(SyncState).filter(SyncState.integration == "__lock__").first()
    if lock_row:
        lock_row.sync_in_progress = False
        lock_row.sync_started_at = None
        db.commit()


def sync_all_orders(db: Session) -> dict[str, Any]:
    # Try to acquire sync lock — prevents concurrent syncs from cron/manual overlap
    if not _acquire_sync_lock(db):
        return {
            "success": False,
            "orders_synced": 0,
            "products_created": 0,
            "message": "Synchronizacja jest już w toku. Poczekaj na jej zakończenie.",
            "sources": [],
        }

    sync_started_at = int(time.time())
    results = []
    orders_synced = 0
    products_created = 0
    success = True

    try:
        for provider in SYNC_PROVIDERS:
            if not provider["configured"]():
                continue

            # Each provider gets its own DB session for isolation.
            # If one provider fails, the other's data is already committed safely.
            provider_db = SessionLocal()
            try:
                result = provider["sync"](provider_db, sync_started_at)
                result.update({"label": provider["label"], "success": True, "message": "OK"})
                orders_synced += int(result["orders_synced"])
                products_created += int(result["products_created"])
            except Exception:
                provider_db.rollback()
                success = False
                logger.exception("Sync failed for %s", provider["integration"])
                result = {
                    "integration": provider["integration"],
                    "label": provider["label"],
                    "success": False,
                    "orders_synced": 0,
                    "products_created": 0,
                    "message": f"Nie udało się zsynchronizować źródła {provider['label']}",
                }
            finally:
                provider_db.close()

            results.append(result)
    finally:
        # Always release the lock, even if something fails
        _release_sync_lock(db)

    if not results:
        return {
            "success": False,
            "orders_synced": 0,
            "products_created": 0,
            "message": "Brak skonfigurowanych źródeł synchronizacji",
            "sources": [],
        }

    if success:
        message = "Synchronizacja zakończona pomyślnie"
    else:
        failed = ", ".join(result["label"] for result in results if not result["success"])
        message = f"Synchronizacja zakończyła się błędami: {failed}"

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
        if state.integration and state.integration != "__lock__"
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
                "last_sync_at": datetime.fromtimestamp(last_sync_timestamp, tz=timezone.utc) if last_sync_timestamp else None,
                "shipment_date_field_id": state.shipment_date_field_id if state else None,
            }
        )

    return {
        "last_sync_timestamp": latest_timestamp,
        "last_sync_at": datetime.fromtimestamp(latest_timestamp, tz=timezone.utc) if latest_timestamp else None,
        "sources": sources,
    }
