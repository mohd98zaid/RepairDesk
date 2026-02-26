# 06 — API Contracts

**Product:** RepairDesk  
**Base URL:** `https://api.repairdesk.app/api/v1`  
**Version:** 1.0  
**Date:** 2026-02-23  
**Auth:** Bearer JWT in `Authorization` header for all protected routes.

---

## 1. Conventions

- All request and response bodies are `application/json`.
- Dates and times are ISO 8601 strings in UTC (e.g., `"2026-02-23T14:30:00Z"`).
- Money fields are strings with 2 decimal places (e.g., `"120.00"`) to avoid float precision issues.
- Pagination uses `?page=1&per_page=20`; responses include `total`, `page`, `per_page`, `pages`.
- Errors follow the shape: `{ "detail": "Human readable message", "code": "ERROR_CODE" }`.

---

## 2. Authentication

### POST `/auth/register`
Register a new shop and owner account.

**Request Body:**
```json
{
  "shop_name": "TechFix Lagos",
  "full_name": "Emeka Okafor",
  "email": "emeka@techfix.ng",
  "phone": "+2348012345678",
  "password": "SecurePass123"
}
```
**Response `201`:**
```json
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "user": {
    "id": "uuid",
    "full_name": "Emeka Okafor",
    "email": "emeka@techfix.ng",
    "role": "OWNER",
    "shop_id": "uuid"
  }
}
```
**Errors:** `409` duplicate email.

---

### POST `/auth/login`
```json
// Request
{ "email": "emeka@techfix.ng", "password": "SecurePass123" }

// Response 200
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "user": { "id": "uuid", "full_name": "...", "role": "OWNER", "shop_id": "uuid" }
}
// Refresh token set in httpOnly cookie: repairdesk_refresh
```
**Errors:** `401` invalid credentials, `429` rate limited.

---

### POST `/auth/refresh`
Uses `repairdesk_refresh` cookie. Returns a new access token.

**Response `200`:** `{ "access_token": "eyJ..." }`

---

### POST `/auth/logout`
Invalidates refresh token in Redis. Returns `204 No Content`.

---

## 3. Tickets

### GET `/tickets`
List tickets for authenticated user's shop.

**Query Params:** `status`, `customer_id`, `from_date`, `to_date`, `search` (customer name), `page`, `per_page`

**Response `200`:**
```json
{
  "total": 142,
  "page": 1,
  "per_page": 20,
  "pages": 8,
  "items": [
    {
      "id": "uuid",
      "ticket_number": 42,
      "status": "READY",
      "device_type": "iPhone",
      "device_model": "13 Pro",
      "reported_issue": "Cracked screen",
      "estimated_cost": "130.00",
      "final_cost": "120.00",
      "profit": "75.00",
      "customer": { "id": "uuid", "name": "John Doe", "phone": "555-1234" },
      "assigned_to": { "id": "uuid", "full_name": "Alex" },
      "created_at": "2026-02-23T09:00:00Z",
      "updated_at": "2026-02-23T14:30:00Z"
    }
  ]
}
```

---

### POST `/tickets`
Create a new ticket.

**Request Body:**
```json
{
  "customer_id": "uuid",              // optional if using customer_phone
  "customer_phone": "+2348012345678", // used for lookup/create if customer_id absent
  "customer_name": "John Doe",        // required if new customer
  "device_type": "iPhone",
  "device_model": "13 Pro",
  "reported_issue": "Cracked screen",
  "estimated_cost": "130.00",
  "assigned_to": "uuid",              // optional
  "image_keys": ["shop_id/tickets/tmp/uuid1.jpg"]
}
```

**Response `201`:**
```json
{
  "id": "uuid",
  "ticket_number": 42,
  "status": "RECEIVED",
  "customer": { ... },
  "created_at": "2026-02-23T09:00:00Z"
}
```

---

### GET `/tickets/{ticket_id}`
Get full ticket detail.

**Response `200`:**
```json
{
  "id": "uuid",
  "ticket_number": 42,
  "status": "READY",
  "device_type": "iPhone",
  "device_model": "13 Pro",
  "reported_issue": "Cracked screen",
  "technician_notes": "Replaced screen module.",
  "estimated_cost": "130.00",
  "final_cost": "120.00",
  "parts_cost": "45.00",
  "profit": "75.00",
  "customer": { "id": "uuid", "name": "John Doe", "phone": "555-1234" },
  "assigned_to": { "id": "uuid", "full_name": "Alex" },
  "images": [
    { "id": "uuid", "url": "https://minio.../presigned", "filename": "front.jpg" }
  ],
  "parts": [
    {
      "id": "uuid",
      "inventory_item_id": "uuid",
      "name": "iPhone 13 Pro Screen",
      "quantity_used": 1,
      "unit_selling_price": "80.00",
      "unit_purchase_price": "45.00"
    }
  ],
  "status_logs": [
    { "from_status": null, "to_status": "RECEIVED", "changed_by": "Emeka", "changed_at": "..." },
    { "from_status": "RECEIVED", "to_status": "IN_PROGRESS", "notes": "Started repair", "changed_by": "Alex", "changed_at": "..." }
  ],
  "created_at": "...",
  "updated_at": "..."
}
```

---

### PATCH `/tickets/{ticket_id}`
Update ticket fields (core fields or final_cost).

**Request Body (all fields optional):**
```json
{
  "device_model": "13 Pro Max",
  "technician_notes": "Replaced screen module.",
  "estimated_cost": "130.00",
  "final_cost": "120.00",
  "assigned_to": "uuid"
}
```
**Response `200`:** Updated ticket object.

