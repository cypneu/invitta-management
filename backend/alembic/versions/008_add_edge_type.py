"""Add edge_type column to products table

Revision ID: 008
Revises: 007
Create Date: 2024-12-27

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '008'
down_revision = '007'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create ENUM type and add column
    op.execute("ALTER TABLE products ADD COLUMN edge_type ENUM('U3', 'U4', 'U5', 'O1', 'O3', 'O5', 'OGK', 'LA') NULL")
    op.create_index('ix_products_edge_type', 'products', ['edge_type'])


def downgrade() -> None:
    op.drop_index('ix_products_edge_type', table_name='products')
    op.drop_column('products', 'edge_type')
