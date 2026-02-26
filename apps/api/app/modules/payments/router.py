import logging
from fastapi import APIRouter, Request, Response
from pydantic import BaseModel

from app.core.config import settings
from app.core.dependencies import CurrentUser
from app.modules.payments import service
import stripe

router = APIRouter(prefix="/payments", tags=["Payments"])
logger = logging.getLogger(__name__)


class CheckoutSessionRequest(BaseModel):
    ticket_id: str
    amount: float
    currency: str = "inr"
    description: str


@router.post("/create-checkout-session")
async def create_checkout_session(
    data: CheckoutSessionRequest,
    current_user: CurrentUser,
):
    """Create a Stripe checkout session. Requires authentication."""
    return await service.create_checkout_session(
        shop_id=current_user["shop_id"],
        user_id=current_user["user_id"],
        ticket_id=data.ticket_id,
        amount=data.amount,
        description=data.description,
        currency=data.currency,
    )


from fastapi import APIRouter, Request, Response, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.db import get_db

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
