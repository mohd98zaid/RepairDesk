"""create invoices table

Revision ID: 0006
Revises: 0005
Create Date: 2026-02-23 09:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "invoices",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("ticket_id", sa.UUID(), nullable=False),
        sa.Column("shop_id", sa.UUID(), nullable=False),
        sa.Column("invoice_number", sa.String(30), nullable=False),
        sa.Column("total_amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("minio_key", sa.Text(), nullable=True),
        sa.Column("public_token", sa.String(64), nullable=False, unique=True),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["ticket_id"], ["tickets.id"]),
        sa.ForeignKeyConstraint(["shop_id"], ["shops.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_invoices_ticket_id", "invoices", ["ticket_id"])
    op.create_index("idx_invoices_shop_id", "invoices", ["shop_id"])
    op.create_index("idx_invoices_public_token", "invoices", ["public_token"], unique=True)


def downgrade() -> None:
    op.drop_index("idx_invoices_public_token")
    op.drop_index("idx_invoices_shop_id")
    op.drop_index("idx_invoices_ticket_id")
    op.drop_table("invoices")
