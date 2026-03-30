import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import select

from app.core.dependencies import CurrentUser, DbSession, OwnerUser
from app.core.exceptions import ForbiddenException, NotFoundException
from app.core.security import hash_password, verify_password
from app.modules.users.models import Invitation, User
from app.modules.users.schemas import InviteRequest, TeamMemberResponse

router = APIRouter(prefix="/team", tags=["Team"])
users_router = APIRouter(prefix="/users", tags=["Users"])


class UserMeUpdate(BaseModel):
    avatar_data: Optional[str] = None
    full_name: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@users_router.patch("/me")
async def update_me(data: UserMeUpdate, current_user: CurrentUser, db: DbSession):
    """Update current user profile (avatar, name)."""
    result = await db.execute(select(User).where(User.id == current_user["user_id"]))
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundException("User not found.")
    if data.avatar_data is not None:
        user.avatar_data = data.avatar_data
    if data.full_name is not None:
        user.full_name = data.full_name
    return {"ok": True}


@users_router.post("/me/change-password")
async def change_my_password(data: ChangePasswordRequest, current_user: CurrentUser, db: DbSession):
    """Change own password after verifying the current password."""
    result = await db.execute(select(User).where(User.id == current_user["user_id"]))
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundException("User not found.")

    if not verify_password(data.current_password, user.password_hash):
        raise ForbiddenException("Current password is incorrect.")

    if len(data.new_password) < 6:
        from app.core.exceptions import UnauthorizedException
        raise ForbiddenException("Password must be at least 6 characters.")

    user.password_hash = hash_password(data.new_password)
    await db.flush()

    # Evict all active sessions for this user across all devices
    from app.core.redis import get_redis
    redis = await get_redis()
    cursor = b'0'
    while cursor:
        cursor, keys = await redis.scan(cursor=cursor, match=f"refresh:{current_user['user_id']}:*")
        if keys:
            await redis.delete(*keys)
        if cursor == b'0':
            break

    return {"ok": True}


@users_router.get("/me/sessions")
async def get_my_sessions(current_user: CurrentUser):
    """Return all active sessions for the currently authenticated user."""
    from app.core.redis import get_redis

    redis = await get_redis()
    user_id = current_user["user_id"]
    current_session_id = current_user.get("session_id", "")
    MAX_TTL = 60 * 60 * 24 * 7

    sessions = []
    cursor = b"0"
    while cursor:
        cursor, keys = await redis.scan(cursor=cursor, match=f"refresh:{user_id}:*")
        for key in keys:
            key_str = key.decode() if isinstance(key, bytes) else key
            parts = key_str.split(":")
            session_id = parts[-1] if len(parts) >= 3 else key_str

            ttl = await redis.ttl(key)
            if ttl < 0:
                continue

            age_seconds = MAX_TTL - ttl
            if age_seconds < 60:
                created_ago = "just now"
            elif age_seconds < 3600:
                created_ago = f"{age_seconds // 60}m ago"
            elif age_seconds < 86400:
                created_ago = f"{age_seconds // 3600}h ago"
            else:
                created_ago = f"{age_seconds // 86400}d ago"

            sessions.append({
                "session_id": session_id,
                "session_key": f"{user_id}:{session_id}",
                "ttl_seconds": ttl,
                "ttl_max": MAX_TTL,
                "created_ago": created_ago,
                "is_current": session_id == current_session_id,
            })
        if cursor == b"0":
            break

    sessions.sort(key=lambda s: s["ttl_seconds"], reverse=True)
    return {"total": len(sessions), "sessions": sessions}


@users_router.delete("/me/sessions/{session_id}", status_code=200)
async def kill_my_session(session_id: str, current_user: CurrentUser):
    """Revoke a specific session. Cannot revoke the current session (use /auth/logout instead)."""
    from app.core.redis import get_redis

    current_session_id = current_user.get("session_id", "")
    if session_id == current_session_id:
        from app.core.exceptions import ForbiddenException as FE
        raise FE("Cannot revoke your current session. Use /auth/logout instead.")

    user_id = current_user["user_id"]
    redis = await get_redis()
    redis_key = f"refresh:{user_id}:{session_id}"
    deleted = await redis.delete(redis_key)

    if deleted == 0:
        raise NotFoundException("Session not found or already expired.")

    return {"ok": True, "message": "Session revoked successfully."}



@router.get("", response_model=list[TeamMemberResponse])
async def list_team(current_user: CurrentUser, db: DbSession):
    """List all active members of the current shop."""
    result = await db.execute(
        select(User).where(User.shop_id == current_user["shop_id"], User.is_active == True)
    )
    return result.scalars().all()


@router.post("/invite", status_code=201)
async def invite_team_member(data: InviteRequest, current_user: OwnerUser, db: DbSession):
    """Invite a new technician by email (owner only)."""
    token = secrets.token_urlsafe(32)
    invitation = Invitation(
        shop_id=current_user["shop_id"],
        email=data.email,
        role=data.role,
        token=token,
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        created_by=current_user["user_id"],
    )
    db.add(invitation)
    # TODO: Send invitation email
    return {"message": f"Invitation sent to {data.email}"}


@router.delete("/{user_id}", status_code=204)
async def deactivate_team_member(
    user_id: uuid.UUID, current_user: OwnerUser, db: DbSession
):
    """Deactivate a team member (owner only, cannot deactivate self)."""
    if str(user_id) == current_user["user_id"]:
        raise ForbiddenException("You cannot deactivate yourself.")

    result = await db.execute(
        select(User).where(User.id == user_id, User.shop_id == current_user["shop_id"])
    )
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundException("Team member not found.")

    user.is_active = False
