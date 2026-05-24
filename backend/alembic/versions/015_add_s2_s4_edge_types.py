"""Add S2 and S4 edge types

Revision ID: 015
Revises: 014
Create Date: 2026-05-24

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE products MODIFY COLUMN edge_type ENUM('U3', 'U4', 'U5', 'O1', 'O3', 'O5', 'OGK', 'LA', 'S2', 'S4') NULL")


def downgrade() -> None:
    op.execute("UPDATE products SET edge_type = NULL WHERE edge_type IN ('S2', 'S4')")
    op.execute("ALTER TABLE products MODIFY COLUMN edge_type ENUM('U3', 'U4', 'U5', 'O1', 'O3', 'O5', 'OGK', 'LA') NULL")
