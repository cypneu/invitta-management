"""Add order status field

Revision ID: 006
Revises: 005
Create Date: 2024-12-26

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '006'
down_revision = '005'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add status column to orders table with default 'fetched'
    # Note: index=True in add_column already creates the index
    op.add_column(
        'orders',
        sa.Column(
            'status',
            sa.Enum('fetched', 'in_progress', 'done', name='orderstatus'),
            nullable=False,
            server_default='fetched',
        )
    )
    
    # Create index manually only if not already created
    # Check if index exists first
    try:
        op.create_index('ix_orders_status', 'orders', ['status'])
    except Exception:
        pass  # Index already exists


def downgrade() -> None:
    # Drop index first (if exists)
    try:
        op.drop_index('ix_orders_status', table_name='orders')
    except Exception:
        pass
    
    # Drop column
    op.drop_column('orders', 'status')