---

### POST `/tickets/{ticket_id}/status`
Change ticket status.

**Request Body:**
```json
{
  "status": "IN_PROGRESS",
  "notes": "Starting screen replacement."
}
```
**Response `200`:** `{ "status": "IN_PROGRESS", "logged_at": "..." }`  
**Errors:** `422` invalid transition, `403` forbidden (e.g., technician trying to cancel).

---

### POST `/tickets/{ticket_id}/parts`
Add a part to a ticket.

**Request Body:**
```json
{
  "inventory_item_id": "uuid",
  "quantity_used": 1
}
```
**Response `201`:** Created `ticket_part` object with price snapshots and updated ticket `parts_cost`.  
**Errors:** `409` insufficient stock.

---

### DELETE `/tickets/{ticket_id}/parts/{part_id}`
Remove a part from a ticket (restores inventory quantity).  
**Response `204`.**

---

### POST `/tickets/{ticket_id}/images/presign`
Get a presigned MinIO upload URL for a ticket photo.

**Request Body:** `{ "filename": "front_damage.jpg", "content_type": "image/jpeg" }`  
**Response `200`:** `{ "upload_url": "https://minio...", "object_key": "..." }`

---

### POST `/tickets/{ticket_id}/images/confirm`
Confirm image upload after client pushes to MinIO.

**Request Body:** `{ "object_key": "...", "filename": "front_damage.jpg", "size_bytes": 204800 }`  
**Response `201`:** `{ "id": "uuid", "url": "...", "filename": "..." }`

---

## 4. Customers

### GET `/customers`
**Query:** `search` (name or phone), `page`, `per_page`

**Response `200`:** Paginated list of `{ id, name, phone, email, ticket_count, total_spent }`.

---

### GET `/customers/{customer_id}`
**Response `200`:** Customer profile + array of tickets (summary).

---

### POST `/customers`
**Request Body:** `{ "name": "...", "phone": "...", "email": "...", "notes": "..." }`  
**Response `201`:** Customer object.

---

### PATCH `/customers/{customer_id}`
Update customer fields. **Response `200`.**

---

## 5. Inventory

### GET `/inventory`
**Query:** `search`, `low_stock` (boolean), `page`, `per_page`

**Response `200`:** Paginated list of items with `is_low_stock` boolean flag.

---

### POST `/inventory`
**Request Body:**
```json
{
  "name": "iPhone 13 Pro Screen",
  "sku": "SCR-IP13P",
  "purchase_price": "45.00",
  "selling_price": "80.00",
  "quantity": 10,
  "low_stock_threshold": 3
}
```
**Response `201`:** InventoryItem object.

---

### PATCH `/inventory/{item_id}`
Update item fields. **Response `200`.**

---

### DELETE `/inventory/{item_id}`
Soft-delete. **Response `204`.**

---

## 6. Reports

### GET `/reports/daily`
**Query:** `date` (YYYY-MM-DD, defaults to today)

**Response `200`:**
```json
{
  "date": "2026-02-23",
  "total_revenue": "1240.00",
  "total_parts_cost": "380.00",
  "net_profit": "860.00",
  "tickets_created": 12,
  "tickets_completed": 8,
  "tickets_by_status": {
    "RECEIVED": 2,
    "IN_PROGRESS": 3,
    "READY": 2,
    "DELIVERED": 8,
    "CANCELLED": 1
  }
}
```

---

### GET `/reports/range`
**Query:** `from_date`, `to_date` (max 90 days; 7 days for Free plan)

**Response `200`:**
```json
{
  "from_date": "2026-02-01",
  "to_date": "2026-02-23",
  "total_revenue": "14200.00",
  "total_parts_cost": "4100.00",
  "net_profit": "10100.00",
  "tickets_completed": 87,
  "daily_breakdown": [
    { "date": "2026-02-01", "revenue": "620.00", "profit": "430.00", "completed": 4 }
  ]
}
```

---

## 7. Invoices

### POST `/tickets/{ticket_id}/invoice`
Generate (or regenerate) an invoice PDF.

**Response `201`:**
```json
{
  "id": "uuid",
  "invoice_number": "INV-2026-0042",
  "total_amount": "120.00",
  "download_url": "https://minio.../presigned",
  "public_url": "https://repairdesk.app/public/invoice/token123",
  "generated_at": "2026-02-23T15:00:00Z"
}
```

---

### GET `/public/invoice/{public_token}`
Unauthenticated endpoint. Returns invoice HTML/PDF for customer sharing.  
**Response `200`:** Invoice data or redirect to PDF URL.

---

## 8. Users & Team

### GET `/team`
List users in the shop.  
**Response `200`:** Array of `{ id, full_name, email, role, is_active, last_login_at }`.

---

### POST `/team/invite`
**Request Body:** `{ "email": "tech@example.com", "role": "TECHNICIAN" }`  
**Response `201`:** `{ "message": "Invitation sent to tech@example.com" }`

---

### DELETE `/team/{user_id}`
Deactivate a team member. Owner only. **Response `204`.**

---

## 9. Error Codes

| HTTP | Code | Description |
|---|---|---|
| 400 | VALIDATION_ERROR | Invalid input |
| 401 | UNAUTHORIZED | Missing or invalid token |
| 403 | FORBIDDEN | Insufficient role |
| 404 | NOT_FOUND | Resource not found |
| 409 | CONFLICT | Duplicate resource or insufficient stock |
| 422 | INVALID_TRANSITION | Invalid status state machine transition |
| 429 | RATE_LIMITED | Too many requests |
| 500 | INTERNAL_ERROR | Server error |
