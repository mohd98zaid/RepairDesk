from pydantic import BaseModel, EmailStr, field_validator
from uuid import UUID
import re


class SendOtpRequest(BaseModel):
    email: EmailStr

    @field_validator("email")
    @classmethod
    def must_be_gmail(cls, v: str) -> str:
        if not v.lower().endswith("@gmail.com"):
            raise ValueError("Only Gmail addresses (@gmail.com) are allowed.")
        return v.lower()


class VerifyOtpRequest(BaseModel):
    email: EmailStr
    otp: str

    @field_validator("otp")
    @classmethod
    def validate_otp_format(cls, v: str) -> str:
        if not re.fullmatch(r"\d{6}", v):
            raise ValueError("OTP must be exactly 6 digits.")
        return v


class VerifyOtpResponse(BaseModel):
    verified_token: str
    message: str = "Email verified successfully."


def _validate_password(v: str) -> str:
    """Shared password strength validator."""
    if len(v) < 8:
        raise ValueError("Password must be at least 8 characters.")
    if not re.search(r"[A-Z]", v):
        raise ValueError("Password must contain at least one uppercase letter.")
    if not re.search(r"[0-9]", v):
        raise ValueError("Password must contain at least one number.")
    return v


class RegisterRequest(BaseModel):
    shop_name: str
    full_name: str
    email: EmailStr
    phone: str | None = None
    password: str
    verified_token: str  # Required OTP verification token

    @field_validator("email")
    @classmethod
    def must_be_gmail(cls, v: str) -> str:
        if not v.lower().endswith("@gmail.com"):
            raise ValueError("Only Gmail addresses (@gmail.com) are allowed.")
        return v.lower()

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        return _validate_password(v)

    @field_validator("shop_name")
    @classmethod
    def validate_shop_name_length(cls, v: str) -> str:
        if len(v) > 200:
            raise ValueError("Shop name must be 200 characters or less.")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str | None = None
    token_type: str = "bearer"
    user: "AuthUserPayload"


class AuthUserPayload(BaseModel):
    id: UUID
    full_name: str
    email: str
    role: str
    shop_id: UUID

    model_config = {"from_attributes": True}

    @field_validator("role", mode="before")
    @classmethod
    def coerce_role(cls, v):
        if hasattr(v, "value"):
            return v.value
        return str(v) if v is not None else v


class RefreshResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        return _validate_password(v)


class ForceLogoutOtpRequest(BaseModel):
    email: EmailStr

    @field_validator("email")
    @classmethod
    def must_be_gmail(cls, v: str) -> str:
        if not v.lower().endswith("@gmail.com"):
            raise ValueError("Only Gmail addresses (@gmail.com) are allowed.")
        return v.lower()


class ForceLogoutRequest(BaseModel):
    email: EmailStr
    otp: str
    password: str

    @field_validator("otp")
    @classmethod
    def validate_otp_format(cls, v: str) -> str:
        if not re.fullmatch(r"\d{6}", v):
            raise ValueError("OTP must be exactly 6 digits.")
        return v
