"""
Production cost calculator.

Calculates production costs based on product dimensions and type.
"""

from enum import Enum


class TableclothFinish(str, Enum):
    """Types of tablecloth edge finishes."""
    ZIG_ZAG = "zig_zag"
    FALBANA = "falbana"
    LAMOWKA = "lamowka"
    LAMOWKA_FALBANA = "lamowka_falbana"
    OWERLOK = "owerlok"


# Default cost factors
DEFAULT_CORNER_SEWING_FACTOR = {
    TableclothFinish.ZIG_ZAG: 0.5,
    TableclothFinish.FALBANA: 1.0,
    TableclothFinish.LAMOWKA: 0.8,
    TableclothFinish.LAMOWKA_FALBANA: 1.2,
    TableclothFinish.OWERLOK: 0.6,
}

DEFAULT_SEWING_FACTOR = {
    TableclothFinish.ZIG_ZAG: 0.02,
    TableclothFinish.FALBANA: 0.04,
    TableclothFinish.LAMOWKA: 0.03,
    TableclothFinish.LAMOWKA_FALBANA: 0.05,
    TableclothFinish.OWERLOK: 0.025,
}


def get_tablecloth_finish_values() -> list[str]:
    """Return list of valid tablecloth finish types."""
    return [f.value for f in TableclothFinish]


def calculate_production_cost(
    product_type: str,
    width_cm: int,
    height_cm: int,
    corner_sewing_factors: dict[str, float] | None = None,
    sewing_factors: dict[str, float] | None = None,
) -> float:
    """
    Calculate the production cost for a tablecloth.
    
    Cost = corner_sewing_factor + (perimeter * sewing_factor)
    
    Args:
        product_type: Type of tablecloth finish
        width_cm: Width in centimeters
        height_cm: Height in centimeters
        corner_sewing_factors: Custom corner factors (optional)
        sewing_factors: Custom sewing factors per cm (optional)
    
    Returns:
        Production cost as a float
    """
    # Use provided factors or defaults
    if corner_sewing_factors is None:
        corner_sewing_factors = {k.value: v for k, v in DEFAULT_CORNER_SEWING_FACTOR.items()}
    if sewing_factors is None:
        sewing_factors = {k.value: v for k, v in DEFAULT_SEWING_FACTOR.items()}
    
    # Get factors for this product type
    corner_factor = corner_sewing_factors.get(product_type, 0.5)
    sewing_factor = sewing_factors.get(product_type, 0.02)
    
    # Calculate perimeter (4 corners for rectangular)
    perimeter = 2 * (width_cm + height_cm)
    
    # Cost calculation
    cost = corner_factor + (perimeter * sewing_factor)
    
    return round(cost, 2)


def calculate_action_cost(action_type: str, quantity: int, product_width: int, product_height: int) -> float:
    """
    Calculate the cost of a production action.
    
    Different action types have different cost multipliers.
    """
    # Base cost per unit based on perimeter
    perimeter = 2 * (product_width + product_height)
    base_cost = perimeter * 0.01  # Base rate per cm
    
    # Action type multipliers
    multipliers = {
        "cutting": 0.5,
        "sewing": 1.5,
        "ironing": 0.3,
        "packing": 0.2,
    }
    
    multiplier = multipliers.get(action_type, 1.0)
    
    return round(base_cost * multiplier * quantity, 2)
