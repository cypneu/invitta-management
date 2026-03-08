"""Add provider-neutral order keys and per-provider sync state

Revision ID: 010
Revises: 009
"""

from alembic import op
import sqlalchemy as sa


revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("orders", sa.Column("integration", sa.String(length=50), nullable=True))
    op.add_column("orders", sa.Column("external_id", sa.String(length=100), nullable=True))
    op.create_index("ix_orders_integration", "orders", ["integration"])
    op.create_index("ix_orders_external_id", "orders", ["external_id"])
    op.execute(
        """
        UPDATE orders
        SET integration = 'baselinker',
            external_id = CAST(baselinker_id AS CHAR)
        WHERE baselinker_id IS NOT NULL
        """
    )
    op.create_unique_constraint(
        "uq_orders_integration_external_id",
        "orders",
        ["integration", "external_id"],
    )

    op.add_column("sync_state", sa.Column("integration", sa.String(length=50), nullable=True))
    op.execute("UPDATE sync_state SET integration = 'baselinker' WHERE integration IS NULL")
    op.alter_column("sync_state", "integration", existing_type=sa.String(length=50), nullable=False)
    op.create_unique_constraint("uq_sync_state_integration", "sync_state", ["integration"])


def downgrade():
    op.drop_constraint("uq_sync_state_integration", "sync_state", type_="unique")
    op.drop_column("sync_state", "integration")

    op.drop_constraint("uq_orders_integration_external_id", "orders", type_="unique")
    op.drop_index("ix_orders_external_id", table_name="orders")
    op.drop_index("ix_orders_integration", table_name="orders")
    op.drop_column("orders", "external_id")
    op.drop_column("orders", "integration")
