"""Add currency logic to shop

Revision ID: f7f2fadf74e6
Revises: e4d08de41091
Create Date: 2026-04-06 11:52:08.138955

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f7f2fadf74e6'
down_revision: Union[str, None] = 'e4d08de41091'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('shops', sa.Column('currency', sa.String(length=10), server_default='INR', nullable=False))
    op.add_column('shops', sa.Column('currency_symbol', sa.String(length=10), server_default='₹', nullable=False))


def downgrade() -> None:
    op.drop_column('shops', 'currency_symbol')
    op.drop_column('shops', 'currency')
