"""Add cancelled status to order status enum

Revision ID: 007
Revises: 006
Create Date: 2024-12-26

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = '007'
down_revision = '006'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # MySQL: ALTER ENUM to add new value
    op.execute("ALTER TABLE orders MODIFY COLUMN status ENUM('fetched', 'in_progress', 'done', 'cancelled') NOT NULL DEFAULT 'fetched'")


def downgrade() -> None:
    # First update any 'cancelled' orders to 'fetched' before removing the enum value
    op.execute("UPDATE orders SET status = 'fetched' WHERE status = 'cancelled'")
    op.execute("ALTER TABLE orders MODIFY COLUMN status ENUM('fetched', 'in_progress', 'done') NOT NULL DEFAULT 'fetched'")
