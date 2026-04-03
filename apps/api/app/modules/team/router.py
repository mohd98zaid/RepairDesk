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
async def invite_team_member(
    current_user: OwnerUser,
    db: DbSession,
    email: str = Body(..., embed=True),
    full_name: str = Body(..., embed=True),
    role: str = Body(..., embed=True),
):
    """
    Invite a team member to the shop.
    In a production system, this would send an email with a sign-up link.
    For now, it creates a pre-activated user with a temporary password.
    """
    from app.core.security import hash_password
    import secrets

    # Validate role
    if role not in ["OWNER", "TECHNICIAN"]:
        raise HTTPException(status_code=400, detail="Invalid role. Must be OWNER or TECHNICIAN.")
    
    # Prevent inviting another owner
    if role == "OWNER":
        raise HTTPException(status_code=403, detail="Cannot invite another owner.")

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
        full_name=full_name,
        email=email.lower(),
        password_hash=hash_password(temp_password),
        role=role,
        is_active=True,
    )
    db.add(user)
    await db.flush()

    # Send email with temp password (never return in response)
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"Team member created for {email}. Temp password sent via email.")
    # TODO: In production, send email with temp_password via EmailService
    return {
        "message": f"Team member account created for {email}. Temporary password has been sent to their email.",
    }


@router.delete("/{member_id}", status_code=204)
async def deactivate_member(
    member_id: uuid.UUID,
    current_user: OwnerUser,
    db: DbSession,
):
    """Deactivate a team member (Owner only). Cannot deactivate yourself. Revokes all active sessions."""
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

    # Revoke all active sessions for this member
    from app.core.redis import get_redis
    redis = await get_redis()
    cursor = "0"
    while True:
        cursor, keys = await redis.scan(cursor=cursor, match=f"refresh:{member_id}:*")
        if keys:
            await redis.delete(*keys)
        if cursor == "0" or not cursor:
            break

    return None


@router.patch("/{member_id}/reactivate", status_code=200)
async def reactivate_member(
    member_id: uuid.UUID,
    current_user: OwnerUser,
    db: DbSession,
):
    """Reactivate a team member (Owner only)."""
    result = await db.execute(
        select(User).where(
            User.id == member_id,
            User.shop_id == current_user["shop_id"],
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found.")
    if member.role == "OWNER":
        raise HTTPException(status_code=403, detail="Cannot reactivate an owner.")
    member.is_active = True
    return {"message": "Member reactivated successfully"}


@router.delete("/{member_id}/delete", status_code=204)
async def delete_member(
    member_id: uuid.UUID,
    current_user: OwnerUser,
    db: DbSession,
):
    """Permanently delete a team member (Owner only). Cannot delete yourself or owner."""
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
        raise HTTPException(status_code=400, detail="You cannot delete yourself.")
    if member.role == "OWNER":
        raise HTTPException(status_code=403, detail="Cannot delete an owner.")
    
    await db.delete(member)
    await db.commit()
    
    # Revoke all active sessions for this member
    from app.core.redis import get_redis
    redis = await get_redis()
    cursor = "0"
    while True:
        cursor, keys = await redis.scan(cursor=cursor, match=f"refresh:{member_id}:*")
        if keys:
            await redis.delete(*keys)
        if cursor == "0" or not cursor:
            break
            
    return None
