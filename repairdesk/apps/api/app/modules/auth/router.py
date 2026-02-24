from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.dependencies import CurrentUser, DbSession, get_refresh_token
from app.modules.auth import service
from app.modules.auth.schemas import (
    LoginRequest,
    RefreshResponse,
    RegisterRequest,
    TokenResponse,
    AuthUserPayload,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])

REFRESH_COOKIE_NAME = "repairdesk_refresh"
REFRESH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7  # 7 days


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(
    data: RegisterRequest,
    response: Response,
    db: DbSession,
):
    """Register a new shop and owner account. Returns JWT access token."""
    result = await service.register_shop(data, db)

    # Set httpOnly refresh cookie
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=result["refresh_token"],
        httponly=True,
        secure=False,  # Set True in production via env (HTTPS required)
        samesite="lax",
        max_age=REFRESH_COOKIE_MAX_AGE,
    )

    return TokenResponse(
        access_token=result["access_token"],
        user=AuthUserPayload.model_validate(result["user"]),
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    data: LoginRequest,
    response: Response,
    db: DbSession,
):
    """Authenticate with email + password. Returns JWT access token."""
    result = await service.login_user(data, db)

    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=result["refresh_token"],
        httponly=True,
        secure=False,  # Set True in production via env (HTTPS required)
        samesite="lax",
        max_age=REFRESH_COOKIE_MAX_AGE,
    )

    return TokenResponse(
        access_token=result["access_token"],
        user=AuthUserPayload.model_validate(result["user"]),
    )


@router.post("/refresh", response_model=RefreshResponse)
async def refresh(
    db: DbSession,
    refresh_token: str = Depends(get_refresh_token),
):
    """Exchange a valid refresh token for a new access token."""
    access_token = await service.refresh_access_token(refresh_token, db)
    return RefreshResponse(access_token=access_token)


@router.post("/logout", status_code=204)
async def logout(
    response: Response,
    current_user: CurrentUser,
):
    """Revoke refresh token and clear the cookie."""
    await service.logout_user(current_user["user_id"])
    response.delete_cookie(key=REFRESH_COOKIE_NAME)
