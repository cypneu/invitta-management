"""Expand product sku, fabric and pattern lengths

Revision ID: 012
Revises: 011
"""

from alembic import op
import sqlalchemy as sa


revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column(
        "products",
        "sku",
        existing_type=sa.String(length=100),
        type_=sa.String(length=512),
        existing_nullable=False,
    )
    op.alter_column(
        "products",
        "fabric",
        existing_type=sa.String(length=50),
        type_=sa.String(length=255),
        existing_nullable=False,
    )
    op.alter_column(
        "products",
        "pattern",
        existing_type=sa.String(length=255),
        type_=sa.String(length=512),
        existing_nullable=False,
    )


def downgrade():
    op.alter_column(
        "products",
        "pattern",
        existing_type=sa.String(length=512),
        type_=sa.String(length=255),
        existing_nullable=False,
    )
    op.alter_column(
        "products",
        "fabric",
        existing_type=sa.String(length=255),
        type_=sa.String(length=50),
        existing_nullable=False,
    )
    op.alter_column(
        "products",
        "sku",
        existing_type=sa.String(length=512),
        type_=sa.String(length=100),
        existing_nullable=False,
    )
