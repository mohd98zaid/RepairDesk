# 11 — Environment & DevOps

**Product:** RepairDesk  
**Version:** 1.0  
**Date:** 2026-02-23

---

## 1. Environments

| Environment | Purpose | URL | Deployment |
|---|---|---|---|
| **Local (dev)** | Developer machines; hot-reload | `localhost:3000` | `docker-compose.dev.yml` |
| **CI** | Automated testing on each PR | GitHub Actions runners | `docker-compose.test.yml` |
| **Production** | Live application | `app.repairdesk.app` | `docker-compose.yml` via GitHub Actions |

> **Note:** No staging environment in MVP. Staging is added in Stage 2 when a second VPS is provisioned.

---

## 2. Local Development Setup

### Prerequisites

- Docker Desktop (or Docker + Docker Compose)
- Node.js 20+ (for running `apps/web` outside Docker, optional)
- Python 3.12+ (for running `apps/api` outside Docker, optional)
- `make` (standard on Linux/macOS; WSL on Windows)

### First-Time Setup

```bash
# 1. Clone the repository
git clone git@github.com:yourorg/repairdesk.git
cd repairdesk

# 2. Copy environment files
cp .env.example .env
cp apps/web/.env.local.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env

# 3. Fill in secrets (JWT_SECRET, MINIO_ACCESS_KEY, etc.)
# Editor: nano .env

# 4. Start all services
make dev

# 5. Run database migrations
make migrate

# 6. (Optional) Seed development data
make seed
```

### Services Running Locally

| Service | URL | Notes |
|---|---|---|
| Next.js Frontend | http://localhost:3000 | Hot-reload |
| FastAPI Backend | http://localhost:8000 | Hot-reload via uvicorn --reload |
| FastAPI Docs (Swagger) | http://localhost:8000/docs | Auto-generated |
| PostgreSQL | localhost:5432 | Direct access for DB GUI |
| Redis | localhost:6379 | — |
| MinIO Console | http://localhost:9001 | Default user/pass in `.env` |

---

## 3. Environment Variables

### Root `.env` (shared across services via Docker Compose)

```env
# PostgreSQL
POSTGRES_DB=repairdesk
POSTGRES_USER=repairdesk_user
POSTGRES_PASSWORD=change_me_in_prod

# Redis
REDIS_URL=redis://redis:6379/0

# MinIO
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=repairdesk_access
MINIO_SECRET_KEY=change_me_in_prod
MINIO_BUCKET=repairdesk
MINIO_USE_SSL=false

# App
ENVIRONMENT=development   # development | production
```

### `apps/api/.env`

```env
# Database
DATABASE_URL=postgresql+asyncpg://repairdesk_user:change_me_in_prod@postgres:5432/repairdesk

# Security
JWT_SECRET=your-256-bit-secret-here
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7

# MinIO (inherited from root or overridden)
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=repairdesk_access
MINIO_SECRET_KEY=change_me_in_prod
MINIO_BUCKET=repairdesk

# Email (SMTP for invites + password reset)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@repairdesk.app
SMTP_PASSWORD=change_me
FROM_EMAIL=RepairDesk <noreply@repairdesk.app>

# Redis
REDIS_URL=redis://redis:6379/0

# App
APP_URL=https://app.repairdesk.app
```

### `apps/web/.env.local`

```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 4. Docker Configuration

### `docker-compose.dev.yml`

```yaml
version: "3.9"
services:

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ACCESS_KEY}
      MINIO_ROOT_PASSWORD: ${MINIO_SECRET_KEY}
    volumes:
      - minio_data:/data
    ports:
      - "9000:9000"
      - "9001:9001"

  api:
    build:
      context: ./apps/api
      dockerfile: ../../infra/docker/Dockerfile.api
      target: development
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
    volumes:
      - ./apps/api:/app
    ports:
      - "8000:8000"
    env_file:
      - .env
      - apps/api/.env
    depends_on:
      - postgres
      - redis
      - minio

  web:
    build:
      context: ./apps/web
      dockerfile: ../../infra/docker/Dockerfile.web
      target: development
    command: npm run dev
    volumes:
      - ./apps/web:/app
      - /app/node_modules
      - /app/.next
    ports:
      - "3000:3000"
    env_file:
      - apps/web/.env.local
    depends_on:
      - api

