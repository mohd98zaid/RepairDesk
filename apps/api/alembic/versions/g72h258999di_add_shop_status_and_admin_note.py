"""add shop_status and admin_note to shops

Revision ID: g72h258999di
Revises: e50f147887bg
Create Date: 2026-03-31 08:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'g72h258999di'
down_revision: Union[str, None] = 'e50f147887bg'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('shops', sa.Column('shop_status', sa.String(20), nullable=False, server_default='ACTIVE'))
    op.add_column('shops', sa.Column('admin_note', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('shops', 'admin_note')
    op.drop_column('shops', 'shop_status')
