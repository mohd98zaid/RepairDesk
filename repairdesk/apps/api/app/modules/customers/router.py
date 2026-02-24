import uuid

from fastapi import APIRouter, Query

from app.core.dependencies import CurrentUser, DbSession, OwnerUser
from app.modules.customers import service
from app.modules.customers.schemas import CustomerCreate, CustomerResponse, CustomerUpdate

router = APIRouter(prefix="/customers", tags=["Customers"])


@router.get("", response_model=dict)
async def list_customers(
    current_user: CurrentUser,
    db: DbSession,
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List all customers for the current shop with optional search."""
    result = await service.list_customers(
        shop_id=current_user["shop_id"],
        search=search,
        page=page,
        per_page=per_page,
        db=db,
    )
    items = [CustomerResponse.model_validate(c).model_dump() for c in result["items"]]
    return {**result, "items": items}


@router.post("", response_model=CustomerResponse, status_code=201)
async def create_customer(data: CustomerCreate, current_user: CurrentUser, db: DbSession):
    """Create a new customer."""
    customer = await service.create_customer(current_user["shop_id"], data, db)
    return CustomerResponse.model_validate(customer)


@router.get("/{customer_id}", response_model=dict)
async def get_customer(
    customer_id: uuid.UUID, current_user: CurrentUser, db: DbSession
):
    """Get a customer profile + their ticket history."""
    from sqlalchemy import select
    from app.modules.tickets.models import Ticket
    customer = await service.get_customer(current_user["shop_id"], customer_id, db)

    # Ticket history (summary)
    tickets_result = await db.execute(
        select(Ticket).where(
            Ticket.customer_id == customer_id,
            Ticket.is_deleted == False,
        ).order_by(Ticket.created_at.desc())
    )
    tickets = tickets_result.scalars().all()
    ticket_dicts = [
        {
            "id": str(t.id),
            "ticket_number": t.ticket_number,
            "status": t.status,
            "device_type": t.device_type,
            "final_cost": str(t.final_cost) if t.final_cost else None,
            "created_at": t.created_at.isoformat(),
        }
        for t in tickets
    ]

    data = CustomerResponse.model_validate(customer).model_dump()
    data["tickets"] = ticket_dicts
    return data


@router.patch("/{customer_id}", response_model=CustomerResponse)
async def update_customer(
    customer_id: uuid.UUID,
    data: CustomerUpdate,
    current_user: CurrentUser,
    db: DbSession,
):
    """Update customer details."""
    customer = await service.update_customer(current_user["shop_id"], customer_id, data, db)
    return CustomerResponse.model_validate(customer)
