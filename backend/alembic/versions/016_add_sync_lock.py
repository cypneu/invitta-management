"""Add sync lock columns to sync_state

Revision ID: 016
Revises: 015
Create Date: 2026-05-24

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "016"
down_revision = "015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('sync_state', sa.Column('sync_in_progress', sa.Boolean(), nullable=False, server_default='0'))
    op.add_column('sync_state', sa.Column('sync_started_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('sync_state', 'sync_started_at')
    op.drop_column('sync_state', 'sync_in_progress')
