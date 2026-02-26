import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import and_, cast, Date, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.tickets.models import Ticket, TicketCharge
from sqlalchemy.orm import selectinload


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
    delivered_q = select(Ticket).options(selectinload(Ticket.charges)).where(
        Ticket.shop_id == shop_id,
        Ticket.is_deleted == False,
        Ticket.status == "DELIVERED",
        Ticket.updated_at >= day_start,
        Ticket.updated_at <= day_end,
    )
    delivered_result = await db.execute(delivered_q)
    delivered = delivered_result.scalars().all()

    total_revenue = Decimal(0)
    total_parts = Decimal(0)
    net_profit = Decimal(0)

    for t in delivered:
        t_final = t.final_cost
        if t_final is None:
            t_final = (t.parts_cost or Decimal(0)) + sum(c.amount for c in t.charges)
        t_profit = t.profit
        if t_profit is None:
            t_profit = t_final - (t.parts_cost or Decimal(0))
            
        total_revenue += t_final
        total_parts += (t.parts_cost or Decimal(0))
        net_profit += t_profit

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
    Uses exactly 2 SQL queries for the entire range to avoid N+1 issues.
    Capped at 90 days to prevent timeout.
    """
    delta = (to_date - from_date).days
    if delta > 90:
        to_date = from_date + timedelta(days=90)

    range_start = datetime.combine(from_date, datetime.min.time())
    range_end   = datetime.combine(to_date, datetime.max.time())

    # 1. Fetch all created tickets in the date range
    created_q = select(Ticket.created_at, Ticket.status).where(
        Ticket.shop_id == shop_id,
        Ticket.is_deleted == False,
        Ticket.created_at >= range_start,
        Ticket.created_at <= range_end,
    )
    created_result = await db.execute(created_q)
    
    created_by_date = {} 
    for created_at, status in created_result.all():
        d_str = created_at.date().isoformat()
        if d_str not in created_by_date:
            created_by_date[d_str] = {"total": 0, "status_counts": {}}
        created_by_date[d_str]["total"] += 1
        created_by_date[d_str]["status_counts"][status] = created_by_date[d_str]["status_counts"].get(status, 0) + 1

    # 2. Fetch all delivered tickets in the date range
    delivered_q = select(Ticket).options(selectinload(Ticket.charges)).where(
        Ticket.shop_id == shop_id,
        Ticket.is_deleted == False,
        Ticket.status == "DELIVERED",
        Ticket.updated_at >= range_start,
        Ticket.updated_at <= range_end,
    )
    delivered_result = await db.execute(delivered_q)
    
    delivered_by_date = {}
    for t in delivered_result.scalars().all():
        d_str = t.updated_at.date().isoformat()
        if d_str not in delivered_by_date:
            delivered_by_date[d_str] = []
        delivered_by_date[d_str].append(t)

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
        d_str = current.isoformat()
        c_stats = created_by_date.get(d_str, {"total": 0, "status_counts": {}})
        d_tickets = delivered_by_date.get(d_str, [])
        
        day_revenue = Decimal(0)
        day_parts = Decimal(0)
        day_profit = Decimal(0)
        
        for t in d_tickets:
            t_final = t.final_cost
            if t_final is None:
                t_final = (t.parts_cost or Decimal(0)) + sum(c.amount for c in t.charges)
            t_profit = t.profit
            if t_profit is None:
                t_profit = t_final - (t.parts_cost or Decimal(0))
                
            day_revenue += t_final
            day_parts += (t.parts_cost or Decimal(0))
            day_profit += t_profit
            
        day_data = {
            "date": d_str,
            "tickets_created": c_stats["total"],
            "tickets_completed": len(d_tickets),
            "total_revenue": str(day_revenue),
            "total_parts_cost": str(day_parts),
            "net_profit": str(day_profit),
            "tickets_by_status": c_stats["status_counts"],
            "avg_ticket_value": str(day_revenue / len(d_tickets) if d_tickets else Decimal(0)),
        }
        days.append(day_data)
        
        totals["total_revenue"]    += day_revenue
        totals["total_parts_cost"] += day_parts
        totals["net_profit"]       += day_profit
        totals["tickets_created"]  += c_stats["total"]
        totals["tickets_completed"] += len(d_tickets)
        
        current += timedelta(days=1)

    return {
        "from_date": from_date.isoformat(),
        "to_date": to_date.isoformat(),
        "days": days,
        "totals": {k: str(v) if isinstance(v, Decimal) else v for k, v in totals.items()},
    }


async def get_revenue_breakdown(
    shop_id: uuid.UUID,
    db: AsyncSession,
) -> dict[str, Any]:
    """
    Get the all-time combined revenue from all delivered tickets, 
    broken down into parts_revenue and specific charge names.
    """
    
    # Query all active tickets with their charges for the shop
    q = select(Ticket).options(selectinload(Ticket.charges)).where(
        Ticket.shop_id == shop_id,
        Ticket.is_deleted == False,
        Ticket.status != "CANCELLED"
    )
    result = await db.execute(q)
    tickets = result.scalars().all()
    
    total_revenue = Decimal(0)
    parts_revenue = Decimal(0)
    charges_breakdown: dict[str, Decimal] = {}
    
    for t in tickets:
        t_final = t.final_cost
        if t_final is None:
            t_final = (t.parts_cost or Decimal(0)) + sum(c.amount for c in t.charges)
            
        total_revenue += t_final
        parts_revenue += t.parts_cost or Decimal(0)
        for c in t.charges:
            # Group charges by name
            charges_breakdown[c.name] = charges_breakdown.get(c.name, Decimal(0)) + c.amount
            
    # Convert Decimals to strings for JSON serialization
    return {
        "total_revenue": str(total_revenue),
        "parts_revenue": str(parts_revenue),
        "charges_breakdown": {name: str(amt) for name, amt in charges_breakdown.items()}
    }
