# 03 — Information Architecture

**Product:** RepairDesk  
**Version:** 1.0  
**Date:** 2026-02-23

---

## 1. Site Map

```
/ (root)
├── /auth
│   ├── /login
│   ├── /register
│   ├── /forgot-password
│   └── /reset-password/[token]
│
├── /app (authenticated, shop-scoped)
│   ├── /dashboard               ← Daily profit overview
│   │
│   ├── /tickets
│   │   ├── /                    ← Ticket list (filterable)
│   │   ├── /new                 ← Create ticket
│   │   └── /[id]
│   │       ├── /                ← Ticket detail & status updates
│   │       ├── /edit            ← Edit ticket core fields (owner only)
│   │       └── /invoice         ← Invoice preview + download
│   │
│   ├── /customers
│   │   ├── /                    ← Customer list
│   │   └── /[id]                ← Customer profile + ticket history
│   │
│   ├── /inventory
│   │   ├── /                    ← Inventory list
│   │   ├── /new                 ← Add item
│   │   └── /[id]/edit           ← Edit item
│   │
│   ├── /reports
│   │   └── /                    ← Date-range profit & ticket reports
│   │
│   └── /settings
│       ├── /shop                ← Shop profile (name, phone, logo)
│       ├── /team                ← Invite / manage users
│       └── /billing             ← Subscription plan management
│
└── /public
    └── /invoice/[token]         ← Public shareable invoice view (no auth)
```

---

## 2. Navigation Structure

### Primary Navigation (Bottom Tab Bar on Mobile, Left Sidebar on Desktop)

| Tab | Icon | Route | Roles |
|---|---|---|---|
| Dashboard | Chart | /app/dashboard | Owner |
| Tickets | Wrench | /app/tickets | Owner, Technician |
| Customers | Person | /app/customers | Owner, Technician |
| Inventory | Box | /app/inventory | Owner (Technician: read-only) |
| Reports | Document | /app/reports | Owner |
| Settings | Gear | /app/settings | Owner |

### Contextual Actions (Floating Action Button)

- On `/app/tickets` → "New Ticket" FAB
- On `/app/inventory` → "Add Item" FAB
- On `/app/tickets/[id]` → "Generate Invoice" button (Owner, if status = READY or DELIVERED)

---

## 3. Page Layouts & Key Components

### 3.1 Dashboard (`/app/dashboard`)

```
┌─────────────────────────────────┐
│  RepairDesk        [Today ▼]   │
├─────────────────────────────────┤
│  Revenue      Parts    Profit  │
│  $1,240       $380     $860    │  ← KPI cards
├─────────────────────────────────┤
│  Tickets Today                  │
│  12 created · 8 completed       │
├─────────────────────────────────┤
│  Recent Tickets                 │
│  [TK-042] iPhone 13 · Ready    │
│  [TK-041] Samsung S21 · Prog.  │
│  ...                            │
└─────────────────────────────────┘
```

---

### 3.2 Ticket List (`/app/tickets`)

```
┌─────────────────────────────────┐
│  Tickets      [Filter] [Search] │
├─────────────────────────────────┤
│  Status: All ▼  Date: Today ▼  │ ← Filter bar
├─────────────────────────────────┤
│  TK-042 · iPhone 13 Screen      │
│  John Doe · READY · $120        │
├─────────────────────────────────┤
│  TK-041 · Samsung S21           │
│  Jane Smith · IN PROGRESS · —  │
└─────────────────────────────────┘
                               [+]  ← FAB
```

---

### 3.3 Ticket Detail (`/app/tickets/[id]`)

```
┌─────────────────────────────────┐
│  ← TK-042             [Invoice]│
├─────────────────────────────────┤
│  Status: ● READY               │
│  [Change Status ▼]              │
├─────────────────────────────────┤
│  Customer: John Doe · 555-1234  │
│  Device: iPhone 13              │
│  Issue: Cracked screen          │
├─────────────────────────────────┤
│  Photos  [img] [img] [img]     │
├─────────────────────────────────┤
│  Parts Used                     │
│  Screen × 1    $45             │
│  [+ Add Part]                   │
├─────────────────────────────────┤
│  Estimated: $130  Final: $120   │
│  Profit: $75                    │
├─────────────────────────────────┤
│  Activity Log                   │
│  14:32 · Status → READY · Alex │
│  11:10 · Status → IN_PROGRESS  │
└─────────────────────────────────┘
```

---

## 4. User Flows

### 4.1 Create Ticket (Primary Flow)

```
[Ticket List] → Tap (+) 
  → [New Ticket Form]
      → Enter customer phone
          → Phone found? → Auto-fill name
          → Not found? → Enter name inline
      → Enter device + issue
      → Optional: estimated cost, images
      → Tap "Create Ticket"
  → [Ticket Detail View — TK-XXX]
```

### 4.2 Complete Repair & Invoice

```
[Ticket Detail] → Change Status → READY
  → Add final cost
  → Add parts used (deducts inventory)
  → Tap "Generate Invoice"
  → [Invoice Preview PDF]
  → Download or Share
```

### 4.3 Offline Ticket Update

```
[Offline Banner visible]
  → User taps "Change Status"
  → Action queued in IndexedDB
  → [Pending badge shown on ticket]
  → Connectivity restored
  → Service Worker syncs queue
  → [Pending badge removed]
```

---

## 5. Role-Based View Differences

| Feature | Owner | Technician |
|---|---|---|
| Dashboard (financial KPIs) | ✅ Full | ❌ Hidden |
| Ticket list | ✅ All tickets | ✅ All tickets |
| Create / edit ticket | ✅ | ✅ |
| Cancel ticket | ✅ | ❌ |
| View ticket profit | ✅ | ❌ |
| Inventory list (prices) | ✅ With prices | ✅ Names only |
| Add / edit inventory | ✅ | ❌ |
| Generate invoice | ✅ | ❌ |
| Reports | ✅ | ❌ |
| Settings → Team | ✅ | ❌ |
| Settings → Billing | ✅ | ❌ |
