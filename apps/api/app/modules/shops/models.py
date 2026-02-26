import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, String, Text, func, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base

# Possible shop account statuses:
#   ACTIVE     – fully operational
#   RESTRICTED – owner can log in but cannot create/modify data (read-only)
#   BLOCKED    – owner cannot log in at all (login returns 403)
#   INACTIVE   – soft-deleted, hidden from normal queries
SHOP_STATUS = ("ACTIVE", "RESTRICTED", "BLOCKED", "INACTIVE")


def _gen_shop_short_id() -> str:
    return "SHOP-" + str(uuid.uuid4()).replace("-", "")[:6].upper()


class Shop(Base):
    __tablename__ = "shops"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    short_id: Mapped[str] = mapped_column(
        String(12), nullable=False, unique=True, index=True, default=_gen_shop_short_id
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(30))
    email: Mapped[str | None] = mapped_column(String(255))
    logo_key: Mapped[str | None] = mapped_column(String)
    address: Mapped[str | None] = mapped_column(Text)
    pincode: Mapped[str | None] = mapped_column(String(10))
    gst_number: Mapped[str | None] = mapped_column(String(20))
    logo_data: Mapped[str | None] = mapped_column(Text)  # base64 data URL, <50KB
    plan: Mapped[str] = mapped_column(String(20), nullable=False, default="free")
    plan_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    shop_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="ACTIVE", server_default="ACTIVE"
    )
    admin_note: Mapped[str | None] = mapped_column(Text)  # internal note from admin
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

