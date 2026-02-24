import uuid
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictException, NotFoundException, ValidationException
from app.modules.inventory.models import InventoryItem, TicketPart
from app.modules.inventory.schemas import (
    AddPartRequest,
    InventoryCreate,
    InventoryUpdate,
    StockAdjustment,
)
from app.modules.tickets.models import Ticket


# ── Inventory CRUD ────────────────────────────────────────────────────────────

async def list_inventory(
    shop_id: uuid.UUID,
    search: str | None,
    low_stock_only: bool,
    page: int,
    per_page: int,
    db: AsyncSession,
) -> dict[str, Any]:
    base_q = select(InventoryItem).where(
        InventoryItem.shop_id == shop_id,
        InventoryItem.is_deleted == False,
    )
    if search:
        base_q = base_q.where(
            InventoryItem.name.ilike(f"%{search}%")
        )
    if low_stock_only:
        base_q = base_q.where(
            InventoryItem.quantity <= InventoryItem.low_stock_threshold
        )

    # Low-stock count (always — for dashboard badge)
    low_stock_count_result = await db.execute(
        select(func.count()).select_from(
            select(InventoryItem).where(
                InventoryItem.shop_id == shop_id,
                InventoryItem.is_deleted == False,
                InventoryItem.quantity <= InventoryItem.low_stock_threshold,
            ).subquery()
        )
    )
    low_stock_count = low_stock_count_result.scalar_one()

    count_result = await db.execute(
        select(func.count()).select_from(base_q.subquery())
    )
    total = count_result.scalar_one()

    offset = (page - 1) * per_page
    items_result = await db.execute(
        base_q.order_by(InventoryItem.name.asc()).offset(offset).limit(per_page)
    )
    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": max(1, -(-total // per_page)),
        "items": items_result.scalars().all(),
        "low_stock_count": low_stock_count,
    }


