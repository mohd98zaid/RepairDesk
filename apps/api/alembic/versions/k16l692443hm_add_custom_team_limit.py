"""add custom_team_limit to shops

Revision ID: k16l692443hm
Revises: j05k581332gl
Create Date: 2026-03-31

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'k16l692443hm'
down_revision = 'j05k581332gl'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'shops',
        sa.Column('custom_team_limit', sa.Integer(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column('shops', 'custom_team_limit')
