import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean, DateTime, Enum as SAEnum, ForeignKey, Integer,
    Numeric, String, Text, UniqueConstraint, func
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Ticket(Base):
    __tablename__ = "tickets"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    shop_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("shops.id", ondelete="CASCADE"), nullable=False, index=True
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("customers.id"), nullable=False, index=True
    )
    assigned_to: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    ticket_number: Mapped[int] = mapped_column(Integer, nullable=False)
    device_type: Mapped[str] = mapped_column(String(100), nullable=False)
    device_model: Mapped[str | None] = mapped_column(String(150))
    reported_issue: Mapped[str] = mapped_column(Text, nullable=False)
    technician_notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(
        SAEnum(
            "RECEIVED", "IN_PROGRESS", "WAITING_PARTS", "READY", "DELIVERED", "CANCELLED",
            name="ticket_status"
        ),
        nullable=False,
        default="RECEIVED",
    )
    estimated_cost: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    final_cost: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    parts_cost: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    profit: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        UniqueConstraint("shop_id", "ticket_number", name="uq_ticket_shop_number"),
    )


class TicketImage(Base):
    __tablename__ = "ticket_images"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    ticket_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    minio_key: Mapped[str] = mapped_column(Text, nullable=False)
    filename: Mapped[str | None] = mapped_column(String(255))
    size_bytes: Mapped[int | None] = mapped_column(Integer)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class TicketStatusLog(Base):
    __tablename__ = "ticket_status_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    ticket_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    from_status: Mapped[str | None] = mapped_column(
        SAEnum(
            "RECEIVED", "IN_PROGRESS", "WAITING_PARTS", "READY", "DELIVERED", "CANCELLED",
            name="ticket_status"
        )
    )
    to_status: Mapped[str] = mapped_column(
        SAEnum(
            "RECEIVED", "IN_PROGRESS", "WAITING_PARTS", "READY", "DELIVERED", "CANCELLED",
            name="ticket_status"
        ),
        nullable=False,
    )
    notes: Mapped[str | None] = mapped_column(Text)
    changed_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
