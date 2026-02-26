import pytest
from httpx import AsyncClient
from tests.helpers import auth_headers

CUSTOMERS_URL = "/api/v1/customers"
TICKETS_URL = "/api/v1/tickets"


@pytest.fixture
async def headers(client: AsyncClient):
    return await auth_headers(client)


@pytest.fixture
async def customer(client: AsyncClient, headers):
    resp = await client.post(
        CUSTOMERS_URL,
        json={"name": "Ticket Customer", "phone": "+2348055555555"},
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()


@pytest.fixture
async def sample_ticket(client: AsyncClient, headers, customer):
    resp = await client.post(
        TICKETS_URL,
        json={
            "customer_id": customer["id"],
            "device_type": "iPhone 13",
            "reported_issue": "Cracked screen",
            "estimated_cost": "25000.00",
        },
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()

# ────────────────────────── Ticket Parts ──────────────────────────

class TestTicketParts:
    INVENTORY_URL = "/api/v1/inventory"

    @pytest.fixture
    async def inventory_item(self, client: AsyncClient, headers):
        resp = await client.post(
            self.INVENTORY_URL,
            json={
                "name": "Screen Replacement",
                "sku": "SCR-001",
                "purchase_price": "20.00",
                "selling_price": "50.00",
                "quantity": 10,
                "low_stock_threshold": 2
            },
            headers=headers,
        )
        assert resp.status_code == 201
        return resp.json()

    async def test_add_part_deducts_stock(self, client: AsyncClient, headers, sample_ticket, inventory_item):
        tid = sample_ticket["id"]
        item_id = inventory_item["id"]

        # Add part
        resp = await client.post(
            f"{TICKETS_URL}/{tid}/parts",
            json={"inventory_item_id": item_id, "quantity_used": 2},
            headers=headers,
        )
        assert resp.status_code == 201
        part_data = resp.json()

        # Check ticket detail has part and cost updated
        detail = await client.get(f"{TICKETS_URL}/{tid}", headers=headers)
        assert detail.status_code == 200
        data = detail.json()
        assert len(data["parts"]) == 1
        assert str(data["parts_cost"]) == "100.00"  # 50.00 * 2

        # Check inventory is deducted
        inv = await client.get(self.INVENTORY_URL, headers=headers)
        items = [i for i in inv.json()["items"] if i["id"] == item_id]
        if items:
            assert items[0]["quantity"] == 8

    async def test_add_part_insufficient_stock(self, client: AsyncClient, headers, sample_ticket, inventory_item):
        tid = sample_ticket["id"]
        item_id = inventory_item["id"]

        resp = await client.post(
            f"{TICKETS_URL}/{tid}/parts",
            json={"inventory_item_id": item_id, "quantity_used": 20}, # More than 10
            headers=headers,
        )
        assert resp.status_code == 409

    async def test_remove_part_restores_stock(self, client: AsyncClient, headers, sample_ticket, inventory_item):
        tid = sample_ticket["id"]
        item_id = inventory_item["id"]

        # Add part
        add_resp = await client.post(
            f"{TICKETS_URL}/{tid}/parts",
            json={"inventory_item_id": item_id, "quantity_used": 3},
            headers=headers,
        )
        part_id = add_resp.json()["id"]

        # Remove part
        del_resp = await client.delete(
            f"{TICKETS_URL}/{tid}/parts/{part_id}",
            headers=headers,
        )
        assert del_resp.status_code == 204

        # Check inventory is restored
        inv = await client.get(self.INVENTORY_URL, headers=headers)
        items = [i for i in inv.json()["items"] if i["id"] == item_id]
        if items:
            assert items[0]["quantity"] == 10

        # Check ticket detail has part removed and cost restored
        detail = await client.get(f"{TICKETS_URL}/{tid}", headers=headers)
        data = detail.json()
        assert len(data["parts"]) == 0
        assert str(data["parts_cost"]) == "0.00"
