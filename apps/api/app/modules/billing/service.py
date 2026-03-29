"""
Billing & Subscription Service
-------------------------------
Core logic: feature checking, plan management, subscription lifecycle.
"""
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.billing.models import Feature, Plan, PlanFeature, Subscription
from app.modules.shops.models import Shop


# ─────────────────────────── Feature Checking ───────────────────────────

async def has_feature(shop_id: uuid.UUID, feature_key: str, db: AsyncSession) -> str | None:
    """
    Check if a shop has access to a feature and return its value.
    Returns the feature value string, or None if not available.

    Usage:
        val = await has_feature(shop_id, "ticket_limit", db)
        if val is None:  → feature not available
        if val == "unlimited" → no limit
        if val.isdigit() → numeric limit
    """
    # Get active subscription with plan features
    sub_result = await db.execute(
        select(Subscription)
        .options(selectinload(Subscription.plan).selectinload(Plan.features).selectinload(PlanFeature.feature))
        .where(
            Subscription.shop_id == shop_id,
            Subscription.status == "active",
            Subscription.current_period_end > datetime.now(timezone.utc),
        )
    )
    subscription = sub_result.scalar_one_or_none()

    if not subscription:
        # No active subscription — check if there's a free/default plan
        return await _get_default_feature_value(feature_key, db)

    # Look up feature in plan
    for pf in subscription.plan.features:
        if pf.feature.key == feature_key and pf.feature.is_active:
            return pf.value

    # Feature not in plan — check default
    return await _get_default_feature_value(feature_key, db)


async def _get_default_feature_value(feature_key: str, db: AsyncSession) -> str | None:
    """Get the default value for a feature (from the free plan or feature default)."""
    # Try to find the free plan
    free_plan_result = await db.execute(
        select(Plan)
        .options(selectinload(Plan.features).selectinload(PlanFeature.feature))
        .where(Plan.slug == "free", Plan.is_active == True)
    )
    free_plan = free_plan_result.scalar_one_or_none()

    if free_plan:
        for pf in free_plan.features:
            if pf.feature.key == feature_key and pf.feature.is_active:
                return pf.value

    # Fall back to feature's default_value
    feat_result = await db.execute(
        select(Feature).where(Feature.key == feature_key, Feature.is_active == True)
    )
    feature = feat_result.scalar_one_or_none()
    if feature:
        return feature.default_value

    return None


async def get_shop_features(shop_id: uuid.UUID, db: AsyncSession) -> dict[str, str]:
    """Get all feature key→value pairs for a shop."""
    sub_result = await db.execute(
        select(Subscription)
        .options(selectinload(Subscription.plan).selectinload(Plan.features).selectinload(PlanFeature.feature))
        .where(
            Subscription.shop_id == shop_id,
            Subscription.status == "active",
            Subscription.current_period_end > datetime.now(timezone.utc),
        )
    )
    subscription = sub_result.scalar_one_or_none()

    if not subscription:
        return {}

    return {
        pf.feature.key: pf.value
        for pf in subscription.plan.features
        if pf.feature.is_active
    }


async def check_feature_limit(
    shop_id: uuid.UUID, feature_key: str, current_count: int, db: AsyncSession
) -> bool:
    """
    Check if the shop is within a numeric feature limit.
    Returns True if allowed, False if limit reached.
    """
    val = await has_feature(shop_id, feature_key, db)
    if val is None:
        return True  # No restriction configured
    if val == "unlimited" or val == "-1":
        return True
    if val.isdigit():
        return current_count < int(val)
    return True


# ─────────────────────────── Plan CRUD ───────────────────────────

async def create_plan(data: dict, db: AsyncSession) -> Plan:
    """Create a new plan (admin only)."""
    plan = Plan(
        name=data["name"],
        slug=data["slug"],
        description=data.get("description"),
        price_monthly=Decimal(str(data.get("price_monthly", 0))),
        price_yearly=Decimal(str(data.get("price_yearly", 0))),
        is_active=data.get("is_active", True),
        is_public=data.get("is_public", True),
        sort_order=data.get("sort_order", 0),
    )
    db.add(plan)
    await db.flush()
    return plan


