# Plan Management — Full Feature Specification

> **Status:** Draft · Not Yet Implemented  
> **Author:** AI-assisted spec · 2026-02-24  
> **Purpose:** Complete blueprint for implementing SaaS plan management across the RepairDesk platform.

---

## 1. Overview

Plan Management gives the super-admin the ability to assign and control subscription tiers for each shop. It controls feature access, usage limits, and billing metadata. Shops are always on exactly one plan at a time.

### Goals
- Admin can assign/upgrade/downgrade any shop's plan
- Plan expiry is tracked and enforced automatically
- Shops can see their current plan, limits, and upgrade prompts
- Graceful degradation when a plan expires (read-only, not deleted)
- Foundation for future Stripe/Razorpay billing integration

---

## 2. Plans & Tiers

### 2.1 Tier Definitions

| Tier | Code | Price (INR/mo) | Description |
|------|------|----------------|-------------|
| Free | `FREE` | ₹0 | Trial / small shops |
| Starter | `STARTER` | ₹499 | Small repair shop |
| Pro | `PRO` | ₹999 | Growing shop with technicians |
| Business | `BUSINESS` | ₹2499 | Multi-staff, high volume |
| Enterprise | `ENTERPRISE` | Custom | Negotiated, unlimited everything |

### 2.2 Feature Limits Per Plan

| Feature | FREE | STARTER | PRO | BUSINESS | ENTERPRISE |
|---------|------|---------|-----|----------|------------|
| Max Team Members | 1 | 3 | 10 | 30 | Unlimited |
| Max Tickets/Month | 50 | 200 | 1000 | 5000 | Unlimited |
| Max Customers | 100 | 500 | 5000 | Unlimited | Unlimited |
| Max Inventory Items | 50 | 200 | 2000 | Unlimited | Unlimited |
| Invoice Download | ❌ | ✅ | ✅ | ✅ | ✅ |
| Shop Logo Upload | ❌ | ✅ | ✅ | ✅ | ✅ |
| Customer SMS Alerts | ❌ | ❌ | ✅ | ✅ | ✅ |
| Priority Support | ❌ | ❌ | ❌ | ✅ | ✅ |
| Custom Plan Note | ❌ | ❌ | ❌ | ❌ | ✅ |
| API Access | ❌ | ❌ | ❌ | ✅ | ✅ |
| Data Export (CSV) | ❌ | ❌ | ✅ | ✅ | ✅ |

---

## 3. Database Schema Changes

### 3.1 New `plans` Table (optional — for dynamic plans)

```sql
CREATE TABLE plans (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code        VARCHAR(20) UNIQUE NOT NULL,  -- e.g. 'PRO'
    name        VARCHAR(50) NOT NULL,
    price_inr   INTEGER NOT NULL DEFAULT 0,
    max_members INTEGER NOT NULL DEFAULT 1,
    max_tickets_per_month INTEGER NOT NULL DEFAULT 50,
    max_customers INTEGER NOT NULL DEFAULT 100,
    max_inventory INTEGER NOT NULL DEFAULT 50,
    invoice_download   BOOLEAN DEFAULT FALSE,
    logo_upload        BOOLEAN DEFAULT FALSE,
    sms_alerts         BOOLEAN DEFAULT FALSE,
    csv_export         BOOLEAN DEFAULT FALSE,
    priority_support   BOOLEAN DEFAULT FALSE,
    api_access         BOOLEAN DEFAULT FALSE,
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.2 Changes to `shops` Table

```sql
ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS plan         VARCHAR(20) NOT NULL DEFAULT 'FREE',
  ADD COLUMN IF NOT EXISTS plan_expires_at  TIMESTAMPTZ,        -- NULL = never expires
  ADD COLUMN IF NOT EXISTS plan_assigned_at TIMESTAMPTZ,        -- when admin last changed it
  ADD COLUMN IF NOT EXISTS plan_assigned_by VARCHAR(255),        -- admin email
  ADD COLUMN IF NOT EXISTS plan_note    TEXT;                    -- internal note about plan
```

> **Note:** `plan` column already exists in the codebase. Only the `plan_expires_at`, `plan_assigned_at`, `plan_assigned_by`, and `plan_note` columns are new.

### 3.3 New `plan_history` Table (Audit Trail)

```sql
CREATE TABLE plan_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id         UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    old_plan        VARCHAR(20),
    new_plan        VARCHAR(20) NOT NULL,
    changed_at      TIMESTAMPTZ DEFAULT NOW(),
    changed_by      VARCHAR(255),           -- admin email
    expires_at      TIMESTAMPTZ,
    note            TEXT
);
```

---

## 4. Backend Implementation

### 4.1 New Model: `PlanHistory`

**File:** `apps/api/app/modules/shops/models.py`

```python
class PlanHistory(Base):
    __tablename__ = "plan_history"

    id          = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    shop_id     = mapped_column(UUID(as_uuid=True), ForeignKey("shops.id", ondelete="CASCADE"), nullable=False)
    old_plan    = mapped_column(String(20))
    new_plan    = mapped_column(String(20), nullable=False)
    changed_at  = mapped_column(DateTime(timezone=True), server_default=func.now())
    changed_by  = mapped_column(String(255))
    expires_at  = mapped_column(DateTime(timezone=True), nullable=True)
    note        = mapped_column(Text, nullable=True)
