import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictException, NotFoundException, ValidationException
from app.core.minio import build_ticket_image_key, generate_presigned_download_url, generate_presigned_upload_url
from app.modules.customers.service import get_or_create_customer
from app.modules.tickets.models import Ticket, TicketImage, TicketStatusLog
from app.modules.tickets.schemas import (
    ConfirmUploadRequest,
    PresignRequest,
    TicketCreate,
    TicketPartCreate,
    TicketChargeCreate,
    TicketStatusUpdate,
    TicketUpdate,
)
from app.modules.tickets.state_machine import validate_transition
from app.modules.users.models import User
from app.modules.notifications.alerts import AlertService


async def _next_ticket_number(shop_id: uuid.UUID, db: AsyncSession) -> int:
    """Get the next ticket number for a shop (max + 1).
    Uses a row-level FOR UPDATE lock on the Shop to prevent race conditions.
    """
    from app.modules.shops.models import Shop
    await db.execute(select(Shop.id).where(Shop.id == shop_id).with_for_update())

    result = await db.execute(
        select(func.max(Ticket.ticket_number))
        .where(Ticket.shop_id == shop_id)
    )
    max_num = result.scalar_one_or_none()
    return (max_num or 0) + 1


async def create_ticket(
    shop_id: uuid.UUID,
    user_id: uuid.UUID,
    data: TicketCreate,
    db: AsyncSession,
) -> Ticket:
    # Resolve customer
    if data.customer_id:
        from sqlalchemy import select
        from app.modules.customers.models import Customer
        result = await db.execute(
            select(Customer).where(Customer.id == data.customer_id, Customer.shop_id == shop_id)
        )
        customer = result.scalar_one_or_none()
        if not customer:
            raise NotFoundException("Customer not found.")
    elif data.customer_phone:
        name = data.customer_name or "Unknown"
        customer = await get_or_create_customer(shop_id, data.customer_phone, name, db)
    else:
        raise ValidationException("Provide either customer_id or customer_phone.")

    ticket_number = await _next_ticket_number(shop_id, db)

    ticket = Ticket(
        shop_id=shop_id,
        customer_id=customer.id,
        created_by=user_id,
        assigned_to=data.assigned_to,
        ticket_number=ticket_number,
        device_type=data.device_type,
        device_model=data.device_model,
        reported_issue=data.reported_issue,
        estimated_cost=Decimal(data.estimated_cost) if data.estimated_cost else None,
        pre_repair_checklist=data.pre_repair_checklist,
        customer_signature=data.customer_signature,
        warranty_days=data.warranty_days,
        status="RECEIVED",
    )
    db.add(ticket)
    await db.flush()

    # Create initial status log
    log = TicketStatusLog(
        ticket_id=ticket.id,
        from_status=None,
        to_status="RECEIVED",
        changed_by=user_id,
    )
    db.add(log)

    # Register any pre-uploaded images
    for key in data.image_keys:
        img = TicketImage(
            ticket_id=ticket.id,
            minio_key=key,
            filename=key.split("/")[-1],
        )
        db.add(img)

    await db.flush()
    return ticket


async def list_tickets(
    shop_id: uuid.UUID,
    status: str | None,
    customer_id: uuid.UUID | None,
    from_date: str | None,
    to_date: str | None,
    search: str | None,
    page: int,
    per_page: int,
    db: AsyncSession,
) -> dict[str, Any]:
    from app.modules.customers.models import Customer

    base_q = (
        select(Ticket)
        .join(Customer, Ticket.customer_id == Customer.id)
        .where(Ticket.shop_id == shop_id, Ticket.is_deleted == False)
    )
    if status:
        base_q = base_q.where(Ticket.status == status)
    if customer_id:
        base_q = base_q.where(Ticket.customer_id == customer_id)
    if from_date:
        from_dt = datetime.strptime(from_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        base_q = base_q.where(Ticket.created_at >= from_dt)
    if to_date:
        to_dt = datetime.strptime(to_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)
        base_q = base_q.where(Ticket.created_at <= to_dt)
    if search:
        base_q = base_q.where(Customer.name.ilike(f"%{search}%"))

    count_result = await db.execute(
        select(func.count()).select_from(base_q.subquery())
    )
    total = count_result.scalar_one()

    offset = (page - 1) * per_page
    items_result = await db.execute(
        base_q.order_by(Ticket.created_at.desc()).offset(offset).limit(per_page)
    )
    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": max(1, -(-total // per_page)),
        "items": items_result.scalars().all(),
    }


