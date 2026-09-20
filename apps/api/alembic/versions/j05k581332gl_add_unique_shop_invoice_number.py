"""add unique constraint on shop invoice number

Revision ID: j05k581332gl
Revises: i94j470221fk
Create Date: 2026-09-20

Adds a UNIQUE constraint on (shop_id, invoice_number) in the invoices table
to prevent duplicate invoice numbers from concurrent invoice generation requests.
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = 'j05k581332gl'
down_revision = 'i94j470221fk'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add UNIQUE constraint to prevent duplicate invoice numbers per shop.
    # Handles the race condition where two concurrent invoice generations
    # both read the same COUNT and compute the same sequence number.
    op.create_unique_constraint(
        'uq_shop_invoice_number',
        'invoices',
        ['shop_id', 'invoice_number']
    )


def downgrade() -> None:
    op.drop_constraint(
        'uq_shop_invoice_number',
        'invoices',
        type_='unique'
    )
