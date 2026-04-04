import asyncio
import json
import logging
import secrets
import uuid
from typing import AsyncGenerator
from fastapi import APIRouter, Cookie, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from jose import JWTError
from sqlalchemy import select

from app.core.config import settings
from app.core.db import AsyncSessionLocal
from app.core.security import decode_token
from app.core.redis import get_redis
from app.modules.inventory.models import InventoryItem
from app.modules.tickets.models import Ticket
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

router = APIRouter(prefix="/notifications", tags=["Notifications"])
logger = logging.getLogger(__name__)


@router.post("/sse-token", status_code=200)
async def create_sse_token(
    request: Request,
    repairdesk_access: str | None = Cookie(default=None),
):
    """
    Issue a short-lived (60s) single-use SSE token.
    The client fetches this via normal authenticated API call (Cookie),
    then opens EventSource with ?sse_token=... instead of ?token=<JWT>.

    This prevents the access JWT from appearing in server logs, browser history,
    and Referer headers.
    """
    authorization = request.headers.get("Authorization")
    token = None
    if repairdesk_access:
        token = repairdesk_access
    elif authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]

    if not token:
        raise HTTPException(status_code=401, detail="Missing authentication token.")

    try:
        payload = decode_token(token)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid token type.")

    user_id = payload.get("sub")
    shop_id = payload.get("shop_id")
    if not user_id or not shop_id:
        raise HTTPException(status_code=401, detail="Token payload is incomplete.")

    # Generate a short-lived SSE token
    sse_token = secrets.token_urlsafe(32)
    redis = await get_redis()
    # Store shop_id + user_id for 60 seconds — single use
    await redis.setex(f"sse:{sse_token}", 60, json.dumps({"user_id": user_id, "shop_id": shop_id}))

    return {"sse_token": sse_token}


async def _validate_sse_token(sse_token: str) -> dict:
    """Validate a short-lived SSE token and consume it."""
    redis = await get_redis()
    raw = await redis.get(f"sse:{sse_token}")
    if not raw:
        raise HTTPException(status_code=401, detail="SSE token is invalid or expired.")
    # Consume the token (single-use)
    await redis.delete(f"sse:{sse_token}")
    return json.loads(raw)


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
    sse_token: str | None = Query(None),
):
    """
    Subscribe to real-time notification streams via Server-Sent Events.
    Uses a short-lived SSE token (from POST /notifications/sse-token) instead
    of the access JWT, preventing token leakage in logs and browser history.
    """
    if not sse_token:
        raise HTTPException(status_code=401, detail="Missing sse_token parameter.")

    current_user = await _validate_sse_token(sse_token)
    try:
        shop_uuid = uuid.UUID(current_user["shop_id"])
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid shop_id in token.")
    return StreamingResponse(
        generate_notification_stream(shop_uuid),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "Connection": "keep-alive",
        }
    )

