from pydantic import BaseModel, EmailStr, field_validator
from uuid import UUID


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


class VerifyOtpResponse(BaseModel):
    verified_token: str
    message: str = "Email verified successfully."


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


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    # Fix #6: refresh_token is never returned in the body (httpOnly cookie only).
    # Field kept for backward-compat clients but will always be None/empty.
    refresh_token: str | None = None
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
