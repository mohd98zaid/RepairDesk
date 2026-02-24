import uuid

from fastapi import APIRouter, Query

from app.core.dependencies import CurrentUser, DbSession, OwnerUser
from app.modules.inventory import service
from app.modules.inventory.schemas import (
    AddPartRequest,
    InventoryCreate,
    InventoryResponse,
    InventoryUpdate,
    StockAdjustment,
    TicketPartResponse,
)

router = APIRouter(tags=["Inventory"])


# ── Inventory endpoints ───────────────────────────────────────────────────────

@router.get("/inventory", response_model=dict)
async def list_inventory(
    current_user: CurrentUser,
    db: DbSession,
    search: str | None = Query(None),
    low_stock_only: bool = Query(False),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List inventory items with optional search and low-stock filter."""
    result = await service.list_inventory(
        shop_id=current_user["shop_id"],
        search=search,
        low_stock_only=low_stock_only,
        page=page,
        per_page=per_page,
        db=db,
    )
    items = []
    for item in result["items"]:
        items.append({
            "id": str(item.id),
            "shop_id": str(item.shop_id),
            "name": item.name,
            "sku": item.sku,
            "description": item.description,
            "purchase_price": str(item.purchase_price),
            "selling_price": str(item.selling_price),
            "quantity": item.quantity,
            "low_stock_threshold": item.low_stock_threshold,
            "is_low_stock": item.quantity <= item.low_stock_threshold,
            "created_at": item.created_at.isoformat(),
        })
    return {**result, "items": items}


@router.post("/inventory", status_code=201)
async def create_item(data: InventoryCreate, current_user: OwnerUser, db: DbSession):
    """Create a new inventory item (owner only)."""
    item = await service.create_item(current_user["shop_id"], data, db)
    return {
        "id": str(item.id),
        "name": item.name,
        "sku": item.sku,
        "quantity": item.quantity,
        "purchase_price": str(item.purchase_price),
        "selling_price": str(item.selling_price),
        "is_low_stock": item.quantity <= item.low_stock_threshold,
    }


@router.get("/inventory/{item_id}")
async def get_item(item_id: uuid.UUID, current_user: CurrentUser, db: DbSession):
    """Get a single inventory item."""
    item = await service.get_item(current_user["shop_id"], item_id, db)
    return {
        "id": str(item.id),
        "name": item.name,
        "sku": item.sku,
        "description": item.description,
        "purchase_price": str(item.purchase_price),
        "selling_price": str(item.selling_price),
        "quantity": item.quantity,
        "low_stock_threshold": item.low_stock_threshold,
        "is_low_stock": item.quantity <= item.low_stock_threshold,
        "created_at": item.created_at.isoformat(),
    }


@router.patch("/inventory/{item_id}")
async def update_item(
    item_id: uuid.UUID, data: InventoryUpdate, current_user: OwnerUser, db: DbSession
):
    """Update inventory item details (owner only)."""
    item = await service.update_item(current_user["shop_id"], item_id, data, db)
    return {
        "id": str(item.id),
        "name": item.name,
        "quantity": item.quantity,
        "purchase_price": str(item.purchase_price),
        "selling_price": str(item.selling_price),
        "is_low_stock": item.quantity <= item.low_stock_threshold,
    }


@router.post("/inventory/{item_id}/stock")
async def adjust_stock(
    item_id: uuid.UUID, data: StockAdjustment, current_user: OwnerUser, db: DbSession
):
    """Adjust stock level (positive = restock, negative = manual deduction). Owner only."""
    item = await service.adjust_stock(current_user["shop_id"], item_id, data, db)
    return {"id": str(item.id), "name": item.name, "quantity": item.quantity}


# ── Ticket parts endpoints ─────────────────────────────────────────────────────

@router.get("/tickets/{ticket_id}/parts")
async def get_ticket_parts(
    ticket_id: uuid.UUID, current_user: CurrentUser, db: DbSession
):
    """Get all parts used in a ticket."""
    parts = await service.get_ticket_parts(ticket_id, db)
    return {"parts": parts}


@router.post("/tickets/{ticket_id}/parts", status_code=201)
async def add_part_to_ticket(
    ticket_id: uuid.UUID, data: AddPartRequest, current_user: CurrentUser, db: DbSession
):
    """Add a part from inventory to a ticket. Deducts stock automatically."""
    part = await service.add_part_to_ticket(
        shop_id=current_user["shop_id"],
        ticket_id=ticket_id,
        data=data,
        db=db,
    )
    return {
        "id": str(part.id),
        "inventory_item_id": str(part.inventory_item_id),
        "quantity_used": part.quantity_used,
        "unit_selling_price": str(part.unit_selling_price),
        "unit_purchase_price": str(part.unit_purchase_price),
    }


@router.delete("/tickets/{ticket_id}/parts/{part_id}", status_code=204)
async def remove_part_from_ticket(
    ticket_id: uuid.UUID, part_id: uuid.UUID, current_user: CurrentUser, db: DbSession
):
    """Remove a part from a ticket. Restores stock."""
    await service.remove_part_from_ticket(
        shop_id=current_user["shop_id"],
        ticket_id=ticket_id,
        part_id=part_id,
        db=db,
    )
