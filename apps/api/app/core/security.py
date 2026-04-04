from datetime import datetime, timedelta, timezone
from typing import Any
import secrets as _secrets

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT claims
_JWT_ISSUER = "repairdesk-api"
_JWT_AUDIENCE = "repairdesk-clients"


def hash_password(plain_password: str) -> str:
    """Hash a plain-text password using bcrypt."""
    return pwd_context.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain-text password against its bcrypt hash."""
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict[str, Any], expires_delta: timedelta | None = None) -> str:
    """Create a signed JWT access token with iss, aud, jti claims."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    )
    to_encode.update({
        "exp": expire,
        "type": "access",
        "iss": _JWT_ISSUER,
        "aud": _JWT_AUDIENCE,
        "jti": _secrets.token_urlsafe(16),  # unique token ID for revocation
    })
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_refresh_token(data: dict[str, Any]) -> str:
    """Create a signed JWT refresh token with iss, aud, jti claims."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    to_encode.update({
        "exp": expire,
        "type": "refresh",
        "iss": _JWT_ISSUER,
        "aud": _JWT_AUDIENCE,
        "jti": _secrets.token_urlsafe(16),
    })
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict[str, Any]:
    """Decode and validate a JWT. Raises JWTError on failure."""
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            issuer=_JWT_ISSUER,
            audience=_JWT_AUDIENCE,
        )
        return payload
    except JWTError:
        raise