```

Also add new fields to `Shop` model:
```python
plan_expires_at  : Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
plan_assigned_at : Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
plan_assigned_by : Mapped[str | None]      = mapped_column(String(255))
plan_note        : Mapped[str | None]      = mapped_column(Text)
```

### 4.2 Updated Schemas

**File:** `apps/api/app/modules/shops/schemas.py`

```python
class ShopResponse(BaseModel):
    # ... existing fields ...
    plan: str
    plan_expires_at: datetime | None
    plan_assigned_at: datetime | None
    plan_assigned_by: str | None
    plan_note: str | None

class PlanAssignRequest(BaseModel):
    plan: Literal["FREE", "STARTER", "PRO", "BUSINESS", "ENTERPRISE"]
    expires_at: datetime | None = None   # ISO string; None = never expires
    note: str | None = None

class PlanHistoryEntry(BaseModel):
    id: UUID
    old_plan: str | None
    new_plan: str
    changed_at: datetime
    changed_by: str | None
    expires_at: datetime | None
    note: str | None
```

### 4.3 New Admin Endpoints

**File:** `apps/api/app/modules/admin/router.py`

```
POST   /admin/shops/{shop_id}/plan          → assign/change plan
GET    /admin/shops/{shop_id}/plan/history  → view plan change history
GET    /admin/plans                         → list all available plan tiers with limits
```

#### `POST /admin/shops/{shop_id}/plan`

```python
@router.post("/shops/{shop_id}/plan")
async def assign_plan(
    shop_id: uuid.UUID,
    body: PlanAssignRequest,
    admin: dict = AdminUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    shop = await _get_shop_or_404(shop_id, db)
    old_plan = shop.plan

    shop.plan = body.plan
    shop.plan_expires_at = body.expires_at
    shop.plan_assigned_at = datetime.now(timezone.utc)
    shop.plan_assigned_by = admin["email"]
    shop.plan_note = body.note

    # Write audit record
    entry = PlanHistory(
        shop_id=shop.id,
        old_plan=old_plan,
        new_plan=body.plan,
        changed_by=admin["email"],
        expires_at=body.expires_at,
        note=body.note,
    )
    db.add(entry)
    await db.commit()
    return {"ok": True, "plan": body.plan}
```

#### `GET /admin/shops/{shop_id}/plan/history`

Returns a list of `PlanHistoryEntry` objects ordered by `changed_at DESC`.

### 4.4 Plan Enforcement (Middleware / Dependency)

**File:** `apps/api/app/core/plan_guard.py` *(new)*

```python
PLAN_LIMITS = {
    "FREE":       {"max_members": 1,  "max_tickets_month": 50,   "max_customers": 100,  "max_inventory": 50},
    "STARTER":    {"max_members": 3,  "max_tickets_month": 200,  "max_customers": 500,  "max_inventory": 200},
    "PRO":        {"max_members": 10, "max_tickets_month": 1000, "max_customers": 5000, "max_inventory": 2000},
    "BUSINESS":   {"max_members": 30, "max_tickets_month": 5000, "max_customers": None, "max_inventory": None},
    "ENTERPRISE": {"max_members": None, "max_tickets_month": None, "max_customers": None, "max_inventory": None},
}

PLAN_FEATURES = {
    "FREE":       {"invoice": False, "logo": False, "sms": False, "csv": False, "api": False},
    "STARTER":    {"invoice": True,  "logo": True,  "sms": False, "csv": False, "api": False},
    "PRO":        {"invoice": True,  "logo": True,  "sms": True,  "csv": True,  "api": False},
    "BUSINESS":   {"invoice": True,  "logo": True,  "sms": True,  "csv": True,  "api": True},
    "ENTERPRISE": {"invoice": True,  "logo": True,  "sms": True,  "csv": True,  "api": True},
}

async def check_plan_limit(shop: Shop, resource: str, db: AsyncSession):
    """Raise 403 if a shop has hit their plan limit for a given resource."""
    effective_plan = "FREE" if shop.plan_expires_at and shop.plan_expires_at < datetime.now(UTC) else shop.plan
    limits = PLAN_LIMITS.get(effective_plan, PLAN_LIMITS["FREE"])
    limit = limits.get(f"max_{resource}")
    if limit is None:
        return  # Unlimited
    # ... count current usage, raise PlanLimitException if exceeded
```

### 4.5 Plan Expiry Check in Login

**File:** `apps/api/app/modules/auth/service.py`

On login, check if the plan is expired:
```python
if shop.plan_expires_at and shop.plan_expires_at < datetime.now(timezone.utc):
    # Downgrade effective plan to FREE in token payload
    effective_plan = "FREE"
else:
    effective_plan = shop.plan

token_data["plan"] = effective_plan
token_data["plan_expires_at"] = shop.plan_expires_at.isoformat() if shop.plan_expires_at else None
```

---

## 5. Frontend Implementation

### 5.1 Admin Shop Detail Page Changes

**File:** `apps/web/app/admin/shops/[id]/page.tsx`

**New UI Elements:**

1. **Plan Badge** in the shop header — colored badge showing current plan (Free=gray, Starter=blue, Pro=purple, Business=amber, Enterprise=gradient)
2. **Plan Management panel** (new card, below Account Controls):
   - Current plan display with expiry countdown
   - Dropdown: Select new plan (FREE → ENTERPRISE)
   - Date picker: Set expiry date (optional; leave empty = never expires)
   - Text input: Plan note (internal)
   - "Assign Plan" button
3. **Plan History tab or expandable section** — table of past plan changes with who/when/from-to

### 5.2 Plan Management Panel Wireframe

```
┌─────────────────────────────────────────────────────┐
│  📋 Plan Management                                  │
│                                                      │
│  Current Plan:  [PRO ✦]  Expires: 31 Mar 2026       │
│                          (35 days remaining)         │
│                                                      │
│  Change Plan:   [Dropdown: PRO ▼]                    │
│  Expires On:    [Date Picker]  or  [✓ Never Expires] │
│  Internal Note: [___________________________]        │
│                                                      │
│  [  Cancel  ]  [  ✦ Assign Plan  ]                   │
│                                                      │
│  ─ Plan History ───────────────────────────────────  │
│  PRO    → BUSINESS  by admin@rd.com  2026-01-15      │
│  FREE   → PRO       by admin@rd.com  2025-12-01      │
└─────────────────────────────────────────────────────┘
```

### 5.3 Shop Settings Page Changes

**File:** `apps/web/app/(app)/settings/shop/page.tsx`

- Show plan badge (name + color) in the "Shop Profile" card header
- Show usage meters (e.g. "12 / 50 tickets this month") for Free & Starter plans
- Add upgrade CTA banner for lower-tier plans: "Upgrade to PRO to unlock invoice downloads →"
- Read plan/limits from JWT token claims (`plan`, `plan_expires_at`)

### 5.4 Plan Context / Hook

**File:** `apps/web/hooks/usePlan.ts` *(new)*

```typescript
export function usePlan() {
  const { user } = useAuthStore();
  const plan = user?.plan ?? 'FREE';
  const expiresAt = user?.plan_expires_at ? new Date(user.plan_expires_at) : null;
  const isExpired = expiresAt ? expiresAt < new Date() : false;
  const effectivePlan = isExpired ? 'FREE' : plan;

  const can = (feature: string): boolean => PLAN_FEATURES[effectivePlan]?.[feature] ?? false;
  const limit = (resource: string): number | null => PLAN_LIMITS[effectivePlan]?.[resource] ?? 0;

  return { plan, effectivePlan, expiresAt, isExpired, can, limit };
}
```

### 5.5 Feature Gates in UI

Use `usePlan()` hook throughout the app to conditionally show/hide features:

```tsx
// Invoice download button — only shown if plan supports it
const { can } = usePlan();
{can('invoice') && <button onClick={downloadInvoice}>Download Invoice</button>}

// Team invite — show limit warning
const { limit } = usePlan();
{teamCount >= (limit('members') ?? Infinity) && (
  <p className="text-amber-400">Team member limit reached. Upgrade your plan.</p>
)}
```

### 5.6 Plan Badge Color Mapping

```typescript
export const PLAN_COLORS = {
  FREE:       { text: '#94a3b8', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.2)' },
  STARTER:    { text: '#60a5fa', bg: 'rgba(96,165,250,0.1)',  border: 'rgba(96,165,250,0.25)' },
  PRO:        { text: '#a78bfa', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.25)' },
  BUSINESS:   { text: '#fbbf24', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.25)' },
  ENTERPRISE: { text: '#f0abfc', bg: 'rgba(240,171,252,0.1)', border: 'rgba(240,171,252,0.25)' },
};
```

---

## 6. API Changes to `admin-api.ts`

```typescript
// lib/admin-api.ts additions

export async function assignPlan(shopId: string, plan: string, expiresAt?: string | null, note?: string) {
  const res = await adminAxios.post(`/shops/${shopId}/plan`, { plan, expires_at: expiresAt ?? null, note });
  return res.data;
}

export async function getPlanHistory(shopId: string) {
  const res = await adminAxios.get(`/shops/${shopId}/plan/history`);
  return res.data as PlanHistoryEntry[];
}

export async function listPlans() {
  const res = await adminAxios.get('/plans');
  return res.data as PlanDefinition[];
}

export interface PlanHistoryEntry {
  id: string;
  old_plan: string | null;
  new_plan: string;
  changed_at: string;
  changed_by: string | null;
  expires_at: string | null;
  note: string | null;
}

export interface PlanDefinition {
  code: string;
  name: string;
  price_inr: number;
  limits: Record<string, number | null>;
  features: Record<string, boolean>;
}
```

---

## 7. AuthUser Type Updates

**File:** `apps/web/types/index.ts`

```typescript
export interface AuthUser {
  // ... existing fields ...
  plan: string;               // e.g. 'PRO'
  plan_expires_at: string | null;  // ISO string or null
}
```

---

## 8. JWT Token Updates

When generating tokens in `auth/service.py`, include plan info:
```python
token_data = {
    "sub": str(user.id),
    "shop_id": str(user.shop_id),
    "role": user.role,
    "shop_status": shop_status,
    "plan": effective_plan,
    "plan_expires_at": shop.plan_expires_at.isoformat() if shop.plan_expires_at else None,
}
```

---

## 9. Database Migration Script

```python
# apps/api/migrate_plan_management.py
import asyncio
from app.core.db import engine
from sqlalchemy import text

async def migrate():
    async with engine.begin() as conn:
        await conn.execute(text("""
            ALTER TABLE shops
            ADD COLUMN IF NOT EXISTS plan_expires_at  TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS plan_assigned_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS plan_assigned_by VARCHAR(255),
            ADD COLUMN IF NOT EXISTS plan_note        TEXT;
        """))
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS plan_history (
                id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                shop_id       UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
                old_plan      VARCHAR(20),
                new_plan      VARCHAR(20) NOT NULL,
                changed_at    TIMESTAMPTZ DEFAULT NOW(),
                changed_by    VARCHAR(255),
                expires_at    TIMESTAMPTZ,
                note          TEXT
            );
        """))
        print("Plan Management migration complete!")

asyncio.run(migrate())
```

---

## 10. Testing Plan

### Backend Tests
- [ ] `POST /admin/shops/{id}/plan` — assigns plan correctly
- [ ] Plan history entry is created on every plan change
- [ ] Expired plan falls back to FREE limits on enforcement check
- [ ] Login token contains correct `plan` and `plan_expires_at`
- [ ] Team member invite blocked when at limit for FREE plan
- [ ] Ticket creation blocked when monthly limit hit for FREE plan

### Frontend Tests
- [ ] Plan badge shows correct color and name in admin shop detail page
- [ ] Plan assignment form validates and submits correctly
- [ ] Plan history table renders all entries
- [ ] `usePlan()` returns `effectivePlan = 'FREE'` when plan is expired
- [ ] Upgrade CTA banner appears for FREE/STARTER users
- [ ] Feature gates correctly hide/show invoice download button

---

## 11. Implementation Phases

| Phase | Scope |
|-------|-------|
| **Phase 1 — Backend Core** | DB migration, Shop model updates, `PlanHistory` model, `assign_plan` endpoint, plan history endpoint |
| **Phase 2 — Auth Integration** | Plan info in JWT token, expiry check in login, `AuthUser` type updated |
| **Phase 3 — Admin UI** | Plan badge, Plan Management panel in shop detail page, plan history table |
| **Phase 4 — App-side Enforcement** | `usePlan()` hook, feature gates, usage meters, upgrade CTA in settings |
| **Phase 5 — Hard Limits** | Backend enforcement of member/ticket/customer/inventory limits on write ops |

---

## 12. Edge Cases & Design Decisions

| Scenario | Behaviour |
|----------|-----------|
| Plan expired, shop tries to create ticket | If below old-plan limit: allow. If above NEW (FREE) limit: block with friendly message |
| Admin assigns plan with past expiry date | Prevent — validate `expires_at` must be in the future |
| Shop downgraded from PRO → FREE, already has 6 team members | Existing members stay active; new invites are blocked |
| ENTERPRISE plan — no limits | All limit checks return "unlimited", no block |
| Plan changed while user is logged in | Enforcement kicks in on next login (token refresh); no mid-session kick |
| Admin sets `expires_at = null` | Subscription never expires — lifetime/manual billing |

---

*Last updated: 2026-02-24*
