"""Add shared workers for production actions

Revision ID: 014
Revises: 013
Create Date: 2026-03-23

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "order_position_action_workers",
        sa.Column("action_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["action_id"], ["order_position_actions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("action_id", "user_id"),
    )
    op.create_index(
        op.f("ix_order_position_action_workers_action_id"),
        "order_position_action_workers",
        ["action_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_order_position_action_workers_user_id"),
        "order_position_action_workers",
        ["user_id"],
        unique=False,
    )

    op.execute(
        """
        INSERT INTO order_position_action_workers (action_id, user_id)
        SELECT id, actor_id
        FROM order_position_actions
        """
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_order_position_action_workers_user_id"), table_name="order_position_action_workers")
    op.drop_index(op.f("ix_order_position_action_workers_action_id"), table_name="order_position_action_workers")
    op.drop_table("order_position_action_workers")
