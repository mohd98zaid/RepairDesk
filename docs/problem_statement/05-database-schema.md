# 05 — Database Schema

**Product:** RepairDesk  
**Version:** 1.0  
**Date:** 2026-02-23  
**Database:** PostgreSQL 16

---

## 1. Entity Relationship Overview

```
Shop ──< User
Shop ──< Customer ──< Ticket ──< TicketPart >── InventoryItem
                       Ticket ──< TicketImage
                       Ticket ──── Invoice
                       Ticket ──< TicketStatusLog
```

---

## 2. Table Definitions

### 2.1 `shops`

Represents a repair shop (tenant root).

```sql
CREATE TABLE shops (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    phone           VARCHAR(30),
    email           VARCHAR(255),
    logo_key        TEXT,                       -- MinIO object key for logo
    plan            VARCHAR(20) NOT NULL DEFAULT 'free',  -- free | pro | business
    plan_expires_at TIMESTAMPTZ,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### 2.2 `users`

Employees of a shop. One shop owner, optional technicians.

```sql
CREATE TYPE user_role AS ENUM ('OWNER', 'TECHNICIAN');

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id         UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    full_name       VARCHAR(255) NOT NULL,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    role            user_role NOT NULL DEFAULT 'TECHNICIAN',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_shop_id ON users(shop_id);
CREATE INDEX idx_users_email ON users(email);
```

---

### 2.3 `invitations`

Pending invitations for new technicians.

```sql
CREATE TABLE invitations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id     UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    email       VARCHAR(255) NOT NULL,
    role        user_role NOT NULL DEFAULT 'TECHNICIAN',
    token       TEXT NOT NULL UNIQUE,           -- bcrypt of the invite token
    accepted    BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_by  UUID NOT NULL REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### 2.4 `customers`

A shop's customer directory.

```sql
CREATE TABLE customers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id     UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    phone       VARCHAR(30) NOT NULL,
    email       VARCHAR(255),
    notes       TEXT,
    is_deleted  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(shop_id, phone)                      -- phone is unique per shop
);

CREATE INDEX idx_customers_shop_id ON customers(shop_id);
CREATE INDEX idx_customers_phone ON customers(shop_id, phone);
```

---

### 2.5 `tickets`

Core entity — one repair job.

```sql
CREATE TYPE ticket_status AS ENUM (
    'RECEIVED',
    'IN_PROGRESS',
    'WAITING_PARTS',
    'READY',
    'DELIVERED',
    'CANCELLED'
);

CREATE TABLE tickets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id         UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    customer_id     UUID NOT NULL REFERENCES customers(id),
    assigned_to     UUID REFERENCES users(id),   -- nullable technician
    ticket_number   INTEGER NOT NULL,            -- auto-increment per shop
    device_type     VARCHAR(100) NOT NULL,
    device_model    VARCHAR(150),
    reported_issue  TEXT NOT NULL,
    technician_notes TEXT,
    status          ticket_status NOT NULL DEFAULT 'RECEIVED',
    estimated_cost  NUMERIC(10,2),
    final_cost      NUMERIC(10,2),
    parts_cost      NUMERIC(10,2) NOT NULL DEFAULT 0,  -- computed on save
    profit          NUMERIC(10,2),                      -- computed: final_cost - parts_cost
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(shop_id, ticket_number)
);

CREATE INDEX idx_tickets_shop_id ON tickets(shop_id);
CREATE INDEX idx_tickets_customer_id ON tickets(customer_id);
CREATE INDEX idx_tickets_status ON tickets(shop_id, status);
CREATE INDEX idx_tickets_created_at ON tickets(shop_id, created_at);
```

> **Note on `ticket_number`:** Generated via a per-shop sequence using a `shop_ticket_sequences` table or a PostgreSQL sequence per shop (managed by application logic on insert).

---

### 2.6 `ticket_images`

Photos attached to a ticket.

```sql
CREATE TABLE ticket_images (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id   UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    minio_key   TEXT NOT NULL,           -- full object key in MinIO
    filename    VARCHAR(255),
    size_bytes  INTEGER,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ticket_images_ticket_id ON ticket_images(ticket_id);
```

---

### 2.7 `inventory_items`

