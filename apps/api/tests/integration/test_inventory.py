"""
Integration tests — Inventory API
Covers: create, list, get, update, stock adjustment, low-stock filter, parts on tickets
"""
import uuid
import pytest
from httpx import AsyncClient
from tests.helpers import auth_headers

INVENTORY_URL = "/api/v1/inventory"
CUSTOMERS_URL = "/api/v1/customers"
TICKETS_URL = "/api/v1/tickets"

ITEM_PAYLOAD = {
    "name": "iPhone Screen",
    "sku": "IPH13-SCR-UNIQUE",
    "purchase_price": "8000.00",
    "selling_price": "12000.00",
    "quantity": 20,
    "low_stock_threshold": 5,
}


@pytest.fixture
async def headers(client: AsyncClient):
    return await auth_headers(client)


@pytest.fixture
async def item(client: AsyncClient, headers):
    resp = await client.post(INVENTORY_URL, json=ITEM_PAYLOAD, headers=headers)
    assert resp.status_code == 201
    return resp.json()


@pytest.fixture
async def ticket(client: AsyncClient, headers):
    c = await client.post(
        CUSTOMERS_URL,
        json={"name": "Inv Customer", "phone": "+2348077777777"},
        headers=headers,
    )
    t = await client.post(
        TICKETS_URL,
        json={"customer_id": c.json()["id"], "device_type": "Phone", "reported_issue": "Cracked"},
        headers=headers,
    )
    return t.json()


# ──────────────────── Create ────────────────────

class TestCreateInventoryItem:
    async def test_create_success(self, client: AsyncClient, headers):
        payload = {**ITEM_PAYLOAD, "sku": "CREATE-TEST-SKU"}
        resp = await client.post(INVENTORY_URL, json=payload, headers=headers)
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "iPhone Screen"
        assert data["quantity"] == 20
        assert "is_low_stock" in data

    async def test_create_requires_auth(self, client: AsyncClient):
        resp = await client.post(INVENTORY_URL, json=ITEM_PAYLOAD)
        assert resp.status_code == 401

    async def test_create_missing_prices(self, client: AsyncClient, headers):
        resp = await client.post(
            INVENTORY_URL,
            json={"name": "Widget", "quantity": 10},
            headers=headers,
        )
        assert resp.status_code == 422

    async def test_create_item_not_low_stock(self, client: AsyncClient, headers, item):
        # quantity 20 > threshold 5
        assert item["is_low_stock"] is False

    async def test_create_item_is_low_stock(self, client: AsyncClient, headers):
        payload = {**ITEM_PAYLOAD, "quantity": 3, "low_stock_threshold": 5, "sku": "LOW-STOCK-SKU"}
        resp = await client.post(INVENTORY_URL, json=payload, headers=headers)
        assert resp.status_code == 201
        assert resp.json()["is_low_stock"] is True


# ──────────────────── List ────────────────────

