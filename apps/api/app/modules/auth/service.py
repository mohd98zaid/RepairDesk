import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictException, UnauthorizedException, ForbiddenException
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
    Does not leak whether the email is already registered.
    """
    # Check if already registered
    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none():
        # Don't reveal email exists — return success anyway
        return

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

    # Check duplicate email (after invalidating token to close race window)
    await redis.delete(f"verified:{data.verified_token}")
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
    session_id = str(uuid.uuid4())
    token_data = {
        "sub": str(user.id),
        "shop_id": str(shop.id),
        "role": user.role,
        "session_id": session_id,
    }
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    # Store refresh token in Redis
    redis = await get_redis()
    await redis.setex(
        f"refresh:{user.id}:{session_id}",
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
    shop = None
    try:
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
    except UnauthorizedException:
        raise
    except Exception:
        pass  # If shop lookup fails, continue with login

    # Update last_login_at (defensively — column may not exist on old DBs)
    try:
        user.last_login_at = datetime.now(timezone.utc)
    except Exception:
        pass

    redis = await get_redis()
    session_id = str(uuid.uuid4())

    # Enforce device limits:
    # 1. Admin custom override takes priority over everything
    # 2. Fall back to billing plan feature (device_limit)
    # 3. Default to 1 if nothing is configured
    custom_limit = getattr(shop, "custom_device_limit", None) if shop else None
    device_limit = 1

    if custom_limit is not None:
        # Admin-set override: 0 or negative = unlimited
        device_limit = -1 if custom_limit <= 0 else custom_limit
    else:
        try:
            from app.modules.billing.service import has_feature
            device_limit_str = await has_feature(user.shop_id, "device_limit", db)

            if device_limit_str in ("unlimited", "-1"):
                device_limit = -1
            else:
                device_limit = int(device_limit_str) if device_limit_str and device_limit_str.isdigit() else 1
        except Exception:
            device_limit = 1

    # Collect all active session keys for this user
    all_session_keys: list[str] = []
    cursor = "0"
    while True:
        cursor, keys = await redis.scan(cursor=cursor, match=f"refresh:{user.id}:*")
        all_session_keys.extend(keys)
        if cursor == "0" or not cursor:
            break

    active_sessions = len(all_session_keys)

    if device_limit != -1 and active_sessions >= device_limit:
        if device_limit == 1:
            if all_session_keys:
                await redis.delete(*all_session_keys)
        else:
            raise ForbiddenException(
                f"Device limit reached. Your plan allows a maximum of {device_limit} active session(s). "
                "Please log out of another device or upgrade your plan."
            )

    token_data = {
        "sub": str(user.id),
        "shop_id": str(user.shop_id),
        "role": str(user.role) if hasattr(user.role, "value") else user.role,
        "shop_status": getattr(shop, "shop_status", "ACTIVE") if shop else "ACTIVE",
        "session_id": session_id,
    }
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    # Store refresh token in Redis
    await redis.setex(
        f"refresh:{user.id}:{session_id}",
        60 * 60 * 24 * 7,
        refresh_token,
    )

    # Seed activity key so the 12-hour inactivity clock starts from login
    await redis.setex(f"activity:{user.id}:{session_id}", 60 * 60 * 12, "1")

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
    session_id = payload.get("session_id")
    if not session_id:
        raise UnauthorizedException("Invalid token payload: missing session_id")

    redis = await get_redis()
    stored_token = await redis.get(f"refresh:{user_id}:{session_id}")

    if not stored_token or stored_token != refresh_token:
        raise UnauthorizedException("Refresh token has been revoked.")

    # ─── Inactivity check ───────────────────────────────────────
    # If the user hasn't made any API call in the last 12 hours, the
    # activity key will have expired. Force them to log in again.
    activity_key = f"activity:{user_id}:{session_id}"
    activity_exists = await redis.exists(activity_key)
    if not activity_exists:
        # Revoke the refresh token too — clean up the session
        await redis.delete(f"refresh:{user_id}:{session_id}")
        raise UnauthorizedException(
            "Your session has expired due to inactivity. Please log in again."
        )

    # Verify user still exists and is active
    result = await db.execute(select(User).where(User.id == user_id, User.is_active == True))
    user = result.scalar_one_or_none()
    if not user:
        raise UnauthorizedException("User not found or inactive.")

    from app.modules.shops.models import Shop
    shop_result = await db.execute(select(Shop.shop_status).where(Shop.id == user.shop_id))
    shop_status = shop_result.scalar_one_or_none()

    if not shop_status or shop_status in ("BLOCKED", "INACTIVE"):
        raise UnauthorizedException("Your shop account is currently not active.")

    token_data = {
        "sub": str(user.id),
        "shop_id": str(user.shop_id),
        "role": user.role,
        "shop_status": shop_status,
        "session_id": session_id,
    }
    return create_access_token(token_data)


async def logout_user(user_id: str, session_id: str | None = None) -> None:
    """Revoke the refresh token by deleting it from Redis."""
    redis = await get_redis()
    if session_id:
        await redis.delete(f"refresh:{user_id}:{session_id}")
    else:
        # Fallback
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
    
    reset_link = f"{settings.frontend_url}/reset-password?token={token}"
    html = (
        f"<div style='font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0f172a;color:#e2e8f0;border-radius:16px'>"
        f"<div style='display:flex;align-items:center;gap:10px;margin-bottom:24px'>"
        f"<div style='width:36px;height:36px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:bold;font-size:18px'>R</div>"
        f"<span style='font-size:18px;font-weight:700;color:#fff'>RepairDesk</span>"
        f"</div>"
        f"<h2 style='font-size:22px;font-weight:700;color:#fff;margin:0 0 10px'>Reset Your Password</h2>"
        f"<p style='color:#94a3b8;margin:0 0 24px'>Hello {user.full_name}, you requested a password reset for your RepairDesk account.</p>"
        f"<a href='{reset_link}' style='display:block;text-align:center;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-weight:700;font-size:15px;padding:14px 24px;border-radius:10px;text-decoration:none;margin-bottom:20px'>"
        f"Reset Password</a>"
        f"<p style='color:#475569;font-size:12px;margin:0'>This link expires in <strong style=color:#94a3b8>15 minutes</strong>. If you didn't request this, you can safely ignore this email.</p>"
        f"<hr style='border:none;border-top:1px solid #1e293b;margin:24px 0'>"
        f"<p style='color:#334155;font-size:11px;margin:0'>If the button doesn't work, copy this link: <br/><span style=color:#6366f1>{reset_link}</span></p>"
        f"</div>"
    )
    await EmailService.send_email(user.email, "RepairDesk — Reset Your Password", html)



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
    
    # Delete all active sessions to terminate compromised logins
    cursor = "0"
    while True:
        cursor, keys = await redis.scan(cursor=cursor, match=f"refresh:{user_id_str}*")
        if keys:
            await redis.delete(*keys)
        if cursor == "0" or not cursor:
            break


async def send_force_logout_otp(email: str, db: AsyncSession) -> None:
    """
    Send a 6-digit OTP to allow the user to force-logout all other sessions.
    Uses a separate Redis namespace (force_logout_otp:) to avoid collision
    with registration OTPs.
    """
    result = await db.execute(select(User).where(User.email == email, User.is_active == True))
    user = result.scalar_one_or_none()
    # Don't reveal whether the email exists
    if not user:
        return

    import random
    from app.modules.notifications.email import EmailService

    otp = f"{random.randint(0, 999999):06d}"
    redis = await get_redis()
    await redis.setex(f"force_logout_otp:{email}", 60 * 10, otp)  # 10 minutes

    html = (
        f"<p>Hello {user.full_name},</p>"
        f"<p>Someone is trying to <strong>force-logout all other devices</strong> on your RepairDesk account.</p>"
        f"<p>Your one-time code is: <strong style='font-size:24px;letter-spacing:4px'>{otp}</strong></p>"
        f"<p>This code expires in <strong>10 minutes</strong>. If this wasn't you, please secure your account immediately.</p>"
    )
    await EmailService.send_email(email, "RepairDesk — Force Logout OTP", html)


async def force_logout_others_and_login(email: str, otp: str, password: str, db: AsyncSession) -> dict:
    """
    Verify the force-logout OTP + password, evict all existing sessions for this
    user from Redis, then issue a brand-new session. Returns the same shape as login_user().
    """
    # Verify OTP
    redis = await get_redis()
    stored_otp = await redis.get(f"force_logout_otp:{email}")
    if not stored_otp or stored_otp != otp:
        raise UnauthorizedException("Invalid or expired OTP. Please request a new one.")

    # Verify credentials
    result = await db.execute(select(User).where(User.email == email, User.is_active == True))
    user = result.scalar_one_or_none()
    if not user or not verify_password(password, user.password_hash):
        raise UnauthorizedException("Invalid email or password.")

    # Consume OTP immediately to prevent replay
    await redis.delete(f"force_logout_otp:{email}")

    # Evict ALL existing sessions for this user
    cursor = "0"
    while True:
        cursor, keys = await redis.scan(cursor=cursor, match=f"refresh:{user.id}:*")
        if keys:
            await redis.delete(*keys)
        if cursor == "0" or not cursor:
            break

    # Check shop status
    shop_result = await db.execute(select(Shop).where(Shop.id == user.shop_id))
    shop = shop_result.scalar_one_or_none()
    if shop:
        shop_status = getattr(shop, "shop_status", "ACTIVE")
        if shop_status == "BLOCKED":
            raise UnauthorizedException("Your shop account has been blocked. Please contact support.")
        if shop_status == "INACTIVE":
            raise UnauthorizedException("Your shop account has been deactivated. Please contact support.")

    # Update last_login_at
    user.last_login_at = datetime.now(timezone.utc)

    # Issue a fresh session
    session_id = str(uuid.uuid4())
    token_data = {
        "sub": str(user.id),
        "shop_id": str(user.shop_id),
        "role": user.role,
        "shop_status": getattr(shop, "shop_status", "ACTIVE") if shop else "ACTIVE",
        "session_id": session_id,
    }
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    await redis.setex(
        f"refresh:{user.id}:{session_id}",
        60 * 60 * 24 * 7,
        refresh_token,
    )

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "user": user,
    }
