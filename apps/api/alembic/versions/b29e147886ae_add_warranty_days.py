"""add_warranty_days

Revision ID: b29e147886ae
Revises: 939e147886ad
Create Date: 2024-05-24 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'b29e147886ae'
down_revision = '939e147886ad'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Add warranty_days column to tickets table
    op.add_column('tickets', sa.Column('warranty_days', sa.Integer(), nullable=True))


def downgrade() -> None:
    # Drop warranty_days column from tickets table
    op.drop_column('tickets', 'warranty_days')
