import uuid

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.core.dependencies import CurrentUser, DbSession
from app.modules.invoices import service

router = APIRouter(tags=["Invoices"])


@router.post("/tickets/{ticket_id}/invoice", status_code=201)
async def generate_invoice(
    ticket_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
):
    """Generate (or retrieve existing) PDF invoice for a ticket."""
    invoice = await service.generate_invoice(
        shop_id=current_user["shop_id"],
        ticket_id=ticket_id,
        db=db,
    )
    return {
        "id": str(invoice.id),
        "invoice_number": invoice.invoice_number,
        "total_amount": str(invoice.total_amount),
        "public_token": invoice.public_token,
        "generated_at": invoice.generated_at.isoformat(),
    }


@router.get("/tickets/{ticket_id}/invoice")
async def get_invoice(
    ticket_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
):
    """Get invoice details + presigned PDF download URL."""
    return await service.get_invoice(
        shop_id=current_user["shop_id"],
        ticket_id=ticket_id,
        db=db,
    )


@router.get("/public/invoice/{token}")
async def public_invoice(token: str, db: DbSession):
    """
    Public shareable invoice view — no authentication required.
    Returns invoice details + download URL using the public_token.
    """
    return await service.get_invoice_by_token(token, db)
