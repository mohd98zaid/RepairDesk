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

router = APIRouter(prefix="/auth", tags=["Authentication"])

ACCESS_COOKIE_NAME = "repairdesk_access"
REFRESH_COOKIE_NAME = "repairdesk_refresh"
REFRESH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7  # 7 days
ACCESS_COOKIE_MAX_AGE = 60 * 15  # 15 minutes

# In dev (HTTP localhost), secure=True causes browsers to reject cookies.
# In production (HTTPS), secure=True is required.
_COOKIE_SECURE = settings.is_production


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    """Set both access and refresh tokens as httpOnly cookies."""
    response.set_cookie(
        key=ACCESS_COOKIE_NAME,
        value=access_token,
        httponly=True,
        secure=_COOKIE_SECURE,
        samesite="none" if _COOKIE_SECURE else "lax",
        max_age=ACCESS_COOKIE_MAX_AGE,
        path="/",
    )
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        secure=_COOKIE_SECURE,
        samesite="none" if _COOKIE_SECURE else "lax",
        max_age=REFRESH_COOKIE_MAX_AGE,
        path="/",
    )


def _clear_auth_cookies(response: Response) -> None:
    """Delete both auth cookies."""
    samesite = "none" if _COOKIE_SECURE else "lax"
    response.delete_cookie(key=ACCESS_COOKIE_NAME, path="/", secure=_COOKIE_SECURE, samesite=samesite)
    response.delete_cookie(key=REFRESH_COOKIE_NAME, path="/", secure=_COOKIE_SECURE, samesite=samesite)


from slowapi import Limiter
from slowapi.util import get_remote_address
limiter = Limiter(key_func=get_remote_address)

@router.post("/send-otp", status_code=202)
@limiter.limit("5/minute")
async def send_otp(request: Request, data: SendOtpRequest, db: DbSession):
    """Send a 6-digit OTP to a valid Gmail address."""
    await service.send_otp(data.email, db)
    return {"message": "OTP sent successfully."}


@router.post("/verify-otp", response_model=VerifyOtpResponse, status_code=200)
@limiter.limit("10/minute")
async def verify_otp(request: Request, data: VerifyOtpRequest, db: DbSession):
    """Verify the 6-digit OTP and return a verified_token."""
    token = await service.verify_otp(data.email, data.otp, db)
    return VerifyOtpResponse(verified_token=token)


@router.post("/register", status_code=201)
@limiter.limit("5/minute")
async def register(
    request: Request,
    data: RegisterRequest,
    response: Response,
    db: DbSession,
):
    """Register a new shop and owner account. Tokens set as httpOnly cookies."""
    result = await service.register_shop(data, db)
    _set_auth_cookies(response, result["access_token"], result["refresh_token"])

    user_obj = result["user"]
    return {
        "user": AuthUserPayload(
            id=user_obj.id,
            full_name=user_obj.full_name,
            email=user_obj.email,
            role=str(user_obj.role.value) if hasattr(user_obj.role, "value") else str(user_obj.role),
            shop_id=user_obj.shop_id,
        ).model_dump(mode="json"),
    }


@router.post("/login", status_code=200)
@limiter.limit("10/minute")
async def login(
    request: Request,
    data: LoginRequest,
    response: Response,
    db: DbSession,
):
    """Authenticate with email + password. Tokens set as httpOnly cookies."""
    result = await service.login_user(data, db)
    _set_auth_cookies(response, result["access_token"], result["refresh_token"])

    user_obj = result["user"]
    return {
        "user": AuthUserPayload(
            id=user_obj.id,
            full_name=user_obj.full_name,
            email=user_obj.email,
            role=str(user_obj.role.value) if hasattr(user_obj.role, "value") else str(user_obj.role),
            shop_id=user_obj.shop_id,
        ).model_dump(mode="json"),
    }


@router.post("/refresh", status_code=200)
@limiter.limit("30/minute")
async def refresh(
    request: Request,
    response: Response,
    db: DbSession,
    repairdesk_refresh: str | None = Cookie(default=None),
):
    """Exchange a valid refresh token for new access+refresh tokens. Reads from httpOnly cookie."""
    if not repairdesk_refresh:
        raise UnauthorizedException("Refresh token not found.")

    result = await service.refresh_access_token(repairdesk_refresh, db)
    _set_auth_cookies(response, result["access_token"], result["refresh_token"])

    return {"ok": True}


@router.post("/logout", status_code=204)
async def logout(
    response: Response,
    current_user: CurrentUser,
):
    """Revoke refresh token and clear cookies."""
    await service.logout_user(current_user["user_id"], current_user.get("session_id"))
    _clear_auth_cookies(response)


@router.post("/forgot-password", status_code=202)
@limiter.limit("3/minute")
async def forgot_password(request: Request, data: ForgotPasswordRequest, db: DbSession):
    """Send a password reset email if the account exists."""
    await service.forgot_password(data.email, db)
    return {"message": "If that email exists, a reset link has been sent."}


@router.post("/reset-password", status_code=200)
@limiter.limit("5/minute")
async def reset_password(request: Request, data: ResetPasswordRequest, db: DbSession):
    """Reset the password using a valid token."""
    await service.reset_password(data.token, data.new_password, db)
    return {"message": "Password successfully updated."}


@router.post("/force-logout-otp", status_code=202)
@limiter.limit("5/minute")
async def force_logout_otp(request: Request, data: ForceLogoutOtpRequest, db: DbSession):
    """Send a 6-digit OTP to allow the user to force-logout all other active sessions."""
    await service.send_force_logout_otp(data.email, db)
    return {"message": "If that email has an active account, an OTP has been sent."}


@router.post("/force-logout-login", status_code=200)
@limiter.limit("5/minute")
async def force_logout_login(
    request: Request,
    data: ForceLogoutRequest,
    response: Response,
    db: DbSession,
):
    """Verify OTP, evict all other sessions, and issue a fresh session. Tokens as httpOnly cookies."""
    result = await service.force_logout_others_and_login(data.email, data.otp, data.password, db)
    _set_auth_cookies(response, result["access_token"], result["refresh_token"])

    user_obj = result["user"]
    return {
        "user": AuthUserPayload(
            id=user_obj.id,
            full_name=user_obj.full_name,
            email=user_obj.email,
            role=str(user_obj.role.value) if hasattr(user_obj.role, "value") else str(user_obj.role),
            shop_id=user_obj.shop_id,
        ).model_dump(mode="json"),
    }


@router.get("/me", status_code=200)
async def get_me(current_user: CurrentUser):
    """Return current user info (from cookie-based auth)."""
    return current_user