async def get_ticket(shop_id: uuid.UUID, ticket_id: uuid.UUID, db: AsyncSession) -> Ticket:
    result = await db.execute(
        select(Ticket).where(
            Ticket.id == ticket_id,
            Ticket.shop_id == shop_id,
            Ticket.is_deleted == False,
        )
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise NotFoundException("Ticket not found.")
    return ticket


async def update_ticket(
    shop_id: uuid.UUID,
    ticket_id: uuid.UUID,
    data: TicketUpdate,
    db: AsyncSession,
) -> Ticket:
    ticket = await get_ticket(shop_id, ticket_id, db)
    for field, value in data.model_dump(exclude_none=True).items():
        if field in ("estimated_cost", "final_cost") and value is not None:
            setattr(ticket, field, Decimal(value))
        else:
            setattr(ticket, field, value)

    # Recompute profit when final_cost changes
    if data.final_cost is not None and ticket.final_cost is not None:
        ticket.profit = ticket.final_cost - ticket.parts_cost

    return ticket


async def change_ticket_status(
    shop_id: uuid.UUID,
    ticket_id: uuid.UUID,
    data: TicketStatusUpdate,
    user_id: uuid.UUID,
    role: str,
    db: AsyncSession,
) -> dict[str, Any]:
    ticket = await get_ticket(shop_id, ticket_id, db)
    validate_transition(ticket.status, data.status, role)

    old_status = ticket.status
    ticket.status = data.status

    if data.status == "DELIVERED" and ticket.final_cost is None:
        await db.refresh(ticket, ['charges'])
        computed_final_cost = (ticket.parts_cost or Decimal(0)) + sum(c.amount for c in ticket.charges)
        ticket.final_cost = computed_final_cost
        ticket.profit = computed_final_cost - (ticket.parts_cost or Decimal(0))

    log = TicketStatusLog(
        ticket_id=ticket.id,
        from_status=old_status,
        to_status=data.status,
        notes=data.notes,
        changed_by=user_id,
    )
    db.add(log)
    await db.flush()  # Make log visible to subsequent queries in the same session

    # Safely trigger Twilio / SendGrid updates
    try:
        from app.modules.customers.models import Customer
        import asyncio
        cust_res = await db.execute(select(Customer).where(Customer.id == ticket.customer_id))
        cust = cust_res.scalar_one_or_none()
        if cust and old_status != data.status:
            asyncio.create_task(AlertService.notify_status_change(
                ticket_number=ticket.ticket_number,
                status=data.status,
                customer_phone=cust.phone,
                customer_email=cust.email
            ))
    except Exception as e:
        import logging
        logging.error(f"Failed to trigger alerts: {e}")

    return {"status": data.status, "logged_at": log.changed_at}


async def add_ticket_part(
    shop_id: uuid.UUID,
    ticket_id: uuid.UUID,
    data: TicketPartCreate,
    db: AsyncSession,
):
    from app.modules.inventory.models import InventoryItem, TicketPart

    ticket = await get_ticket(shop_id, ticket_id, db)

    # Lock inventory item for update
    item_result = await db.execute(
        select(InventoryItem)
        .where(
            InventoryItem.id == data.inventory_item_id,
            InventoryItem.shop_id == shop_id,
            InventoryItem.is_deleted == False
        )
        .with_for_update()
    )
    item = item_result.scalar_one_or_none()
    if not item:
        raise NotFoundException("Inventory item not found.")

    if item.quantity < data.quantity_used:
        raise ConflictException(f"Insufficient stock. Only {item.quantity} remaining.")

    # Deduct stock
    item.quantity -= data.quantity_used

    # Create ticket part record
    part = TicketPart(
        ticket_id=ticket.id,
        inventory_item_id=item.id,
        quantity_used=data.quantity_used,
        unit_purchase_price=item.purchase_price,
        unit_selling_price=item.selling_price,
    )
    db.add(part)

    # Update ticket parts_cost and profit
    cost_increase = item.selling_price * data.quantity_used
    ticket.parts_cost += cost_increase
    if ticket.final_cost is not None:
        ticket.profit = ticket.final_cost - ticket.parts_cost

    await db.flush()
    return part


async def add_ticket_charge(
    shop_id: uuid.UUID,
    ticket_id: uuid.UUID,
    data: TicketChargeCreate,
    db: AsyncSession,
):
    from app.modules.tickets.models import TicketCharge

    ticket = await get_ticket(shop_id, ticket_id, db)

    charge_amount = Decimal(data.amount)

    # Create charge record
    charge = TicketCharge(
        ticket_id=ticket.id,
        name=data.name,
        amount=charge_amount,
    )
    db.add(charge)

    # Automatically add this charge amount to the ticket's final_cost if it is populated
    if ticket.final_cost is not None:
        ticket.final_cost += charge_amount
        ticket.profit = ticket.final_cost - ticket.parts_cost

    await db.flush()
    return charge


async def remove_ticket_charge(
    shop_id: uuid.UUID,
    ticket_id: uuid.UUID,
    charge_id: uuid.UUID,
    db: AsyncSession,
):
    from app.modules.tickets.models import TicketCharge

    ticket = await get_ticket(shop_id, ticket_id, db)

    charge_result = await db.execute(
        select(TicketCharge).where(TicketCharge.id == charge_id, TicketCharge.ticket_id == ticket.id)
    )
    charge = charge_result.scalar_one_or_none()
    if not charge:
        raise NotFoundException("Ticket charge not found.")

    # Remove this charge amount from the ticket's final_cost if it is populated
    if ticket.final_cost is not None:
        ticket.final_cost -= charge.amount
        ticket.profit = ticket.final_cost - ticket.parts_cost

    await db.delete(charge)
    await db.flush()


async def remove_ticket_part(
    shop_id: uuid.UUID,
    ticket_id: uuid.UUID,
    part_id: uuid.UUID,
    db: AsyncSession,
):
    from app.modules.inventory.models import InventoryItem, TicketPart

    ticket = await get_ticket(shop_id, ticket_id, db)

    part_result = await db.execute(
        select(TicketPart).where(TicketPart.id == part_id, TicketPart.ticket_id == ticket.id)
    )
    part = part_result.scalar_one_or_none()
    if not part:
        raise NotFoundException("Ticket part not found.")

    # Restore stock
    item_result = await db.execute(
        select(InventoryItem)
        .where(InventoryItem.id == part.inventory_item_id)
        .with_for_update()
    )
    item = item_result.scalar_one_or_none()
    if item:
        item.quantity += part.quantity_used

    # Update ticket parts_cost and profit
    cost_decrease = part.unit_selling_price * part.quantity_used
    ticket.parts_cost -= cost_decrease
    if ticket.final_cost is not None:
        ticket.profit = ticket.final_cost - ticket.parts_cost

    await db.delete(part)
    await db.flush()


async def presign_image_upload(
    shop_id: uuid.UUID,
    ticket_id: uuid.UUID,
    data: PresignRequest,
    db: AsyncSession,
) -> dict[str, str]:
    await get_ticket(shop_id, ticket_id, db)
    key = build_ticket_image_key(str(shop_id), str(ticket_id), data.filename)
    url = generate_presigned_upload_url(key, data.content_type)
    return {"upload_url": url, "object_key": key}


async def confirm_image_upload(
    shop_id: uuid.UUID,
    ticket_id: uuid.UUID,
    data: ConfirmUploadRequest,
    db: AsyncSession,
) -> TicketImage:
    await get_ticket(shop_id, ticket_id, db)
    img = TicketImage(
        ticket_id=ticket_id,
        minio_key=data.object_key,
        filename=data.filename,
        size_bytes=data.size_bytes,
    )
    db.add(img)
    await db.flush()
    return img


async def get_ticket_detail(
    shop_id: uuid.UUID,
    ticket_id: uuid.UUID,
    db: AsyncSession,
) -> dict[str, Any]:
    """Return a full ticket detail including images, parts, and status logs."""
    ticket = await get_ticket(shop_id, ticket_id, db)

    # Images (with presigned download URLs)
    images_result = await db.execute(
        select(TicketImage).where(TicketImage.ticket_id == ticket_id)
    )
    images = []
    for img in images_result.scalars().all():
        try:
            url = generate_presigned_download_url(img.minio_key)
        except Exception:
            url = ""
        images.append({"id": img.id, "url": url, "filename": img.filename})

    # Status logs with user name
    logs_result = await db.execute(
        select(TicketStatusLog, User.full_name)
        .join(User, TicketStatusLog.changed_by == User.id)
        .where(TicketStatusLog.ticket_id == ticket_id)
        .order_by(TicketStatusLog.changed_at.asc())
    )
    logs = []
    for log, full_name in logs_result.all():
        logs.append({
            "from_status": log.from_status,
            "to_status": log.to_status,
            "notes": log.notes,
            "changed_by": full_name,
            "changed_at": log.changed_at,
        })

    # Customer
    from app.modules.customers.models import Customer
    cust_result = await db.execute(select(Customer).where(Customer.id == ticket.customer_id))
    customer = cust_result.scalar_one_or_none()

    # Assigned user
    assigned = None
    if ticket.assigned_to:
        u_result = await db.execute(select(User).where(User.id == ticket.assigned_to))
        u = u_result.scalar_one_or_none()
        if u:
            assigned = {"id": u.id, "full_name": u.full_name}

    from app.modules.inventory.models import InventoryItem, TicketPart
    parts_result = await db.execute(
        select(TicketPart, InventoryItem.name)
        .join(InventoryItem, TicketPart.inventory_item_id == InventoryItem.id)
        .where(TicketPart.ticket_id == ticket_id)
    )
    parts = []
    for p, name in parts_result.all():
        parts.append({
            "id": p.id,
            "inventory_item_id": p.inventory_item_id,
            "name": name,
            "quantity_used": p.quantity_used,
            "unit_purchase_price": str(p.unit_purchase_price),
            "unit_selling_price": str(p.unit_selling_price),
        })

    ticket_dict = {k: v for k, v in ticket.__dict__.items() if not k.startswith("_")}
    
    # Format customer
    cust_data = None
    if customer:
        cust_data = {k: v for k, v in customer.__dict__.items() if not k.startswith("_")}
        # Convert UUID fields if necessary, though FastAPI handles UUID serialization usually.

    return {
        **ticket_dict,
        "customer": cust_data,
        "assigned_to": assigned,
        "images": images,
        "parts": parts,
        "status_logs": logs,
        "estimated_cost": str(ticket.estimated_cost) if ticket.estimated_cost else None,
        "final_cost": str(ticket.final_cost) if ticket.final_cost else None,
        "parts_cost": str(ticket.parts_cost),
        "profit": str(ticket.profit) if ticket.profit else None,
    }
