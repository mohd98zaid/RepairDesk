import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictException, NotFoundException
from app.modules.customers.models import Customer
from app.modules.customers.schemas import CustomerCreate, CustomerUpdate
from app.modules.tickets.models import Ticket


async def get_or_create_customer(
    shop_id: uuid.UUID,
    phone: str,
    name: str,
    db: AsyncSession,
) -> Customer:
    """Look up a customer by phone (shop-scoped); create if not found."""
    result = await db.execute(
        select(Customer).where(
            Customer.shop_id == shop_id,
            Customer.phone == phone,
            Customer.is_deleted == False,
        )
    )
    customer = result.scalar_one_or_none()
    if customer:
        return customer

    customer = Customer(shop_id=shop_id, name=name, phone=phone)
    db.add(customer)
    await db.flush()
    return customer


async def list_customers(
    shop_id: uuid.UUID,
    search: str | None,
    page: int,
    per_page: int,
    db: AsyncSession,
) -> dict[str, Any]:
    base_query = select(Customer).where(
        Customer.shop_id == shop_id, Customer.is_deleted == False
    )
    if search:
        pattern = f"%{search}%"
        from sqlalchemy import or_
        base_query = base_query.where(
            or_(Customer.name.ilike(pattern), Customer.phone.ilike(pattern))
        )

    count_result = await db.execute(
        select(func.count()).select_from(base_query.subquery())
    )
    total = count_result.scalar_one()

    offset = (page - 1) * per_page
    items_result = await db.execute(
        base_query.order_by(Customer.created_at.desc()).offset(offset).limit(per_page)
    )
    items = items_result.scalars().all()

    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": max(1, -(-total // per_page)),
        "items": items,
    }


async def get_customer(shop_id: uuid.UUID, customer_id: uuid.UUID, db: AsyncSession) -> Customer:
    result = await db.execute(
        select(Customer).where(
            Customer.id == customer_id,
            Customer.shop_id == shop_id,
            Customer.is_deleted == False,
        )
    )
    customer = result.scalar_one_or_none()
    if not customer:
        raise NotFoundException("Customer not found.")
    return customer


async def create_customer(shop_id: uuid.UUID, data: CustomerCreate, db: AsyncSession) -> Customer:
    existing = await db.execute(
        select(Customer).where(
            Customer.shop_id == shop_id,
            Customer.phone == data.phone,
            Customer.is_deleted == False,
        )
    )
    if existing.scalar_one_or_none():
        raise ConflictException(f"A customer with phone '{data.phone}' already exists.")

    customer = Customer(shop_id=shop_id, **data.model_dump())
    db.add(customer)
    await db.flush()
    return customer


async def update_customer(
    shop_id: uuid.UUID,
    customer_id: uuid.UUID,
    data: CustomerUpdate,
    db: AsyncSession,
) -> Customer:
    customer = await get_customer(shop_id, customer_id, db)
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(customer, field, value)
    return customer
