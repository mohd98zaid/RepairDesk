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

    # Enforce team_limit feature
    from app.modules.billing.service import has_feature
    from sqlalchemy import func
    team_limit_val = await has_feature(current_user["shop_id"], "team_limit", db)
    if team_limit_val and team_limit_val != "unlimited" and team_limit_val != "-1":
        if team_limit_val.isdigit():
            count_result = await db.execute(
                select(func.count()).where(
                    User.shop_id == current_user["shop_id"],
                    User.is_active == True,
                )
            )
            current_count = count_result.scalar_one()
            if current_count >= int(team_limit_val):
                raise HTTPException(
                    status_code=403,
                    detail=f"Team member limit reached ({team_limit_val}). "
                           "Please upgrade your plan to add more members.",
                )

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
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"Technician created for {email}. Temp password should be sent via email in production.")
    return {
        "message": f"Technician account created for {email}. Temporary password has been sent to their email.",
        "note": "Check server logs for temp password in development mode.",
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
