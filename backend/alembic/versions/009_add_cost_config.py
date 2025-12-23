"""Add cost_config table and cost column to actions

Revision ID: 009
Revises: 008
"""

from alembic import op
import sqlalchemy as sa


revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


# Default values from user's script
DEFAULT_CORNER_SEWING = {
    "U3": 0.084, "U4": 0.084, "O1": 0.1183, "O3": 0.6708,
    "O5": 0.6708, "OGK": 1.254, "LA": 0.1183
}
DEFAULT_SEWING = {
    "U3": 0.1593, "U4": 0.1593, "O1": 0.7847, "O3": 1.489,
    "O5": 1.489, "OGK": 1.995, "LA": 2.8
}
DEFAULT_MATERIAL_WASTE = {
    "U3": 2, "U4": 2, "O1": 5, "O3": 9, "O5": 13, "OGK": -16, "LA": 1
}


def upgrade():
    # Add cost column to order_position_actions
    op.add_column(
        "order_position_actions",
        sa.Column("cost", sa.Float(), nullable=True)
    )
    
    # Create cost_config table
    op.create_table(
        "cost_config",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("lag_factor", sa.Float(), nullable=False, server_default="0.35"),
        sa.Column("cutting_factor", sa.Float(), nullable=False, server_default="1.86"),
        sa.Column("ironing_factor", sa.Float(), nullable=False, server_default="0.65"),
        sa.Column("prepacking_factor", sa.Float(), nullable=False, server_default="0.3539"),
        sa.Column("packing_factor", sa.Float(), nullable=False, server_default="0.2045"),
        sa.Column("depreciation_factor", sa.Float(), nullable=False, server_default="0.062"),
        sa.Column("packaging_materials_price", sa.Float(), nullable=False, server_default="3.2"),
        sa.Column("corner_sewing_factors", sa.JSON(), nullable=False),
        sa.Column("sewing_factors", sa.JSON(), nullable=False),
        sa.Column("material_waste", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    
    # Insert default config row
    import json
    op.execute(
        f"""INSERT INTO cost_config (
            lag_factor, cutting_factor, ironing_factor, prepacking_factor,
            packing_factor, depreciation_factor, packaging_materials_price,
            corner_sewing_factors, sewing_factors, material_waste
        ) VALUES (
            0.35, 1.86, 0.65, 0.3539, 0.2045, 0.062, 3.2,
            '{json.dumps(DEFAULT_CORNER_SEWING)}',
            '{json.dumps(DEFAULT_SEWING)}',
            '{json.dumps(DEFAULT_MATERIAL_WASTE)}'
        )"""
    )


def downgrade():
    op.drop_table("cost_config")
    op.drop_column("order_position_actions", "cost")
