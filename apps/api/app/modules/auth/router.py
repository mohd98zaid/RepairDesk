from fastapi import APIRouter, Cookie, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_db
from app.core.dependencies import CurrentUser, DbSession
from app.core.exceptions import UnauthorizedException
from app.modules.auth import service
from app.modules.auth.schemas import (
    LoginRequest,
    RefreshResponse,
    RegisterRequest,
    TokenResponse,
    AuthUserPayload,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    SendOtpRequest,
    VerifyOtpRequest,
    VerifyOtpResponse,
    ForceLogoutOtpRequest,
    ForceLogoutRequest,
)
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

router = APIRouter(prefix="/auth", tags=["Authentication"])

REFRESH_COOKIE_NAME = "repairdesk_refresh"
REFRESH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7  # 7 days


@router.post("/send-otp", status_code=202)
@limiter.limit("5/minute")
async def send_otp(request: Request, data: SendOtpRequest, db: DbSession):
    """Send a 6-digit OTP to a valid Gmail address."""
    await service.send_otp(data.email, db)
    return {"message": "OTP sent successfully."}


@router.post("/verify-otp", response_model=VerifyOtpResponse, status_code=200)
async def verify_otp(data: VerifyOtpRequest, db: DbSession):
    """Verify the 6-digit OTP and return a verified_token."""
    token = await service.verify_otp(data.email, data.otp, db)
    return VerifyOtpResponse(verified_token=token)


@router.post("/register", response_model=TokenResponse, status_code=201)
@limiter.limit("5/minute")
async def register(
    request: Request,
    data: RegisterRequest,
    response: Response,
    db: DbSession,
):
    """Register a new shop and owner account. Returns JWT access token."""
    result = await service.register_shop(data, db)

    # Fix #6: Refresh token travels ONLY via httpOnly cookie — never in JSON body
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=result["refresh_token"],
        httponly=True,
        secure=True,
        samesite="none",
        max_age=REFRESH_COOKIE_MAX_AGE,
    )

    user_obj = result["user"]
    user_payload = AuthUserPayload(
        id=user_obj.id,
        full_name=user_obj.full_name,
        email=user_obj.email,
        role=str(user_obj.role.value) if hasattr(user_obj.role, "value") else str(user_obj.role),
        shop_id=user_obj.shop_id,
    )

    return TokenResponse(
        access_token=result["access_token"],
        refresh_token=None,  # Fix #6: never expose in body
        user=user_payload,
    )


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(
    request: Request,
    data: LoginRequest,
    response: Response,
    db: DbSession,
):
    """Authenticate with email + password. Returns JWT access token."""
    result = await service.login_user(data, db)

    # Fix #6: Refresh token travels ONLY via httpOnly cookie — never in JSON body
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=result["refresh_token"],
        httponly=True,
        secure=True,
        samesite="none",
        max_age=REFRESH_COOKIE_MAX_AGE,
    )

    user_obj = result["user"]
    user_payload = AuthUserPayload(
        id=user_obj.id,
        full_name=user_obj.full_name,
        email=user_obj.email,
        role=str(user_obj.role.value) if hasattr(user_obj.role, "value") else str(user_obj.role),
        shop_id=user_obj.shop_id,
    )

    return TokenResponse(
        access_token=result["access_token"],
        refresh_token=None,  # Fix #6: never expose in body
        user=user_payload,
    )


@router.post("/refresh", response_model=RefreshResponse)
async def refresh(
    request: Request,
    db: DbSession,
    repairdesk_refresh: str | None = Cookie(default=None),
):
    """Exchange a valid refresh token for a new access token.

    Fix #6: Refresh token is accepted ONLY from the httpOnly cookie.
    The body-fallback is removed to prevent XSS token theft.
    """
    if not repairdesk_refresh:
        raise UnauthorizedException("Refresh token not found.")

    access_token = await service.refresh_access_token(repairdesk_refresh, db)
    return RefreshResponse(access_token=access_token)


@router.post("/logout", status_code=204)
async def logout(
    response: Response,
    current_user: CurrentUser,
):
    """Revoke refresh token and clear the cookie."""
    await service.logout_user(current_user["user_id"], current_user.get("session_id"))
    response.delete_cookie(key=REFRESH_COOKIE_NAME)


@router.post("/forgot-password", status_code=202)
@limiter.limit("3/minute")
async def forgot_password(request: Request, data: ForgotPasswordRequest, db: DbSession):
    """Send a password reset email if the account exists."""
    await service.forgot_password(data.email, db)
    return {"message": "If that email exists, a reset link has been sent."}


@router.post("/reset-password", status_code=200)
async def reset_password(data: ResetPasswordRequest, db: DbSession):
    """Reset the password using a valid token."""
    await service.reset_password(data.token, data.new_password, db)
    return {"message": "Password successfully updated."}


@router.post("/force-logout-otp", status_code=202)
@limiter.limit("5/minute")
async def force_logout_otp(request: Request, data: ForceLogoutOtpRequest, db: DbSession):
    """Send a 6-digit OTP to allow the user to force-logout all other active sessions."""
    await service.send_force_logout_otp(data.email, db)
    return {"message": "If that email has an active account, an OTP has been sent."}


@router.post("/force-logout-login", response_model=TokenResponse, status_code=200)
@limiter.limit("5/minute")
async def force_logout_login(
    request: Request,
    data: ForceLogoutRequest,
    response: Response,
    db: DbSession,
):
    """Verify OTP, evict all other sessions, and issue a fresh session."""
    result = await service.force_logout_others_and_login(data.email, data.otp, data.password, db)

    # Fix #6: Refresh token travels ONLY via httpOnly cookie
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=result["refresh_token"],
        httponly=True,
        secure=True,
        samesite="none",
        max_age=REFRESH_COOKIE_MAX_AGE,
    )

    user_obj = result["user"]
    user_payload = AuthUserPayload(
        id=user_obj.id,
        full_name=user_obj.full_name,
        email=user_obj.email,
        role=str(user_obj.role.value) if hasattr(user_obj.role, "value") else str(user_obj.role),
        shop_id=user_obj.shop_id,
    )

    return TokenResponse(
        access_token=result["access_token"],
        refresh_token=None,  # Fix #6: never expose in body
        user=user_payload,
    )
