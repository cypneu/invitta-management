"""Start new orders in progress and migrate fetched orders

Revision ID: 013
Revises: 012
Create Date: 2026-03-23

"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE orders SET status = 'in_progress' WHERE status = 'fetched'")
    op.execute(
        "ALTER TABLE orders MODIFY COLUMN status "
        "ENUM('fetched', 'in_progress', 'done', 'cancelled') NOT NULL DEFAULT 'in_progress'"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE orders MODIFY COLUMN status "
        "ENUM('fetched', 'in_progress', 'done', 'cancelled') NOT NULL DEFAULT 'fetched'"
    )
