from datetime import date

from fastapi import APIRouter, Query

from app.core.dependencies import CurrentUser, DbSession
from app.modules.reports import service

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.get("/daily")
async def daily_report(
    current_user: CurrentUser,
    db: DbSession,
    report_date: date = Query(default_factory=date.today),
):
    """Get aggregated stats for a single day."""
    return await service.get_daily_report(
        shop_id=current_user["shop_id"],
        report_date=report_date,
        db=db,
    )


@router.get("/range")
async def range_report(
    current_user: CurrentUser,
    db: DbSession,
    from_date: date = Query(...),
    to_date: date = Query(default_factory=date.today),
):
    """Get aggregated stats over a date range (max 90 days)."""
    return await service.get_range_report(
        shop_id=current_user["shop_id"],
        from_date=from_date,
        to_date=to_date,
        db=db,
    )
