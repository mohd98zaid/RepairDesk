# RepairDesk

> **Digital Repair Ticket Management PWA** — Mobile-first repair shop management built for speed, clarity, and profit.

---

## What is RepairDesk?

RepairDesk helps independent repair shops manage their entire workflow:

- 🎫 **Repair Tickets** — Create, track, and close tickets in < 60 seconds
- 📦 **Inventory Management** — Track parts, get low-stock alerts, auto-deduct on ticket completion
- 💰 **Profit Tracking** — Real-time revenue, parts cost, and net profit calculations
- 🧾 **Invoicing** — Generate PDF invoices and share via link
- 📊 **Reports** — Daily and range-based financial reports
- 📱 **PWA / Offline** — Installable, works offline with sync on reconnect

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), TailwindCSS, Zustand, React Hook Form, Zod |
| Backend | Python 3.12, FastAPI, SQLAlchemy 2 (async), Pydantic v2 |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Storage | MinIO (S3-compatible) |
| PDF | WeasyPrint |
| DevOps | Docker, Docker Compose, Nginx, GitHub Actions |

---

## Quick Start (Local Development)

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- `make` (WSL on Windows, or use the commands directly)

### Setup

```bash
# 1. Clone the repo
git clone <your-repo-url>
cd repairdesk

# 2. Copy env files and fill in secrets
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.local.example apps/web/.env.local

# 3. Start all services (hot-reload)
make dev

# 4. Run database migrations
make migrate

# 5. (Optional) Seed sample data
make seed
```

### Services

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| API (FastAPI) | http://localhost:8000 |
| API Docs (Swagger) | http://localhost:8000/docs |
| MinIO Console | http://localhost:9001 |

---

## Project Structure

```
repairdesk/
├── apps/
│   ├── api/          # FastAPI backend
│   └── web/          # Next.js PWA frontend
├── infra/
│   ├── docker/       # Dockerfiles
│   ├── nginx/        # Nginx config
│   └── compose/      # Docker Compose files
├── .github/
│   └── workflows/    # CI/CD (GitHub Actions)
├── Makefile
└── .env.example
```

---

## Development Phases

| Phase | Status | Description |
|---|---|---|
| **Phase 1** | ✅ Complete | Foundation, Auth, Docker stack |
| **Phase 2** | 🔄 Next | Ticket Module |
| **Phase 3** | ⏳ | Inventory & Profit Engine |
| **Phase 4** | ⏳ | Reports, Invoices & PWA |
| **Phase 5** | ⏳ | QA & Production Deploy |

---

## Common Commands

```bash
make dev          # Start all services with hot-reload
make migrate      # Run database migrations
make test         # Run all tests
make test-api     # Run backend tests only
make shell-api    # Open bash in API container
make shell-db     # Open psql shell
make logs         # Tail all service logs
```
