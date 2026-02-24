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


class TicketUpdate(BaseModel):
    device_model: str | None = None
    technician_notes: str | None = None
    estimated_cost: str | None = None
    final_cost: str | None = None
    assigned_to: UUID | None = None


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
    model_config = {"from_attributes": True}


class CustomerInTicketResponse(BaseModel):
    id: UUID
    name: str
    phone: str
    model_config = {"from_attributes": True}


class TicketDetailResponse(TicketSummaryResponse):
    technician_notes: str | None
    parts_cost: str
    images: list[TicketImageResponse] = []
    parts: list[TicketPartResponse] = []
    status_logs: list[StatusLogResponse] = []


class PaginatedTickets(BaseModel):
    total: int
    page: int
    per_page: int
    pages: int
    items: list[TicketSummaryResponse]
