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
    password: str | None = Body(default=None, embed=True),
):
    """
    Directly create or invite a team member to the shop.
    If password is provided, it is set directly so the user can immediately log in.
    Otherwise, a temporary password is generated.
    """
    from app.core.security import hash_password
    from app.modules.shops.models import Shop
    from app.modules.billing.service import has_feature
    from sqlalchemy import func
    import secrets

    # Validate role
    if role not in ["OWNER", "TECHNICIAN"]:
        raise HTTPException(status_code=400, detail="Invalid role. Must be OWNER or TECHNICIAN.")
    
    # Prevent inviting another owner
    if role == "OWNER":
        raise HTTPException(status_code=403, detail="Cannot invite another owner.")

    # Check if email already in use
    clean_email = email.lower().strip()
    existing = await db.execute(select(User).where(User.email == clean_email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="A user with this email already exists.")

    # Validate password if provided
    if password is not None and len(password.strip()) > 0:
        if len(password.strip()) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
        chosen_password = password.strip()
    else:
        chosen_password = secrets.token_urlsafe(10)

    # Enforce team_limit hierarchy:
    # 1. Shop-level custom_team_limit override set by Admin Portal (0 = unlimited)
    # 2. Billing plan feature 'team_limit'
    # 3. Default for Free plan: 2 (1 Owner + 1 Technician)
    shop_res = await db.execute(select(Shop).where(Shop.id == current_user["shop_id"]))
    shop = shop_res.scalar_one_or_none()
    
    team_limit: int = 2
    if shop and shop.custom_team_limit is not None:
        team_limit = -1 if shop.custom_team_limit <= 0 else shop.custom_team_limit
    else:
        team_limit_val = await has_feature(current_user["shop_id"], "team_limit", db)
        if team_limit_val in ("unlimited", "-1"):
            team_limit = -1
        elif team_limit_val and team_limit_val.isdigit():
            team_limit = int(team_limit_val)
        else:
            team_limit = 2

    if team_limit != -1:
        count_result = await db.execute(
            select(func.count()).where(
                User.shop_id == current_user["shop_id"],
                User.is_active == True,
            )
        )
        current_count = count_result.scalar_one()
        if current_count >= team_limit:
            raise HTTPException(
                status_code=403,
                detail=f"Team member limit reached ({team_limit}). "
                       "The Free plan allows 1 technician account. "
                       "Please upgrade your plan or contact admin to add more members.",
            )

    user = User(
        shop_id=current_user["shop_id"],
        full_name=full_name.strip(),
        email=clean_email,
        password_hash=hash_password(chosen_password),
        role=role,
        is_active=True,
    )
    db.add(user)
    await db.flush()

    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"Team member created for {clean_email}. Role: {role}.")

    return {
        "message": f"Team member account created for {clean_email}.",
        "user": {
            "id": str(user.id),
            "full_name": user.full_name,
            "email": user.email,
            "role": user.role,
        },
        "credentials": {
            "email": user.email,
            "password": chosen_password,
        },
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
