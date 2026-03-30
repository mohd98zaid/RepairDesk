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


async def get_current_user(
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Extract and validate the JWT Bearer token from the Authorization header.
    Returns the decoded token payload including user_id, shop_id, role.
    Also enforces shop health/status (BLOCKED, RESTRICTED, etc).
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise UnauthorizedException("Missing or invalid Authorization header.")

    token = authorization.split(" ", 1)[1]
    try:
        payload = decode_token(token)
    except JWTError:
        raise UnauthorizedException("Token is invalid or expired.")

    if payload.get("type") != "access":
        raise UnauthorizedException("Invalid token type.")

    user_id = payload.get("sub")
    shop_id = payload.get("shop_id")
    role = payload.get("role")

    session_id = payload.get("session_id")

    if not user_id or not shop_id or not role:
        raise UnauthorizedException("Token payload is incomplete.")

    # ─── REAL-TIME SHOP STATUS ENFORCEMENT ───
    # We check the database status on every request to ensure immediate enforcement
    # of blocks/restrictions even if the user still has a valid token.
    result = await db.execute(select(Shop.shop_status).where(Shop.id == shop_id))
    shop_status = result.scalar_one_or_none()

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

    return {
        "user_id": user_id,
        "shop_id": shop_id,
        "role": role,
        "shop_status": shop_status,
        "session_id": session_id,
    }


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
