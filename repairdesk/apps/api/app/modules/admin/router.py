"""
Super-Admin API Router
----------------------
Platform-level admin endpoints. Credentials are stored in env vars (not DB).
All endpoints require a valid admin JWT (role=SUPER_ADMIN).
"""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_db
from app.modules.customers.models import Customer
from app.modules.inventory.models import InventoryItem
from app.modules.shops.models import Shop
from app.modules.tickets.models import Ticket
from app.modules.users.models import User

router = APIRouter(prefix="/admin", tags=["Super-Admin"])

_ADMIN_TOKEN_EXPIRE_HOURS = 8
_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/admin/auth/login", auto_error=False)


# ─────────────────────────── Auth helpers ───────────────────────────

def _create_admin_token() -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=_ADMIN_TOKEN_EXPIRE_HOURS)
    return jwt.encode(
        {"sub": "super_admin", "role": "SUPER_ADMIN", "exp": expire},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )


async def _get_admin_user(token: str = Depends(_oauth2_scheme)) -> dict:
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        if payload.get("role") != "SUPER_ADMIN":
            raise HTTPException(status_code=403, detail="Admin access required")
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired admin token")


AdminUser = Depends(_get_admin_user)


# ─────────────────────────── Login ───────────────────────────

@router.post("/auth/login")
async def admin_login(body: dict):
    """Authenticate with platform admin credentials from .env."""
    email = body.get("email", "").strip().lower()
    password = body.get("password", "")

    if email != settings.admin_email.lower() or password != settings.admin_password:
        raise HTTPException(status_code=401, detail="Invalid admin credentials")

    token = _create_admin_token()
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"email": settings.admin_email, "role": "SUPER_ADMIN"},
    }


@router.get("/auth/me")
async def admin_me(admin: dict = AdminUser):
    """Return current admin identity."""
    return {"email": settings.admin_email, "role": "SUPER_ADMIN"}


# ─────────────────────────── Shops ───────────────────────────

@router.get("/shops")
async def list_all_shops(
    admin: dict = AdminUser,
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: str | None = Query(None),
) -> dict[str, Any]:
    """List all shops with aggregate stats."""
    q = select(Shop).where(Shop.is_active == True)
    if search:
        q = q.where(Shop.name.ilike(f"%{search}%"))

    count_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = count_result.scalar_one()

    offset = (page - 1) * per_page
    shops_result = await db.execute(
        q.order_by(Shop.created_at.desc()).offset(offset).limit(per_page)
    )
    shops = shops_result.scalars().all()

    items = []
    for shop in shops:
        # Ticket count
        tc = await db.execute(
            select(func.count()).where(Ticket.shop_id == shop.id, Ticket.is_deleted == False)
        )
        ticket_count = tc.scalar_one()

        # Member count
        mc = await db.execute(
            select(func.count()).where(User.shop_id == shop.id, User.is_active == True)
        )
        member_count = mc.scalar_one()

        # Owner
        owner_result = await db.execute(
            select(User).where(User.shop_id == shop.id, User.role == "OWNER")
        )
        owner = owner_result.scalar_one_or_none()

        items.append({
            "id": str(shop.id),
            "name": shop.name,
            "email": shop.email,
            "phone": shop.phone,
            "is_active": shop.is_active,
            "created_at": shop.created_at.isoformat(),
            "owner": {"full_name": owner.full_name, "email": owner.email} if owner else None,
            "ticket_count": ticket_count,
            "member_count": member_count,
        })

    return {"total": total, "page": page, "per_page": per_page, "items": items}


