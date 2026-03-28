import logging
import uuid
import stripe
from decimal import Decimal
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import NotFoundException, ValidationException

logger = logging.getLogger(__name__)

if settings.stripe_secret_key:
    stripe.api_key = settings.stripe_secret_key


async def create_checkout_session(
    shop_id: uuid.UUID,
    user_id: uuid.UUID,
    ticket_id: str,
    description: str,
    currency: str = "inr",
    db: AsyncSession = None,
):
    from app.modules.tickets.models import Ticket, TicketCharge

    if not settings.stripe_secret_key:
        raise ValidationException("Stripe payments are not configured for this instance.")

    # Compute amount server-side from ticket data (never trust client)
    try:
        ticket_uuid = uuid.UUID(ticket_id)
    except ValueError:
        raise ValidationException("Invalid ticket ID.")

    result = await db.execute(
        select(Ticket).where(
            Ticket.id == ticket_uuid,
            Ticket.shop_id == shop_id,
            Ticket.is_deleted == False,
        )
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise NotFoundException("Ticket not found.")

    # Compute total: parts_cost + charges
    parts_cost = ticket.parts_cost or Decimal(0)
    charges_result = await db.execute(
        select(TicketCharge).where(TicketCharge.ticket_id == ticket_uuid)
    )
    charges_total = sum(c.amount for c in charges_result.scalars().all())
    total_amount = float(parts_cost + charges_total)

    if total_amount <= 0:
        raise ValidationException("Ticket has no charges to pay.")

    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{
                "price_data": {
                    "currency": currency,
                    "product_data": {
                        "name": description,
                    },
                    "unit_amount": int(total_amount * 100),  # Stripe expects cents/paise
                },
                "quantity": 1,
            }],
            mode="payment",
            success_url=f"{settings.frontend_url}/tickets/{ticket_id}?payment=success",
            cancel_url=f"{settings.frontend_url}/tickets/{ticket_id}?payment=cancelled",
            client_reference_id=ticket_id,
            metadata={
                "shop_id": str(shop_id),
                "user_id": str(user_id),
            },
        )
        return {"url": session.url}
    except Exception as e:
        raise ValidationException(f"Could not create checkout session: {e}")


async def handle_payment_success(ticket_id: str, db: AsyncSession) -> None:
    """Mark ticket as DELIVERED and generate invoice after successful payment."""
    from app.modules.tickets.models import Ticket
    from app.modules.invoices.service import generate_invoice

    try:
        result = await db.execute(
            select(Ticket).where(Ticket.id == uuid.UUID(ticket_id))
        )
        ticket = result.scalar_one_or_none()
        if not ticket:
            logger.warning(f"Payment received for unknown ticket {ticket_id}")
            return
        if ticket.status == "READY":
            ticket.status = "DELIVERED"
            # Generate invoice if not already generated
            await generate_invoice(ticket.shop_id, ticket.id, db)
            await db.flush()
            logger.info(f"Payment success: ticket {ticket_id} marked DELIVERED")
        else:
            logger.warning(f"Payment received for ticket {ticket_id} but status is not READY (status={ticket.status})")
    except Exception:
        raise
