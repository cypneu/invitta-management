"""Initial migration

Revision ID: 001
Revises: 
Create Date: 2025-12-06

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create users table
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('user_code', sa.String(length=20), nullable=False),
        sa.Column('role', sa.String(length=20), nullable=False),
        sa.CheckConstraint("role IN ('admin', 'worker')", name='valid_role'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_users_id', 'users', ['id'], unique=False)
    op.create_index('ix_users_user_code', 'users', ['user_code'], unique=True)
    
    # Create production_entries table
    op.create_table(
        'production_entries',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('worker_id', sa.Integer(), nullable=False),
        sa.Column('product_type', sa.String(length=50), nullable=False),
        sa.Column('product_size', sa.String(length=20), nullable=False),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['worker_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_production_entries_id', 'production_entries', ['id'], unique=False)
    
    # Seed data
    op.execute("""
        INSERT INTO users (name, user_code, role) VALUES
        ('Admin CEO', 'ADMIN001', 'admin'),
        ('Worker One', 'WRK001', 'worker'),
        ('Worker Two', 'WRK002', 'worker'),
        ('Worker Three', 'WRK003', 'worker'),
        ('Worker Four', 'WRK004', 'worker'),
        ('Worker Five', 'WRK005', 'worker')
    """)


def downgrade() -> None:
    op.drop_index('ix_production_entries_id', table_name='production_entries')
    op.drop_table('production_entries')
    op.drop_index('ix_users_user_code', table_name='users')
    op.drop_index('ix_users_id', table_name='users')
    op.drop_table('users')
