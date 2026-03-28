"""
Billing & Subscription Models
------------------------------
Dynamic plan/feature system with shop subscriptions.
Designed to extend existing Shop.plan field, not replace it.
"""
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text,
    UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
import sqlalchemy.orm

from app.core.db import Base


class Plan(Base):
    """Subscription plan definition (e.g., Free, Basic, Pro)."""
    __tablename__ = "plans"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    slug: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text)
    price_monthly: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    price_yearly: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_public: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    features: Mapped[list["PlanFeature"]] = relationship(
        "PlanFeature", back_populates="plan", cascade="all, delete-orphan",
    )
    subscriptions: Mapped[list["Subscription"]] = relationship(
        "Subscription", back_populates="plan",
    )


class Feature(Base):
    """Feature definition (e.g., ticket_limit, ai_diagnosis)."""
    __tablename__ = "features"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    key: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    feature_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="boolean"
    )  # boolean, numeric, string
    default_value: Mapped[str] = mapped_column(String(100), nullable=False, default="false")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class PlanFeature(Base):
    """Mapping: which features a plan includes, with their values."""
    __tablename__ = "plan_features"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("plans.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    feature_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("features.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    # Value stored as string; interpret based on feature.feature_type:
    #   boolean → "true" / "false"
    #   numeric → "100", "unlimited"
    #   string  → any value
    value: Mapped[str] = mapped_column(String(100), nullable=False, default="true")

    # Relationships
    plan: Mapped["Plan"] = relationship("Plan", back_populates="features")
    feature: Mapped["Feature"] = relationship("Feature")

    __table_args__ = (
        UniqueConstraint("plan_id", "feature_id", name="uq_plan_feature"),
    )


class Subscription(Base):
    """Shop subscription record (links shop to plan with billing period)."""
    __tablename__ = "subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    shop_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("shops.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("plans.id"),
        nullable=False, index=True,
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="active", index=True
    )  # active, cancelled, expired, past_due
    billing_cycle: Mapped[str] = mapped_column(
        String(10), nullable=False, default="monthly"
    )  # monthly, yearly
    current_period_start: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
    )
    current_period_end: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
    )
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(255))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    plan: Mapped["Plan"] = relationship("Plan", back_populates="subscriptions")

    __table_args__ = (
        UniqueConstraint("shop_id", name="uq_subscription_shop"),
    )
