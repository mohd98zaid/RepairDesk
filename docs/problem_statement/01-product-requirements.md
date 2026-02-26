# 01 — Product Requirements Document

**Product:** RepairDesk — Digital Repair Ticket Management PWA  
**Version:** 1.0  
**Date:** 2026-02-23  
**Status:** Approved for MVP

---

## 1. Problem Statement

Independent repair shops and solo technicians manage their workflows using paper tickets, WhatsApp messages, or memory. This leads to lost repair history, zero financial visibility, poor customer trust, and no scalable process. There is no affordable, mobile-first SaaS solution purpose-built for this segment.

---

## 2. Product Vision

A mobile-first Progressive Web App that allows repair shops to create and track repair tickets in under 60 seconds, monitor inventory, calculate real-time profit, and generate invoices — all from any device with a browser, with offline support.

---

## 3. Goals & Success Metrics

| Goal | Metric | Target |
|---|---|---|
| Fast ticket creation | Time-to-create a ticket | < 60 seconds |
| Financial clarity | Shops viewing daily profit report | ≥ 70% of active shops weekly |
| Adoption | Active shops at end of Month 3 | 100 shops |
| Retention | 30-day retention rate | ≥ 60% |
| Reliability | Uptime | ≥ 99.5% |

---

## 4. Target Users

**Primary — Shop Owner / Manager**
- Runs 1–5 technicians
- Needs profit overview and full access
- Not highly technical

**Secondary — Technician**
- Updates ticket status and notes during repair
- Needs simple, fast UI on mobile

**Tertiary — Customer (indirect)**
- Receives invoice PDF
- May receive SMS/WhatsApp status updates (post-MVP)

---

## 5. Functional Requirements

### 5.1 Authentication & Multi-Tenancy
- FR-01: User can register a new shop account with name, phone, and email.
- FR-02: Users log in via email + password (JWT-based sessions).
- FR-03: Each shop is fully isolated; data from one shop is never visible to another.
- FR-04: Shop owner can invite technicians by email and assign the `TECHNICIAN` role.
- FR-05: Password reset via email link.

### 5.2 Repair Ticket Management
- FR-06: Authenticated user can create a ticket by entering customer name/phone, device description, reported issue, and optional estimated cost.
- FR-07: Ticket creation form auto-creates a new customer record if the phone number is not found.
- FR-08: User can attach up to 5 images per ticket (device condition photos).
- FR-09: Ticket has statuses: `RECEIVED → IN_PROGRESS → WAITING_PARTS → READY → DELIVERED → CANCELLED`.
- FR-10: User can update ticket status, add technician notes, and set final cost.
- FR-11: Parts used in a repair are linked to inventory items and deducted from stock on ticket completion.
- FR-12: User can search and filter tickets by status, date range, and customer name.

### 5.3 Customer Management
- FR-13: System maintains a per-shop customer directory (name, phone).
- FR-14: User can view a customer's full repair history.

### 5.4 Inventory Management
- FR-15: User can add, edit, and delete inventory items (name, purchase price, selling price, quantity).
- FR-16: System prevents using more parts than available quantity.
- FR-17: Low-stock alert when quantity falls below a configurable threshold (default: 3).

### 5.5 Profit & Financial Tracking
- FR-18: System calculates ticket profit: `final_cost - sum(parts_used × purchase_price)`.
- FR-19: Daily profit dashboard shows total revenue, total parts cost, and net profit.
- FR-20: User can view profit breakdown by date range.

### 5.6 Invoicing
- FR-21: User can generate a PDF invoice for any completed ticket.
- FR-22: Invoice includes shop name, customer name, device description, parts used, labor cost, total, and date.
- FR-23: Invoice PDF is downloadable and shareable.

### 5.7 Reporting
- FR-24: Daily summary report: tickets created, completed, revenue, profit.
- FR-25: Reports are filterable by date range (Paid tier only for ranges > 7 days).

### 5.8 Offline Support
- FR-26: Core read operations (ticket list, inventory list) are available offline via service worker cache.
- FR-27: Ticket status updates made offline are queued and synced when connectivity is restored.

---

## 6. Non-Functional Requirements

| ID | Requirement | Detail |
|---|---|---|
| NFR-01 | Mobile-first UI | All screens fully usable on 375px width |
| NFR-02 | Performance | First Contentful Paint < 2s on 4G |
| NFR-03 | Offline | Core reads work offline; writes are queued |
| NFR-04 | Security | HTTPS, JWT, bcrypt, input validation, per-shop data isolation |
| NFR-05 | Scalability | Architecture allows horizontal scaling without redesign |
| NFR-06 | Availability | 99.5% uptime SLA |
| NFR-07 | Data retention | Soft-delete for tickets; hard-delete on shop account termination |
| NFR-08 | Storage | Image uploads limited to 5 MB per image |

---

## 7. Monetization

| Plan | Price | Limits |
|---|---|---|
| Free | $0 | 30 active tickets/month, 1 user, 7-day report history |
| Pro | $19/month | Unlimited tickets, 5 users, full report history, invoice branding |
| Business | $49/month | Unlimited tickets, unlimited users, API access (future) |

---

## 8. Out of Scope (MVP)

- Customer-facing portal or tracking link
- SMS / WhatsApp notifications
- POS or payment gateway integration
- Multi-location (branch) support
- Native iOS / Android apps
- Third-party integrations (QuickBooks, etc.)
