"""
Security Tests — IDOR (Insecure Direct Object Reference)
Verifies that cross-tenant access is properly blocked for all resources.
"""
import uuid
import pytest
from httpx import AsyncClient

BASE = "/api/v1"

pytestmark = pytest.mark.asyncio


class TestCrossTenantTicketAccess:
    """Shop B must NOT be able to read/modify Shop A's tickets."""

    async def test_cannot_get_other_shop_ticket(
        self, client: AsyncClient, shop_b_headers: dict, shop_a_ticket: dict
    ):
        resp = await client.get(
            f"{BASE}/tickets/{shop_a_ticket['id']}",
            headers=shop_b_headers,
        )
        assert resp.status_code == 404, "Cross-tenant ticket read must return 404"

    async def test_cannot_update_other_shop_ticket(
        self, client: AsyncClient, shop_b_headers: dict, shop_a_ticket: dict
    ):
        resp = await client.patch(
            f"{BASE}/tickets/{shop_a_ticket['id']}",
            json={"device_model": "Hacked"},
            headers=shop_b_headers,
        )
        assert resp.status_code == 404, "Cross-tenant ticket update must return 404"

    async def test_cannot_change_other_shop_ticket_status(
        self, client: AsyncClient, shop_b_headers: dict, shop_a_ticket: dict
    ):
        resp = await client.post(
            f"{BASE}/tickets/{shop_a_ticket['id']}/status",
            json={"status": "IN_PROGRESS"},
            headers=shop_b_headers,
        )
        assert resp.status_code == 404, "Cross-tenant status change must return 404"

    async def test_cannot_delete_other_shop_ticket(
        self, client: AsyncClient, shop_b_headers: dict, shop_a_ticket: dict
    ):
        resp = await client.delete(
            f"{BASE}/tickets/{shop_a_ticket['id']}",
            headers=shop_b_headers,
        )
        assert resp.status_code == 404, "Cross-tenant ticket delete must return 404"


class TestCrossTenantCustomerAccess:
    """Shop B must NOT be able to read/modify Shop A's customers."""

    async def test_cannot_get_other_shop_customer(
        self, client: AsyncClient, shop_b_headers: dict, shop_a_customer: dict
    ):
        resp = await client.get(
            f"{BASE}/customers/{shop_a_customer['id']}",
            headers=shop_b_headers,
        )
        assert resp.status_code == 404, "Cross-tenant customer read must return 404"

    async def test_cannot_update_other_shop_customer(
        self, client: AsyncClient, shop_b_headers: dict, shop_a_customer: dict
    ):
        resp = await client.patch(
            f"{BASE}/customers/{shop_a_customer['id']}",
            json={"name": "Hacked Name"},
            headers=shop_b_headers,
        )
        assert resp.status_code == 404, "Cross-tenant customer update must return 404"


class TestCrossTenantInventoryAccess:
    """Shop B must NOT be able to read/modify Shop A's inventory."""

    async def test_cannot_get_other_shop_inventory(
        self, client: AsyncClient, shop_b_headers: dict, shop_a_inventory: dict
    ):
        resp = await client.get(
            f"{BASE}/inventory/{shop_a_inventory['id']}",
            headers=shop_b_headers,
        )
        assert resp.status_code == 404, "Cross-tenant inventory read must return 404"

    async def test_cannot_update_other_shop_inventory(
        self, client: AsyncClient, shop_b_headers: dict, shop_a_inventory: dict
    ):
        resp = await client.patch(
            f"{BASE}/inventory/{shop_a_inventory['id']}",
            json={"name": "Hacked Item"},
            headers=shop_b_headers,
        )
        assert resp.status_code == 404, "Cross-tenant inventory update must return 404"

    async def test_cannot_adjust_other_shop_stock(
        self, client: AsyncClient, shop_b_headers: dict, shop_a_inventory: dict
    ):
        resp = await client.post(
            f"{BASE}/inventory/{shop_a_inventory['id']}/stock",
            json={"delta": -999},
            headers=shop_b_headers,
        )
        assert resp.status_code == 404, "Cross-tenant stock adjustment must return 404"


class TestCrossTenantTicketParts:
    """Shop B must NOT be able to add parts to Shop A's tickets."""

    async def test_cannot_add_part_to_other_shop_ticket(
        self, client: AsyncClient,
        shop_b_headers: dict,
        shop_a_ticket: dict,
        shop_a_inventory: dict,
    ):
        resp = await client.post(
            f"{BASE}/tickets/{shop_a_ticket['id']}/parts",
            json={"inventory_item_id": shop_a_inventory["id"], "quantity_used": 1},
            headers=shop_b_headers,
        )
        assert resp.status_code == 404, "Cross-tenant part addition must return 404"

    async def test_cannot_list_other_shop_ticket_parts(
        self, client: AsyncClient,
        shop_b_headers: dict,
        shop_a_ticket: dict,
    ):
        resp = await client.get(
            f"{BASE}/tickets/{shop_a_ticket['id']}/parts",
            headers=shop_b_headers,
        )
        # Should return 404 or empty list (not the other shop's parts)
        if resp.status_code == 200:
            data = resp.json()
            parts = data.get("parts", [])
            assert len(parts) == 0, "Cross-tenant parts list must be empty"
        else:
            assert resp.status_code == 404


class TestCrossTenantListIsolation:
    """List endpoints must only return the current shop's data."""

    async def test_tickets_list_isolation(
        self, client: AsyncClient,
        shop_a_headers: dict,
        shop_b_headers: dict,
        shop_a_ticket: dict,
        shop_b_ticket: dict,
    ):
        # Shop A should only see Shop A's ticket
        resp_a = await client.get(f"{BASE}/tickets", headers=shop_a_headers)
        assert resp_a.status_code == 200
        shop_a_ids = {t["id"] for t in resp_a.json()["items"]}
        assert shop_a_ticket["id"] in shop_a_ids
        assert shop_b_ticket["id"] not in shop_a_ids, "Shop A must not see Shop B's tickets"

        # Shop B should only see Shop B's ticket
        resp_b = await client.get(f"{BASE}/tickets", headers=shop_b_headers)
        assert resp_b.status_code == 200
        shop_b_ids = {t["id"] for t in resp_b.json()["items"]}
        assert shop_b_ticket["id"] in shop_b_ids
        assert shop_a_ticket["id"] not in shop_b_ids, "Shop B must not see Shop A's tickets"

    async def test_customers_list_isolation(
        self, client: AsyncClient,
        shop_a_headers: dict,
        shop_b_headers: dict,
        shop_a_customer: dict,
        shop_b_customer: dict,
    ):
        resp_a = await client.get(f"{BASE}/customers", headers=shop_a_headers)
        shop_a_ids = {c["id"] for c in resp_a.json()["items"]}
        assert shop_a_customer["id"] in shop_a_ids
        assert shop_b_customer["id"] not in shop_a_ids

        resp_b = await client.get(f"{BASE}/customers", headers=shop_b_headers)
        shop_b_ids = {c["id"] for c in resp_b.json()["items"]}
        assert shop_b_customer["id"] in shop_b_ids
        assert shop_a_customer["id"] not in shop_b_ids

    async def test_inventory_list_isolation(
        self, client: AsyncClient,
        shop_a_headers: dict,
        shop_b_headers: dict,
        shop_a_inventory: dict,
    ):
        resp_b = await client.get(f"{BASE}/inventory", headers=shop_b_headers)
        shop_b_ids = {i["id"] for i in resp_b.json()["items"]}
        assert shop_a_inventory["id"] not in shop_b_ids, "Shop B must not see Shop A's inventory"
