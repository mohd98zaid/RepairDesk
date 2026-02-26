import asyncio
import json
import uuid
from typing import AsyncGenerator
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from app.core.db import AsyncSessionLocal
from app.core.dependencies import get_current_user, CurrentUser
from app.modules.inventory.models import InventoryItem
from app.modules.tickets.models import Ticket

router = APIRouter(prefix="/notifications", tags=["Notifications"])


async def generate_notification_stream(shop_id: uuid.UUID) -> AsyncGenerator[str, None]:
    """
    Generator that pushes Server-Sent Events (SSE) to the client.
    Uses a fresh DB session for each poll cycle to avoid connection pool exhaustion.
    """
    try:
        while True:
            # Create a fresh session for each poll to avoid holding connections
            async with AsyncSessionLocal() as db:
                # 1. Check Low Stock Items
                inv_stmt = select(InventoryItem).where(
                    InventoryItem.shop_id == shop_id,
                    InventoryItem.is_deleted == False,
                )
                inv_res = await db.execute(inv_stmt)
                items = inv_res.scalars().all()
                low_stock_items = [i for i in items if i.quantity <= (i.low_stock_threshold or 5)]

                # 2. Check Ready Tickets
                ticket_stmt = select(Ticket).where(
                    Ticket.shop_id == shop_id,
                    Ticket.status == "READY",
                    Ticket.is_deleted == False,
                )
                ticket_res = await db.execute(ticket_stmt)
                ready_tickets = ticket_res.scalars().all()

            # Construct Notifications Payload (outside DB session)
            notifications = []
            if low_stock_items:
                notifications.append({
                    "id": "low_stock",
                    "type": "low_stock",
                    "title": "Low Stock Alert",
                    "desc": f"{len(low_stock_items)} item(s) need restocking",
                    "href": "/inventory"
                })

            if ready_tickets:
                notifications.append({
                    "id": "ready",
                    "type": "ready",
                    "title": "Ready for Pickup",
                    "desc": f"{len(ready_tickets)} ticket(s) waiting for customer",
                    "href": "/tickets?status=READY"
                })

            # Send event payload to client
            data = json.dumps({"notifications": notifications})
            yield f"data: {data}\n\n"

            # Wait before next state check
            await asyncio.sleep(30)

    except asyncio.CancelledError:
        # Client disconnected
        pass
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"SSE Error: {e}")
        yield f"event: error\ndata: {str(e)}\n\n"


@router.get("/stream")
async def notification_stream(
    current_user: CurrentUser,
):
    """
    Subscribe to real-time notification streams via Server-Sent Events.
    """
    return StreamingResponse(
        generate_notification_stream(current_user["shop_id"]),
        media_type="text/event-stream",
    )

