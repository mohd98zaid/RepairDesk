from datetime import datetime
from uuid import UUID
from typing import Any
from pydantic import BaseModel, ConfigDict


class ActivityLogResponse(BaseModel):
    id: UUID
    shop_id: UUID
    user_id: UUID | None
    action: str
    entity_type: str | None
    entity_id: UUID | None
    details: dict[str, Any] | None
    ip_address: str | None
    created_at: datetime
    
    # Resolved join fields (optional for UI display)
    user_name: str | None = None

    model_config = ConfigDict(from_attributes=True)


class ActivityLogListResponse(BaseModel):
    items: list[ActivityLogResponse]
    total: int
    page: int
    per_page: int
