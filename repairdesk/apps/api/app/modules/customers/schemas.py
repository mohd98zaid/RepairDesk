from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


# ── Customer schemas ──────────────────────────────────────────────────────────

class CustomerBase(BaseModel):
    name: str
    phone: str
    email: str | None = None
    notes: str | None = None


class CustomerCreate(CustomerBase):
    pass


class CustomerUpdate(BaseModel):
    name: str | None = None
    phone: str | None = None
    email: str | None = None
    notes: str | None = None


class CustomerResponse(CustomerBase):
    id: UUID
    shop_id: UUID
    ticket_count: int = 0
    total_spent: str = "0.00"
    created_at: datetime

    model_config = {"from_attributes": True}


class CustomerInTicket(BaseModel):
    id: UUID
    name: str
    phone: str

    model_config = {"from_attributes": True}
