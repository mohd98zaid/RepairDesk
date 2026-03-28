"""
Billing & Subscription Schemas
"""
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, field_validator


# ─────────────────────────── Feature ───────────────────────────

class FeatureCreate(BaseModel):
    key: str
    name: str
    description: str | None = None
    feature_type: str = "boolean"
    default_value: str = "false"
    is_active: bool = True


class FeatureResponse(BaseModel):
    id: UUID
    key: str
    name: str
    description: str | None
    feature_type: str
    default_value: str
    is_active: bool
    created_at: datetime
    model_config = {"from_attributes": True}


# ─────────────────────────── Plan ───────────────────────────

class PlanCreate(BaseModel):
    name: str
    slug: str
    description: str | None = None
    price_monthly: str = "0"
    price_yearly: str = "0"
    is_active: bool = True
    is_public: bool = True
    sort_order: int = 0


class PlanUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    price_monthly: str | None = None
    price_yearly: str | None = None
    is_active: bool | None = None
    is_public: bool | None = None
    sort_order: int | None = None


class PlanFeatureItem(BaseModel):
    feature_id: UUID
    feature_key: str
    feature_name: str
    feature_type: str
    value: str


class PlanResponse(BaseModel):
    id: UUID
    name: str
    slug: str
    description: str | None
    price_monthly: str
    price_yearly: str
    is_active: bool
    is_public: bool
    sort_order: int
    created_at: datetime
    features: list[PlanFeatureItem] = []

    @field_validator("price_monthly", "price_yearly", mode="before")
    def dec_to_str(cls, v):
        return str(v)

    model_config = {"from_attributes": True}


class SetPlanFeatureRequest(BaseModel):
    feature_id: UUID
    value: str = "true"


# ─────────────────────────── Subscription ───────────────────────────

class SubscribeRequest(BaseModel):
    plan_id: UUID
    billing_cycle: str = "monthly"


class SubscriptionResponse(BaseModel):
    id: UUID
    shop_id: UUID
    plan_id: UUID
    plan_name: str
    plan_slug: str
    status: str
    billing_cycle: str
    current_period_start: datetime
    current_period_end: datetime
    created_at: datetime
    features: dict[str, str] = {}

    model_config = {"from_attributes": True}
