import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import and_, cast, Date, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.tickets.models import Ticket


async def get_daily_report(
    shop_id: uuid.UUID,
    report_date: date,
    db: AsyncSession,
) -> dict[str, Any]:
    """Aggregate ticket stats and financials for a single day."""
    day_start = datetime.combine(report_date, datetime.min.time())
    day_end   = datetime.combine(report_date, datetime.max.time())

    # All tickets created today
    created_q = select(Ticket).where(
        Ticket.shop_id == shop_id,
        Ticket.is_deleted == False,
        Ticket.created_at >= day_start,
        Ticket.created_at <= day_end,
    )
    created_result = await db.execute(created_q)
    created_tickets = created_result.scalars().all()

    # Tickets delivered today (revenue source)
    delivered_q = select(Ticket).where(
        Ticket.shop_id == shop_id,
        Ticket.is_deleted == False,
        Ticket.status == "DELIVERED",
        Ticket.updated_at >= day_start,
        Ticket.updated_at <= day_end,
    )
    delivered_result = await db.execute(delivered_q)
    delivered = delivered_result.scalars().all()

    total_revenue  = sum(t.final_cost or Decimal(0) for t in delivered)
    total_parts    = sum(t.parts_cost or Decimal(0) for t in delivered)
    net_profit     = sum(t.profit or Decimal(0) for t in delivered)

    # Count by status
    status_counts: dict[str, int] = {}
    for t in created_tickets:
        status_counts[t.status] = status_counts.get(t.status, 0) + 1

    return {
        "date": report_date.isoformat(),
        "tickets_created": len(created_tickets),
        "tickets_completed": len(delivered),
        "total_revenue": str(total_revenue),
        "total_parts_cost": str(total_parts),
        "net_profit": str(net_profit),
        "tickets_by_status": status_counts,
        "avg_ticket_value": str(
            total_revenue / len(delivered) if delivered else Decimal(0)
        ),
    }


async def get_range_report(
    shop_id: uuid.UUID,
    from_date: date,
    to_date: date,
    db: AsyncSession,
) -> dict[str, Any]:
    """
    Generate a date-range report with per-day breakdown and totals.
    Capped at 90 days to prevent timeout.
    """
    delta = (to_date - from_date).days
    if delta > 90:
        to_date = from_date + timedelta(days=90)

    days = []
    current = from_date
    totals = {
        "total_revenue": Decimal(0),
        "total_parts_cost": Decimal(0),
        "net_profit": Decimal(0),
        "tickets_created": 0,
        "tickets_completed": 0,
    }

    while current <= to_date:
        day_data = await get_daily_report(shop_id, current, db)
        days.append(day_data)
        totals["total_revenue"]    += Decimal(day_data["total_revenue"])
        totals["total_parts_cost"] += Decimal(day_data["total_parts_cost"])
        totals["net_profit"]       += Decimal(day_data["net_profit"])
        totals["tickets_created"]  += day_data["tickets_created"]
        totals["tickets_completed"] += day_data["tickets_completed"]
        current += timedelta(days=1)

    return {
        "from_date": from_date.isoformat(),
        "to_date": to_date.isoformat(),
        "days": days,
        "totals": {k: str(v) if isinstance(v, Decimal) else v for k, v in totals.items()},
    }