@router.get("/shops/{shop_id}")
async def get_shop_detail(
    shop_id: uuid.UUID,
    admin: dict = AdminUser,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Get detail for a specific shop."""
    result = await db.execute(select(Shop).where(Shop.id == shop_id))
    shop = result.scalar_one_or_none()
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")

    # Stats
    tc = await db.execute(
        select(func.count()).where(Ticket.shop_id == shop_id, Ticket.is_deleted == False)
    )
    cc = await db.execute(select(func.count()).where(Customer.shop_id == shop_id))
    mc = await db.execute(
        select(func.count()).where(User.shop_id == shop_id, User.is_active == True)
    )
    ic = await db.execute(select(func.count()).where(InventoryItem.shop_id == shop_id))

    owner_result = await db.execute(
        select(User).where(User.shop_id == shop_id, User.role == "OWNER")
    )
    owner = owner_result.scalar_one_or_none()

    return {
        "id": str(shop.id),
        "name": shop.name,
        "email": shop.email,
        "phone": shop.phone,
        "is_active": shop.is_active,
        "created_at": shop.created_at.isoformat(),
        "owner": {"full_name": owner.full_name, "email": owner.email, "id": str(owner.id)} if owner else None,
        "stats": {
            "tickets": tc.scalar_one(),
            "customers": cc.scalar_one(),
            "members": mc.scalar_one(),
            "inventory_items": ic.scalar_one(),
        },
    }


@router.post("/shops", status_code=201)
async def create_shop(
    body: dict,
    admin: dict = AdminUser,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Create a new shop with an owner account."""
    from app.core.security import hash_password
    from sqlalchemy import select as sa_select

    shop_name = (body.get("shop_name") or "").strip()
    owner_name = (body.get("owner_name") or "").strip()
    email = (body.get("email") or "").strip().lower()
    password = (body.get("password") or "").strip()
    phone = (body.get("phone") or "").strip() or None

    if not shop_name or not owner_name or not email or not password:
        raise HTTPException(status_code=422, detail="shop_name, owner_name, email and password are required.")
    if len(password) < 6:
        raise HTTPException(status_code=422, detail="Password must be at least 6 characters.")

    # Check duplicate email
    existing = await db.execute(sa_select(User).where(User.email == email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"An account with email '{email}' already exists.")

    # Create shop
    shop = Shop(name=shop_name, phone=phone, email=email, plan="free")
    db.add(shop)
    await db.flush()

    # Create owner user
    user = User(
        shop_id=shop.id,
        full_name=owner_name,
        email=email,
        password_hash=hash_password(password),
        role="OWNER",
    )
    db.add(user)
    await db.commit()
    await db.refresh(shop)

    return {
        "id": str(shop.id),
        "name": shop.name,
        "email": shop.email,
        "phone": shop.phone,
        "is_active": shop.is_active,
        "created_at": shop.created_at.isoformat(),
        "owner": {"full_name": user.full_name, "email": user.email, "id": str(user.id)},
    }


@router.delete("/shops/{shop_id}", status_code=204)
async def delete_shop(
    shop_id: uuid.UUID,
    admin: dict = AdminUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Permanently delete a shop and all its data (CASCADE)."""
    result = await db.execute(select(Shop).where(Shop.id == shop_id))
    shop = result.scalar_one_or_none()
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")
    await db.delete(shop)
    await db.commit()


# ─────────────────────────── Shop — Tickets ───────────────────────────

@router.get("/shops/{shop_id}/tickets")
async def get_shop_tickets(
    shop_id: uuid.UUID,
    admin: dict = AdminUser,
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status: str | None = Query(None),
) -> dict[str, Any]:
    from app.modules.customers.models import Customer as C
    q = (
        select(Ticket)
        .join(C, Ticket.customer_id == C.id)
        .where(Ticket.shop_id == shop_id, Ticket.is_deleted == False)
    )
    if status:
        q = q.where(Ticket.status == status)

    count_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = count_result.scalar_one()
    offset = (page - 1) * per_page
    result = await db.execute(q.order_by(Ticket.created_at.desc()).offset(offset).limit(per_page))
    tickets = result.scalars().all()

    return {
        "total": total, "page": page, "per_page": per_page,
        "items": [
            {
                "id": str(t.id),
                "ticket_number": t.ticket_number,
                "status": t.status,
                "device_type": t.device_type,
                "device_model": t.device_model,
                "reported_issue": t.reported_issue,
                "estimated_cost": str(t.estimated_cost) if t.estimated_cost else None,
                "final_cost": str(t.final_cost) if t.final_cost else None,
                "created_at": t.created_at.isoformat(),
            }
            for t in tickets
        ],
    }


@router.get("/shops/{shop_id}/tickets/{ticket_id}")
async def get_shop_ticket_detail(
    shop_id: uuid.UUID,
    ticket_id: uuid.UUID,
    admin: dict = AdminUser,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    from app.modules.tickets.service import get_ticket_detail
    return await get_ticket_detail(shop_id, ticket_id, db)


@router.get("/shops/{shop_id}/tickets/{ticket_id}/invoice")
async def get_shop_ticket_invoice(
    shop_id: uuid.UUID,
    ticket_id: uuid.UUID,
    admin: dict = AdminUser,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    from app.modules.invoices.service import get_invoice
    return await get_invoice(shop_id, ticket_id, db)

# ─────────────────────────── Shop — Customers ───────────────────────────

@router.get("/shops/{shop_id}/customers")
async def get_shop_customers(
    shop_id: uuid.UUID,
    admin: dict = AdminUser,
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
) -> dict[str, Any]:
    q = select(Customer).where(Customer.shop_id == shop_id)
    count_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = count_result.scalar_one()
    offset = (page - 1) * per_page
    result = await db.execute(q.order_by(Customer.created_at.desc()).offset(offset).limit(per_page))
    customers = result.scalars().all()

    return {
        "total": total, "page": page, "per_page": per_page,
        "items": [
            {
                "id": str(c.id),
                "name": c.name,
                "phone": c.phone,
                "email": c.email,
                "created_at": c.created_at.isoformat(),
            }
            for c in customers
        ],
    }


# ─────────────────────────── Shop — Team ───────────────────────────

@router.get("/shops/{shop_id}/team")
async def get_shop_team(
    shop_id: uuid.UUID,
    admin: dict = AdminUser,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    result = await db.execute(
        select(User).where(User.shop_id == shop_id).order_by(User.created_at.asc())
    )
    members = result.scalars().all()
    return {
        "members": [
            {
                "id": str(m.id),
                "full_name": m.full_name,
                "email": m.email,
                "role": m.role,
                "is_active": m.is_active,
                "created_at": m.created_at.isoformat(),
            }
            for m in members
        ]
    }


# ─────────────────────────── Shop — Inventory ───────────────────────────

@router.get("/shops/{shop_id}/inventory")
async def get_shop_inventory(
    shop_id: uuid.UUID,
    admin: dict = AdminUser,
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
) -> dict[str, Any]:
    q = select(InventoryItem).where(InventoryItem.shop_id == shop_id)
    count_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = count_result.scalar_one()
    offset = (page - 1) * per_page
    result = await db.execute(q.order_by(InventoryItem.created_at.desc()).offset(offset).limit(per_page))
    items = result.scalars().all()

    return {
        "total": total, "page": page, "per_page": per_page,
        "items": [
            {
                "id": str(i.id),
                "name": i.name,
                "sku": i.sku,
                "quantity": i.quantity,
                "selling_price": str(i.selling_price),
                "purchase_price": str(i.purchase_price),
                "is_low_stock": i.is_low_stock,
            }
            for i in items
        ],
    }
