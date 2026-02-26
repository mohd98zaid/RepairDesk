from pydantic import BaseModel
from typing import List, Any


class SearchTicketItem(BaseModel):
    id: str
    ticket_number: int
    device_type: str
    device_model: str | None = None
    reported_issue: str
    status: str


class SearchCustomerItem(BaseModel):
    id: str
    name: str
    phone: str | None = None
    email: str | None = None


class SearchInventoryItem(BaseModel):
    id: str
    name: str
    sku: str | None = None
    quantity: int
    selling_price: str


class GlobalSearchResponse(BaseModel):
    tickets: List[SearchTicketItem]
    customers: List[SearchCustomerItem]
    inventory: List[SearchInventoryItem]
