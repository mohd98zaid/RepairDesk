"""add_vendors_and_purchase_orders

Revision ID: c39e147886ae
Revises: b29e147886ae
Create Date: 2026-02-24 16:30:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'c39e147886ae'
down_revision: Union[str, None] = 'b29e147886ae'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create vendors table
    op.create_table('vendors',
    sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
    sa.Column('shop_id', postgresql.UUID(as_uuid=True), nullable=False),
    sa.Column('name', sa.String(length=255), nullable=False),
    sa.Column('contact_name', sa.String(length=255), nullable=True),
    sa.Column('email', sa.String(length=255), nullable=True),
    sa.Column('phone', sa.String(length=50), nullable=True),
    sa.Column('address', sa.Text(), nullable=True),
    sa.Column('website', sa.String(length=255), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['shop_id'], ['shops.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_vendors_shop_id'), 'vendors', ['shop_id'], unique=False)

    # Create purchase_orders table
    op.create_table('purchase_orders',
    sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
    sa.Column('shop_id', postgresql.UUID(as_uuid=True), nullable=False),
    sa.Column('vendor_id', postgresql.UUID(as_uuid=True), nullable=False),
    sa.Column('po_number', sa.String(length=100), nullable=False),
    sa.Column('status', sa.String(length=50), nullable=False),
    sa.Column('total_amount', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['shop_id'], ['shops.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['vendor_id'], ['vendors.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_purchase_orders_shop_id'), 'purchase_orders', ['shop_id'], unique=False)
    op.create_index(op.f('ix_purchase_orders_po_number'), 'purchase_orders', ['po_number'], unique=False)

    # Create purchase_order_items table
    op.create_table('purchase_order_items',
    sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
    sa.Column('po_id', postgresql.UUID(as_uuid=True), nullable=False),
    sa.Column('inventory_item_id', postgresql.UUID(as_uuid=True), nullable=False),
    sa.Column('quantity', sa.Integer(), nullable=False),
    sa.Column('unit_cost', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['inventory_item_id'], ['inventory_items.id'], ),
    sa.ForeignKeyConstraint(['po_id'], ['purchase_orders.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_purchase_order_items_po_id'), 'purchase_order_items', ['po_id'], unique=False)


def downgrade() -> None:
    # Drop in reverse order of creation
    op.drop_index(op.f('ix_purchase_order_items_po_id'), table_name='purchase_order_items')
    op.drop_table('purchase_order_items')
    op.drop_index(op.f('ix_purchase_orders_po_number'), table_name='purchase_orders')
    op.drop_index(op.f('ix_purchase_orders_shop_id'), table_name='purchase_orders')
    op.drop_table('purchase_orders')
    op.drop_index(op.f('ix_vendors_shop_id'), table_name='vendors')
    op.drop_table('vendors')