async def get_item(shop_id: uuid.UUID, item_id: uuid.UUID, db: AsyncSession) -> InventoryItem:
    result = await db.execute(
        select(InventoryItem).where(
            InventoryItem.id == item_id,
            InventoryItem.shop_id == shop_id,
            InventoryItem.is_deleted == False,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundException("Inventory item not found.")
    return item


async def create_item(
    shop_id: uuid.UUID, data: InventoryCreate, db: AsyncSession
) -> InventoryItem:
    item = InventoryItem(
        shop_id=shop_id,
        name=data.name,
        sku=data.sku,
        description=data.description,
        purchase_price=Decimal(data.purchase_price),
        selling_price=Decimal(data.selling_price),
        quantity=data.quantity,
        low_stock_threshold=data.low_stock_threshold,
    )
    db.add(item)
    await db.flush()
    return item


async def update_item(
    shop_id: uuid.UUID,
    item_id: uuid.UUID,
    data: InventoryUpdate,
    db: AsyncSession,
) -> InventoryItem:
    item = await get_item(shop_id, item_id, db)
    updates = data.model_dump(exclude_none=True)
    for field, value in updates.items():
        if field in ("purchase_price", "selling_price"):
            setattr(item, field, Decimal(value))
        else:
            setattr(item, field, value)
    return item


async def adjust_stock(
    shop_id: uuid.UUID,
    item_id: uuid.UUID,
    data: StockAdjustment,
    db: AsyncSession,
) -> InventoryItem:
    item = await get_item(shop_id, item_id, db)
    new_qty = item.quantity + data.delta
    if new_qty < 0:
        raise ValidationException(
            f"Cannot reduce stock below zero. Current: {item.quantity}, delta: {data.delta}."
        )
    item.quantity = new_qty
    return item


# ── Ticket parts integration ──────────────────────────────────────────────────

async def add_part_to_ticket(
    shop_id: uuid.UUID,
    ticket_id: uuid.UUID,
    data: AddPartRequest,
    db: AsyncSession,
) -> TicketPart:
    """
    Add a part to a ticket:
    1. Verify inventory item belongs to the shop
    2. Verify sufficient stock
    3. Deduct stock from inventory
    4. Create TicketPart record (snapshotting prices)
    5. Recalculate ticket.parts_cost and profit
    """
    # Get inventory item
    item = await get_item(shop_id, data.inventory_item_id, db)

    if item.quantity < data.quantity_used:
        raise ValidationException(
            f"Insufficient stock for '{item.name}'. "
            f"Available: {item.quantity}, requested: {data.quantity_used}."
        )

    # Get ticket (verifying shop ownership)
    ticket_result = await db.execute(
        select(Ticket).where(
            Ticket.id == ticket_id,
            Ticket.shop_id == shop_id,
            Ticket.is_deleted == False,
        )
    )
    ticket = ticket_result.scalar_one_or_none()
    if not ticket:
        raise NotFoundException("Ticket not found.")

    # Deduct stock
    item.quantity -= data.quantity_used

    # Create part usage record (snapshot prices)
    part = TicketPart(
        ticket_id=ticket_id,
        inventory_item_id=item.id,
        quantity_used=data.quantity_used,
        unit_purchase_price=item.purchase_price,
        unit_selling_price=item.selling_price,
    )
    db.add(part)
    await db.flush()

    # Recalculate ticket.parts_cost
    await _recalculate_ticket_costs(ticket, db)

    return part


async def remove_part_from_ticket(
    shop_id: uuid.UUID,
    ticket_id: uuid.UUID,
    part_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    """Remove a part line, restore stock, and recalculate costs."""
    part_result = await db.execute(
        select(TicketPart).where(TicketPart.id == part_id, TicketPart.ticket_id == ticket_id)
    )
    part = part_result.scalar_one_or_none()
    if not part:
        raise NotFoundException("Part not found on this ticket.")

    # Restore stock
    item_result = await db.execute(
        select(InventoryItem).where(InventoryItem.id == part.inventory_item_id)
    )
    item = item_result.scalar_one_or_none()
    if item:
        item.quantity += part.quantity_used

    await db.delete(part)
    await db.flush()

    # Recalculate
    ticket_result = await db.execute(
        select(Ticket).where(Ticket.id == ticket_id, Ticket.shop_id == shop_id)
    )
    ticket = ticket_result.scalar_one_or_none()
    if ticket:
        await _recalculate_ticket_costs(ticket, db)


async def get_ticket_parts(
    ticket_id: uuid.UUID, db: AsyncSession
) -> list[dict[str, Any]]:
    """Get all parts for a ticket with inventory item names."""
    result = await db.execute(
        select(TicketPart, InventoryItem.name)
        .join(InventoryItem, TicketPart.inventory_item_id == InventoryItem.id)
        .where(TicketPart.ticket_id == ticket_id)
        .order_by(TicketPart.created_at.asc())
    )
    parts = []
    for part, name in result.all():
        line_total = part.quantity_used * part.unit_selling_price
        parts.append({
            "id": part.id,
            "inventory_item_id": part.inventory_item_id,
            "name": name,
            "quantity_used": part.quantity_used,
            "unit_selling_price": str(part.unit_selling_price),
            "unit_purchase_price": str(part.unit_purchase_price),
            "line_total": str(line_total),
        })
    return parts


async def _recalculate_ticket_costs(ticket: Ticket, db: AsyncSession) -> None:
    """
    Recalculate parts_cost (sum of purchase_price * qty) and profit
    (final_cost - parts_cost) for a ticket.
    """
    parts_result = await db.execute(
        select(TicketPart).where(TicketPart.ticket_id == ticket.id)
    )
    parts = parts_result.scalars().all()

    parts_cost = sum(p.unit_purchase_price * p.quantity_used for p in parts)
    ticket.parts_cost = parts_cost

    if ticket.final_cost is not None:
        ticket.profit = ticket.final_cost - parts_cost