Parts and supplies in a shop's stock.

```sql
CREATE TABLE inventory_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id             UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    name                VARCHAR(255) NOT NULL,
    sku                 VARCHAR(100),
    purchase_price      NUMERIC(10,2) NOT NULL,
    selling_price       NUMERIC(10,2) NOT NULL,
    quantity            INTEGER NOT NULL DEFAULT 0,
    low_stock_threshold INTEGER NOT NULL DEFAULT 3,
    is_deleted          BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inventory_shop_id ON inventory_items(shop_id);
```

---

### 2.8 `ticket_parts`

Parts used in a specific repair (junction table).

```sql
CREATE TABLE ticket_parts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id           UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    inventory_item_id   UUID NOT NULL REFERENCES inventory_items(id),
    quantity_used       INTEGER NOT NULL DEFAULT 1,
    unit_purchase_price NUMERIC(10,2) NOT NULL,   -- snapshot at time of use
    unit_selling_price  NUMERIC(10,2) NOT NULL,   -- snapshot at time of use
    added_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ticket_parts_ticket_id ON ticket_parts(ticket_id);
```

> **Price Snapshot:** Unit prices are copied from inventory at the time of linking, so historical records remain correct even if prices change later.

---

### 2.9 `invoices`

Invoice records for completed tickets.

```sql
CREATE TABLE invoices (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id       UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    shop_id         UUID NOT NULL REFERENCES shops(id),
    invoice_number  VARCHAR(50) NOT NULL UNIQUE,  -- e.g. INV-2026-0042
    total_amount    NUMERIC(10,2) NOT NULL,
    minio_key       TEXT,                          -- stored PDF object key
    public_token    TEXT UNIQUE,                   -- for shareable link
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    generated_by    UUID NOT NULL REFERENCES users(id)
);

CREATE INDEX idx_invoices_ticket_id ON invoices(ticket_id);
CREATE INDEX idx_invoices_shop_id ON invoices(shop_id);
```

---

### 2.10 `ticket_status_logs`

Audit trail of all status changes.

```sql
CREATE TABLE ticket_status_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id   UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    from_status ticket_status,
    to_status   ticket_status NOT NULL,
    notes       TEXT,
    changed_by  UUID NOT NULL REFERENCES users(id),
    changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_status_logs_ticket_id ON ticket_status_logs(ticket_id);
```

---

## 3. Computed Fields & Triggers

### 3.1 `tickets.parts_cost` Trigger

Recomputed after any insert/update/delete on `ticket_parts`:

```sql
CREATE OR REPLACE FUNCTION update_ticket_parts_cost()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE tickets
    SET
        parts_cost = (
            SELECT COALESCE(SUM(quantity_used * unit_purchase_price), 0)
            FROM ticket_parts
            WHERE ticket_id = COALESCE(NEW.ticket_id, OLD.ticket_id)
        ),
        updated_at = NOW()
    WHERE id = COALESCE(NEW.ticket_id, OLD.ticket_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_parts_cost
AFTER INSERT OR UPDATE OR DELETE ON ticket_parts
FOR EACH ROW EXECUTE FUNCTION update_ticket_parts_cost();
```

### 3.2 `tickets.profit` Computed on Save

Updated by the application layer (not trigger) when `final_cost` is set:

```
profit = final_cost - parts_cost
```

---

## 4. Migrations Strategy

- **Tool:** Alembic (Python)
- **Convention:** Sequential numbered migrations in `alembic/versions/`
- **Naming:** `{timestamp}_{short_description}.py` (e.g., `20260223_0001_create_shops.py`)
- **CI enforcement:** Migration check runs in GitHub Actions on every PR targeting `main`
- **Rollback:** Each migration includes a `downgrade()` function

---

## 5. Data Retention & Soft Deletes

| Entity | Strategy |
|---|---|
| Tickets | Soft delete (`is_deleted = TRUE`); never purged |
| Customers | Soft delete; retained for ticket history |
| Inventory Items | Soft delete; retained for ticket_parts history |
| Users | Soft delete (`is_active = FALSE`) |
| Shops | Hard delete after 90-day grace period (GDPR) |
| Invoices | Retained permanently; PDF in MinIO |
