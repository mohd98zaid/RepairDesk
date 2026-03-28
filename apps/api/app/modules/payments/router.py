import logging
from fastapi import APIRouter, Request, Response, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_db
from app.core.dependencies import CurrentUser, DbSession
from app.modules.payments import service
import stripe

router = APIRouter(prefix="/payments", tags=["Payments"])
logger = logging.getLogger(__name__)


class CheckoutSessionRequest(BaseModel):
    ticket_id: str
    description: str
    currency: str = "inr"
    # NOTE: amount is accepted but ignored — computed server-side from ticket data
    amount: float | None = None


@router.post("/create-checkout-session")
async def create_checkout_session(
    data: CheckoutSessionRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    """Create a Stripe checkout session. Amount is computed server-side from ticket."""
    return await service.create_checkout_session(
        shop_id=current_user["shop_id"],
        user_id=current_user["user_id"],
        ticket_id=data.ticket_id,
        description=data.description,
        currency=data.currency,
        db=db,
    )


@router.post("/webhook")
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Handle Stripe webhook events (no auth — verified by Stripe signature)."""
    if not settings.stripe_webhook_secret:
        return Response(status_code=400)

    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.stripe_webhook_secret
        )
    except ValueError:
        return Response(status_code=400)
    except stripe.error.SignatureVerificationError:
        return Response(status_code=400)

    # Handle successful payment
    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        ticket_id = session.get("client_reference_id")
        if ticket_id:
            try:
                await service.handle_payment_success(ticket_id, db)
            except Exception as e:
                logger.error(f"Error handling payment success for ticket {ticket_id}: {e}")

    return Response(status_code=200)