volumes:
  postgres_data:
  minio_data:
```

### `Dockerfile.api`

```dockerfile
FROM python:3.12-slim AS base
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM base AS development
COPY requirements-dev.txt .
RUN pip install --no-cache-dir -r requirements-dev.txt
COPY . .

FROM base AS production
COPY . .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
```

### `Dockerfile.web`

```dockerfile
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json .
RUN npm ci

FROM base AS development
COPY . .

FROM base AS builder
COPY . .
RUN npm run build

FROM node:20-alpine AS production
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
CMD ["node", "server.js"]
```

---

## 5. Nginx Configuration

```nginx
# infra/nginx/sites/repairdesk.conf

server {
    listen 80;
    server_name app.repairdesk.app;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name app.repairdesk.app;

    ssl_certificate     /etc/letsencrypt/live/app.repairdesk.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.repairdesk.app/privkey.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # API proxy
    location /api/ {
        proxy_pass http://api:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Rate limit on auth endpoints
        limit_req zone=auth burst=10 nodelay;
    }

    # Frontend proxy
    location / {
        proxy_pass http://web:3000;
        proxy_set_header Host $host;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
    }
}

limit_req_zone $binary_remote_addr zone=auth:10m rate=5r/m;
```

---

## 6. CI/CD — GitHub Actions

### `.github/workflows/ci.yml` (Pull Request)

```yaml
name: CI

on:
  pull_request:
    branches: [main]

jobs:
  test-api:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: repairdesk_test
          POSTGRES_USER: test_user
          POSTGRES_PASSWORD: test_pass
        ports: ["5432:5432"]
      redis:
        image: redis:7-alpine
        ports: ["6379:6379"]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install -r apps/api/requirements-dev.txt
      - run: cd apps/api && pytest --cov=app --cov-report=xml
      - uses: codecov/codecov-action@v4

  test-web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - run: cd apps/web && npm ci && npm run lint && npm run type-check

  build:
    runs-on: ubuntu-latest
    needs: [test-api, test-web]
    steps:
      - uses: actions/checkout@v4
      - run: docker compose -f infra/compose/docker-compose.yml build
```

### `.github/workflows/deploy.yml` (Push to main)

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build and push Docker images
        run: |
          docker build -f infra/docker/Dockerfile.api -t repairdesk-api:latest apps/api
          docker build -f infra/docker/Dockerfile.web -t repairdesk-web:latest apps/web

      - name: Deploy to VPS
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /opt/repairdesk
            git pull origin main
            docker compose pull
            docker compose up -d --build
            docker compose exec api alembic upgrade head
            docker image prune -f
```

---

## 7. Backup Strategy

```bash
# Runs nightly via cron (02:00 UTC) on the VPS

#!/bin/bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DUMP_FILE="/tmp/repairdesk_${TIMESTAMP}.sql.gz"

docker exec repairdesk-postgres-1 pg_dump -U repairdesk_user repairdesk \
  | gzip > "$DUMP_FILE"

# Upload to MinIO backups bucket
docker exec repairdesk-minio-1 mc cp "$DUMP_FILE" local/repairdesk-backups/

# Keep only last 30 days of backups
find /tmp -name "repairdesk_*.sql.gz" -mtime +1 -delete

echo "Backup completed: $DUMP_FILE"
```

Retention: 30 daily backups in MinIO `repairdesk-backups/` bucket.

---

## 8. Monitoring & Alerting (MVP)

| Tool | Purpose | Cost |
|---|---|---|
| UptimeRobot | HTTP uptime checks every 5 min | Free |
| Docker health checks | Container restart on crash | Built-in |
| Nginx access logs | Request logging | Built-in |
| FastAPI `/health` endpoint | Returns `{ "status": "ok", "db": "ok", "redis": "ok" }` | Custom |

**Health Check Endpoint:**
```
GET /api/v1/health
Response 200: { "status": "ok", "db": "connected", "redis": "connected" }
Response 503: { "status": "degraded", "db": "error", "redis": "connected" }
```
