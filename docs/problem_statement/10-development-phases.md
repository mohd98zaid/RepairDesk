# 10 — Development Phases

**Product:** RepairDesk  
**Version:** 1.0 (MVP)  
**Duration:** 8 Weeks  
**Date:** 2026-02-23

---

## Phase Map

```
Week 1–2:  Foundation & Auth
Week 3–4:  Ticket Module
Week 5–6:  Inventory, Parts & Profit Engine
Week 7:    Reports, Invoices & PWA Offline
Week 8:    QA, Hardening & Production Deploy
```

---

## Phase 1: Foundation & Auth (Weeks 1–2)

**Goal:** Running monorepo, Docker stack, database, and a working authentication system end-to-end.

### Backend Tasks

- [ ] Initialise FastAPI project (`apps/api/`) with modular structure
- [ ] Configure `core/config.py` with Pydantic BaseSettings (all env vars)
- [ ] Set up async SQLAlchemy + Alembic
- [ ] Write and run initial migrations: `shops`, `users`, `invitations`
- [ ] Implement `POST /auth/register` with bcrypt + JWT issuance
- [ ] Implement `POST /auth/login` with refresh token (stored in Redis)
- [ ] Implement `POST /auth/refresh` and `POST /auth/logout`
- [ ] Implement `POST /team/invite` and invitation acceptance endpoint
- [ ] Role-based dependency: `get_current_user`, `require_owner`
- [ ] Configure CORS, rate limiting middleware

### Frontend Tasks

- [ ] Initialise Next.js project (`apps/web/`) with App Router, TailwindCSS, ShadCN UI
- [ ] Set up Zustand store for auth (`authStore.ts`)
- [ ] Build `/auth/register` page + form (RHF + Zod)
- [ ] Build `/auth/login` page + form
- [ ] Build `/auth/forgot-password` page
- [ ] Auth guard in `(app)/layout.tsx` — redirect if no token
- [ ] Token refresh logic in API client (`lib/api/client.ts`)
- [ ] App shell: bottom nav (mobile) + sidebar (desktop)

### DevOps Tasks

- [ ] Set up monorepo root (`Makefile`, `.gitignore`, `.env.example`)
- [ ] Write `Dockerfile.api` and `Dockerfile.web`
- [ ] Write `docker-compose.dev.yml` (all services, hot-reload)
- [ ] Write `docker-compose.yml` (production)
- [ ] Configure Nginx (`repairdesk.conf`) with SSL + proxy rules
- [ ] Set up GitHub Actions: lint + test on PR
- [ ] Set up GitHub Actions: deploy on `main` push

### Deliverables

- A user can register a shop, log in, receive a JWT, and access the authenticated shell.
- The full Docker stack runs locally with `make dev`.
- CI pipeline runs on every PR.

---

## Phase 2: Ticket Module (Weeks 3–4)

**Goal:** Full ticket lifecycle — create, view, update status, attach images, search.

### Backend Tasks

- [ ] Migrations: `customers`, `tickets`, `ticket_images`, `ticket_status_logs`
- [ ] `POST /tickets` — create ticket (auto-create customer if new)
- [ ] `GET /tickets` — list with filters (status, date, search) + pagination
- [ ] `GET /tickets/{id}` — full detail with logs, images, parts placeholder
- [ ] `PATCH /tickets/{id}` — update core fields
- [ ] `POST /tickets/{id}/status` — enforce state machine, log change
- [ ] `POST /tickets/{id}/images/presign` — return MinIO presigned URL
- [ ] `POST /tickets/{id}/images/confirm` — register uploaded image
- [ ] `GET /customers` — list with search
- [ ] `GET /customers/{id}` — profile + ticket history
- [ ] `POST /customers` and `PATCH /customers/{id}`

### Frontend Tasks

- [ ] `/app/tickets` page — ticket list with status chips and filter bar
- [ ] `/app/tickets/new` page — create ticket form:
  - Customer phone search with inline create
  - Device type + model + issue fields
  - Estimated cost (optional)
  - Image uploader with preview (presigned URL upload)
- [ ] `/app/tickets/[id]` page — ticket detail:
  - Header: ticket number, status badge, device info
  - Customer section with link
  - Images carousel
  - Activity log timeline
  - Status change button (role-aware)
  - Final cost input (owner only)
- [ ] `StatusChangeModal` component
- [ ] `/app/customers` page — customer list + search
- [ ] `/app/customers/[id]` page — customer profile + history

### Deliverables

- Full ticket lifecycle from creation to delivery is functional.
- Images can be uploaded and viewed per ticket.
- Status machine is enforced on backend and reflected in UI.

---

## Phase 3: Inventory, Parts & Profit Engine (Weeks 5–6)

**Goal:** Inventory management, parts linkage to tickets, automatic profit calculation, stock deduction.

### Backend Tasks

