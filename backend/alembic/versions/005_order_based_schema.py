"""Order-based production schema

Revision ID: 005
Revises: 004
Create Date: 2025-12-23

This migration:
1. Drops old production_entries and cost_config tables
2. Creates products, orders, order_positions, order_position_actions, sync_state tables
3. Updates users table: rename user_code to code, add allowed_action_types
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '005'
down_revision: Union[str, None] = '004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop old tables
    op.drop_table('production_entries')
    op.drop_table('cost_config')

    # Create shape_type enum (for MySQL, we use VARCHAR with CHECK)
    # Create products table
    op.create_table(
        'products',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('sku', sa.String(100), nullable=False),
        sa.Column('fabric', sa.String(50), nullable=False),
        sa.Column('pattern', sa.String(50), nullable=False),
        sa.Column('shape', sa.Enum('rectangular', 'round', 'oval', name='shapetype'), nullable=False),
        sa.Column('width', sa.Integer(), nullable=True),
        sa.Column('height', sa.Integer(), nullable=True),
        sa.Column('diameter', sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('sku'),
        sa.CheckConstraint('width IS NULL OR width > 0', name='chk_positive_width'),
        sa.CheckConstraint('height IS NULL OR height > 0', name='chk_positive_height'),
        sa.CheckConstraint('diameter IS NULL OR diameter > 0', name='chk_positive_diameter'),
    )
    op.create_index('ix_products_id', 'products', ['id'])
    op.create_index('ix_products_sku', 'products', ['sku'])
    op.create_index('ix_products_fabric', 'products', ['fabric'])
    op.create_index('ix_products_pattern', 'products', ['pattern'])

    # Create orders table
    op.create_table(
        'orders',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('baselinker_id', sa.BigInteger(), nullable=True),
        sa.Column('source', sa.String(50), nullable=True),
        sa.Column('expected_shipment_date', sa.Date(), nullable=True),
        sa.Column('fullname', sa.String(200), nullable=True),
        sa.Column('company', sa.String(200), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('baselinker_id'),
    )
    op.create_index('ix_orders_id', 'orders', ['id'])
    op.create_index('ix_orders_baselinker_id', 'orders', ['baselinker_id'])
    op.create_index('ix_orders_expected_shipment_date', 'orders', ['expected_shipment_date'])
    op.create_index('ix_orders_fullname', 'orders', ['fullname'])

    # Create order_positions table
    op.create_table(
        'order_positions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('order_id', sa.Integer(), nullable=False),
        sa.Column('product_id', sa.Integer(), nullable=False),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['order_id'], ['orders.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['product_id'], ['products.id']),
        sa.UniqueConstraint('order_id', 'product_id', name='uq_order_product'),
        sa.CheckConstraint('quantity > 0', name='chk_positive_quantity'),
    )
    op.create_index('ix_order_positions_id', 'order_positions', ['id'])
    op.create_index('ix_order_positions_product_id', 'order_positions', ['product_id'])

    # Create order_position_actions table
    op.create_table(
        'order_position_actions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('order_position_id', sa.Integer(), nullable=False),
        sa.Column('action_type', sa.Enum('cutting', 'sewing', 'ironing', 'packing', name='actiontype'), nullable=False),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('actor_id', sa.Integer(), nullable=False),
        sa.Column('timestamp', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['order_position_id'], ['order_positions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['actor_id'], ['users.id']),
        sa.CheckConstraint('quantity > 0', name='chk_action_positive_quantity'),
    )
    op.create_index('ix_order_position_actions_id', 'order_position_actions', ['id'])
    op.create_index('ix_order_position_actions_order_position_id', 'order_position_actions', ['order_position_id'])
    op.create_index('ix_order_position_actions_actor_id', 'order_position_actions', ['actor_id'])
    op.create_index('ix_order_position_actions_timestamp', 'order_position_actions', ['timestamp'])

    # Create sync_state table
    op.create_table(
        'sync_state',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('last_sync_timestamp', sa.BigInteger(), nullable=False, default=0),
        sa.Column('shipment_date_field_id', sa.Integer(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_sync_state_id', 'sync_state', ['id'])

    # Update users table: rename user_code to code, add allowed_action_types
    op.alter_column('users', 'user_code', new_column_name='code', existing_type=sa.String(20))
    op.add_column('users', sa.Column('allowed_action_types', sa.JSON(), nullable=True))
    
    # Set default empty array for existing users
    op.execute("UPDATE users SET allowed_action_types = '[]'")
    
    # Make column non-nullable
    op.alter_column('users', 'allowed_action_types', nullable=False, existing_type=sa.JSON())


def downgrade() -> None:
    # Revert users table changes
    op.alter_column('users', 'code', new_column_name='user_code', existing_type=sa.String(20))
    op.drop_column('users', 'allowed_action_types')

    # Drop new tables
    op.drop_table('sync_state')
    op.drop_table('order_position_actions')
    op.drop_table('order_positions')
    op.drop_table('orders')
    op.drop_table('products')

    # Recreate old tables
    op.create_table(
        'cost_config',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('corner_sewing_factors', sa.JSON(), nullable=False),
        sa.Column('sewing_factors', sa.JSON(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_cost_config_id', 'cost_config', ['id'])

    op.create_table(
        'production_entries',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('worker_id', sa.Integer(), nullable=False),
        sa.Column('product_type', sa.String(50), nullable=False),
        sa.Column('width_cm', sa.Integer(), nullable=False),
        sa.Column('height_cm', sa.Integer(), nullable=False),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['worker_id'], ['users.id']),
    )
    op.create_index('ix_production_entries_id', 'production_entries', ['id'])
