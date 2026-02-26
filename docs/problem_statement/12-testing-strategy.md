# 12 — Testing Strategy

**Product:** RepairDesk  
**Version:** 1.0  
**Date:** 2026-02-23

---

## 1. Testing Philosophy

RepairDesk follows a **pragmatic test pyramid** tuned for a small team and 8-week MVP timeline. The focus is on correctness of core business logic (profit calculation, state machine, stock deduction) and reliable integration of the API layer. UI tests are limited to critical user flows.

```
          ┌────────────┐
          │  E2E Tests  │  ← Few; critical flows only
          ├────────────┤
          │ Integration │  ← API endpoints; medium coverage
          ├────────────┤
          │  Unit Tests │  ← Business logic; high coverage
          └────────────┘
```

**Coverage targets:**

| Layer | Target |
|---|---|
| Backend unit tests | ≥ 85% on `modules/` |
| Backend integration tests | All API endpoints have at least one passing test |
| Frontend | Type-check + lint must pass; no unit coverage target in MVP |
| E2E | 5 critical flows automated |

---

## 2. Backend Testing

### 2.1 Stack

| Tool | Purpose |
|---|---|
| `pytest` | Test runner |
| `pytest-asyncio` | Async test support |
| `httpx.AsyncClient` | In-process HTTP client for FastAPI |
| `pytest-cov` | Coverage reporting |
| `factory_boy` | Test data factories |
| `faker` | Fake data generation |
| PostgreSQL (test DB) | Real DB (not SQLite); avoids ORM compatibility issues |

### 2.2 Test Database Setup

```python
# tests/conftest.py

@pytest.fixture(scope="session")
async def test_engine():
    engine = create_async_engine(settings.TEST_DATABASE_URL)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

@pytest.fixture()
async def db(test_engine):
    async with AsyncSession(test_engine) as session:
        yield session
        await session.rollback()  # Each test rolls back

@pytest.fixture()
async def client(db):
    app.dependency_overrides[get_db] = lambda: db
    async with AsyncClient(app=app, base_url="http://test") as ac:
        yield ac
```

### 2.3 Unit Tests

Located in `apps/api/tests/unit/`. These test pure functions and service methods with mocked dependencies.

#### Profit & Financial Engine (Priority: CRITICAL)

```python
# tests/unit/test_profit_calc.py

def test_parts_cost_no_parts():
    assert compute_parts_cost([]) == Decimal("0.00")

def test_parts_cost_single_part():
    parts = [TicketPartData(quantity_used=1, unit_purchase_price=Decimal("45.00"))]
    assert compute_parts_cost(parts) == Decimal("45.00")

def test_parts_cost_multiple_parts():
    parts = [
        TicketPartData(quantity_used=2, unit_purchase_price=Decimal("10.00")),
        TicketPartData(quantity_used=1, unit_purchase_price=Decimal("30.00")),
    ]
    assert compute_parts_cost(parts) == Decimal("50.00")

def test_profit_normal():
    assert compute_profit(Decimal("120.00"), Decimal("45.00")) == Decimal("75.00")

def test_profit_no_final_cost():
    assert compute_profit(None, Decimal("45.00")) is None

def test_profit_negative():
    assert compute_profit(Decimal("30.00"), Decimal("45.00")) == Decimal("-15.00")

def test_profit_zero_final_cost():
    assert compute_profit(Decimal("0.00"), Decimal("45.00")) == Decimal("-45.00")
```

#### State Machine (Priority: HIGH)

```python
# tests/unit/test_state_machine.py

def test_valid_transition_received_to_in_progress():
    assert is_valid_transition("RECEIVED", "IN_PROGRESS") is True

def test_invalid_transition_delivered_to_in_progress():
    assert is_valid_transition("DELIVERED", "IN_PROGRESS") is False

def test_cancel_from_received():
    assert is_valid_transition("RECEIVED", "CANCELLED") is True

def test_cancel_from_delivered():
    assert is_valid_transition("DELIVERED", "CANCELLED") is False

def test_all_valid_transitions():
    VALID = [
        ("RECEIVED", "IN_PROGRESS"),
        ("IN_PROGRESS", "WAITING_PARTS"),
        ("WAITING_PARTS", "IN_PROGRESS"),
        ("IN_PROGRESS", "READY"),
        ("READY", "DELIVERED"),
    ]
    for from_s, to_s in VALID:
        assert is_valid_transition(from_s, to_s) is True
```

#### Security (Priority: HIGH)

