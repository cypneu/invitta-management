"""Add cost_config table and remove production_cost column

Revision ID: 003
Revises: 002
Create Date: 2025-12-06

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '003'
down_revision: Union[str, None] = '002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create cost_config table
    op.create_table(
        'cost_config',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('corner_sewing_factors', sa.JSON(), nullable=False),
        sa.Column('sewing_factors', sa.JSON(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_cost_config_id', 'cost_config', ['id'], unique=False)
    
    # Drop production_cost column from production_entries
    op.drop_column('production_entries', 'production_cost')


def downgrade() -> None:
    # Add back production_cost column
    op.add_column('production_entries', sa.Column('production_cost', sa.Float(), nullable=True))
    op.execute("UPDATE production_entries SET production_cost = 0 WHERE production_cost IS NULL")
    op.alter_column('production_entries', 'production_cost', nullable=False)
    
    # Drop cost_config table
    op.drop_index('ix_cost_config_id', table_name='cost_config')
    op.drop_table('cost_config')
