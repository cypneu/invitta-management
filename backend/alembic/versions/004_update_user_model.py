"""Update user model with first_name and last_name

Revision ID: 004
Revises: 003
Create Date: 2025-12-06

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '004'
down_revision: Union[str, None] = '003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add first_name and last_name columns
    op.add_column('users', sa.Column('first_name', sa.String(50), nullable=True))
    op.add_column('users', sa.Column('last_name', sa.String(50), nullable=True))
    
    # Migrate existing data: split name into first/last
    op.execute("""
        UPDATE users SET 
            first_name = SPLIT_PART(name, ' ', 1),
            last_name = COALESCE(NULLIF(SPLIT_PART(name, ' ', 2), ''), SPLIT_PART(name, ' ', 1))
        WHERE first_name IS NULL
    """)
    
    # Make columns non-nullable
    op.alter_column('users', 'first_name', nullable=False)
    op.alter_column('users', 'last_name', nullable=False)
    
    # Drop old name column
    op.drop_column('users', 'name')
    
    # Update admin user_code from env var or generate random
    import os
    import secrets
    import string
    admin_code = os.environ.get('ADMIN_CODE')
    if not admin_code:
        # Generate random 8-char alphanumeric if not provided
        admin_code = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(8))
        print(f"Generated admin code: {admin_code}")
    op.execute(f"UPDATE users SET user_code = '{admin_code}' WHERE role = 'admin'")


def downgrade() -> None:
    # Add back name column
    op.add_column('users', sa.Column('name', sa.String(100), nullable=True))
    
    # Concatenate first_name and last_name
    op.execute("UPDATE users SET name = first_name || ' ' || last_name")
    
    # Make name non-nullable
    op.alter_column('users', 'name', nullable=False)
    
    # Drop first_name and last_name
    op.drop_column('users', 'last_name')
    op.drop_column('users', 'first_name')
    
    # Reset admin code
    op.execute("UPDATE users SET user_code = 'ADMIN001' WHERE role = 'admin'")
