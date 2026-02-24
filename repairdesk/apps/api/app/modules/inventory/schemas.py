from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, field_validator


class InventoryCreate(BaseModel):
    name: str
    sku: str | None = None
    description: str | None = None
    purchase_price: str  # Accept string for decimal precision
    selling_price: str
    quantity: int = 0
    low_stock_threshold: int = 5


class InventoryUpdate(BaseModel):
    name: str | None = None
    sku: str | None = None
    description: str | None = None
    purchase_price: str | None = None
    selling_price: str | None = None
    quantity: int | None = None
    low_stock_threshold: int | None = None


class StockAdjustment(BaseModel):
    delta: int   # positive = restock, negative = manual deduction
    notes: str | None = None


class InventoryResponse(BaseModel):
    id: UUID
    shop_id: UUID
    name: str
    sku: str | None
    description: str | None
    purchase_price: str
    selling_price: str
    quantity: int
    low_stock_threshold: int
    is_low_stock: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class AddPartRequest(BaseModel):
    inventory_item_id: UUID
    quantity_used: int


class TicketPartResponse(BaseModel):
    id: UUID
    inventory_item_id: UUID
    name: str
    quantity_used: int
    unit_selling_price: str
    unit_purchase_price: str
    line_total: str   # quantity_used * unit_selling_price

    model_config = {"from_attributes": True}


class PaginatedInventory(BaseModel):
    total: int
    page: int
    per_page: int
    pages: int
    items: list[InventoryResponse]
    low_stock_count: int
