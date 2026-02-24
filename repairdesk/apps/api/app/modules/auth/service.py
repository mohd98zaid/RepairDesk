import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictException, UnauthorizedException
from app.core.redis import get_redis
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.modules.auth.schemas import LoginRequest, RegisterRequest
from app.modules.shops.models import Shop
from app.modules.users.models import User


async def register_shop(data: RegisterRequest, db: AsyncSession) -> dict:
    """
    Register a new shop and create the OWNER user.
    Returns access_token + user payload.
    """
    # Check duplicate email
    existing = await db.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none():
        raise ConflictException(f"An account with email '{data.email}' already exists.")

    # Create shop
    shop = Shop(
        name=data.shop_name,
        phone=data.phone,
        email=data.email,
        plan="free",
    )
    db.add(shop)
    await db.flush()  # get shop.id

    # Create owner user
    user = User(
        shop_id=shop.id,
        full_name=data.full_name,
        email=data.email,
        password_hash=hash_password(data.password),
        role="OWNER",
    )
    db.add(user)
    await db.flush()

    # Issue tokens
    token_data = {
        "sub": str(user.id),
        "shop_id": str(shop.id),
        "role": user.role,
    }
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    # Store refresh token in Redis
    redis = await get_redis()
    await redis.setex(
        f"refresh:{user.id}",
        60 * 60 * 24 * 7,  # 7 days in seconds
        refresh_token,
    )

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "user": user,
    }


async def login_user(data: LoginRequest, db: AsyncSession) -> dict:
    """
    Authenticate a user by email + password.
    Returns access_token, refresh_token, and user payload.
    """
    result = await db.execute(select(User).where(User.email == data.email, User.is_active == True))
    user = result.scalar_one_or_none()

    if not user or not verify_password(data.password, user.password_hash):
        raise UnauthorizedException("Invalid email or password.")

    # Update last_login_at
    user.last_login_at = datetime.now(timezone.utc)

    token_data = {
        "sub": str(user.id),
        "shop_id": str(user.shop_id),
        "role": user.role,
    }
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    # Store refresh token in Redis (overwrite existing)
    redis = await get_redis()
    await redis.setex(
        f"refresh:{user.id}",
        60 * 60 * 24 * 7,
        refresh_token,
    )

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "user": user,
    }


async def refresh_access_token(refresh_token: str, db: AsyncSession) -> str:
    """
    Validate the refresh token, verify it still exists in Redis,
    and issue a new access token.
    """
    from jose import JWTError

    try:
        payload = decode_token(refresh_token)
    except JWTError:
        raise UnauthorizedException("Refresh token is invalid or expired.")

    if payload.get("type") != "refresh":
        raise UnauthorizedException("Invalid token type.")

    user_id = payload.get("sub")
    redis = await get_redis()
    stored_token = await redis.get(f"refresh:{user_id}")

    if not stored_token or stored_token != refresh_token:
        raise UnauthorizedException("Refresh token has been revoked.")

    # Verify user still exists and is active
    result = await db.execute(select(User).where(User.id == user_id, User.is_active == True))
    user = result.scalar_one_or_none()
    if not user:
        raise UnauthorizedException("User not found or inactive.")

    token_data = {
        "sub": str(user.id),
        "shop_id": str(user.shop_id),
        "role": user.role,
    }
    return create_access_token(token_data)


async def logout_user(user_id: str) -> None:
    """Revoke the refresh token by deleting it from Redis."""
    redis = await get_redis()
    await redis.delete(f"refresh:{user_id}")
