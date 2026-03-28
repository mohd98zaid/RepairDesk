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
    VendorCreate,
    VendorUpdate,
    VendorResponse,
    PurchaseOrderCreate,
    PurchaseOrderUpdate,
    PurchaseOrderResponse,
    PaginatedInventory,
)

router = APIRouter(tags=["Inventory"])


# ── Inventory endpoints ───────────────────────────────────────────────────────

@router.get("/inventory", response_model=PaginatedInventory)
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


@router.post("/inventory", status_code=201, response_model=InventoryResponse)
async def create_item(data: InventoryCreate, current_user: OwnerUser, db: DbSession):
    """Create a new inventory item (owner only)."""
    item = await service.create_item(current_user["shop_id"], data, db)
    return item


@router.get("/inventory/{item_id}", response_model=InventoryResponse)
async def get_item(item_id: uuid.UUID, current_user: CurrentUser, db: DbSession):
    """Get a single inventory item."""
    item = await service.get_item(current_user["shop_id"], item_id, db)
    return item


@router.patch("/inventory/{item_id}", response_model=InventoryResponse)
async def update_item(
    item_id: uuid.UUID, data: InventoryUpdate, current_user: OwnerUser, db: DbSession
):
    """Update inventory item details (owner only)."""
    item = await service.update_item(current_user["shop_id"], item_id, data, db)
    return item


@router.post("/inventory/{item_id}/stock", response_model=InventoryResponse)
async def adjust_stock(
    item_id: uuid.UUID, data: StockAdjustment, current_user: OwnerUser, db: DbSession
):
    """Adjust stock level (positive = restock, negative = manual deduction). Owner only."""
    item = await service.adjust_stock(current_user["shop_id"], item_id, data, db)
    return item


@router.delete("/inventory/{item_id}", status_code=204)
async def delete_item(
    item_id: uuid.UUID,
    current_user: OwnerUser,
    db: DbSession,
):
    """Soft-delete an inventory item (owner only)."""
    item = await service.get_item(current_user["shop_id"], item_id, db)
    item.is_deleted = True
    await db.flush()


# ── Ticket parts endpoints ─────────────────────────────────────────────────────

@router.get("/tickets/{ticket_id}/parts")
async def get_ticket_parts(
    ticket_id: uuid.UUID, current_user: CurrentUser, db: DbSession
):
    """Get all parts used in a ticket."""
    parts = await service.get_ticket_parts(current_user["shop_id"], ticket_id, db)
    return {"parts": parts}


@router.post("/tickets/{ticket_id}/parts", status_code=201, response_model=TicketPartResponse)
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


# ── Vendor Endpoints ──────────────────────────────────────────────────────────

@router.get("/vendors", response_model=list[VendorResponse])
async def list_vendors(current_user: CurrentUser, db: DbSession):
    """List all vendors."""
    return await service.list_vendors(current_user["shop_id"], db)


@router.get("/vendors/{vendor_id}", response_model=VendorResponse)
async def get_vendor(vendor_id: uuid.UUID, current_user: CurrentUser, db: DbSession):
    """Get a single vendor."""
    return await service.get_vendor(current_user["shop_id"], vendor_id, db)


@router.post("/vendors", response_model=VendorResponse, status_code=201)
async def create_vendor(data: VendorCreate, current_user: OwnerUser, db: DbSession):
    """Create a new vendor."""
    return await service.create_vendor(current_user["shop_id"], data, db)


@router.patch("/vendors/{vendor_id}", response_model=VendorResponse)
async def update_vendor(
    vendor_id: uuid.UUID, data: VendorUpdate, current_user: OwnerUser, db: DbSession
):
    """Update vendor details."""
    return await service.update_vendor(current_user["shop_id"], vendor_id, data, db)


# ── Purchase Order Endpoints ──────────────────────────────────────────────────

@router.get("/purchase-orders", response_model=list[PurchaseOrderResponse])
async def list_purchase_orders(current_user: CurrentUser, db: DbSession):
    """List all purchase orders."""
    return await service.list_purchase_orders(current_user["shop_id"], db)


@router.get("/purchase-orders/{po_id}", response_model=PurchaseOrderResponse)
async def get_purchase_order(po_id: uuid.UUID, current_user: CurrentUser, db: DbSession):
    """Get a single purchase order by ID."""
    return await service.get_purchase_order(current_user["shop_id"], po_id, db)


@router.post("/purchase-orders", response_model=PurchaseOrderResponse, status_code=201)
async def create_purchase_order(data: PurchaseOrderCreate, current_user: OwnerUser, db: DbSession):
    """Create a new purchase order."""
    return await service.create_purchase_order(current_user["shop_id"], data, db)


@router.patch("/purchase-orders/{po_id}", response_model=PurchaseOrderResponse)
async def update_purchase_order(
    po_id: uuid.UUID, data: PurchaseOrderUpdate, current_user: OwnerUser, db: DbSession
):
    """Update purchase order details/status."""
    return await service.update_purchase_order(current_user["shop_id"], po_id, data, db)
