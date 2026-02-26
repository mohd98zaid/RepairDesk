# 08 — Scoring Engine Specification (Profit & Financial Calculation Engine)

**Product:** RepairDesk  
**Version:** 1.0  
**Date:** 2026-02-23

> **Note:** "Scoring Engine" in the RepairDesk context refers to the **Financial Calculation Engine** — the system responsible for computing ticket profit, daily revenue, parts cost, and aggregated reporting figures. This document specifies all formulas, rules, edge cases, and implementation details for this engine.

---

## 1. Overview

The Financial Engine has three calculation scopes:

| Scope | Trigger | Output |
|---|---|---|
| **Ticket-level** | On part add/remove, final_cost set | `parts_cost`, `profit` per ticket |
| **Daily-level** | On report request for a date | Revenue, cost, net profit for one day |
| **Range-level** | On report request for a date range | Aggregated + per-day breakdown |

All calculations use `NUMERIC(10,2)` precision (2 decimal places). No floating-point arithmetic.

---

## 2. Ticket-Level Calculations

### 2.1 Parts Cost

**Definition:** The total cost to the shop of all parts used in a repair.

**Formula:**
```
parts_cost = Σ (quantity_used × unit_purchase_price)
             for each ticket_part in ticket
```

**Rules:**
- Uses the **purchase price snapshot** stored in `ticket_parts.unit_purchase_price` at the time of part assignment — not the current inventory price.
- If no parts are linked, `parts_cost = 0.00`.
- Recalculated immediately after any add/remove of a part.

**Implementation:** PostgreSQL trigger on `ticket_parts` updates `tickets.parts_cost` atomically (see DB schema doc §3.1).

---

### 2.2 Ticket Profit

**Definition:** Net earnings from a single repair after parts cost.

**Formula:**
```
profit = final_cost - parts_cost
```

**Rules:**
- Only computed when `final_cost IS NOT NULL`.
- Can be negative (repair at a loss — allowed and displayed clearly in red).
- `profit` is `NULL` if `final_cost` is not yet set.
- Labor cost is implicitly included in `final_cost` (not tracked separately in MVP).
- Profit is updated by application layer whenever `final_cost` is set or `parts_cost` changes.

**Example:**

| Field | Value |
|---|---|
| `final_cost` | $120.00 |
| Parts: Screen × 1 @ $45.00 | $45.00 |
| `parts_cost` | $45.00 |
| **`profit`** | **$75.00** |

---

### 2.3 Profit Margin % (Display Only)

Computed at the application/frontend layer for display; not persisted.

```
margin_pct = (profit / final_cost) × 100
```

Only shown when `final_cost > 0`.

---

## 3. Daily-Level Calculations

Triggered by a call to `GET /reports/daily?date=YYYY-MM-DD`.

### 3.1 Scope

Includes all tickets for the shop where:
```sql
status IN ('DELIVERED')
AND DATE(updated_at AT TIME ZONE shop_timezone) = target_date
```

> **Design Decision:** Revenue is recognized on the day the ticket reaches `DELIVERED` status, not when created. This reflects actual cash-in for the shop owner.

---

### 3.2 Daily Metrics

```python
daily_revenue    = SUM(final_cost)       WHERE status = 'DELIVERED' AND delivery_date = target_date
daily_parts_cost = SUM(parts_cost)       same filter
daily_profit     = SUM(profit)           same filter
  # equivalent to: daily_revenue - daily_parts_cost

tickets_created   = COUNT(*)             WHERE DATE(created_at) = target_date
tickets_completed = COUNT(*)             WHERE status = 'DELIVERED' AND DATE(updated_at) = target_date
```

### 3.3 Status Count Snapshot

For the dashboard pie/bar chart:
```python
tickets_by_status = {
    status: COUNT(*)
    for status in ALL_STATUSES
    WHERE DATE(created_at) <= target_date
      AND (status != 'DELIVERED' OR DATE(updated_at) >= target_date)
}
```

---

## 4. Range-Level Calculations

