"""Cost calculation service for production actions."""

from ..models import ActionType, CostConfig, Product, EdgeType


def get_material_waste(edge_type: str | None, config: CostConfig) -> int:
    """Get material waste in cm for given edge type."""
    if not edge_type:
        edge_type = "O5"
    return config.material_waste.get(edge_type, 13)


def calculate_action_cost(
    action_type: ActionType,
    product: Product,
    quantity: int,
    config: CostConfig,
) -> float:
    """
    Calculate cost of a single action based on product dimensions and edge type.

    Cost formulas based on provided script:
    - cutting: lag (area-based) + cutting (perimeter-based)
    - sewing: corner_sewing (4 corners) + edge sewing (perimeter)
    - ironing: area-based (U3/U4/U5 have no ironing cost)
    - packing: prepacking (fixed) + packing (area-based)
    """
    # Get dimensions (with material waste adjustment)
    width = product.width or 100
    height = product.height or 100
    edge_type = product.edge_type.value if product.edge_type else "O5"

    # Apply material waste to get extended dimensions
    waste = get_material_waste(edge_type, config)
    ext_width = width + waste
    ext_height = height + waste

    if action_type == ActionType.cutting:
        # lag + cutting combined
        lag = ext_width * 0.01 * ext_height * 0.01 * config.lag_factor
        cutting = (ext_width + ext_height) * 0.01 * config.cutting_factor
        return (lag + cutting) * quantity

    elif action_type == ActionType.sewing:
        corner_factor = config.corner_sewing_factors.get(edge_type, 0.6708)
        sewing_factor = config.sewing_factors.get(edge_type, 1.489)

        corner = 4 * corner_factor
        edge = 2 * (width + height) * 0.01 * sewing_factor
        return (corner + edge) * quantity

    elif action_type == ActionType.ironing:
        # U3, U4, U5 don't have ironing cost
        if edge_type in ("U3", "U4", "U5"):
            return 0.0
        return width * height * 0.0001 * config.ironing_factor * quantity

    elif action_type == ActionType.packing:
        prepacking = config.prepacking_factor
        packing = width * height * 0.0001 * config.packing_factor
        return (prepacking + packing) * quantity

    return 0.0


def get_or_create_config(db) -> CostConfig:
    """Get existing config or create with defaults."""
    config = db.query(CostConfig).first()
    if not config:
        config = CostConfig(
            lag_factor=0.35,
            cutting_factor=1.86,
            ironing_factor=0.65,
            prepacking_factor=0.3539,
            packing_factor=0.2045,
            depreciation_factor=0.062,  # Kept for backward compatibility but not used
            packaging_materials_price=3.2,  # Kept for backward compatibility but not used
            corner_sewing_factors={
                "U3": 0.084,
                "U4": 0.084,
                "U5": 0.084,
                "O1": 0.1183,
                "O3": 0.6708,
                "O5": 0.6708,
                "OGK": 1.254,
                "LA": 0.1183,
            },
            sewing_factors={
                "U3": 0.1593,
                "U4": 0.1593,
                "U5": 0.1593,
                "O1": 0.7847,
                "O3": 1.489,
                "O5": 1.489,
                "OGK": 1.995,
                "LA": 2.8,
            },
            material_waste={
                "U3": 2,
                "U4": 2,
                "U5": 2,
                "O1": 5,
                "O3": 9,
                "O5": 13,
                "OGK": -16,
                "LA": 1,
            },
        )
        db.add(config)
        db.commit()
        db.refresh(config)
    return config
