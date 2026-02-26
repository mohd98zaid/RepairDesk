from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import select
from datetime import datetime, date
import uuid
from decimal import Decimal

from app.core.dependencies import CurrentUser, DbSession, OwnerUser
from app.core.exceptions import NotFoundException
from app.modules.shops.models import Shop
from app.modules.shops.schemas import ShopResponse, ShopUpdate

# Import all models for export
from app.modules.customers.models import Customer
from app.modules.tickets.models import Ticket, TicketCharge, TicketImage, TicketStatusLog
from app.modules.inventory.models import InventoryItem, TicketPart, Vendor, PurchaseOrder, PurchaseOrderItem
from app.modules.invoices.models import Invoice
from app.modules.users.models import User

router = APIRouter(prefix="/shops", tags=["Shops"])


from typing import Any

def _serialize(obj):
    """Helper to convert SQLAlchemy obj to dict with JSON-serializable types."""
    d = {}
    for column in obj.__table__.columns:
        val = getattr(obj, column.name)
        if isinstance(val, (datetime, date)):
            val = val.isoformat()
        elif isinstance(val, uuid.UUID):
            val = str(val)
        elif isinstance(val, Decimal):
            val = float(val)
        d[column.name] = val
    return d


@router.get("/me", response_model=ShopResponse)
async def get_my_shop(current_user: CurrentUser, db: DbSession):
    """Get the current user's shop details."""
    result = await db.execute(select(Shop).where(Shop.id == current_user["shop_id"]))
    shop = result.scalar_one_or_none()
    if not shop:
        raise NotFoundException("Shop not found.")
    return shop


@router.patch("/me", response_model=ShopResponse)
async def update_my_shop(data: ShopUpdate, current_user: OwnerUser, db: DbSession):
    """Update the current shop's details (owner only)."""
    result = await db.execute(select(Shop).where(Shop.id == current_user["shop_id"]))
    shop = result.scalar_one_or_none()
    if not shop:
        raise NotFoundException("Shop not found.")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(shop, field, value)

    return shop


@router.get("/export")
async def export_shop_data(current_user: OwnerUser, db: DbSession):
    """Export all shop data as a JSON file (owner only)."""
    shop_id = current_user["shop_id"]

    # Export structure
    export_data: dict[str, Any] = {
        "shop": {},
        "users": [],
        "customers": [],
        "inventory": {
            "items": [],
            "vendors": [],
            "purchase_orders": [],
            "purchase_order_items": []
        },
        "tickets": {
            "data": [],
            "charges": [],
            "parts": [],
            "images": [],
            "status_logs": []
        },
        "invoices": []
    }

    # 1. Shop
    res = await db.execute(select(Shop).where(Shop.id == shop_id))
    shop_obj = res.scalar_one_or_none()
    if shop_obj:
        export_data["shop"] = _serialize(shop_obj)

    # 2. Users
    res = await db.execute(select(User).where(User.shop_id == shop_id))
    export_data["users"] = [_serialize(u) for u in res.scalars().all()]

    # 3. Customers
    res = await db.execute(select(Customer).where(Customer.shop_id == shop_id))
    export_data["customers"] = [_serialize(c) for c in res.scalars().all()]

    # 4. Inventory
    res = await db.execute(select(InventoryItem).where(InventoryItem.shop_id == shop_id))
    export_data["inventory"]["items"] = [_serialize(i) for i in res.scalars().all()]
    res = await db.execute(select(Vendor).where(Vendor.shop_id == shop_id))
    export_data["inventory"]["vendors"] = [_serialize(v) for v in res.scalars().all()]
    
    # 5. Purchase Orders
    res = await db.execute(select(PurchaseOrder).where(PurchaseOrder.shop_id == shop_id))
    pos = res.scalars().all()
    export_data["inventory"]["purchase_orders"] = [_serialize(po) for po in pos]
    if pos:
        po_ids = [po.id for po in pos]
        res = await db.execute(select(PurchaseOrderItem).where(PurchaseOrderItem.po_id.in_(po_ids)))
        export_data["inventory"]["purchase_order_items"] = [_serialize(poi) for poi in res.scalars().all()]

    # 6. Tickets & Related
    res = await db.execute(select(Ticket).where(Ticket.shop_id == shop_id))
    tickets = res.scalars().all()
    export_data["tickets"]["data"] = [_serialize(t) for t in tickets]
    if tickets:
        ticket_ids = [t.id for t in tickets]
        
        res = await db.execute(select(TicketCharge).where(TicketCharge.ticket_id.in_(ticket_ids)))
        export_data["tickets"]["charges"] = [_serialize(tc) for tc in res.scalars().all()]
        
        res = await db.execute(select(TicketPart).where(TicketPart.ticket_id.in_(ticket_ids)))
        export_data["tickets"]["parts"] = [_serialize(tp) for tp in res.scalars().all()]
        
        res = await db.execute(select(TicketImage).where(TicketImage.ticket_id.in_(ticket_ids)))
        export_data["tickets"]["images"] = [_serialize(ti) for ti in res.scalars().all()]
        
        res = await db.execute(select(TicketStatusLog).where(TicketStatusLog.ticket_id.in_(ticket_ids)))
        export_data["tickets"]["status_logs"] = [_serialize(ts) for ts in res.scalars().all()]

    # 7. Invoices
    res = await db.execute(select(Invoice).where(Invoice.shop_id == shop_id))
    export_data["invoices"] = [_serialize(inv) for inv in res.scalars().all()]

    # Return as downloadable JSON file
    headers = {
        "Content-Disposition": f"attachment; filename=repairdesk-export-{datetime.now().strftime('%Y-%m-%d')}.json"
    }
    return JSONResponse(content=export_data, headers=headers)
