"""Add ticket_charges table and missing ticket columns

Revision ID: i94j470221fk
Revises: f7f2fadf74e6
Create Date: 2026-09-20 03:30:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'i94j470221fk'
down_revision: Union[str, None] = 'f7f2fadf74e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add missing columns to tickets defensively
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [c['name'] for c in inspector.get_columns('tickets')]

    if 'pre_repair_checklist' not in columns:
        op.add_column('tickets', sa.Column('pre_repair_checklist', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    if 'customer_signature' not in columns:
        op.add_column('tickets', sa.Column('customer_signature', sa.Text(), nullable=True))

    # 2. Create ticket_charges table defensively
    tables = inspector.get_table_names()
    if 'ticket_charges' not in tables:
        op.create_table(
            'ticket_charges',
            sa.Column('id', sa.UUID(), nullable=False),
            sa.Column('ticket_id', sa.UUID(), nullable=False),
            sa.Column('name', sa.String(length=200), nullable=False),
            sa.Column('amount', sa.Numeric(precision=10, scale=2), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.ForeignKeyConstraint(['ticket_id'], ['tickets.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_ticket_charges_ticket_id'), 'ticket_charges', ['ticket_id'], unique=False)


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()
    if 'ticket_charges' in tables:
        op.drop_index(op.f('ix_ticket_charges_ticket_id'), table_name='ticket_charges')
        op.drop_table('ticket_charges')
    columns = [c['name'] for c in inspector.get_columns('tickets')]
    if 'customer_signature' in columns:
        op.drop_column('tickets', 'customer_signature')
    if 'pre_repair_checklist' in columns:
        op.drop_column('tickets', 'pre_repair_checklist')
