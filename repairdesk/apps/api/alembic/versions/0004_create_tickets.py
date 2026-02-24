"""create tickets, ticket_images, ticket_status_logs tables

Revision ID: 0004
Revises: 0003
Create Date: 2026-02-23 07:01:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Pre-define the enum with create_type=False so create_table doesn't auto-emit CREATE TYPE
_ticket_status = sa.Enum(
    "RECEIVED", "IN_PROGRESS", "WAITING_PARTS", "READY", "DELIVERED", "CANCELLED",
    name="ticket_status",
    create_type=False,
)


def upgrade() -> None:
    # Create ticket_status enum only if it doesn't already exist
    conn = op.get_bind()
    exists = conn.execute(
        text("SELECT 1 FROM pg_type WHERE typname = 'ticket_status'")
    ).fetchone()
    if not exists:
        conn.execute(text(
            "CREATE TYPE ticket_status AS ENUM "
            "('RECEIVED', 'IN_PROGRESS', 'WAITING_PARTS', 'READY', 'DELIVERED', 'CANCELLED')"
        ))

    op.create_table(
        "tickets",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("shop_id", sa.UUID(), nullable=False),
        sa.Column("customer_id", sa.UUID(), nullable=False),
        sa.Column("assigned_to", sa.UUID(), nullable=True),
        sa.Column("created_by", sa.UUID(), nullable=False),
        sa.Column("ticket_number", sa.Integer(), nullable=False),
        sa.Column("device_type", sa.String(100), nullable=False),
        sa.Column("device_model", sa.String(150), nullable=True),
        sa.Column("reported_issue", sa.Text(), nullable=False),
        sa.Column("technician_notes", sa.Text(), nullable=True),
        sa.Column("status", _ticket_status, nullable=False, server_default="RECEIVED"),
        sa.Column("estimated_cost", sa.Numeric(10, 2), nullable=True),
        sa.Column("final_cost", sa.Numeric(10, 2), nullable=True),
        sa.Column("parts_cost", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("profit", sa.Numeric(10, 2), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["shop_id"], ["shops.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"]),
        sa.ForeignKeyConstraint(["assigned_to"], ["users.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("shop_id", "ticket_number", name="uq_ticket_shop_number"),
    )
    op.create_index("idx_tickets_shop_id", "tickets", ["shop_id"])
    op.create_index("idx_tickets_customer_id", "tickets", ["customer_id"])
    op.create_index("idx_tickets_status", "tickets", ["shop_id", "status"])

    op.create_table(
        "ticket_images",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("ticket_id", sa.UUID(), nullable=False),
        sa.Column("minio_key", sa.Text(), nullable=False),
        sa.Column("filename", sa.String(255), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=True),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["ticket_id"], ["tickets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_ticket_images_ticket_id", "ticket_images", ["ticket_id"])

    op.create_table(
        "ticket_status_logs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("ticket_id", sa.UUID(), nullable=False),
        sa.Column("from_status", _ticket_status, nullable=True),
        sa.Column("to_status", _ticket_status, nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("changed_by", sa.UUID(), nullable=False),
        sa.Column("changed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["ticket_id"], ["tickets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["changed_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_status_logs_ticket_id", "ticket_status_logs", ["ticket_id"])


def downgrade() -> None:
    op.drop_index("idx_status_logs_ticket_id")
    op.drop_table("ticket_status_logs")
    op.drop_index("idx_ticket_images_ticket_id")
    op.drop_table("ticket_images")
    op.drop_index("idx_tickets_status")
    op.drop_index("idx_tickets_customer_id")
    op.drop_index("idx_tickets_shop_id")
    op.drop_table("tickets")
    op.execute("DROP TYPE IF EXISTS ticket_status CASCADE;")
