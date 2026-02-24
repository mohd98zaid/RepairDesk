import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Body
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentUser, DbSession, OwnerUser
from app.modules.users.models import User


router = APIRouter(prefix="/team", tags=["Team"])


@router.get("")
async def list_team(
    current_user: CurrentUser,
    db: DbSession,
):
    """List all team members for the current shop."""
    result = await db.execute(
        select(User)
        .where(User.shop_id == current_user["shop_id"])
        .order_by(User.created_at)
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


@router.post("/invite", status_code=201)
async def invite_technician(
    current_user: OwnerUser,
    db: DbSession,
    email: str = Body(..., embed=True),
):
    """
    Invite a technician to the shop.
    In a production system, this would send an email with a sign-up link.
    For now, it creates a pre-activated user with a temporary password.
    """
    from app.core.security import hash_password
    import secrets

    # Check if email already in use
    existing = await db.execute(select(User).where(User.email == email.lower()))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="A user with this email already exists.")

    temp_password = secrets.token_urlsafe(10)
    user = User(
        shop_id=current_user["shop_id"],
        full_name=email.split("@")[0].replace(".", " ").title(),
        email=email.lower(),
        password_hash=hash_password(temp_password),
        role="TECHNICIAN",
        is_active=True,
    )
    db.add(user)
    await db.flush()

    # In production: send email with temp_password
    # For now, return it in the response (dev only!)
    return {
        "message": f"Technician account created for {email}",
        "temp_password": temp_password,
        "note": "In production, this would be sent via email.",
    }


@router.delete("/{member_id}", status_code=204)
async def deactivate_member(
    member_id: uuid.UUID,
    current_user: OwnerUser,
    db: DbSession,
):
    """Deactivate a team member (Owner only). Cannot deactivate yourself."""
    result = await db.execute(
        select(User).where(
            User.id == member_id,
            User.shop_id == current_user["shop_id"],
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found.")
    if str(member.id) == current_user["user_id"]:
        raise HTTPException(status_code=400, detail="You cannot deactivate yourself.")
    if member.role == "OWNER":
        raise HTTPException(status_code=403, detail="Cannot deactivate an owner.")
    member.is_active = False
    return None
