# 07 — Monorepo Structure

**Product:** RepairDesk  
**Version:** 1.0  
**Date:** 2026-02-23

---

## 1. Repository Overview

RepairDesk uses a **monorepo** managed with a flat directory structure. No monorepo tool (Turborepo/Nx) is used in MVP to keep complexity low; one can be introduced in Stage 2. The repo holds both the frontend and backend as separate top-level packages.

```
repairdesk/
├── apps/
│   ├── web/          # Next.js PWA frontend
│   └── api/          # FastAPI backend
├── packages/
│   └── shared-types/ # Shared TypeScript types (optional, for future)
├── infra/
│   ├── docker/       # Dockerfiles
│   ├── nginx/        # Nginx config
│   └── compose/      # Docker Compose files
├── docs/             # Project documentation (these files)
├── scripts/          # Utility shell scripts
├── .github/
│   └── workflows/    # GitHub Actions CI/CD
├── .env.example
├── .gitignore
├── README.md
└── Makefile          # Developer convenience commands
```

---

## 2. Frontend — `apps/web/`

```
apps/web/
├── public/
│   ├── icons/                  # PWA icons (192x192, 512x512)
│   ├── manifest.json           # Web App Manifest
│   └── offline.html            # Offline fallback page
│
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/             # Route group — unauthenticated
│   │   │   ├── login/
│   │   │   │   └── page.tsx
│   │   │   ├── register/
│   │   │   │   └── page.tsx
│   │   │   └── forgot-password/
│   │   │       └── page.tsx
│   │   │
│   │   ├── (app)/              # Route group — authenticated, shop-scoped
│   │   │   ├── layout.tsx      # Shell: nav + auth guard
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx
│   │   │   ├── tickets/
│   │   │   │   ├── page.tsx            # List
│   │   │   │   ├── new/
│   │   │   │   │   └── page.tsx        # Create form
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx        # Detail
│   │   │   │       ├── edit/
│   │   │   │       │   └── page.tsx
│   │   │   │       └── invoice/
│   │   │   │           └── page.tsx
│   │   │   ├── customers/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx
│   │   │   ├── inventory/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── new/
│   │   │   │   │   └── page.tsx
│   │   │   │   └── [id]/
│   │   │   │       └── edit/
│   │   │   │           └── page.tsx
│   │   │   ├── reports/
│   │   │   │   └── page.tsx
│   │   │   └── settings/
│   │   │       ├── shop/
│   │   │       │   └── page.tsx
│   │   │       ├── team/
│   │   │       │   └── page.tsx
│   │   │       └── billing/
│   │   │           └── page.tsx
│   │   │
│   │   ├── public/
│   │   │   └── invoice/[token]/
│   │   │       └── page.tsx            # Public invoice view
│   │   │
│   │   ├── api/                        # Next.js Route Handlers (proxy only)
│   │   │   └── auth/[...nextauth]/
│   │   │       └── route.ts            # If NextAuth used; else handled by FastAPI
│   │   │
│   │   ├── layout.tsx                  # Root layout
│   │   ├── not-found.tsx
│   │   └── error.tsx
│   │
│   ├── components/
│   │   ├── ui/                         # ShadCN auto-generated components
│   │   ├── layout/
│   │   │   ├── AppShell.tsx            # Sidebar + bottom nav
│   │   │   ├── TopBar.tsx
│   │   │   ├── BottomNav.tsx
│   │   │   └── Sidebar.tsx
│   │   ├── tickets/
│   │   │   ├── TicketCard.tsx
│   │   │   ├── TicketForm.tsx
│   │   │   ├── StatusBadge.tsx
│   │   │   ├── StatusChangeModal.tsx
│   │   │   ├── PartsSelector.tsx
│   │   │   ├── ImageUploader.tsx
│   │   │   └── ActivityLog.tsx
│   │   ├── customers/
│   │   │   ├── CustomerSearch.tsx
│   │   │   └── CustomerTicketHistory.tsx
│   │   ├── inventory/
│   │   │   ├── InventoryTable.tsx
│   │   │   └── LowStockBadge.tsx
│   │   ├── dashboard/
│   │   │   ├── KpiCard.tsx
│   │   │   └── RecentTickets.tsx
│   │   └── shared/
│   │       ├── OfflineBanner.tsx
│   │       ├── PendingSyncIndicator.tsx
│   │       ├── EmptyState.tsx
│   │       ├── LoadingSpinner.tsx
│   │       └── ConfirmDialog.tsx
│   │
│   ├── lib/
│   │   ├── api/
│   │   │   ├── client.ts               # Axios/fetch wrapper with auth headers
│   │   │   ├── tickets.ts              # API functions for tickets
│   │   │   ├── customers.ts
│   │   │   ├── inventory.ts
│   │   │   └── reports.ts
│   │   ├── offline/
│   │   │   ├── indexeddb.ts            # IDB wrapper
│   │   │   └── syncQueue.ts            # Offline action queue manager
│   │   ├── utils.ts                    # General helpers
│   │   └── validations/
│   │       ├── ticket.schema.ts        # Zod schemas
│   │       ├── customer.schema.ts
│   │       └── inventory.schema.ts
│   │
│   ├── store/
│   │   ├── authStore.ts                # Zustand: user, access token
│   │   ├── offlineStore.ts             # Zustand: online/offline status
│   │   └── uiStore.ts                  # Zustand: modals, toasts
│   │
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useOnlineStatus.ts
│   │   └── useSyncQueue.ts
│   │
│   └── types/
│       └── index.ts                    # TypeScript interfaces
│
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── postcss.config.ts
├── package.json
└── .env.local.example
```

