"""Update schema for tablecloth production

Revision ID: 002
Revises: 001
Create Date: 2025-12-06

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '002'
down_revision: Union[str, None] = '001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add new columns
    op.add_column('production_entries', sa.Column('width_cm', sa.Integer(), nullable=True))
    op.add_column('production_entries', sa.Column('height_cm', sa.Integer(), nullable=True))
    op.add_column('production_entries', sa.Column('production_cost', sa.Float(), nullable=True))
    
    # Set default values for existing rows (if any)
    op.execute("UPDATE production_entries SET width_cm = 100, height_cm = 100, production_cost = 0 WHERE width_cm IS NULL")
    
    # Make columns non-nullable
    op.alter_column('production_entries', 'width_cm', nullable=False)
    op.alter_column('production_entries', 'height_cm', nullable=False)
    op.alter_column('production_entries', 'production_cost', nullable=False)
    
    # Drop old product_size column if it exists
    try:
        op.drop_column('production_entries', 'product_size')
    except:
        pass  # Column might not exist


def downgrade() -> None:
    op.add_column('production_entries', sa.Column('product_size', sa.VARCHAR(length=20), nullable=True))
    op.drop_column('production_entries', 'production_cost')
    op.drop_column('production_entries', 'height_cm')
    op.drop_column('production_entries', 'width_cm')
