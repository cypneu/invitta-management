from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import CostConfig
from ..schemas import CostConfigUpdate, CostConfigResponse
from ..cost_calculator import DEFAULT_CORNER_SEWING_FACTOR, DEFAULT_SEWING_FACTOR

router = APIRouter(prefix="/api/config", tags=["config"])


def get_cost_config(db: Session) -> CostConfig:
    """Get or create the cost config."""
    config = db.query(CostConfig).first()
    if not config:
        # Create default config
        config = CostConfig(
            corner_sewing_factors=DEFAULT_CORNER_SEWING_FACTOR,
            sewing_factors=DEFAULT_SEWING_FACTOR
        )
        db.add(config)
        db.commit()
        db.refresh(config)
    return config


@router.get("/cost", response_model=CostConfigResponse)
def get_config(db: Session = Depends(get_db)):
    """Get current cost configuration."""
    return get_cost_config(db)


@router.put("/cost", response_model=CostConfigResponse)
def update_config(
    config_update: CostConfigUpdate,
    db: Session = Depends(get_db)
):
    """Update cost configuration (admin only)."""
    config = get_cost_config(db)
    config.corner_sewing_factors = config_update.corner_sewing_factors
    config.sewing_factors = config_update.sewing_factors
    db.commit()
    db.refresh(config)
    return config