---

## 3. Backend — `apps/api/`

```
apps/api/
├── alembic/
│   ├── env.py
│   ├── script.py.mako
│   └── versions/
│       ├── 20260223_0001_create_shops.py
│       ├── 20260223_0002_create_users.py
│       └── ...
│
├── app/
│   ├── core/
│   │   ├── config.py           # Pydantic BaseSettings
│   │   ├── db.py               # Async SQLAlchemy session
│   │   ├── redis.py            # Redis client
│   │   ├── minio.py            # MinIO client + helpers
│   │   ├── security.py         # JWT, bcrypt
│   │   ├── dependencies.py     # FastAPI deps (get_current_user, etc.)
│   │   └── exceptions.py       # Custom HTTP exceptions
│   │
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── router.py
│   │   │   ├── service.py
│   │   │   └── schemas.py
│   │   ├── shops/
│   │   │   ├── router.py
│   │   │   ├── service.py
│   │   │   ├── models.py       # SQLAlchemy ORM model
│   │   │   └── schemas.py      # Pydantic schemas
│   │   ├── users/
│   │   │   ├── router.py
│   │   │   ├── service.py
│   │   │   ├── models.py
│   │   │   └── schemas.py
│   │   ├── tickets/
│   │   │   ├── router.py
│   │   │   ├── service.py
│   │   │   ├── models.py
│   │   │   ├── schemas.py
│   │   │   └── state_machine.py   # Status transition rules
│   │   ├── customers/
│   │   │   ├── router.py
│   │   │   ├── service.py
│   │   │   ├── models.py
│   │   │   └── schemas.py
│   │   ├── inventory/
│   │   │   ├── router.py
│   │   │   ├── service.py
│   │   │   ├── models.py
│   │   │   └── schemas.py
│   │   ├── invoices/
│   │   │   ├── router.py
│   │   │   ├── service.py
│   │   │   ├── models.py
│   │   │   ├── schemas.py
│   │   │   └── pdf_renderer.py   # WeasyPrint PDF logic
│   │   └── reports/
│   │       ├── router.py
│   │       ├── service.py
│   │       └── schemas.py
│   │
│   ├── templates/
│   │   └── invoice.html          # Jinja2 HTML template for PDF
│   │
│   └── main.py                   # FastAPI app factory, router registration
│
├── tests/
│   ├── conftest.py               # Pytest fixtures, test DB setup
│   ├── unit/
│   │   ├── test_state_machine.py
│   │   ├── test_profit_calc.py
│   │   └── test_security.py
│   └── integration/
│       ├── test_auth.py
│       ├── test_tickets.py
│       ├── test_inventory.py
│       └── test_reports.py
│
├── pyproject.toml
├── requirements.txt
├── requirements-dev.txt
├── alembic.ini
└── .env.example
```

---

## 4. Infrastructure — `infra/`

```
infra/
├── docker/
│   ├── Dockerfile.web            # Next.js production image
│   ├── Dockerfile.api            # FastAPI production image
│   └── .dockerignore
│
├── nginx/
│   ├── nginx.conf                # Main config
│   └── sites/
│       └── repairdesk.conf       # Server block with proxy rules
│
└── compose/
    ├── docker-compose.yml        # Production
    ├── docker-compose.dev.yml    # Development (hot reload)
    └── docker-compose.test.yml   # CI test environment
```

---

## 5. Makefile Commands

```makefile
# Development
make dev          # Start all services in dev mode
make dev-api      # Start only FastAPI with hot reload
make dev-web      # Start only Next.js dev server

# Database
make migrate      # Run alembic upgrade head
make migration m="description"  # Create new migration

# Testing
make test         # Run all tests
make test-api     # Run backend tests only
make test-web     # Run frontend tests only

# Production
make build        # Build all Docker images
make up           # Start production stack
make down         # Stop all services
make logs         # Tail all service logs

# Utilities
make shell-api    # Open bash inside API container
make shell-db     # Open psql shell
make seed         # Seed development data
```
