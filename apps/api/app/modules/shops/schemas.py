from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr


class ShopResponse(BaseModel):
    id: UUID
    short_id: str | None = None
    name: str
    phone: str | None
    email: str | None
    address: str | None
    pincode: str | None
    gst_number: str | None
    logo_data: str | None
    plan: str
    is_active: bool
    shop_status: str = "ACTIVE"
    admin_note: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ShopUpdate(BaseModel):
    name: str | None = None
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    pincode: str | None = None
    gst_number: str | None = None
    logo_data: str | None = None

