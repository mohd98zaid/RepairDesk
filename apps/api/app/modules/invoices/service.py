import io
import secrets
import uuid
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictException, NotFoundException
from app.core.minio import get_minio_client, generate_presigned_download_url
from app.core.config import settings
from app.modules.customers.models import Customer
from app.modules.inventory.models import TicketPart, InventoryItem
from app.modules.invoices.models import Invoice
from app.modules.shops.models import Shop
from app.modules.tickets.models import Ticket

TEMPLATE_DIR = Path(__file__).parent / "templates"


def _render_html(context: dict[str, Any]) -> str:
    env = Environment(loader=FileSystemLoader(str(TEMPLATE_DIR)))
    template = env.get_template("invoice.html")
    return template.render(**context)


def _generate_pdf(html: str) -> bytes:
    """Render HTML to PDF using WeasyPrint."""
    try:
        from weasyprint import HTML  # type: ignore
        return HTML(string=html).write_pdf()
    except ImportError:
        return b"MOCK PDF CONTENT"
    except Exception as exc:
        raise RuntimeError(f"PDF generation failed: {exc}") from exc


def _upload_pdf(pdf_bytes: bytes, key: str) -> None:
    client = get_minio_client()
    client.put_object(
        bucket_name=settings.minio_bucket,
        object_name=key,
        data=io.BytesIO(pdf_bytes),
        length=len(pdf_bytes),
        content_type="application/pdf",
    )


async def generate_invoice(
    shop_id: uuid.UUID,
    ticket_id: uuid.UUID,
    db: AsyncSession,
) -> Invoice:
    """
    Generate or retrieve an invoice for a ticket.
    - Builds HTML from Jinja2 template
    - Renders to PDF via WeasyPrint
    - Uploads to MinIO
    - Saves Invoice record to DB
    """
    # Check if invoice already exists
    existing = await db.execute(
        select(Invoice).where(
            Invoice.ticket_id == ticket_id,
            Invoice.shop_id == shop_id,
        )
    )
    if inv := existing.scalar_one_or_none():
        return inv

    # Fetch all related data
    ticket_result = await db.execute(
        select(Ticket).where(Ticket.id == ticket_id, Ticket.shop_id == shop_id)
    )
    ticket = ticket_result.scalar_one_or_none()
    if not ticket:
        raise NotFoundException("Ticket not found.")

    shop_result = await db.execute(select(Shop).where(Shop.id == shop_id))
    shop = shop_result.scalar_one()

    cust_result = await db.execute(select(Customer).where(Customer.id == ticket.customer_id))
    customer = cust_result.scalar_one()

    # Build parts data
    parts_result = await db.execute(
        select(TicketPart, InventoryItem.name)
        .join(InventoryItem, TicketPart.inventory_item_id == InventoryItem.id)
        .where(TicketPart.ticket_id == ticket_id)
    )
    parts_data = []
    parts_total = Decimal(0)
    for part, name in parts_result.all():
        line_total = part.quantity_used * part.unit_selling_price
        parts_total += line_total
        parts_data.append({
            "name": name,
            "quantity_used": part.quantity_used,
            "unit_selling_price": f"{part.unit_selling_price:,.2f}",
            "line_total": f"{line_total:,.2f}",
        })

    # Generate invoice number
    today = date.today()
    await db.execute(select(Shop.id).where(Shop.id == shop_id).with_for_update())
    count_result = await db.execute(
        select(func.count())
        .select_from(Invoice)
        .where(Invoice.shop_id == shop_id)
    )
    seq = (count_result.scalar_one() or 0) + 1
    invoice_number = f"INV-{today.strftime('%Y%m')}-{seq:04d}"

    total = ticket.final_cost or (ticket.estimated_cost or Decimal(0))
    labour_cost = total - parts_total
    if labour_cost < 0:
        labour_cost = Decimal(0)

    # Render template
    html = _render_html({
        "shop_name": shop.name,
        "shop_phone": shop.phone or "",
        "shop_email": shop.email or "",
        "invoice_number": invoice_number,
        "date": today.strftime("%d %B %Y"),
        "customer_name": customer.name,
        "customer_phone": customer.phone,
        "customer_email": customer.email or "",
        "ticket_number": ticket.ticket_number,
        "status": ticket.status.replace("_", " ").title(),
        "device_type": ticket.device_type,
        "device_model": ticket.device_model,
        "reported_issue": ticket.reported_issue,
        "technician_notes": ticket.technician_notes,
        "currency": "₹",
        "parts": parts_data,
        "parts_total": f"{parts_total:,.2f}",
        "labour_cost": f"{labour_cost:,.2f}",
        "total": f"{total:,.2f}",
    })

    # Generate PDF
    pdf_bytes = _generate_pdf(html)
    minio_key = f"invoices/{shop_id}/{ticket_id}/{invoice_number}.pdf"
    _upload_pdf(pdf_bytes, minio_key)

    # Save to DB
    public_token = secrets.token_urlsafe(32)
    invoice = Invoice(
        ticket_id=ticket_id,
        shop_id=shop_id,
        invoice_number=invoice_number,
        total_amount=total,
        minio_key=minio_key,
        public_token=public_token,
    )
    db.add(invoice)
    await db.flush()
    return invoice


async def get_invoice(
    shop_id: uuid.UUID,
    ticket_id: uuid.UUID,
    db: AsyncSession,
) -> dict[str, Any]:
    """Get invoice metadata + presigned download URL."""
    result = await db.execute(
        select(Invoice).where(
            Invoice.ticket_id == ticket_id,
            Invoice.shop_id == shop_id,
        )
    )
    inv = result.scalar_one_or_none()
    if not inv:
        raise NotFoundException("Invoice not found. Generate it first.")

    download_url = ""
    if inv.minio_key:
        try:
            download_url = generate_presigned_download_url(inv.minio_key, filename=f"{inv.invoice_number}.pdf")
        except Exception:
            pass

    return {
        "id": str(inv.id),
        "invoice_number": inv.invoice_number,
        "total_amount": str(inv.total_amount),
        "download_url": download_url,
        "public_token": inv.public_token,
        "generated_at": inv.generated_at.isoformat(),
    }


async def get_invoice_by_token(token: str, db: AsyncSession) -> dict[str, Any]:
    """Public endpoint — get invoice by public_token (no auth required)."""
    result = await db.execute(select(Invoice).where(Invoice.public_token == token))
    inv = result.scalar_one_or_none()
    if not inv:
        raise NotFoundException("Invoice not found.")

    download_url = ""
    if inv.minio_key:
        try:
            download_url = generate_presigned_download_url(inv.minio_key, filename=f"{inv.invoice_number}.pdf")
        except Exception:
            pass

    return {
        "invoice_number": inv.invoice_number,
        "total_amount": str(inv.total_amount),
        "download_url": download_url,
        "generated_at": inv.generated_at.isoformat(),
    }