async def update_plan(plan_id: uuid.UUID, data: dict, db: AsyncSession) -> Plan:
    """Update plan fields (admin only)."""
    result = await db.execute(select(Plan).where(Plan.id == plan_id))
    plan = result.scalar_one_or_none()
    if not plan:
        raise ValueError("Plan not found")

    ALLOWED_FIELDS = {"name", "description", "price_monthly", "price_yearly", "is_active", "is_public", "sort_order"}
    for field, value in data.items():
        if field in ALLOWED_FIELDS and value is not None:
            if field in ("price_monthly", "price_yearly"):
                setattr(plan, field, Decimal(str(value)))
            else:
                setattr(plan, field, value)
    await db.flush()
    return plan


async def delete_plan(plan_id: uuid.UUID, db: AsyncSession) -> None:
    """Delete a plan (only if no active subscriptions)."""
    # Check for active subscriptions
    count_result = await db.execute(
        select(func.count()).where(
            Subscription.plan_id == plan_id,
            Subscription.status == "active",
        )
    )
    if count_result.scalar_one() > 0:
        raise ValueError("Cannot delete plan with active subscriptions")

    result = await db.execute(select(Plan).where(Plan.id == plan_id))
    plan = result.scalar_one_or_none()
    if plan:
        await db.delete(plan)
        await db.flush()


async def list_plans(db: AsyncSession, public_only: bool = False) -> list[Plan]:
    """List all plans with features."""
    q = select(Plan).options(selectinload(Plan.features).selectinload(PlanFeature.feature))
    if public_only:
        q = q.where(Plan.is_public == True, Plan.is_active == True)
    q = q.order_by(Plan.sort_order.asc())
    result = await db.execute(q)
    return list(result.scalars().all())


async def get_plan(plan_id: uuid.UUID, db: AsyncSession) -> Plan | None:
    """Get a single plan with features."""
    result = await db.execute(
        select(Plan)
        .options(selectinload(Plan.features).selectinload(PlanFeature.feature))
        .where(Plan.id == plan_id)
    )
    return result.scalar_one_or_none()


# ─────────────────────────── Plan Features ───────────────────────────

async def set_plan_feature(
    plan_id: uuid.UUID, feature_id: uuid.UUID, value: str, db: AsyncSession
) -> PlanFeature:
    """Set or update a feature value for a plan."""
    result = await db.execute(
        select(PlanFeature).where(
            PlanFeature.plan_id == plan_id,
            PlanFeature.feature_id == feature_id,
        )
    )
    pf = result.scalar_one_or_none()

    if pf:
        pf.value = value
    else:
        pf = PlanFeature(plan_id=plan_id, feature_id=feature_id, value=value)
        db.add(pf)

    await db.flush()
    return pf


async def remove_plan_feature(
    plan_id: uuid.UUID, feature_id: uuid.UUID, db: AsyncSession
) -> None:
    """Remove a feature from a plan."""
    result = await db.execute(
        select(PlanFeature).where(
            PlanFeature.plan_id == plan_id,
            PlanFeature.feature_id == feature_id,
        )
    )
    pf = result.scalar_one_or_none()
    if pf:
        await db.delete(pf)
        await db.flush()


# ─────────────────────────── Feature CRUD ───────────────────────────

async def create_feature(data: dict, db: AsyncSession) -> Feature:
    """Create a new feature definition."""
    feature = Feature(
        key=data["key"],
        name=data["name"],
        description=data.get("description"),
        feature_type=data.get("feature_type", "boolean"),
        default_value=data.get("default_value", "false"),
        is_active=data.get("is_active", True),
    )
    db.add(feature)
    await db.flush()
    return feature


async def list_features(db: AsyncSession) -> list[Feature]:
    """List all features."""
    result = await db.execute(
        select(Feature).where(Feature.is_active == True).order_by(Feature.key)
    )
    return list(result.scalars().all())


async def delete_feature(feature_id: uuid.UUID, db: AsyncSession) -> None:
    """Delete a feature (removes from all plans first)."""
    result = await db.execute(select(Feature).where(Feature.id == feature_id))
    feature = result.scalar_one_or_none()
    if not feature:
        raise ValueError("Feature not found")

    # Remove all plan-feature mappings first
    mappings = (await db.execute(
        select(PlanFeature).where(PlanFeature.feature_id == feature_id)
    )).scalars().all()
    for m in mappings:
        await db.delete(m)

    await db.delete(feature)
    await db.flush()


# ─────────────────────────── Subscription Lifecycle ───────────────────────────

