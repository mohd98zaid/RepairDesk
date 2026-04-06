from typing import Any
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.db import get_db
from app.core.dependencies import get_current_user
from app.modules.users.models import User
from app.modules.activity.models import ActivityLog
from app.modules.activity.schemas import ActivityLogResponse, ActivityLogListResponse

router = APIRouter(prefix="/activity", tags=["activity"])


@router.get("", response_model=ActivityLogListResponse)
async def list_activity_logs(
    request: Request,
    user_id: str | None = Query(None, description="Filter by user ID"),
    action: str | None = Query(None, description="Filter by action name"),
    entity_type: str | None = Query(None, description="Filter by entity type"),
    entity_id: str | None = Query(None, description="Filter by entity ID"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    List activity logs for the current shop.
    """
    query = select(ActivityLog, User.full_name.label("user_name")).outerjoin(
        User, ActivityLog.user_id == User.id
    ).where(ActivityLog.shop_id == current_user["shop_id"])

    if user_id:
        query = query.where(ActivityLog.user_id == user_id)
    if action:
        query = query.where(ActivityLog.action == action)
    if entity_type:
        query = query.where(ActivityLog.entity_type == entity_type)
    if entity_id:
        query = query.where(ActivityLog.entity_id == entity_id)

    # Count
    count_stmt = select(func.count()).select_from(query.subquery())
    total = await db.scalar(count_stmt)

    # Fetch
    query = query.order_by(desc(ActivityLog.created_at))
    query = query.offset((page - 1) * per_page).limit(per_page)

    result = await db.execute(query)
    rows = result.all()

    items = []
    for log, user_name in rows:
        log_dict = {
            "id": log.id,
            "shop_id": log.shop_id,
            "user_id": log.user_id,
            "action": log.action,
            "entity_type": log.entity_type,
            "entity_id": log.entity_id,
            "details": log.details,
            "ip_address": log.ip_address,
            "created_at": log.created_at,
            "user_name": user_name,
        }
        items.append(ActivityLogResponse(**log_dict))

    return ActivityLogListResponse(
        items=items,
        total=total or 0,
        page=page,
        per_page=per_page
    )


async def log_activity(
    db: AsyncSession,
    shop_id: Any,
    user_id: Any | None,
    action: str,
    entity_type: str | None = None,
    entity_id: Any | None = None,
    details: dict | None = None,
    ip_address: str | None = None,
):
    """
    Helper function to log an activity.
    """
    log = ActivityLog(
        shop_id=shop_id,
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=details,
        ip_address=ip_address,
    )
    db.add(log)
    # Don't commit, let the calling route commit
