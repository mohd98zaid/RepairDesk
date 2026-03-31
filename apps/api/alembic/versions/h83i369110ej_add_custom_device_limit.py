"""add custom_device_limit to shops

Revision ID: h83i369110ej
Revises: f61g258998ch, g72h258999di
Create Date: 2026-03-31

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'h83i369110ej'
down_revision = ('f61g258998ch', 'g72h258999di')
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'shops',
        sa.Column('custom_device_limit', sa.Integer(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column('shops', 'custom_device_limit')
