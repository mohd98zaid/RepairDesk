"""add onboarding fields to shops and users

Revision ID: 0007
Revises: 0006
Create Date: 2026-02-23 11:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Shop — address, pincode, gst_number, logo_data
    op.add_column("shops", sa.Column("address", sa.Text(), nullable=True))
    op.add_column("shops", sa.Column("pincode", sa.String(10), nullable=True))
    op.add_column("shops", sa.Column("gst_number", sa.String(20), nullable=True))
    op.add_column("shops", sa.Column("logo_data", sa.Text(), nullable=True))

    # User — avatar_data (owner profile photo)
    op.add_column("users", sa.Column("avatar_data", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "avatar_data")
    op.drop_column("shops", "logo_data")
    op.drop_column("shops", "gst_number")
    op.drop_column("shops", "pincode")
    op.drop_column("shops", "address")
