from typing import Annotated
from uuid import UUID

from fastapi import Cookie, Depends, Header, Request
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.exceptions import ForbiddenException, UnauthorizedException
from app.core.security import decode_token
from app.modules.shops.models import Shop
from app.modules.users.models import User

# Inactivity timeout: force logout after this many seconds of no API activity
_INACTIVITY_TIMEOUT_SECONDS = 12 * 60 * 60  # 12 hours


async def get_current_user(
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
    repairdesk_access: str | None = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Extract and validate the JWT from:
    1. httpOnly cookie (repairdesk_access) — PRIMARY
    2. Authorization: Bearer header — FALLBACK

    Validates user.shop_id from DATABASE, not from the JWT.
    This prevents horizontal privilege escalation via forged tokens.
    """
    # Determine token source (cookie takes priority)
    token = None
    if repairdesk_access:
        token = repairdesk_access
    elif authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]

    if not token:
        raise UnauthorizedException("Missing authentication token.")
    try:
        payload = decode_token(token)
    except JWTError:
        raise UnauthorizedException("Token is invalid or expired.")

    if payload.get("type") != "access":
        raise UnauthorizedException("Invalid token type.")

    user_id = payload.get("sub")
    session_id = payload.get("session_id")

    if not user_id:
        raise UnauthorizedException("Token payload is incomplete.")

    try:
        user_id_uuid = UUID(user_id)
    except ValueError:
        raise UnauthorizedException("Invalid token payload format.")

    # ─── MULTI-TENANT ISOLATION: Always read shop_id from DB, never trust JWT ──
    result = await db.execute(
        select(User.shop_id, User.is_active, User.role)
        .where(User.id == user_id_uuid)
    )
    user_row = result.one_or_none()

    if not user_row or not user_row.is_active:
        raise UnauthorizedException("User not found or inactive.")

    shop_id_uuid = user_row.shop_id
    role = str(user_row.role.value) if hasattr(user_row.role, "value") else str(user_row.role)

    # ─── REAL-TIME SHOP STATUS ENFORCEMENT ───
    shop_result = await db.execute(select(Shop.shop_status).where(Shop.id == shop_id_uuid))
    shop_status = shop_result.scalar_one_or_none()

    if not shop_status:
        raise ForbiddenException("Shop not found.")

    if shop_status == "BLOCKED":
        raise ForbiddenException("This shop has been BLOCKED. Please contact support.")

    if shop_status == "INACTIVE":
        raise ForbiddenException("This shop account is inactive.")

    if shop_status == "RESTRICTED":
        # Restricted mode = Read-only. Block write operations.
        if request.method in ["POST", "PUT", "PATCH", "DELETE"]:
            raise ForbiddenException(
                "Your shop is currently in restricted (read-only) mode. "
                "You can view existing data, but creating new records or making changes is disabled. "
                "Please contact support to restore full access."
            )

    # Refresh the inactivity timer
    await _touch_activity(user_id, session_id)

    return {
        "user_id": user_id_uuid,
        "shop_id": shop_id_uuid,
        "role": role,
        "shop_status": shop_status,
        "session_id": session_id,
    }


async def _touch_activity(user_id: str, session_id: str | None) -> None:
    """
    Refresh the inactivity timer for this session in Redis.
    Called on every successfully authenticated request.
    If the key expires (no activity for 12h), the next refresh attempt will fail.
    """
    if not session_id:
        return
    try:
        from app.core.redis import get_redis
        redis = await get_redis()
        await redis.setex(
            f"activity:{user_id}:{session_id}",
            _INACTIVITY_TIMEOUT_SECONDS,
            "1",
        )
    except Exception:
        pass  # Never block a request due to Redis hiccup


async def require_owner(
    current_user: Annotated[dict, Depends(get_current_user)],
) -> dict:
    """Dependency that restricts access to OWNER role only."""
    if current_user["role"] != "OWNER":
        raise ForbiddenException("This action requires the OWNER role.")
    return current_user


async def get_refresh_token(
    repairdesk_refresh: Annotated[str | None, Cookie()] = None,
) -> str:
    """Extract refresh token from httpOnly cookie."""
    if not repairdesk_refresh:
        raise UnauthorizedException("Refresh token not found.")
    return repairdesk_refresh


# Type aliases for cleaner endpoint signatures
CurrentUser = Annotated[dict, Depends(get_current_user)]
OwnerUser = Annotated[dict, Depends(require_owner)]
DbSession = Annotated[AsyncSession, Depends(get_db)]


# ─────────────────────── Feature Enforcement ───────────────────────

async def require_feature(
    feature_key: str,
    current_user: CurrentUser,
    db: DbSession,
) -> str:
    """
    Dependency factory: require a feature to be enabled for the current shop.
    Returns the feature value if available, raises 403 if not.

    Usage in router:
        @router.get("/analytics")
        async def analytics(val: str = Depends(require_feature_fn("analytics_access"))):
            ...
    """
    from app.modules.billing.service import has_feature
    value = await has_feature(current_user["shop_id"], feature_key, db)
    if value is None or value == "false":
        raise ForbiddenException(
            f"This feature ({feature_key}) is not available on your current plan. "
            "Please upgrade to access this feature."
        )
    return value


def require_feature_fn(feature_key: str):
    """Factory to create a feature-checking dependency for a specific feature key."""
    async def _check(current_user: CurrentUser, db: DbSession) -> str:
        return await require_feature(feature_key, current_user, db)
    return _check
