"""Production cost calculator for tablecloth production."""

from enum import Enum


class TableclothFinish(Enum):
    U3 = "U3"
    U4 = "U4"
    O1 = "O1"
    O3 = "O3"
    O5 = "O5"
    OGK = "OGK"
    LA = "LA"


# Constants
MARGIN = 2.15
FABRIC_WIDTH = 160
FABRIC_PRICE = 12

LACE_WIDTH = 9
LACE_PRICE = 3.58

LAG_FACTOR = 0.35
CUTTING_FACTOR = 1.86
IRONING_FACTOR = 0.65
PREPACKING_FACTOR = 0.3539
DEPRECIATION_FACTOR = 0.062
PACKING_FACTOR = 0.2045
PACKAGING_MATERIALS_PRICE = 3.2

CORNER_SEWING_FACTOR = {
    TableclothFinish.U3: 0.084,
    TableclothFinish.U4: 0.084,
    TableclothFinish.O1: 0.1183,
    TableclothFinish.O3: 0.6708,
    TableclothFinish.O5: 0.6708,
    TableclothFinish.OGK: 1.254,
    TableclothFinish.LA: 0.1183,
}

SEWING_FACTOR = {
    TableclothFinish.U3: 0.1593,
    TableclothFinish.U4: 0.1593,
    TableclothFinish.O1: 0.7847,
    TableclothFinish.O3: 1.489,
    TableclothFinish.O5: 1.489,
    TableclothFinish.OGK: 1.995,
    TableclothFinish.LA: 2.8,
}

MATERIAL_WASTE = {
    TableclothFinish.U3: lambda _: 2,
    TableclothFinish.U4: lambda _: 2,
    TableclothFinish.O1: lambda _: 5,
    TableclothFinish.O3: lambda _: 9,
    TableclothFinish.O5: lambda _: 13,
    TableclothFinish.OGK: lambda lace_width: -(2 * lace_width - 2),
    TableclothFinish.LA: lambda _: 1,
}


def get_tablecloth_finish_values() -> list[str]:
    """Return all valid tablecloth finish values."""
    return [finish.value for finish in TableclothFinish]


def _get_running_and_other_sides(ext_width: int, ext_length: int) -> tuple[int, int]:
    running_side, other_side = min(ext_width, ext_length), max(ext_width, ext_length)
    if other_side > FABRIC_WIDTH:
        return other_side, running_side

    first_material = running_side * 0.01 * FABRIC_PRICE / (FABRIC_WIDTH // other_side)
    second_material = other_side * 0.01 * FABRIC_PRICE / (FABRIC_WIDTH // running_side)
    if second_material < first_material:
        running_side, other_side = other_side, running_side

    return running_side, other_side


def calculate_price_brutto(finish_value: str, width: int, height: int) -> float:
    """Calculate brutto price for a tablecloth.
    
    Args:
        finish_value: The tablecloth finish type (e.g., "U3", "O1")
        width: Width in cm (10-2000)
        height: Height in cm (10-2000)
    
    Returns:
        Price brutto in PLN
    """
    tablecloth_finish = TableclothFinish(finish_value)
    
    ext_width = width + MATERIAL_WASTE[tablecloth_finish](LACE_WIDTH)
    ext_length = height + MATERIAL_WASTE[tablecloth_finish](LACE_WIDTH)

    running_side, other_side = _get_running_and_other_sides(ext_width, ext_length)
    number_of_tablecloths = FABRIC_WIDTH // other_side

    material = running_side * 0.01 * FABRIC_PRICE / number_of_tablecloths
    lag = ext_width * 0.01 * ext_length * 0.01 * LAG_FACTOR
    cutting = (ext_width + ext_length) * 0.01 * CUTTING_FACTOR
    sewing = (
        4 * CORNER_SEWING_FACTOR[tablecloth_finish]
        + 2 * (width + height) * 0.01 * SEWING_FACTOR[tablecloth_finish]
    )
    packing = PREPACKING_FACTOR + width * height * 0.01 * 0.01 * PACKING_FACTOR

    production_cost = (
        material + lag + cutting + sewing + packing + PACKAGING_MATERIALS_PRICE
    )

    if tablecloth_finish == TableclothFinish.OGK:
        production_cost += 2 * (width * 0.01 + height * 0.01) * LACE_PRICE

    if tablecloth_finish not in (TableclothFinish.U3, TableclothFinish.U4):
        ironing = width * height * 0.01 * 0.01 * IRONING_FACTOR
        production_cost += ironing

    if tablecloth_finish in (TableclothFinish.U3, TableclothFinish.U4):
        depreciation = 2 * (width + height) * 0.01 * DEPRECIATION_FACTOR
        production_cost += depreciation

    return round(MARGIN * production_cost * 1.23, 2)


def calculate_price_with_delivery(finish_value: str, width: int, height: int) -> float:
    """Calculate price brutto with delivery fees.
    
    Args:
        finish_value: The tablecloth finish type
        width: Width in cm
        height: Height in cm
    
    Returns:
        Price brutto with delivery in PLN
    """
    price = calculate_price_brutto(finish_value, width, height)
    
    if price >= 150:
        price += 11.5
    elif price >= 100:
        price += 9
    elif price >= 65:
        price += 5.8
    elif price >= 45:
        price += 4
    elif price >= 30:
        price += 2

    return round(price, 2)
