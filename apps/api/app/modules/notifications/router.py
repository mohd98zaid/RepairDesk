import asyncio
import json
import logging
import uuid
from typing import AsyncGenerator
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from jose import JWTError
from sqlalchemy import select

from app.core.config import settings
from app.core.db import AsyncSessionLocal
from app.core.security import decode_token
from app.modules.inventory.models import InventoryItem
from app.modules.tickets.models import Ticket

router = APIRouter(prefix="/notifications", tags=["Notifications"])
logger = logging.getLogger(__name__)


async def _get_sse_user(token: str | None = Query(None)) -> dict:
    """
    Authenticate SSE connections via query parameter token.
    EventSource API does not support custom headers, so we accept the token
    as a query param. This is safe over HTTPS since the token is encrypted in transit.
    """
    if not token:
        raise HTTPException(status_code=401, detail="Missing token.")
    try:
        payload = decode_token(token)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid token type.")
    user_id = payload.get("sub")
    shop_id = payload.get("shop_id")
    role = payload.get("role")
    if not user_id or not shop_id or not role:
        raise HTTPException(status_code=401, detail="Token payload is incomplete.")
    return {"user_id": user_id, "shop_id": shop_id, "role": role}


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
        logger.error(f"SSE Error: {e}")
        yield f"event: error\ndata: Internal error\n\n"


@router.get("/stream")
async def notification_stream(
    token: str | None = Query(None),
):
    """
    Subscribe to real-time notification streams via Server-Sent Events.
    Accepts token as query parameter (EventSource API limitation).
    """
    current_user = await _get_sse_user(token)
    # Fix #2: JWT payload returns shop_id as a string; cast to uuid.UUID for SQLAlchemy
    try:
        shop_uuid = uuid.UUID(current_user["shop_id"])
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid shop_id in token.")
    return StreamingResponse(
        generate_notification_stream(shop_uuid),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive"
        }
    )

