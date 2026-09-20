import asyncio
import uuid
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictException, NotFoundException, ValidationException
from app.core.minio import (
    build_ticket_image_key,
    delete_object,
    generate_presigned_download_url,
    generate_presigned_post_policy,
)
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

    # Enforce ticket_limit feature
    from app.modules.billing.service import has_feature
    from app.core.audit_logger import log_limit_blocked
    ticket_limit_val = await has_feature(shop_id, "ticket_limit", db)
    if ticket_limit_val and ticket_limit_val != "unlimited" and ticket_limit_val != "-1":
        if ticket_limit_val.isdigit():
            active_count_result = await db.execute(
                select(func.count()).where(
                    Ticket.shop_id == shop_id,
                    Ticket.is_deleted == False,
                    Ticket.status.in_(["RECEIVED", "IN_PROGRESS", "WAITING_PARTS", "READY"]),
                )
            )
            active_count = active_count_result.scalar_one()
            if active_count >= int(ticket_limit_val):
                log_limit_blocked(
                    str(shop_id), "ticket_limit",
                    int(ticket_limit_val), active_count
                )
                raise ValidationException(
                    f"Ticket limit reached ({ticket_limit_val}). "
                    "Please upgrade your plan or close existing tickets."
                )

    ticket_number = await _next_ticket_number(shop_id, db)

    # Validate assigned_to belongs to this shop
    if data.assigned_to:
        assigned_user_check = await db.execute(
            select(User).where(User.id == data.assigned_to, User.shop_id == shop_id, User.is_active == True)
        )
        if not assigned_user_check.scalar_one_or_none():
            raise ValidationException("Assigned user does not belong to this shop.")

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
        sla_deadline=data.sla_deadline if data.sla_deadline else (
            datetime.now(timezone.utc) + timedelta(hours=data.sla_hours) if data.sla_hours else None
        ),
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

    # Register any pre-uploaded images — strictly validate tenant prefix
    expected_shop_prefix = f"{shop_id}/tickets/"
    for key in data.image_keys:
        if not key.startswith(expected_shop_prefix) or ".." in key:
            raise ValidationException(f"Invalid image key '{key}' for this shop.")
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
        select(Ticket, Customer.name.label("customer_name"), Customer.phone.label("customer_phone"))
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
    
    items = []
    for row in items_result.all():
        ticket, c_name, c_phone = row
        ticket.customer_name = c_name
        ticket.customer_phone = c_phone
        items.append(ticket)

    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": max(1, -(-total // per_page)),
        "items": items,
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
    dump = data.model_dump(exclude_none=True)
    if "assigned_to" in dump and dump["assigned_to"] is not None:
        assigned_user_check = await db.execute(
            select(User).where(User.id == dump["assigned_to"], User.shop_id == shop_id, User.is_active == True)
        )
        if not assigned_user_check.scalar_one_or_none():
            raise ValidationException("Assigned user does not belong to this shop.")
        ticket.assigned_to = dump["assigned_to"]

    if "sla_hours" in dump and dump["sla_hours"] is not None:
        ticket.sla_deadline = datetime.now(timezone.utc) + timedelta(hours=dump["sla_hours"])

    ALLOWED_FIELDS = {"device_model", "technician_notes", "estimated_cost", "final_cost", "pre_repair_checklist", "customer_signature", "warranty_days", "sla_deadline"}
    for field, value in dump.items():
        if field not in ALLOWED_FIELDS:
            continue
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
            # Hold a strong reference to prevent GC before the task completes
            task = asyncio.create_task(AlertService.notify_status_change(
                ticket_number=ticket.ticket_number,
                status=data.status,
                customer_phone=cust.phone,
                customer_email=cust.email
            ))
            task.add_done_callback(lambda _: None)  # Keep ref alive until done
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
    if ticket.estimated_cost is not None:
        ticket.estimated_cost += cost_increase

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
    if ticket.estimated_cost is not None:
        ticket.estimated_cost += charge_amount

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
    if ticket.estimated_cost is not None:
        ticket.estimated_cost -= charge.amount

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
    if ticket.estimated_cost is not None:
        ticket.estimated_cost -= cost_decrease

    await db.delete(part)
    await db.flush()


async def presign_image_upload(
    shop_id: uuid.UUID,
    ticket_id: uuid.UUID,
    data: PresignRequest,
    db: AsyncSession,
) -> dict[str, str | dict]:
    await get_ticket(shop_id, ticket_id, db)
    key = build_ticket_image_key(str(shop_id), str(ticket_id), data.filename)
    return generate_presigned_post_policy(key, data.content_type)


async def confirm_image_upload(
    shop_id: uuid.UUID,
    ticket_id: uuid.UUID,
    data: ConfirmUploadRequest,
    db: AsyncSession,
) -> TicketImage:
    await get_ticket(shop_id, ticket_id, db)
    expected_prefix = f"{shop_id}/tickets/{ticket_id}/"
    if not data.object_key.startswith(expected_prefix) or ".." in data.object_key:
        raise ValidationException("Invalid object key for this ticket.")
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
async def delete_ticket(
    shop_id: uuid.UUID,
    ticket_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    """Permanently delete a ticket, restocking parts and clearing images."""
    # 1. Fetch ticket with lock
    result = await db.execute(
        select(Ticket)
        .where(Ticket.id == ticket_id, Ticket.shop_id == shop_id)
        .with_for_update()
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise NotFoundException("Ticket not found.")

    # 2. Restock inventory parts
    from app.modules.inventory.models import InventoryItem, TicketPart

    parts_result = await db.execute(
        select(TicketPart).where(TicketPart.ticket_id == ticket_id)
    )
    parts = parts_result.scalars().all()

    if parts:
        item_ids = [p.inventory_item_id for p in parts]
        inv_items_result = await db.execute(
            select(InventoryItem)
            .where(InventoryItem.id.in_(item_ids))
            .with_for_update()
        )
        inv_items_map = {item.id: item for item in inv_items_result.scalars().all()}
        for part in parts:
            inv_item = inv_items_map.get(part.inventory_item_id)
            if inv_item:
                inv_item.quantity += part.quantity_used

    # 3. Delete images from MinIO (run sync SDK in thread pool to avoid blocking event loop)
    images_result = await db.execute(
        select(TicketImage).where(TicketImage.ticket_id == ticket_id)
    )
    images = images_result.scalars().all()
    loop = asyncio.get_event_loop()
    for img in images:
        await loop.run_in_executor(None, delete_object, img.minio_key)

    # 4. Physical deletion from DB (Cascade handles related records)
    await db.delete(ticket)
    await db.flush()
