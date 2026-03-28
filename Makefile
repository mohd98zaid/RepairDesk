# ============================================================
# RepairDesk — Developer Convenience Commands
# ============================================================

COMPOSE_DEV = docker compose -f infra/compose/docker-compose.dev.yml
COMPOSE_PROD = docker compose -f infra/compose/docker-compose.yml

# -------------------------------------------------------
# Development
# -------------------------------------------------------
.PHONY: dev dev-api dev-web
dev:
	$(COMPOSE_DEV) up --build

dev-api:
	$(COMPOSE_DEV) up api --build

dev-web:
	$(COMPOSE_DEV) up web --build

# -------------------------------------------------------
# Database
# -------------------------------------------------------
.PHONY: migrate migration
migrate:
	$(COMPOSE_DEV) exec api alembic upgrade head

migration:
	$(COMPOSE_DEV) exec api alembic revision --autogenerate -m "$(m)"

# -------------------------------------------------------
# Testing
# -------------------------------------------------------
.PHONY: test test-api test-web
test: test-api test-web

test-api:
	$(COMPOSE_DEV) exec api pytest tests/ -v --cov=app --cov-report=term-missing

test-web:
	$(COMPOSE_DEV) exec web npm run lint && $(COMPOSE_DEV) exec web npm run type-check

# -------------------------------------------------------
# Production
# -------------------------------------------------------
.PHONY: build up down logs
build:
	$(COMPOSE_PROD) build

up:
	$(COMPOSE_PROD) up -d

down:
	$(COMPOSE_PROD) down

logs:
	$(COMPOSE_PROD) logs -f

# -------------------------------------------------------
# Utilities
# -------------------------------------------------------
.PHONY: shell-api shell-db seed
shell-api:
	$(COMPOSE_DEV) exec api bash

shell-db:
	$(COMPOSE_DEV) exec postgres psql -U repairdesk_user -d repairdesk

seed:
	$(COMPOSE_DEV) exec api python scripts/seed.py

# -------------------------------------------------------
# Security Audit
# -------------------------------------------------------
.PHONY: audit audit-fix test-security
audit:
	$(COMPOSE_DEV) exec api python scripts/audit_fix.py audit

audit-fix:
	$(COMPOSE_DEV) exec api python scripts/audit_fix.py full

test-security:
	$(COMPOSE_DEV) exec api pytest tests/security/ -v --tb=short