```python
# tests/unit/test_security.py

def test_password_hash_and_verify():
    hashed = hash_password("SecurePass123")
    assert verify_password("SecurePass123", hashed) is True
    assert verify_password("WrongPass", hashed) is False

def test_jwt_create_and_decode():
    token = create_access_token({"sub": "user-uuid", "shop_id": "shop-uuid"})
    payload = decode_token(token)
    assert payload["sub"] == "user-uuid"

def test_expired_jwt_raises():
    token = create_access_token({"sub": "uuid"}, expires_delta=timedelta(seconds=-1))
    with pytest.raises(TokenExpiredError):
        decode_token(token)
```

---

### 2.4 Integration Tests

Located in `apps/api/tests/integration/`. These tests hit real FastAPI endpoints with a real test database.

#### Auth

```python
# tests/integration/test_auth.py

async def test_register_success(client):
    res = await client.post("/api/v1/auth/register", json={...})
    assert res.status_code == 201
    assert "access_token" in res.json()

async def test_register_duplicate_email(client, existing_user):
    res = await client.post("/api/v1/auth/register", json={...same email...})
    assert res.status_code == 409

async def test_login_success(client, existing_user):
    res = await client.post("/api/v1/auth/login", json={...})
    assert res.status_code == 200
    assert "access_token" in res.json()

async def test_login_wrong_password(client, existing_user):
    res = await client.post("/api/v1/auth/login", json={..., "password": "wrong"})
    assert res.status_code == 401

async def test_protected_route_without_token(client):
    res = await client.get("/api/v1/tickets")
    assert res.status_code == 401
```

#### Tickets

```python
async def test_create_ticket_creates_new_customer(auth_client, db):
    res = await auth_client.post("/api/v1/tickets", json={
        "customer_phone": "+2348099999999",
        "customer_name": "New Customer",
        "device_type": "Android Phone",
        "reported_issue": "Won't charge"
    })
    assert res.status_code == 201
    assert res.json()["status"] == "RECEIVED"
    # Verify customer was created
    customer = await db.get(Customer, res.json()["customer"]["id"])
    assert customer.name == "New Customer"

async def test_status_transition_enforced(auth_client, existing_ticket):
    # Try invalid transition
    res = await auth_client.post(f"/api/v1/tickets/{existing_ticket.id}/status",
        json={"status": "DELIVERED"})  # Must go through READY first
    assert res.status_code == 422

async def test_technician_cannot_cancel(technician_client, existing_ticket):
    res = await technician_client.post(f"/api/v1/tickets/{existing_ticket.id}/status",
        json={"status": "CANCELLED"})
    assert res.status_code == 403
```

#### Inventory & Stock

```python
async def test_add_part_deducts_stock_on_delivery(auth_client, ticket, inventory_item):
    # Link part to ticket
    await auth_client.post(f"/api/v1/tickets/{ticket.id}/parts",
        json={"inventory_item_id": str(inventory_item.id), "quantity_used": 2})

    # Move ticket to DELIVERED
    await auth_client.post(f"/api/v1/tickets/{ticket.id}/status", json={"status": "IN_PROGRESS"})
    await auth_client.post(f"/api/v1/tickets/{ticket.id}/status", json={"status": "READY"})
    await auth_client.patch(f"/api/v1/tickets/{ticket.id}", json={"final_cost": "100.00"})
    await auth_client.post(f"/api/v1/tickets/{ticket.id}/status", json={"status": "DELIVERED"})

    # Verify stock was deducted
    res = await auth_client.get(f"/api/v1/inventory/{inventory_item.id}")
    assert res.json()["quantity"] == inventory_item.quantity - 2

async def test_insufficient_stock_returns_409(auth_client, ticket, low_stock_item):
    res = await auth_client.post(f"/api/v1/tickets/{ticket.id}/parts",
        json={"inventory_item_id": str(low_stock_item.id), "quantity_used": 99})
    assert res.status_code == 409

async def test_shop_data_isolation(auth_client_shop_a, ticket_shop_b):
    res = await auth_client_shop_a.get(f"/api/v1/tickets/{ticket_shop_b.id}")
    assert res.status_code == 404  # Must not be visible
```

#### Reports

```python
async def test_daily_report_includes_delivered_tickets(auth_client, delivered_ticket):
    res = await auth_client.get("/api/v1/reports/daily?date=2026-02-23")
    assert res.status_code == 200
    data = res.json()
    assert Decimal(data["total_revenue"]) == delivered_ticket.final_cost

async def test_free_plan_range_limit(auth_client_free):
    res = await auth_client_free.get("/api/v1/reports/range?from_date=2026-01-01&to_date=2026-02-23")
    assert res.status_code == 403
    assert res.json()["code"] == "PLAN_LIMIT_EXCEEDED"
```

---

