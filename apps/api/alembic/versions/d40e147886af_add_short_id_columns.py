"""add_short_id_columns

Revision ID: d40e147886af
Revises: c39e147886ae
Create Date: 2026-02-25 14:10:00.000000

"""
from typing import Sequence, Union
import uuid
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision: str = 'd40e147886af'
down_revision: Union[str, None] = 'c39e147886ae'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _gen(prefix: str) -> str:
    return prefix + str(uuid.uuid4()).replace("-", "")[:6].upper()


def upgrade() -> None:
    # 1. Add short_id columns (nullable first so existing rows are OK)
    op.add_column('shops',
        sa.Column('short_id', sa.String(length=12), nullable=True)
    )
    op.add_column('customers',
        sa.Column('short_id', sa.String(length=10), nullable=True)
    )
    op.add_column('inventory_items',
        sa.Column('short_id', sa.String(length=10), nullable=True)
    )

    # 2. Backfill existing rows with generated short IDs
    conn = op.get_bind()

    shops = conn.execute(sa.text("SELECT id FROM shops")).fetchall()
    for row in shops:
        conn.execute(
            sa.text("UPDATE shops SET short_id = :sid WHERE id = :id AND short_id IS NULL"),
            {"sid": _gen("SHOP-"), "id": row[0]}
        )

    customers = conn.execute(sa.text("SELECT id FROM customers")).fetchall()
    for row in customers:
        conn.execute(
            sa.text("UPDATE customers SET short_id = :sid WHERE id = :id AND short_id IS NULL"),
            {"sid": _gen("CUS-"), "id": row[0]}
        )

    inventory = conn.execute(sa.text("SELECT id FROM inventory_items")).fetchall()
    for row in inventory:
        conn.execute(
            sa.text("UPDATE inventory_items SET short_id = :sid WHERE id = :id AND short_id IS NULL"),
            {"sid": _gen("PRD-"), "id": row[0]}
        )

    # 3. Now make NOT NULL and add unique + index constraints
    op.alter_column('shops', 'short_id', nullable=False)
    op.create_unique_constraint('uq_shops_short_id', 'shops', ['short_id'])
    op.create_index('ix_shops_short_id', 'shops', ['short_id'], unique=True)

    op.alter_column('customers', 'short_id', nullable=False)
    op.create_unique_constraint('uq_customers_short_id', 'customers', ['short_id'])
    op.create_index('ix_customers_short_id', 'customers', ['short_id'], unique=True)

    op.alter_column('inventory_items', 'short_id', nullable=False)
    op.create_unique_constraint('uq_inventory_items_short_id', 'inventory_items', ['short_id'])
    op.create_index('ix_inventory_items_short_id', 'inventory_items', ['short_id'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_inventory_items_short_id', table_name='inventory_items')
    op.drop_constraint('uq_inventory_items_short_id', 'inventory_items', type_='unique')
    op.drop_column('inventory_items', 'short_id')

    op.drop_index('ix_customers_short_id', table_name='customers')
    op.drop_constraint('uq_customers_short_id', 'customers', type_='unique')
    op.drop_column('customers', 'short_id')

    op.drop_index('ix_shops_short_id', table_name='shops')
    op.drop_constraint('uq_shops_short_id', 'shops', type_='unique')
    op.drop_column('shops', 'short_id')
