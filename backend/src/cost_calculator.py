"""Production cost calculator - sewing cost only."""

from enum import Enum


class TableclothFinish(Enum):
    U3 = "U3"
    U4 = "U4"
    O1 = "O1"
    O3 = "O3"
    O5 = "O5"
    OGK = "OGK"
    LA = "LA"


# Default sewing factors (can be overridden by DB config)
DEFAULT_CORNER_SEWING_FACTOR = {
    "U3": 0.084,
    "U4": 0.084,
    "O1": 0.1183,
    "O3": 0.6708,
    "O5": 0.6708,
    "OGK": 1.254,
    "LA": 0.1183,
}

DEFAULT_SEWING_FACTOR = {
    "U3": 0.1593,
    "U4": 0.1593,
    "O1": 0.7847,
    "O3": 1.489,
    "O5": 1.489,
    "OGK": 1.995,
    "LA": 2.8,
}


def get_tablecloth_finish_values() -> list[str]:
    """Return all valid tablecloth finish values."""
    return [finish.value for finish in TableclothFinish]


def calculate_production_cost(
    finish_value: str,
    width: int,
    height: int,
    corner_sewing_factors: dict[str, float] | None = None,
    sewing_factors: dict[str, float] | None = None,
) -> float:
    """Calculate production cost (sewing cost only).
    
    Args:
        finish_value: The tablecloth finish type (e.g., "U3", "O1")
        width: Width in cm (10-2000)
        height: Height in cm (10-2000)
        corner_sewing_factors: Optional custom corner sewing factors
        sewing_factors: Optional custom sewing factors
    
    Returns:
        Production cost (sewing cost) in PLN
    """
    # Use provided factors or defaults
    corner_factors = corner_sewing_factors or DEFAULT_CORNER_SEWING_FACTOR
    sew_factors = sewing_factors or DEFAULT_SEWING_FACTOR
    
    # Get factors for this finish type
    corner_factor = corner_factors.get(finish_value, 0.1)
    sewing_factor = sew_factors.get(finish_value, 0.5)
    
    # Calculate sewing cost:
    # 4 corners + perimeter length * sewing factor
    sewing_cost = (
        4 * corner_factor
        + 2 * (width + height) * 0.01 * sewing_factor
    )
    
    return round(sewing_cost, 2)
