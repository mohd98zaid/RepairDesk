"""
Billing & Subscription Router
------------------------------
Endpoints for plan management, feature management, and subscriptions.
Admin endpoints use AdminUser dependency.
Shop-facing endpoints use CurrentUser dependency.
"""
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.db import get_db
from app.core.dependencies import CurrentUser, OwnerUser
from app.modules.billing import service
from app.modules.billing.models import Feature, Plan, PlanFeature
from app.modules.billing.schemas import (
    FeatureCreate, FeatureResponse,
    PlanCreate, PlanUpdate, PlanResponse, PlanFeatureItem,
    SubscribeRequest, SubscriptionResponse, SetPlanFeatureRequest,
)

# Reuse admin auth from existing admin router
from app.modules.admin.router import AdminUser, _get_admin_user

router = APIRouter(prefix="/billing", tags=["Billing"])



# ═══════════════════════════════════════════════════════════════
#  ADMIN — Plan Management
# ═══════════════════════════════════════════════════════════════

@router.get("/admin/plans", response_model=list[PlanResponse])
async def admin_list_plans(
    admin: dict = Depends(_get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """List all plans with their features (admin only)."""
    plans = await service.list_plans(db, public_only=False)
    return [_plan_to_response(p) for p in plans]


@router.post("/admin/plans", response_model=PlanResponse, status_code=201)
async def admin_create_plan(
    data: PlanCreate,
    admin: dict = Depends(_get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new plan (admin only)."""
    plan = await service.create_plan(data.model_dump(), db)
    return _plan_to_response(plan)


@router.patch("/admin/plans/{plan_id}", response_model=PlanResponse)
async def admin_update_plan(
    plan_id: uuid.UUID,
    data: PlanUpdate,
    admin: dict = Depends(_get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Update plan fields (admin only)."""
    plan = await service.update_plan(plan_id, data.model_dump(exclude_none=True), db)
    # Reload with features
    plan = await service.get_plan(plan_id, db)
    return _plan_to_response(plan)


@router.delete("/admin/plans/{plan_id}", status_code=204)
async def admin_delete_plan(
    plan_id: uuid.UUID,
    admin: dict = Depends(_get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a plan (only if no active subscriptions)."""
    try:
        await service.delete_plan(plan_id, db)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.post("/admin/plans/{plan_id}/features", status_code=201)
async def admin_set_plan_feature(
    plan_id: uuid.UUID,
    data: SetPlanFeatureRequest,
    admin: dict = Depends(_get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Set or update a feature value for a plan."""
    pf = await service.set_plan_feature(plan_id, data.feature_id, data.value, db)
    return {"id": str(pf.id), "plan_id": str(pf.plan_id), "feature_id": str(pf.feature_id), "value": pf.value}


@router.delete("/admin/plans/{plan_id}/features/{feature_id}", status_code=204)
async def admin_remove_plan_feature(
    plan_id: uuid.UUID,
    feature_id: uuid.UUID,
    admin: dict = Depends(_get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a feature from a plan."""
    await service.remove_plan_feature(plan_id, feature_id, db)


# ═══════════════════════════════════════════════════════════════
#  ADMIN — Feature Management
# ═══════════════════════════════════════════════════════════════

@router.get("/admin/features", response_model=list[FeatureResponse])
async def admin_list_features(
    admin: dict = Depends(_get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """List all feature definitions (admin only)."""
    return await service.list_features(db)


@router.post("/admin/features", response_model=FeatureResponse, status_code=201)
async def admin_create_feature(
    data: FeatureCreate,
    admin: dict = Depends(_get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new feature definition (admin only)."""
    return await service.create_feature(data.model_dump(), db)


@router.delete("/admin/features/{feature_id}", status_code=204)
async def admin_delete_feature(
    feature_id: uuid.UUID,
    admin: dict = Depends(_get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a feature definition (removes from all plans first)."""
    try:
        await service.delete_feature(feature_id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ═══════════════════════════════════════════════════════════════
#  ADMIN — Subscription Management
# ═══════════════════════════════════════════════════════════════

@router.get("/admin/subscriptions/stats")
async def admin_subscription_stats(
    admin: dict = Depends(_get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Get subscription analytics (MRR, plan distribution, etc)."""
    return await service.get_subscription_stats(db)


@router.get("/admin/subscriptions")
async def admin_list_subscriptions(
    admin: dict = Depends(_get_admin_user),
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status: str | None = Query(None),
):
    """List all subscriptions with shop details (admin only)."""
    from app.modules.shops.models import Shop
    from sqlalchemy import func

    q = (
        select(Plan, service.Subscription, Shop)
        .select_from(service.Subscription)
        .join(Plan, service.Subscription.plan_id == Plan.id)
        .join(Shop, service.Subscription.shop_id == Shop.id)
        .options(selectinload(Plan.features).selectinload(PlanFeature.feature))
    )
    if status:
        q = q.where(service.Subscription.status == status)

    count_q = select(func.count()).select_from(q.subquery())
    total = (await db.execute(count_q)).scalar_one()

    offset = (page - 1) * per_page
    result = await db.execute(
        q.order_by(service.Subscription.created_at.desc())
        .offset(offset).limit(per_page)
    )

    items = []
    for plan, sub, shop in result.fetchall():
        features = {
            pf.feature.key: pf.value
            for pf in plan.features
            if pf.feature.is_active
        } if plan.features else {}
        items.append({
            "id": str(sub.id),
            "shop_id": str(sub.shop_id),
            "shop_name": shop.name,
            "plan_id": str(plan.id),
            "plan_name": plan.name,
            "plan_slug": plan.slug,
            "status": sub.status,
            "billing_cycle": sub.billing_cycle,
            "current_period_start": sub.current_period_start.isoformat(),
            "current_period_end": sub.current_period_end.isoformat(),
            "features": features,
            "created_at": sub.created_at.isoformat(),
        })

    return {"total": total, "page": page, "per_page": per_page, "items": items}


@router.post("/admin/shops/{shop_id}/subscribe")
async def admin_subscribe_shop(
    shop_id: uuid.UUID,
    data: SubscribeRequest,
    admin: dict = Depends(_get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Manually subscribe a shop to a plan (admin only)."""
    try:
        sub = await service.subscribe_shop(shop_id, data.plan_id, data.billing_cycle, db)
        return {"id": str(sub.id), "status": sub.status, "plan_id": str(sub.plan_id)}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/admin/shops/{shop_id}/cancel-subscription")
async def admin_cancel_subscription(
    shop_id: uuid.UUID,
    admin: dict = Depends(_get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Cancel a shop's active subscription (admin only)."""
    await service.cancel_subscription(shop_id, db)
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════
#  SHOP-FACING — Plan & Feature Queries
# ═══════════════════════════════════════════════════════════════

@router.get("/plans", response_model=list[PlanResponse])
async def list_public_plans(
    db: AsyncSession = Depends(get_db),
):
    """List public plans (available for self-service signup)."""
    plans = await service.list_plans(db, public_only=True)
    return [_plan_to_response(p) for p in plans]


@router.get("/subscription", response_model=SubscriptionResponse)
async def get_my_subscription(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Get the current shop's subscription details."""
    sub = await service.get_shop_subscription(current_user["shop_id"], db)
    if not sub:
        raise HTTPException(status_code=404, detail="No active subscription found")

    features = {
        pf.feature.key: pf.value
        for pf in sub.plan.features
        if pf.feature.is_active
    } if sub.plan.features else {}

    return SubscriptionResponse(
        id=sub.id,
        shop_id=sub.shop_id,
        plan_id=sub.plan_id,
        plan_name=sub.plan.name,
        plan_slug=sub.plan.slug,
        status=sub.status,
        billing_cycle=sub.billing_cycle,
        current_period_start=sub.current_period_start,
        current_period_end=sub.current_period_end,
        created_at=sub.created_at,
        features=features,
    )


@router.get("/features")
async def get_my_features(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Get all feature key→value pairs for the current shop."""
    features = await service.get_shop_features(current_user["shop_id"], db)
    return {"features": features}


@router.get("/features/{feature_key}")
async def check_my_feature(
    feature_key: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Check if the current shop has access to a specific feature."""
    value = await service.has_feature(current_user["shop_id"], feature_key, db)
    return {"key": feature_key, "value": value, "available": value is not None and value != "false"}


# ═══════════════════════════════════════════════════════════════
#  HELPERS
# ═══════════════════════════════════════════════════════════════

def _plan_to_response(plan: Plan) -> PlanResponse:
    """Convert a Plan model to a PlanResponse."""
    features = []
    if plan.features:
        for pf in plan.features:
            if pf.feature:
                features.append(PlanFeatureItem(
                    feature_id=pf.feature.id,
                    feature_key=pf.feature.key,
                    feature_name=pf.feature.name,
                    feature_type=pf.feature.feature_type,
                    value=pf.value,
                ))
    return PlanResponse(
        id=plan.id,
        name=plan.name,
        slug=plan.slug,
        description=plan.description,
        price_monthly=str(plan.price_monthly),
        price_yearly=str(plan.price_yearly),
        is_active=plan.is_active,
        is_public=plan.is_public,
        sort_order=plan.sort_order,
        created_at=plan.created_at,
        features=features,
    )