async def subscribe_shop(
    shop_id: uuid.UUID,
    plan_id: uuid.UUID,
    billing_cycle: str = "monthly",
    db: AsyncSession = None,
) -> Subscription:
    """
    Subscribe a shop to a plan.
    Cancels any existing active subscription first.
    Also syncs Shop.plan and Shop.plan_expires_at for backward compat.
    """
    now = datetime.now(timezone.utc)

    # Cancel existing subscription
    existing_result = await db.execute(
        select(Subscription).where(
            Subscription.shop_id == shop_id,
            Subscription.status == "active",
        )
    )
    existing = existing_result.scalar_one_or_none()
    if existing:
        existing.status = "cancelled"
        existing.cancelled_at = now

    # Calculate period
    if billing_cycle == "yearly":
        period_end = now + timedelta(days=365)
    else:
        period_end = now + timedelta(days=30)

    # Get plan slug for backward compat
    plan_result = await db.execute(select(Plan).where(Plan.id == plan_id))
    plan = plan_result.scalar_one_or_none()
    if not plan:
        raise ValueError("Plan not found")

    subscription = Subscription(
        shop_id=shop_id,
        plan_id=plan_id,
        status="active",
        billing_cycle=billing_cycle,
        current_period_start=now,
        current_period_end=period_end,
    )
    db.add(subscription)

    # Sync shop fields for backward compatibility
    shop_result = await db.execute(select(Shop).where(Shop.id == shop_id))
    shop = shop_result.scalar_one_or_none()
    if shop:
        shop.plan = plan.slug
        shop.plan_expires_at = period_end

    await db.flush()
    return subscription


async def cancel_subscription(shop_id: uuid.UUID, db: AsyncSession) -> None:
    """Cancel the active subscription for a shop."""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Subscription).where(
            Subscription.shop_id == shop_id,
            Subscription.status == "active",
        )
    )
    sub = result.scalar_one_or_none()
    if sub:
        sub.status = "cancelled"
        sub.cancelled_at = now
        # Sync shop fields for backward compatibility
        shop_result = await db.execute(select(Shop).where(Shop.id == shop_id))
        shop = shop_result.scalar_one_or_none()
        if shop:
            shop.plan = "free"
            shop.plan_expires_at = None
        await db.flush()


async def get_shop_subscription(shop_id: uuid.UUID, db: AsyncSession) -> Subscription | None:
    """Get the active subscription for a shop."""
    result = await db.execute(
        select(Subscription)
        .options(selectinload(Subscription.plan).selectinload(Plan.features).selectinload(PlanFeature.feature))
        .where(
            Subscription.shop_id == shop_id,
            Subscription.status == "active",
        )
    )
    return result.scalar_one_or_none()


# ─────────────────────────── Analytics Helpers ───────────────────────────

async def get_subscription_stats(db: AsyncSession) -> dict[str, Any]:
    """Get subscription analytics for admin dashboard."""
    now = datetime.now(timezone.utc)

    # Active subscriptions
    active_result = await db.execute(
        select(func.count()).where(Subscription.status == "active")
    )
    active_subs = active_result.scalar_one()

    # MRR (Monthly Recurring Revenue)
    mrr_result = await db.execute(
        select(func.coalesce(func.sum(Plan.price_monthly), 0))
        .select_from(Subscription)
        .join(Plan, Subscription.plan_id == Plan.id)
        .where(Subscription.status == "active")
    )
    mrr = float(mrr_result.scalar_one() or 0)

    # Plan distribution
    dist_result = await db.execute(
        select(Plan.name, Plan.slug, func.count(Subscription.id))
        .select_from(Plan)
        .outerjoin(
            Subscription,
            (Subscription.plan_id == Plan.id) & (Subscription.status == "active")
        )
        .group_by(Plan.id, Plan.name, Plan.slug)
        .order_by(Plan.sort_order)
    )
    plan_distribution = [
        {"name": row[0], "slug": row[1], "count": row[2]}
        for row in dist_result.fetchall()
    ]

    # Shops on free plan (plan field = "free")
    free_result = await db.execute(
        select(func.count()).where(Shop.plan == "free", Shop.is_active == True)
    )
    free_shops = free_result.scalar_one()

    return {
        "active_subscriptions": active_subs,
        "mrr": mrr,
        "plan_distribution": plan_distribution,
        "free_shops": free_shops,
    }
