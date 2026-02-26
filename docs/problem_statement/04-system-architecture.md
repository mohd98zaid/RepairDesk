# 04 — System Architecture

**Product:** RepairDesk  
**Version:** 1.0  
**Date:** 2026-02-23

---

## 1. Architecture Overview

RepairDesk is a **multi-tenant SaaS PWA** built on a **Modular Monolith** backend. The architecture is designed to run on a single VPS in Stage 1 and scale horizontally in Stage 2 without application code changes — only infrastructure topology changes.

```
┌──────────────────────────────────────────────────────────┐
│                     CLIENT LAYER                         │
│   Next.js PWA (App Router)  ─  Service Worker (offline)  │
└───────────────────────┬──────────────────────────────────┘
                        │ HTTPS
┌───────────────────────▼──────────────────────────────────┐
│                     NGINX (Reverse Proxy)                 │
│   SSL termination · Static asset serving · Rate limiting  │
└────────┬─────────────────────────┬────────────────────────┘
         │                         │
┌────────▼──────────┐   ┌─────────▼──────────────────────┐
│  Next.js Server   │   │     FastAPI Backend             │
│  (SSR + API Proxy)│   │  /api/v1/* routes               │
└───────────────────┘   └────────┬───────────────────────┘
                                  │
           ┌──────────────────────┼────────────────┐
           │                      │                │
  ┌────────▼──────┐   ┌──────────▼────┐  ┌────────▼──────┐
  │  PostgreSQL   │   │     Redis     │  │     MinIO     │
  │  (Primary DB) │   │  (Cache/Queue)│  │ (File Storage)│
  └───────────────┘   └───────────────┘  └───────────────┘
```

---

## 2. Component Descriptions

### 2.1 Frontend — Next.js PWA

- **Framework:** Next.js 14+ (App Router)
- **Rendering:** Server-Side Rendering (SSR) for initial load; Client-Side Navigation thereafter
- **Offline:** `next-pwa` wraps Workbox; caches critical routes and API responses in IndexedDB
- **State Management:** Zustand for global client state (auth token, current shop context)
- **Forms:** React Hook Form + Zod for validation
- **UI:** TailwindCSS + ShadCN UI component library

**Key responsibilities:**
- Authentication UI and token management (access token in memory, refresh token in httpOnly cookie)
- Offline queue management (IndexedDB sync via Background Sync API)
- Image upload with preview before sending to backend

---

### 2.2 Backend — FastAPI (Modular Monolith)

- **Framework:** FastAPI + Uvicorn (ASGI)
- **ORM:** SQLAlchemy 2.0 (async) with Alembic for migrations
- **Validation:** Pydantic v2 schemas
- **Auth:** JWT (python-jose) — access tokens (15 min), refresh tokens (7 days stored in Redis)
- **PDF Generation:** WeasyPrint or ReportLab for invoice PDFs
- **Task Queue:** Background tasks via FastAPI `BackgroundTasks` (MVP); Celery + Redis (Stage 2)

**Internal module structure:**
```
app/
├── modules/
│   ├── auth/          # Registration, login, token refresh
│   ├── shops/         # Shop CRUD, settings
│   ├── users/         # User management, invitations
│   ├── tickets/       # Ticket CRUD, status machine, parts linkage
│   ├── customers/     # Customer CRUD, history
│   ├── inventory/     # Inventory CRUD, stock management
│   ├── invoices/      # Invoice generation, PDF rendering
│   └── reports/       # Profit calculation, daily/range reports
├── core/
│   ├── db.py          # Async DB session factory
│   ├── security.py    # JWT helpers, password hashing
│   ├── config.py      # Settings via Pydantic BaseSettings
│   └── dependencies.py # FastAPI dependency injection
└── main.py
```

---

### 2.3 Database — PostgreSQL 16

- Single database; multi-tenancy enforced at application layer via `shop_id` foreign key on all tenant-scoped tables.
- Connection pooling via **PgBouncer** (Stage 2; direct in MVP).
- Backups: daily `pg_dump` to MinIO bucket (automated via cron).

---

### 2.4 Cache & Session Store — Redis 7

- Refresh token storage (keyed by `user_id`, TTL = 7 days)
- Rate limiting counters (login attempts)
- Future: Job queue for async tasks (Celery broker)

---

### 2.5 Object Storage — MinIO

- S3-compatible; stores ticket photos and generated invoice PDFs.
- Bucket structure: `/{shop_id}/tickets/{ticket_id}/` for photos; `/{shop_id}/invoices/` for PDFs.
- Presigned URLs used for client-side image uploads (frontend uploads directly to MinIO, not through API).
- Access controlled via MinIO policies per bucket prefix.

---

### 2.6 Reverse Proxy — Nginx

- SSL termination (Let's Encrypt / Certbot)
- Serves Next.js static assets from `/public`
- Proxies `/api/*` to FastAPI
- Proxies `/` to Next.js server
- Rate limiting: 100 req/min per IP on `/api/auth/*`

---

## 3. Infrastructure — Stage 1 (MVP)

All services run on a **single VPS** (e.g., 4 vCPU, 8 GB RAM, Hetzner or DigitalOcean) orchestrated by Docker Compose.

```yaml
# Services
- nginx          # Port 80/443
- nextjs         # Port 3000 (internal)
- fastapi        # Port 8000 (internal)
- postgres       # Port 5432 (internal)
- redis          # Port 6379 (internal)
- minio          # Ports 9000/9001 (internal + console)
```

---

## 4. Infrastructure — Stage 2 (Scale)

- Separate managed PostgreSQL (e.g., Supabase, RDS, or dedicated VPS)
- Redis cluster or managed Redis
- MinIO on dedicated storage node or migrate to Cloudflare R2
- FastAPI horizontally scaled behind Nginx upstream
- Celery workers for async tasks (PDF generation, email, sync)
- Optional: CDN for static Next.js assets

---

## 5. Security Architecture

| Layer | Control |
|---|---|
| Transport | HTTPS (TLS 1.2+), HSTS headers |
| Authentication | JWT (HS256), short-lived access tokens |
| Session | Refresh tokens in Redis; invalidated on logout |
| Password | bcrypt (cost factor 12) |
| Authorization | Role-based; all API routes check `shop_id` claim |
| Input | Pydantic validation on all API inputs |
| CORS | Strict origin whitelist |
| Rate Limiting | Nginx + Redis counter on auth endpoints |
| File Uploads | Type validation, size limit (5 MB), random filename (UUID) |
| Secrets | Environment variables; never in code |

---

## 6. Data Flow: Ticket Creation

```
User (PWA)
  │
  ├─ 1. Fill form, attach photos
  │
  ├─ 2. Request presigned URL → FastAPI → MinIO → return URL
  │
  ├─ 3. Upload photos directly to MinIO (presigned URL)
  │
  ├─ 4. POST /api/v1/tickets { ...fields, image_keys: [...] }
  │       → FastAPI validates JWT + shop_id
  │       → Creates Customer if new
  │       → Inserts Ticket row
  │       → Returns TicketResponse
  │
  └─ 5. Navigate to /app/tickets/{id}
```

---

## 7. Technology Stack Summary

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, React 18, TailwindCSS, ShadCN UI, Zustand, RHF, Zod, next-pwa |
| Backend | Python 3.12, FastAPI, SQLAlchemy 2 (async), Pydantic v2, Uvicorn |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Storage | MinIO (S3-compatible) |
| PDF | WeasyPrint |
| DevOps | Docker, Docker Compose, Nginx, GitHub Actions, Certbot |
