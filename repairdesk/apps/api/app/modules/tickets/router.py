import uuid

from fastapi import APIRouter, Query

from app.core.dependencies import CurrentUser, DbSession, OwnerUser
from app.modules.tickets import service
from app.modules.tickets.schemas import (
    ConfirmUploadRequest,
    PresignRequest,
    PresignResponse,
    TicketCreate,
    TicketPartCreate,
    TicketStatusUpdate,
    TicketUpdate,
)

router = APIRouter(prefix="/tickets", tags=["Tickets"])


@router.get("", response_model=dict)
async def list_tickets(
    current_user: CurrentUser,
    db: DbSession,
    status: str | None = Query(None),
    customer_id: uuid.UUID | None = Query(None),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List tickets for the current shop with filters."""
    result = await service.list_tickets(
        shop_id=current_user["shop_id"],
        status=status,
        customer_id=customer_id,
        from_date=from_date,
        to_date=to_date,
        search=search,
        page=page,
        per_page=per_page,
        db=db,
    )
    # Serialize decimal fields
    items = []
    for t in result["items"]:
        items.append({
            "id": str(t.id),
            "ticket_number": t.ticket_number,
            "status": t.status,
            "device_type": t.device_type,
            "device_model": t.device_model,
            "reported_issue": t.reported_issue,
            "estimated_cost": str(t.estimated_cost) if t.estimated_cost else None,
            "final_cost": str(t.final_cost) if t.final_cost else None,
            "profit": str(t.profit) if t.profit else None,
            "created_at": t.created_at.isoformat(),
            "updated_at": t.updated_at.isoformat(),
        })
    return {**result, "items": items}


@router.post("", status_code=201)
async def create_ticket(data: TicketCreate, current_user: CurrentUser, db: DbSession):
    """Create a new ticket. Auto-creates customer by phone if not found."""
    ticket = await service.create_ticket(
        shop_id=current_user["shop_id"],
        user_id=current_user["user_id"],
        data=data,
        db=db,
    )
    return {
        "id": str(ticket.id),
        "ticket_number": ticket.ticket_number,
        "status": ticket.status,
        "created_at": ticket.created_at.isoformat(),
    }


@router.get("/{ticket_id}")
async def get_ticket(ticket_id: uuid.UUID, current_user: CurrentUser, db: DbSession):
    """Get full ticket detail with images, parts, and activity log."""
    return await service.get_ticket_detail(
        shop_id=current_user["shop_id"],
        ticket_id=ticket_id,
        db=db,
    )


@router.patch("/{ticket_id}")
async def update_ticket(
    ticket_id: uuid.UUID,
    data: TicketUpdate,
    current_user: CurrentUser,
    db: DbSession,
):
    """Update ticket fields (notes, cost, assigned tech)."""
    ticket = await service.update_ticket(
        shop_id=current_user["shop_id"],
        ticket_id=ticket_id,
        data=data,
        db=db,
    )
    return {
        "id": str(ticket.id),
        "ticket_number": ticket.ticket_number,
        "status": ticket.status,
        "final_cost": str(ticket.final_cost) if ticket.final_cost else None,
        "profit": str(ticket.profit) if ticket.profit else None,
    }


@router.post("/{ticket_id}/status")
async def change_status(
    ticket_id: uuid.UUID,
    data: TicketStatusUpdate,
    current_user: CurrentUser,
    db: DbSession,
):
    """Transition ticket status through the state machine."""
    return await service.change_ticket_status(
        shop_id=current_user["shop_id"],
        ticket_id=ticket_id,
        data=data,
        user_id=current_user["user_id"],
        role=current_user["role"],
        db=db,
    )


@router.post("/{ticket_id}/images/presign", response_model=PresignResponse)
async def presign_upload(
    ticket_id: uuid.UUID,
    data: PresignRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    """Get a presigned URL for direct client-to-MinIO image upload."""
    return await service.presign_image_upload(
        shop_id=current_user["shop_id"],
        ticket_id=ticket_id,
        data=data,
        db=db,
    )


@router.post("/{ticket_id}/images/confirm", status_code=201)
async def confirm_upload(
    ticket_id: uuid.UUID,
    data: ConfirmUploadRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    """Register an uploaded image after client PUT to presigned URL."""
    img = await service.confirm_image_upload(
        shop_id=current_user["shop_id"],
        ticket_id=ticket_id,
        data=data,
        db=db,
    )
    return {"id": str(img.id), "filename": img.filename}


@router.post("/{ticket_id}/parts", status_code=201)
async def add_ticket_part(
    ticket_id: uuid.UUID,
    data: TicketPartCreate,
    current_user: CurrentUser,
    db: DbSession,
):
    """Add a part to a ticket and deduct inventory."""
    part = await service.add_ticket_part(
        shop_id=current_user["shop_id"],
        ticket_id=ticket_id,
        data=data,
        db=db,
    )
    return {
        "id": str(part.id),
        "inventory_item_id": str(part.inventory_item_id),
        "quantity_used": part.quantity_used,
        "unit_purchase_price": str(part.unit_purchase_price),
        "unit_selling_price": str(part.unit_selling_price),
    }


@router.delete("/{ticket_id}/parts/{part_id}", status_code=204)
async def remove_ticket_part(
    ticket_id: uuid.UUID,
    part_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
):
    """Remove a part from a ticket and restore inventory."""
    await service.remove_ticket_part(
        shop_id=current_user["shop_id"],
        ticket_id=ticket_id,
        part_id=part_id,
        db=db,
    )