- [ ] Migrations: `inventory_items`, `ticket_parts`
- [ ] Database trigger: `trg_update_parts_cost`
- [ ] `GET /inventory`, `POST /inventory`, `PATCH /inventory/{id}`, `DELETE /inventory/{id}`
- [ ] `POST /tickets/{id}/parts` — add part with stock validation
- [ ] `DELETE /tickets/{id}/parts/{part_id}` — remove part, restore stock
- [ ] Update `deliver_ticket()` — atomic stock deduction transaction
- [ ] `profit` field: computed in `update_profit()` service method whenever `final_cost` changes
- [ ] Low-stock detection: `is_low_stock` flag in inventory list response

### Frontend Tasks

- [ ] `/app/inventory` page — table with low-stock badges, search, sort
- [ ] `/app/inventory/new` and `/app/inventory/[id]/edit` — item form
- [ ] `PartsSelector` component in ticket detail:
  - Search inventory by name
  - Add part with quantity
  - Display line items with price (selling price visible to owner)
  - Running parts cost total
- [ ] Display profit on ticket detail (owner only, after final_cost set)
- [ ] `LowStockBadge` component
- [ ] Low-stock alert banner on inventory page if any items are critical

### Deliverables

- Technician can add parts from inventory to a ticket.
- Profit is automatically computed and shown to owner.
- Stock is deducted atomically when ticket is delivered.
- Low-stock items are visually flagged.

---

## Phase 4: Reports, Invoices & PWA Offline (Week 7)

**Goal:** Financial reporting, invoice PDF generation, PWA installability, offline read cache, and offline write queue.

### Backend Tasks

- [ ] Migrations: `invoices`
- [ ] `GET /reports/daily` — daily metrics with plan enforcement
- [ ] `GET /reports/range` — range report with per-day breakdown
- [ ] `POST /tickets/{id}/invoice` — generate PDF via WeasyPrint, store in MinIO, return presigned download URL + public token
- [ ] `GET /public/invoice/{token}` — unauthenticated invoice view

### Frontend Tasks

- [ ] `/app/reports` page:
  - Date picker (single date for daily, range for range)
  - KPI cards: revenue, parts cost, profit
  - Simple bar chart (daily breakdown)
  - Plan upgrade prompt if range limit exceeded
- [ ] Invoice button on ticket detail (READY/DELIVERED only, owner only)
- [ ] `/app/tickets/[id]/invoice` page — preview + download link + share link
- [ ] `/public/invoice/[token]` page — public read-only invoice view
- [ ] `next-pwa` configuration and `manifest.json`
- [ ] Service Worker: cache ticket list and ticket detail pages
- [ ] `OfflineBanner` component — shown when offline
- [ ] `IndexedDB` queue for offline status updates (`lib/offline/`)
- [ ] `useSyncQueue` hook — sync on reconnect via Background Sync API
- [ ] `PendingSyncIndicator` on tickets with queued updates

### Deliverables

- Owners can view daily and range profit reports.
- Invoice PDFs are generated, downloadable, and shareable via link.
- App is installable as a PWA.
- Ticket list and detail pages load offline.
- Status updates made offline are synced on reconnect.

---

## Phase 5: QA, Hardening & Production Deploy (Week 8)

**Goal:** Production-ready, tested, deployed, monitored application.

### QA Tasks

- [ ] All unit tests written and passing (target: ≥ 80% coverage on `modules/`)
- [ ] All integration tests written and passing
- [ ] End-to-end smoke test: register → create ticket → complete → invoice
- [ ] Mobile manual testing: iPhone Safari, Android Chrome (375px)
- [ ] Desktop testing: Chrome, Firefox, Safari
- [ ] Offline scenario testing: disconnect, make change, reconnect, verify sync
- [ ] Load test: simulate 100 concurrent users (k6 or Locust)

### Security Hardening Tasks

- [ ] Pen-test checklist: SQL injection (all inputs through Pydantic), XSS (Next.js escapes by default), CSRF (httpOnly cookie + SameSite)
- [ ] Nginx: add security headers (`X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, `Content-Security-Policy`)
- [ ] Review all routes: confirm `shop_id` isolation on every query
- [ ] Secrets audit: no secrets in code, Docker images, or Git history

### Production Deploy Tasks

- [ ] Provision VPS (Hetzner CX21 or equivalent)
- [ ] Configure DNS, point domain to VPS
- [ ] Run `make up` — start production stack
- [ ] Run Alembic migrations on production database
- [ ] Verify SSL certificate issued and auto-renewal configured
- [ ] Set up nightly backup cron job (pg_dump → MinIO)
- [ ] Configure uptime monitoring (UptimeRobot or similar — free tier)
- [ ] Create `RUNBOOK.md` for common operations (restart services, apply migration, restore backup)

### Deliverables

- Application is live at production URL.
- All MVP features are functional and tested.
- Monitoring and backups are active.
- Runbook is documented.

---

## Milestone Summary

| Milestone | End of Week | Criteria |
|---|---|---|
| M1: Auth & Stack | Week 2 | Register, login, JWT, Docker stack, CI running |
| M2: Ticket System | Week 4 | Full ticket lifecycle, images, customer management |
| M3: Inventory & Profit | Week 6 | Parts linkage, stock deduction, profit computed |
| M4: Reports & PWA | Week 7 | Reports, PDF invoices, PWA offline mode |
| M5: Production Launch | Week 8 | Live at domain, monitored, backed up |
