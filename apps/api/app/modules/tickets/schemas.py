from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, field_validator


class AssignedUser(BaseModel):
    id: UUID
    full_name: str
    model_config = {"from_attributes": True}


class TicketImageResponse(BaseModel):
    id: UUID
    url: str
    filename: str | None
    model_config = {"from_attributes": True}


class StatusLogResponse(BaseModel):
    from_status: str | None
    to_status: str
    notes: str | None
    changed_by: str   # full_name resolved in service
    changed_at: datetime
    model_config = {"from_attributes": True}


class TicketCreate(BaseModel):
    customer_id: UUID | None = None
    customer_phone: str | None = None
    customer_name: str | None = None
    device_type: str
    device_model: str | None = None
    reported_issue: str
    estimated_cost: str | None = None
    assigned_to: UUID | None = None
    image_keys: list[str] = []
    pre_repair_checklist: dict | None = None
    customer_signature: str | None = None
    warranty_days: int | None = None


class TicketUpdate(BaseModel):
    device_model: str | None = None
    technician_notes: str | None = None
    estimated_cost: str | None = None
    final_cost: str | None = None
    assigned_to: UUID | None = None
    pre_repair_checklist: dict | None = None
    customer_signature: str | None = None
    warranty_days: int | None = None


class TicketStatusUpdate(BaseModel):
    status: str
    notes: str | None = None


class PresignRequest(BaseModel):
    filename: str
    content_type: str = "image/jpeg"


class PresignResponse(BaseModel):
    upload_url: str
    object_key: str


class TicketPartCreate(BaseModel):
    inventory_item_id: UUID
    quantity_used: int


class TicketPartResponse(BaseModel):
    id: UUID
    inventory_item_id: UUID
    name: str
    quantity_used: int
    unit_purchase_price: str
    unit_selling_price: str
    model_config = {"from_attributes": True}


class ConfirmUploadRequest(BaseModel):
    object_key: str
    filename: str
    size_bytes: int


class TicketChargeCreate(BaseModel):
    name: str
    amount: str


class TicketChargeResponse(BaseModel):
    id: UUID
    ticket_id: UUID
    name: str
    amount: str
    created_at: datetime

    @field_validator("amount", mode="before")
    def truncate_decimals(cls, v):
        return str(v)

    model_config = {"from_attributes": True}


class TicketSummaryResponse(BaseModel):
    id: UUID
    ticket_number: int
    status: str
    device_type: str
    device_model: str | None
    reported_issue: str
    estimated_cost: str | None
    final_cost: str | None
    profit: str | None
    customer: "CustomerInTicketResponse"
    assigned_to: AssignedUser | None
    created_at: datetime
    updated_at: datetime
    warranty_days: int | None = None
    model_config = {"from_attributes": True}


class CustomerInTicketResponse(BaseModel):
    id: UUID
    name: str
    phone: str
    model_config = {"from_attributes": True}


class TicketDetailResponse(TicketSummaryResponse):
    technician_notes: str | None
    parts_cost: str
    pre_repair_checklist: dict | None = None
    customer_signature: str | None = None
    images: list[TicketImageResponse] = []
    parts: list[TicketPartResponse] = []
    status_logs: list[StatusLogResponse] = []


class TicketListResponse(BaseModel):
    id: UUID
    ticket_number: int
    status: str
    device_type: str
    device_model: str | None = None
    reported_issue: str
    estimated_cost: str | None = None
    final_cost: str | None = None
    profit: str | None = None
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class PaginatedTickets(BaseModel):
    total: int
    page: int
    per_page: int
    pages: int
    items: list[TicketListResponse]

class TicketCreateResponse(BaseModel):
    id: UUID
    ticket_number: int
    status: str
    created_at: datetime
    model_config = {"from_attributes": True}

class TicketUpdateResponse(BaseModel):
    id: UUID
    ticket_number: int
    status: str
    final_cost: str | None = None
    profit: str | None = None
    model_config = {"from_attributes": True}