## 3. Frontend Testing

### 3.1 Stack

| Tool | Purpose |
|---|---|
| TypeScript compiler | Type safety (CI blocks on type errors) |
| ESLint + eslint-config-next | Code quality |
| Prettier | Code formatting |

> Unit and component testing (Vitest/Testing Library) are deferred to post-MVP. Type-checking + lint is the MVP frontend quality gate.

### 3.2 Type-Check Command

```bash
cd apps/web && npx tsc --noEmit
```

### 3.3 Lint Command

```bash
cd apps/web && npm run lint
```

---

## 4. End-to-End Tests

### 4.1 Stack

- **Tool:** Playwright
- **Location:** `apps/web/e2e/`
- **Runs:** On merge to `main` in CI (not on every PR — too slow)

### 4.2 Critical Flows (5 automated)

```
E2E-01: Shop Registration & Login
  → Register new shop → Log in → Verify dashboard loads

E2E-02: Ticket Lifecycle
  → Login → Create ticket (new customer) → Change status to IN_PROGRESS
  → Add part → Change to READY → Set final cost → Change to DELIVERED
  → Verify profit displayed correctly

E2E-03: Invoice Generation
  → Login → Navigate to DELIVERED ticket → Click Generate Invoice
  → Verify PDF download initiated → Verify share link works (unauthenticated)

E2E-04: Inventory Management
  → Login → Add inventory item → Verify appears in list
  → Edit quantity → Verify low-stock badge appears at threshold

E2E-05: Offline Ticket Update
  → Login → Load ticket list → Disconnect network (Playwright network intercept)
  → Verify offline banner appears → Change status → Reconnect
  → Verify status synced
```

### 4.3 Example Playwright Test

```typescript
// e2e/ticket-lifecycle.spec.ts

test("full ticket lifecycle", async ({ page }) => {
  await loginAs(page, "owner@test.com", "password");
  await page.goto("/app/tickets/new");
  await page.fill('[name="customer_phone"]', "+2348099999999");
  await page.fill('[name="customer_name"]', "Test Customer");
  await page.fill('[name="device_type"]', "iPhone");
  await page.fill('[name="reported_issue"]', "Broken screen");
  await page.click('[data-testid="submit-ticket"]');
  await expect(page).toHaveURL(/\/app\/tickets\/[a-z0-9-]+/);
  await expect(page.locator('[data-testid="status-badge"]')).toHaveText("RECEIVED");
});
```

---

## 5. Manual QA Checklist (Pre-Launch, Week 8)

### Mobile (Chrome Android, Safari iOS at 375px)

- [ ] All pages render without horizontal scroll
- [ ] Bottom navigation is tappable and navigates correctly
- [ ] Ticket create form is usable on mobile keyboard
- [ ] Image upload works on mobile camera
- [ ] Status change modal opens and submits on mobile
- [ ] PWA install prompt appears on Android Chrome
- [ ] App launches in standalone mode after install
- [ ] Offline banner appears when WiFi is disabled
- [ ] Cached ticket list loads offline

### Desktop (Chrome, Firefox, Safari)

- [ ] Sidebar navigation renders correctly
- [ ] Ticket list table is readable at 1440px
- [ ] Report chart renders and is interactive
- [ ] Invoice PDF downloads correctly

### Security

- [ ] Accessing `/app/*` without login redirects to `/auth/login`
- [ ] Technician cannot access `/app/reports` (receives 403 or redirect)
- [ ] Technician cannot see price columns in inventory
- [ ] Shop A user cannot access Shop B's ticket IDs (returns 404)
- [ ] Login with 6 wrong attempts triggers lock message
- [ ] Password reset link expires after 1 hour

---

## 6. CI Test Execution Summary

```yaml
# Full CI run on PR

Jobs:
  test-api:
    - Install Python deps
    - Start test PostgreSQL + Redis
    - Run: pytest --cov=app --cov-fail-under=80
    - Upload coverage to Codecov

  test-web:
    - Install Node deps
    - Run: npm run type-check
    - Run: npm run lint

  build:
    - Build Docker images (verifies no build errors)

# E2E runs only on main merge
  e2e:
    needs: [deploy-staging]   # Stage 2 only; in MVP, runs post-deploy manually
```

---

## 7. Bug Severity Classification

| Severity | Definition | SLA |
|---|---|---|
| Critical | Data loss, security breach, complete feature failure | Fix immediately, hotfix deploy |
| High | Core feature broken for all users | Fix before next release |
| Medium | Feature partially broken or workaround exists | Fix within 1 sprint |
| Low | UI polish, minor UX issue | Backlog |

All Critical and High bugs block production releases.
