# 02 — User Stories & Acceptance Criteria

**Product:** RepairDesk  
**Version:** 1.0  
**Date:** 2026-02-23

---

## Epic 1: Authentication & Shop Setup

### US-01 — Shop Registration
**As a** shop owner,  
**I want to** register my shop with my name and email,  
**so that** I can start managing my repair workflow.

**Acceptance Criteria:**
- [ ] Registration form collects: shop name, owner full name, email, password (min 8 chars), phone.
- [ ] Password is validated for minimum length and confirmed in a second field.
- [ ] On success, user is redirected to the dashboard and a JWT access token is issued.
- [ ] Duplicate email returns a `409 Conflict` error with a user-friendly message.
- [ ] Email domain format is validated on the client and server.

---

### US-02 — Login
**As a** user (owner or technician),  
**I want to** log in with my email and password,  
**so that** I can access my shop's data.

**Acceptance Criteria:**
- [ ] Successful login returns access token (15 min) and refresh token (7 days) via httpOnly cookie.
- [ ] Invalid credentials return a generic "Invalid email or password" message (no leaking which field is wrong).
- [ ] After 5 failed attempts, the account is locked for 15 minutes with a clear message.
- [ ] User is redirected to the page they were trying to access before being prompted to log in.

---

### US-03 — Invite Technician
**As a** shop owner,  
**I want to** invite a technician by email,  
**so that** they can log in and update tickets without seeing financial data.

**Acceptance Criteria:**
- [ ] Owner can enter an email address and assign role `TECHNICIAN`.
- [ ] Invitee receives an email with a one-time setup link (expires in 48 hours).
- [ ] Technician account is bound to the owner's shop_id.
- [ ] Technician role cannot access: financial reports, invoice generation, inventory prices.

---

## Epic 2: Ticket Management

### US-04 — Create Ticket
**As a** technician or owner,  
**I want to** create a repair ticket quickly,  
**so that** I can begin tracking a repair without leaving the counter.

**Acceptance Criteria:**
- [ ] Ticket form requires: customer phone (lookup or create new), device type, reported issue.
- [ ] Estimated cost and notes are optional fields.
- [ ] If phone number matches existing customer, their name is auto-filled; otherwise a new customer is created on save.
- [ ] Up to 5 images can be attached (JPG/PNG, max 5 MB each); upload progress is shown.
- [ ] On save, ticket receives status `RECEIVED` and a sequential ticket number (e.g., `TK-00042`).
- [ ] Full form submission completes in under 60 seconds on a standard connection.

---

### US-05 — Update Ticket Status
**As a** technician,  
**I want to** update a ticket's status and add notes,  
**so that** the owner and customer history reflects progress.

**Acceptance Criteria:**
- [ ] Status transitions are enforced: `RECEIVED → IN_PROGRESS → WAITING_PARTS → READY → DELIVERED`.
- [ ] `CANCELLED` can be set from any status by an owner only.
- [ ] Each status change is logged with a timestamp and the user who made the change.
- [ ] Technician can add free-text notes on each status update.
- [ ] Status update is reflected immediately in the ticket list view.

---

### US-06 — Link Parts to Ticket
**As a** technician,  
**I want to** add parts used from inventory to a ticket,  
**so that** the cost is calculated automatically and stock is deducted.

**Acceptance Criteria:**
- [ ] User searches inventory by name and selects an item.
- [ ] User specifies quantity used; system validates quantity ≤ available stock.
- [ ] Each linked part shows: name, unit selling price, quantity, line total.
- [ ] On ticket completion (`DELIVERED`), inventory quantities are atomically deducted.
- [ ] Profit is recalculated and shown on save.

---

### US-07 — Search & Filter Tickets
**As an** owner,  
**I want to** search and filter tickets,  
**so that** I can quickly find a specific repair.

**Acceptance Criteria:**
- [ ] Filter options: status, date range (created_at), customer name/phone.
- [ ] Search is triggered on input (debounced 300 ms) or explicit submit.
- [ ] Results are paginated (20 per page) with a total count displayed.
- [ ] Active filters are shown as dismissible chips above the list.
- [ ] Empty state shows a helpful message, not a blank screen.

---

## Epic 3: Customer Management

### US-08 — View Customer History
**As an** owner,  
**I want to** see all past repairs for a customer,  
**so that** I can provide better service and reference past work.

**Acceptance Criteria:**
- [ ] Customer profile shows: name, phone, all tickets (date, device, status, final cost).
- [ ] Clicking a ticket navigates to the full ticket detail view.
- [ ] Total spent by customer is shown at the top of the profile.

---

## Epic 4: Inventory Management

### US-09 — Manage Inventory
**As an** owner,  
**I want to** add and edit parts in my inventory,  
**so that** I can track stock and cost.

**Acceptance Criteria:**
- [ ] Owner can create an item with: name, purchase price, selling price, initial quantity, low-stock threshold.
- [ ] Owner can edit any field; history of price changes is not tracked in MVP.
- [ ] Owner can soft-delete an item (items used in tickets are preserved historically).
- [ ] Low-stock badge (red) appears on items at or below threshold.
- [ ] Inventory list is sortable by name, quantity, and selling price.

---

## Epic 5: Financials & Reports

### US-10 — View Daily Profit Dashboard
**As an** owner,  
**I want to** see today's profit at a glance,  
**so that** I understand my business performance.

**Acceptance Criteria:**
- [ ] Dashboard shows: total revenue (sum of final_costs), total parts cost, net profit, number of tickets completed today.
- [ ] Data updates in real time (or on page refresh).
- [ ] Owner can tap a date to see that day's breakdown.

---

### US-11 — Generate Invoice
**As an** owner,  
**I want to** generate a PDF invoice for a completed repair,  
**so that** I can give the customer a professional receipt.

**Acceptance Criteria:**
- [ ] Invoice is only available for tickets in `READY` or `DELIVERED` status.
- [ ] Invoice PDF includes: shop name & phone, ticket number, customer name, device, parts list with unit prices and totals, labor cost (if any), grand total, generation date.
- [ ] PDF is generated server-side and returned as a downloadable file.
- [ ] Invoice can be regenerated multiple times (idempotent).

---

## Epic 6: Offline Support

### US-12 — Use App Offline
**As a** technician,  
**I want to** view tickets when I have no internet,  
**so that** I can still reference repair details.

**Acceptance Criteria:**
- [ ] Ticket list and ticket detail pages load from cache when offline.
- [ ] A "You are offline" banner is displayed clearly.
- [ ] Status update actions taken offline are queued in IndexedDB and synced automatically when connectivity is restored.
- [ ] Queued actions are shown with a "pending sync" indicator.
- [ ] If a queued sync fails (e.g., conflict), the user is notified and shown options.
