"""create users and invitations tables

Revision ID: 0002
Revises: 0001
Create Date: 2026-02-23 06:00:01.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Pre-create the enum once (create_type=False on all column defs below)
_user_role = sa.Enum("OWNER", "TECHNICIAN", name="user_role", create_type=False)


def upgrade() -> None:
    # Create user_role enum only if it doesn't already exist
    conn = op.get_bind()
    exists = conn.execute(
        text("SELECT 1 FROM pg_type WHERE typname = 'user_role'")
    ).fetchone()
    if not exists:
        conn.execute(text("CREATE TYPE user_role AS ENUM ('OWNER', 'TECHNICIAN')"))

    op.create_table(
        "users",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("shop_id", sa.UUID(), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("role", _user_role, nullable=False, server_default="TECHNICIAN"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["shop_id"], ["shops.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_index("idx_users_shop_id", "users", ["shop_id"])
    op.create_index("idx_users_email", "users", ["email"])

    op.create_table(
        "invitations",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("shop_id", sa.UUID(), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("role", _user_role, nullable=False, server_default="TECHNICIAN"),
        sa.Column("token", sa.Text(), nullable=False),
        sa.Column("accepted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["shop_id"], ["shops.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token"),
    )


def downgrade() -> None:
    op.drop_table("invitations")
    op.drop_table("users")
    op.execute("DROP TYPE IF EXISTS user_role CASCADE;")
