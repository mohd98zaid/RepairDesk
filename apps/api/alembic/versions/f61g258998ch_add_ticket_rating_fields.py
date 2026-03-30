"""add ticket rating fields

Revision ID: f61g258998ch
Revises: e50f147887bg
Create Date: 2026-03-30

"""
from alembic import op
import sqlalchemy as sa

revision = "f61g258998ch"
down_revision = "e50f147887bg"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tickets", sa.Column("customer_rating", sa.Integer(), nullable=True))
    op.add_column("tickets", sa.Column("customer_feedback", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("tickets", "customer_feedback")
    op.drop_column("tickets", "customer_rating")