Triggered by `GET /reports/range?from_date=&to_date=`.

### 4.1 Aggregated Totals

```python
total_revenue     = SUM(final_cost)     for all DELIVERED tickets in date range
total_parts_cost  = SUM(parts_cost)     same
net_profit        = total_revenue - total_parts_cost
tickets_completed = COUNT(*)            same
avg_ticket_value  = total_revenue / tickets_completed   (0 if none)
avg_profit        = net_profit / tickets_completed      (0 if none)
```

### 4.2 Daily Breakdown

Per-day array for charting:
```python
for each day in [from_date, to_date]:
    day_revenue   = SUM(final_cost)  for DELIVERED on that day
    day_profit    = SUM(profit)      for DELIVERED on that day
    day_completed = COUNT(*)         for DELIVERED on that day
```

---

## 5. Plan Enforcement Rules

| Plan | Max Range | Behaviour if exceeded |
|---|---|---|
| Free | 7 days | API returns `403` with `code: PLAN_LIMIT_EXCEEDED` |
| Pro | 90 days | — |
| Business | 365 days | — |

Enforcement applied in `reports/service.py` before running the query.

---

## 6. Inventory Deduction on Ticket Delivery

When a ticket's status changes to `DELIVERED`, the following happens **atomically in a single database transaction**:

```python
async def deliver_ticket(ticket_id, db):
    async with db.begin():
        ticket = await get_ticket(ticket_id, db, lock=True)

        for part in ticket.parts:
            item = await get_inventory_item(part.inventory_item_id, db, lock=True)
            if item.quantity < part.quantity_used:
                raise InsufficientStockError(item.name)
            item.quantity -= part.quantity_used

        ticket.status = 'DELIVERED'
        ticket.profit = ticket.final_cost - ticket.parts_cost
        log_status_change(ticket, 'DELIVERED', user)
```

**Failure handling:** If any item has insufficient stock (race condition), the transaction is rolled back and a `409 CONFLICT` is returned. The ticket status remains unchanged.

---

## 7. Edge Cases & Rules

| Case | Rule |
|---|---|
| Ticket with no parts | `parts_cost = 0`, `profit = final_cost` |
| Ticket with no final_cost | `profit = NULL`; excluded from revenue reports |
| Cancelled ticket | Excluded from all revenue/profit calculations |
| Part removed after delivery | Not allowed (validation error) |
| Price change after part linked | No effect; snapshot is preserved in `ticket_parts` |
| Negative profit | Allowed; shown in red; included in aggregations |
| `final_cost = 0` | `profit = -parts_cost`; valid for warranty repairs |
| Timezone handling | All daily cutoffs are in the shop's configured timezone (UTC default in MVP) |

---

## 8. Implementation Location

| Concern | Location |
|---|---|
| `parts_cost` recomputation | PostgreSQL trigger `trg_update_parts_cost` |
| `profit` computation | `apps/api/app/modules/tickets/service.py` → `update_profit()` |
| Daily report query | `apps/api/app/modules/reports/service.py` → `get_daily_report()` |
| Range report query | `apps/api/app/modules/reports/service.py` → `get_range_report()` |
| Plan enforcement | `apps/api/app/modules/reports/service.py` → `check_plan_date_range()` |
| Delivery transaction | `apps/api/app/modules/tickets/service.py` → `deliver_ticket()` |

---

## 9. Unit Test Cases (Required Coverage)

```
test_parts_cost_no_parts           → parts_cost = 0
test_parts_cost_single_part        → correct computation
test_parts_cost_multiple_parts     → sum is correct
test_profit_with_parts             → profit = final - parts
test_profit_no_final_cost          → profit = NULL
test_profit_negative               → negative allowed
test_daily_report_no_tickets       → all zeros, no error
test_daily_report_cancelled_excluded
test_range_report_plan_enforcement → 403 for free plan > 7 days
test_delivery_deducts_inventory
test_delivery_insufficient_stock   → rollback, 409
test_price_snapshot_preserved      → changing price doesn't affect historical records
```
