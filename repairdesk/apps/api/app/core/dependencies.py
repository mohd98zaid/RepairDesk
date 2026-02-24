from typing import Annotated
from uuid import UUID

from fastapi import Cookie, Depends, Header
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.exceptions import ForbiddenException, UnauthorizedException
from app.core.security import decode_token


async def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Extract and validate the JWT Bearer token from the Authorization header.
    Returns the decoded token payload including user_id, shop_id, role.
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

    if not user_id or not shop_id or not role:
        raise UnauthorizedException("Token payload is incomplete.")

    return {
        "user_id": user_id,
        "shop_id": shop_id,
        "role": role,
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
