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


async def send_otp(email: str, db: AsyncSession) -> None:
    """
    Generate and send a 6-digit OTP to the user's email.
    """
    # Check if already registered
    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none():
        raise ConflictException(f"An account with email '{email}' already exists.")

    import random
    from app.modules.notifications.email import EmailService
    from app.core.config import settings

    otp = f"{random.randint(0, 999999):06d}"
    
    redis = await get_redis()
    await redis.setex(f"otp:{email}", 60 * 10, otp)  # 10 minutes

    html = f"<p>Your RepairDesk verification code is: <strong>{otp}</strong></p><p>This code expires in 10 minutes.</p>"
    await EmailService.send_email(email, "RepairDesk Registration OTP", html)


async def verify_otp(email: str, otp: str, db: AsyncSession) -> str:
    """
    Verify the OTP and return a verified_token valid for 5 minutes.
    """
    redis = await get_redis()
    stored_otp = await redis.get(f"otp:{email}")
    
    if not stored_otp or stored_otp != otp:
        raise UnauthorizedException("Invalid or expired OTP.")

    await redis.delete(f"otp:{email}")

    import secrets
    verified_token = secrets.token_urlsafe(32)
    await redis.setex(f"verified:{verified_token}", 60 * 5, email)  # 5 minutes
    
    return verified_token


async def register_shop(data: RegisterRequest, db: AsyncSession) -> dict:
    """
    Register a new shop and create the OWNER user.
    Requires a valid verified_token from OTP verification.
    Returns access_token + user payload.
    """
    redis = await get_redis()
    verified_email = await redis.get(f"verified:{data.verified_token}")
    
    if not verified_email or verified_email != data.email:
        raise UnauthorizedException("Invalid or expired verification token. Please verify your email again.")

    # Check duplicate email
    existing = await db.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none():
        raise ConflictException(f"An account with email '{data.email}' already exists.")

    # Invalidate token after single use
    await redis.delete(f"verified:{data.verified_token}")
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

    # Check shop account status
    shop_result = await db.execute(select(Shop).where(Shop.id == user.shop_id))
    shop = shop_result.scalar_one_or_none()
    if shop:
        shop_status = getattr(shop, "shop_status", "ACTIVE")
        if shop_status == "BLOCKED":
            raise UnauthorizedException(
                "Your shop account has been blocked. Please contact support."
            )
        if shop_status == "INACTIVE":
            raise UnauthorizedException(
                "Your shop account has been deactivated. Please contact support."
            )

    # Update last_login_at
    user.last_login_at = datetime.now(timezone.utc)

    token_data = {
        "sub": str(user.id),
        "shop_id": str(user.shop_id),
        "role": user.role,
        "shop_status": getattr(shop, "shop_status", "ACTIVE") if shop else "ACTIVE",
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


async def forgot_password(email: str, db: AsyncSession) -> None:
    """
    Generate a password reset token and send an email.
    We don't raise an error if the email doesn't exist for security reasons.
    """
    result = await db.execute(select(User).where(User.email == email, User.is_active == True))
    user = result.scalar_one_or_none()
    if not user:
        return

    import secrets
    token = secrets.token_urlsafe(32)
    
    redis = await get_redis()
    await redis.setex(f"pwreset:{token}", 60 * 15, str(user.id))  # 15 minutes
    
    from app.modules.notifications.email import EmailService
    from app.core.config import settings
    
    reset_link = f"{settings.frontend_url}/auth/reset-password?token={token}"
    html = f"<p>Hello {user.full_name},</p><p>Click <a href='{reset_link}'>here</a> to reset your Password.</p><p>This link expires in 15 minutes.</p>"
    await EmailService.send_email(user.email, "RepairDesk Password Reset", html)


async def reset_password(token: str, new_password: str, db: AsyncSession) -> None:
    """Validate token and update password."""
    redis = await get_redis()
    user_id_str = await redis.get(f"pwreset:{token}")
    if not user_id_str:
        raise UnauthorizedException("Invalid or expired password reset token.")
        
    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id_str)))
    user = result.scalar_one_or_none()
    if not user:
        raise UnauthorizedException("User no longer exists.")
        
    user.password_hash = hash_password(new_password)
    await db.flush()
    await redis.delete(f"pwreset:{token}")
