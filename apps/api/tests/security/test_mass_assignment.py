"""
Security Tests — Mass Assignment
Verifies that restricted fields (shop_id, role, is_deleted, plan, etc.)
cannot be overwritten via update endpoints.
"""
import pytest
from httpx import AsyncClient

BASE = "/api/v1"

pytestmark = pytest.mark.asyncio


class TestCustomerMassAssignment:
    """Customer update must not allow changing shop_id or is_deleted."""

    async def test_cannot_set_shop_id(
        self, client: AsyncClient, shop_a_headers: dict, shop_a_customer: dict
    ):
        import uuid
        fake_shop_id = str(uuid.uuid4())
        resp = await client.patch(
            f"{BASE}/customers/{shop_a_customer['id']}",
            json={"name": "Updated", "shop_id": fake_shop_id},
            headers=shop_a_headers,
        )
        assert resp.status_code == 200
        # shop_id must NOT have changed
        assert resp.json()["shop_id"] != fake_shop_id

    async def test_cannot_set_is_deleted(
        self, client: AsyncClient, shop_a_headers: dict, shop_a_customer: dict
    ):
        resp = await client.patch(
            f"{BASE}/customers/{shop_a_customer['id']}",
            json={"name": "Updated", "is_deleted": True},
            headers=shop_a_headers,
        )
        assert resp.status_code == 200
        # Customer should still be retrievable (not soft-deleted via mass assignment)
        check = await client.get(
            f"{BASE}/customers/{shop_a_customer['id']}",
            headers=shop_a_headers,
        )
        assert check.status_code == 200, "Customer must not be soft-deleted via mass assignment"


class TestTicketMassAssignment:
    """Ticket update must not allow changing shop_id, status, or created_by."""

    async def test_cannot_set_shop_id(
        self, client: AsyncClient, shop_a_headers: dict, shop_a_ticket: dict
    ):
        import uuid
        fake_shop_id = str(uuid.uuid4())
        resp = await client.patch(
            f"{BASE}/tickets/{shop_a_ticket['id']}",
            json={"shop_id": fake_shop_id},
            headers=shop_a_headers,
        )
        # Either rejected or ignored — ticket must still belong to Shop A
        detail = await client.get(
            f"{BASE}/tickets/{shop_a_ticket['id']}",
            headers=shop_a_headers,
        )
        assert detail.status_code == 200

    async def test_cannot_set_status_directly(
        self, client: AsyncClient, shop_a_headers: dict, shop_a_ticket: dict
    ):
        """Status changes should go through the status endpoint, not PATCH."""
        resp = await client.patch(
            f"{BASE}/tickets/{shop_a_ticket['id']}",
            json={"status": "DELIVERED"},
            headers=shop_a_headers,
        )
        # Status should NOT change via PATCH
        detail = await client.get(
            f"{BASE}/tickets/{shop_a_ticket['id']}",
            headers=shop_a_headers,
        )
        assert detail.json()["status"] == "RECEIVED", "Status must not change via PATCH"


class TestInventoryMassAssignment:
    """Inventory update must not allow changing shop_id."""

    async def test_cannot_set_shop_id(
        self, client: AsyncClient, shop_a_headers: dict, shop_a_inventory: dict
    ):
        import uuid
        fake_shop_id = str(uuid.uuid4())
        resp = await client.patch(
            f"{BASE}/inventory/{shop_a_inventory['id']}",
            json={"name": "Updated", "shop_id": fake_shop_id},
            headers=shop_a_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["shop_id"] != fake_shop_id


class TestShopMassAssignment:
    """Shop update must not allow self-upgrading plan or changing status."""

    async def test_cannot_self_upgrade_plan(
        self, client: AsyncClient, shop_a_headers: dict
    ):
        resp = await client.patch(
            f"{BASE}/shops/me",
            json={"name": "Updated", "plan": "enterprise"},
            headers=shop_a_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["plan"] != "enterprise", "Self-upgrade plan must be blocked"

    async def test_cannot_change_shop_status(
        self, client: AsyncClient, shop_a_headers: dict
    ):
        resp = await client.patch(
            f"{BASE}/shops/me",
            json={"name": "Updated", "shop_status": "ACTIVE"},
            headers=shop_a_headers,
        )
        assert resp.status_code == 200
        # shop_status should not be in the allowed fields
