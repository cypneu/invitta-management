"""Add sync_warning column to orders

Revision ID: 017
Revises: 016
Create Date: 2026-05-24

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "017"
down_revision = "016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('orders', sa.Column('sync_warning', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('orders', 'sync_warning')
