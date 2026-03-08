from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..schemas import SyncStatusResponse, SyncTriggerResponse
from ..services.sync import get_sync_status as get_sync_status_payload, sync_all_orders

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
    require_admin(user_id, db)
    return SyncTriggerResponse(**sync_all_orders(db))


@router.get("/status", response_model=SyncStatusResponse)
def get_sync_status(db: Session = Depends(get_db)):
    return SyncStatusResponse(**get_sync_status_payload(db))