class TestListInventory:
    async def test_list_empty(self, client: AsyncClient, headers):
        resp = await client.get(INVENTORY_URL, headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert "low_stock_count" in data

    async def test_list_includes_item(self, client: AsyncClient, headers, item):
        resp = await client.get(INVENTORY_URL, headers=headers)
        assert resp.status_code == 200
        assert resp.json()["total"] >= 1

    async def test_search_by_name(self, client: AsyncClient, headers, item):
        # API uses `search=` parameter
        resp = await client.get(INVENTORY_URL, params={"search": "iPhone"}, headers=headers)
        assert resp.status_code == 200
        assert resp.json()["total"] >= 1

    async def test_search_no_match(self, client: AsyncClient, headers, item):
        resp = await client.get(INVENTORY_URL, params={"search": "zzznomatch99"}, headers=headers)
        assert resp.status_code == 200
        assert resp.json()["total"] == 0

    async def test_low_stock_filter(self, client: AsyncClient, headers):
        await client.post(
            INVENTORY_URL,
            json={**ITEM_PAYLOAD, "quantity": 2, "low_stock_threshold": 5, "sku": "LOW-FILTER-SKU"},
            headers=headers,
        )
        resp = await client.get(INVENTORY_URL, params={"low_stock_only": "true"}, headers=headers)
        assert resp.status_code == 200
        for it in resp.json()["items"]:
            assert it["is_low_stock"] is True


# ──────────────────── Get / Update ────────────────────

class TestGetUpdateItem:
    async def test_get_existing(self, client: AsyncClient, headers, item):
        resp = await client.get(f"{INVENTORY_URL}/{item['id']}", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["id"] == item["id"]

    async def test_get_nonexistent(self, client: AsyncClient, headers):
        resp = await client.get(f"{INVENTORY_URL}/{uuid.uuid4()}", headers=headers)
        assert resp.status_code == 404

    async def test_update_name(self, client: AsyncClient, headers, item):
        resp = await client.patch(
            f"{INVENTORY_URL}/{item['id']}",
            json={"name": "Updated Screen"},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Updated Screen"

    async def test_update_price(self, client: AsyncClient, headers, item):
        resp = await client.patch(
            f"{INVENTORY_URL}/{item['id']}",
            json={"selling_price": "15000.00"},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["selling_price"] == "15000.00"


# ──────────────────── Stock Adjustment ────────────────────

class TestStockAdjustment:
    async def test_add_stock(self, client: AsyncClient, headers, item):
        original_qty = item["quantity"]  # 20
        resp = await client.post(
            f"{INVENTORY_URL}/{item['id']}/stock",
            json={"delta": 10, "reason": "Restock"},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["quantity"] == original_qty + 10

    async def test_remove_stock(self, client: AsyncClient, headers, item):
        original_qty = item["quantity"]  # 20
        resp = await client.post(
            f"{INVENTORY_URL}/{item['id']}/stock",
            json={"delta": -5, "reason": "Manual adjustment"},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["quantity"] == original_qty - 5

    async def test_stock_cannot_go_negative(self, client: AsyncClient, headers, item):
        resp = await client.post(
            f"{INVENTORY_URL}/{item['id']}/stock",
            json={"delta": -100, "reason": "Too much"},
            headers=headers,
        )
        assert resp.status_code in (400, 422)


# ──────────────────── Ticket Parts ────────────────────

class TestTicketParts:
    async def test_add_part_to_ticket(self, client: AsyncClient, headers, item, ticket):
        tid = ticket["id"]
        resp = await client.post(
            f"{TICKETS_URL}/{tid}/parts",
            json={"inventory_item_id": item["id"], "quantity_used": 1},
            headers=headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["quantity_used"] == 1
        assert "unit_selling_price" in data
        # Parts endpoint returns: id, inventory_item_id, quantity_used, unit_selling_price, unit_purchase_price
        assert "unit_purchase_price" in data

    async def test_add_part_deducts_stock(self, client: AsyncClient, headers, item, ticket):
        original_qty = item["quantity"]
        await client.post(
            f"{TICKETS_URL}/{ticket['id']}/parts",
            json={"inventory_item_id": item["id"], "quantity_used": 3},
            headers=headers,
        )
        updated_item = await client.get(f"{INVENTORY_URL}/{item['id']}", headers=headers)
        assert updated_item.json()["quantity"] == original_qty - 3

    async def test_add_part_exceeding_stock_fails(self, client: AsyncClient, headers, item, ticket):
        resp = await client.post(
            f"{TICKETS_URL}/{ticket['id']}/parts",
            json={"inventory_item_id": item["id"], "quantity_used": 999},
            headers=headers,
        )
        assert resp.status_code in (400, 409, 422)

    async def test_list_ticket_parts(self, client: AsyncClient, headers, item, ticket):
        await client.post(
            f"{TICKETS_URL}/{ticket['id']}/parts",
            json={"inventory_item_id": item["id"], "quantity_used": 1},
            headers=headers,
        )
        resp = await client.get(f"{TICKETS_URL}/{ticket['id']}/parts", headers=headers)
        assert resp.status_code == 200
        # Parts list endpoint returns {"parts": [...]}
        data = resp.json()
        assert "parts" in data
        assert len(data["parts"]) >= 1
