# 09 — Engineering Scope Definition

**Product:** RepairDesk  
**Version:** 1.0 (MVP)  
**Date:** 2026-02-23

---

## 1. Purpose

This document defines the exact boundaries of what the engineering team will and will not build for the MVP. It serves as the source of truth for sprint planning, story sizing, and scope control.

---

## 2. IN SCOPE — MVP Engineering Deliverables

### 2.1 Infrastructure & DevOps

| Item | Detail |
|---|---|
| Docker Compose stack | Web, API, PostgreSQL, Redis, MinIO, Nginx — all containerized |
| Development environment | `docker-compose.dev.yml` with hot-reload for both frontend and backend |
| Production environment | Single VPS deployment via `docker-compose.yml` |
| SSL | Let's Encrypt via Certbot, auto-renewal |
| CI pipeline | GitHub Actions: lint, test, build on every PR |
| CD pipeline | GitHub Actions: auto-deploy to VPS on merge to `main` |
| Database migrations | Alembic migration system; migrations run automatically on deploy |
| Backups | Nightly `pg_dump` to MinIO `backups/` bucket via cron |
| Environment secrets | `.env` files; managed via GitHub Secrets in CI/CD |

---

### 2.2 Backend (FastAPI)

| Feature | Scope |
|---|---|
| Shop registration + JWT auth | Full: register, login, refresh, logout |
| Password hashing | bcrypt |
| Role-based access control | OWNER and TECHNICIAN roles; enforced on every route |
| Team invitations | Email invite link with 48-hour token |
| Ticket CRUD | Create, read, update (status, notes, final_cost) |
| Ticket state machine | 6-state machine with enforced transitions |
| Ticket images | Presigned URL flow; confirm upload endpoint |
| Parts linkage | Add/remove parts from ticket; stock validation |
| Inventory CRUD | Full CRUD with soft delete |
| Stock deduction | Atomic transaction on ticket delivery |
| Customer CRUD | Create/read/update; auto-create on ticket |
| Invoice PDF | WeasyPrint server-side PDF generation |
| Public invoice link | Token-based unauthenticated invoice view |
| Daily report | Revenue, cost, profit, ticket counts |
| Range report | Aggregated totals + per-day breakdown |
| Plan enforcement | Free plan limits on report date range |
| Offline sync (server side) | Idempotent endpoint design (safe to retry queued actions) |
| Rate limiting | Nginx-level; login endpoint throttled |
| Input validation | Pydantic v2 on all request bodies |
| Error handling | Standardised error shape across all endpoints |

---

### 2.3 Frontend (Next.js PWA)

| Feature | Scope |
|---|---|
| Auth pages | Login, register, forgot password, reset password |
| Auth guard | Redirect unauthenticated users; token refresh on expiry |
| Dashboard | KPI cards (revenue, parts cost, profit, ticket counts) |
| Ticket list | Paginated, filterable by status / date / search |
| Create ticket form | Customer lookup/create, device info, estimated cost, images |
| Ticket detail view | Full ticket info, parts, images, activity log |
| Status change modal | Status dropdown + optional notes |
| Invoice download | Button to trigger generation; direct download link |
| Customer list & profile | List + per-customer ticket history |
| Inventory list | Table with low-stock badge |
| Add/edit inventory item | Form with all fields |
| Reports page | Date picker, KPI display, daily breakdown chart |
| Settings: Shop | Name, phone, email update |
| Settings: Team | List users, send invite |
| Offline banner | Shown when navigator.onLine = false |
| Offline read cache | Service worker caches ticket list + detail |
| Offline write queue | IndexedDB queue for status updates |
| Sync on reconnect | Background Sync API integration |
| PWA manifest | installable, standalone mode |
| Mobile-first layout | Bottom nav on mobile, sidebar on desktop |
| Responsive breakpoints | Works on 375px → 1440px |

---

## 3. OUT OF SCOPE — Not Built in MVP

The following features are explicitly excluded from MVP. They may be planned for subsequent phases.

| Feature | Reason for exclusion |
|---|---|
| Customer-facing repair status portal | Post-MVP; reduces MVP complexity |
| SMS / WhatsApp notifications | Requires third-party integration (Twilio/360dialog) |
| Email notifications to customers | Deferred; only internal emails (invites, password reset) |
| Payment gateway integration | Not a core workflow need for MVP |
| Multi-branch / multi-location | Architecture allows it; deferred by demand |
| Native iOS/Android app | PWA is sufficient for MVP; app stores require additional overhead |
| Advanced analytics / BI dashboards | Simple reports cover MVP needs |
| Customer-visible invoice portal (with login) | Public link (no auth) is sufficient for MVP |
| API access for third parties | Business plan feature; deferred |
| QuickBooks / Xero / accounting integrations | Post-MVP |
| Warranty tracking | Out of scope |
| Multi-currency support | Single currency per shop; multi-currency post-MVP |
| Audit log for financial edits | Basic status log only in MVP |
| Custom invoice template branding | Pro plan logo only; custom templates post-MVP |
| Real-time collaboration (WebSocket) | Polling or manual refresh in MVP |
| Search indexing (Elasticsearch) | PostgreSQL full-text search is sufficient for MVP volumes |
| Data export (CSV/Excel) | Post-MVP |

---

## 4. Engineering Constraints

| Constraint | Detail |
|---|---|
| Budget | Open-source stack only; zero SaaS dependencies in MVP |
| Team | Assumed 2–3 engineers (1 full-stack + 1 backend or similar) |
| Timeline | 8 weeks to production-ready MVP |
| VPS | Single server; no Kubernetes, no managed databases |
| External services | Only: SMTP server (for emails), Let's Encrypt (for SSL) |
| Mobile support | PWA; no React Native; no Capacitor |

---

## 5. Technical Debt Accepted in MVP

The following decisions trade speed for quality and are acknowledged:

| Decision | Trade-off | Mitigation |
|---|---|---|
| Monolith backend | Harder to scale modules independently | Module structure makes it easy to extract later |
| No task queue (Celery) | PDF generation is synchronous (may be slow on large invoices) | FastAPI BackgroundTasks; Celery added in Stage 2 |
| Direct PgBouncer not used | Direct connections; may hit connection limits at scale | Add PgBouncer in Stage 2 |
| No full-text search engine | PostgreSQL `ILIKE` search (slow at large scale) | Sufficient for ≤50k tickets; add pgvector or Meilisearch later |
| Single VPS | SPOF; no HA | Snapshot backups; fast recovery documented |
| Shop timezone fixed to UTC | Reports may be slightly off for non-UTC shops | User-configurable timezone in Stage 2 |

---

## 6. Definition of Done

A feature is considered complete when:

1. Code is merged to `main` and passes all CI checks.
2. Relevant unit and/or integration tests are written and passing.
3. The feature matches the acceptance criteria in Document 02.
4. The API endpoint is documented (in Document 06 or inline via FastAPI `/docs`).
5. No critical or high-severity bugs are open against the feature.
6. The feature is manually tested on a mobile device (real or emulator) at 375px width.
7. If the feature has a UI, it works in Chrome, Safari, and Firefox.
