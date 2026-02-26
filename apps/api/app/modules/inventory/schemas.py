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
    short_id: str | None = None
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

    @field_validator("purchase_price", "selling_price", mode="before")
    def truncate_decimals(cls, v):
        return str(v)

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

    @field_validator("unit_selling_price", "unit_purchase_price", "line_total", mode="before")
    def truncate_decimals(cls, v):
        return str(v)

    model_config = {"from_attributes": True}


class PaginatedInventory(BaseModel):
    total: int
    page: int
    per_page: int
    pages: int
    items: list[InventoryResponse]
    low_stock_count: int


# --- Vendor Schemas ---
class VendorCreate(BaseModel):
    name: str
    contact_name: str | None = None
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    website: str | None = None
    notes: str | None = None


class VendorUpdate(BaseModel):
    name: str | None = None
    contact_name: str | None = None
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    website: str | None = None
    notes: str | None = None


class VendorResponse(VendorCreate):
    id: UUID
    shop_id: UUID
    created_at: datetime
    updated_at: datetime
    
    model_config = {"from_attributes": True}


# --- Purchase Order Schemas ---
class POItemCreate(BaseModel):
    inventory_item_id: UUID
    quantity: int
    unit_cost: str


class PurchaseOrderCreate(BaseModel):
    vendor_id: UUID
    po_number: str
    status: str = "DRAFT"
    notes: str | None = None
    items: list[POItemCreate]


class PurchaseOrderUpdate(BaseModel):
    status: str | None = None
    notes: str | None = None


class POItemResponse(POItemCreate):
    id: UUID
    po_id: UUID
    created_at: datetime
    
    model_config = {"from_attributes": True}


class PurchaseOrderResponse(BaseModel):
    id: UUID
    shop_id: UUID
    vendor_id: UUID
    po_number: str
    status: str
    total_amount: str
    notes: str | None
    created_at: datetime
    updated_at: datetime
    # We could include items here, but a separate endpoint or joined response might be better.
    items: list[POItemResponse] = []
    
    model_config = {"from_attributes": True}
