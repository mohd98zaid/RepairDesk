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
.PHONY: test test-api test-web test-breaking test-security test-edge test-cors test-failure test-ci test-coverage test-kw
test: test-api test-web

test-api:
	$(COMPOSE_DEV) exec api pytest tests/ -v --cov=app --cov-report=term-missing

test-breaking:
	$(COMPOSE_DEV) exec api pytest tests/breaking/ -v --tb=short

test-security:
	$(COMPOSE_DEV) exec api pytest tests/breaking/test_security.py tests/security/ -v --tb=short

test-edge:
	$(COMPOSE_DEV) exec api pytest tests/breaking/test_edge_cases.py -v --tb=short

test-cors:
	$(COMPOSE_DEV) exec api pytest tests/breaking/test_cors_network.py -v --tb=short

test-failure:
	$(COMPOSE_DEV) exec api pytest tests/breaking/test_failure_injection.py -v --tb=short

test-web:
	$(COMPOSE_DEV) exec web npm run lint && $(COMPOSE_DEV) exec web npm run type-check && $(COMPOSE_DEV) exec web npm run test

test-ci: test-breaking test-security test-web

test-coverage:
	$(COMPOSE_DEV) exec api pytest tests/ -v --cov=app --cov-report=term-missing --cov-report=html

test-kw:
	$(COMPOSE_DEV) exec api pytest tests/ -v --tb=short -k "$(KW)"
