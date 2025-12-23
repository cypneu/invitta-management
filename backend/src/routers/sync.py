"""Sync router - Baselinker synchronization endpoints."""

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User, SyncState
from ..schemas import SyncStatusResponse, SyncTriggerResponse
from ..services.baselinker import sync_orders

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sync", tags=["sync"])


def require_admin(user_id: int, db: Session) -> User:
    """Verify user is an admin."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


@router.post("/trigger", response_model=SyncTriggerResponse)
def trigger_sync(
    user_id: int = Query(..., description="ID of the admin triggering the sync"),
    db: Session = Depends(get_db),
):
    """Manually trigger a Baselinker sync (admin only)."""
    require_admin(user_id, db)

    try:
        result = sync_orders(db)
        return SyncTriggerResponse(
            success=True,
            orders_synced=result["orders_synced"],
            products_created=result["products_created"],
            message="Sync completed successfully",
        )
    except Exception as e:
        logger.exception("Sync failed")
        return SyncTriggerResponse(
            success=False,
            orders_synced=0,
            products_created=0,
            message=f"Sync failed: {str(e)}",
        )


@router.get("/status", response_model=SyncStatusResponse)
def get_sync_status(db: Session = Depends(get_db)):
    """Get the current sync status."""
    sync_state = db.query(SyncState).first()

    if sync_state is None:
        return SyncStatusResponse(
            last_sync_timestamp=0,
            last_sync_at=None,
            shipment_date_field_id=None,
        )

    # Convert unix timestamp to datetime
    last_sync_at = None
    if sync_state.last_sync_timestamp > 0:
        last_sync_at = datetime.fromtimestamp(sync_state.last_sync_timestamp)

    return SyncStatusResponse(
        last_sync_timestamp=sync_state.last_sync_timestamp,
        last_sync_at=last_sync_at,
        shipment_date_field_id=sync_state.shipment_date_field_id,
    )
