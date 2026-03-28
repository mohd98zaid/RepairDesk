"""
Integration Tests — Customers & Search
"""
import uuid
import pytest
from httpx import AsyncClient

BASE = "/api/v1"

pytestmark = pytest.mark.asyncio


class TestCustomerCRUD:
    """Full customer CRUD with edge cases."""

    async def test_create_customer_success(
        self, client: AsyncClient, shop_a_headers: dict
    ):
        resp = await client.post(f"{BASE}/customers", json={
            "name": "New Customer",
            "phone": "+1777777777",
            "email": "new@customer.test",
            "notes": "VIP customer",
        }, headers=shop_a_headers)
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "New Customer"
        assert data["phone"] == "+1777777777"

    async def test_duplicate_phone_returns_409(
        self, client: AsyncClient, shop_a_headers: dict, shop_a_customer: dict
    ):
        resp = await client.post(f"{BASE}/customers", json={
            "name": "Duplicate",
            "phone": shop_a_customer["phone"],
        }, headers=shop_a_headers)
        assert resp.status_code == 409

    async def test_get_customer_with_tickets(
        self, client: AsyncClient, shop_a_headers: dict,
        shop_a_customer: dict, shop_a_ticket: dict
    ):
        resp = await client.get(
            f"{BASE}/customers/{shop_a_customer['id']}",
            headers=shop_a_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "tickets" in data
        assert len(data["tickets"]) >= 1

    async def test_update_customer_name(
        self, client: AsyncClient, shop_a_headers: dict, shop_a_customer: dict
    ):
        resp = await client.patch(
            f"{BASE}/customers/{shop_a_customer['id']}",
            json={"name": "Updated Name"},
            headers=shop_a_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Updated Name"

    async def test_update_customer_email(
        self, client: AsyncClient, shop_a_headers: dict, shop_a_customer: dict
    ):
        resp = await client.patch(
            f"{BASE}/customers/{shop_a_customer['id']}",
            json={"email": "updated@test.com"},
            headers=shop_a_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["email"] == "updated@test.com"

    async def test_soft_delete_customer(
        self, client: AsyncClient, shop_a_headers: dict
    ):
        # Create then delete
        create = await client.post(f"{BASE}/customers", json={
            "name": "ToDelete",
            "phone": "+1666666666",
        }, headers=shop_a_headers)
        cid = create.json()["id"]

        del_resp = await client.delete(
            f"{BASE}/customers/{cid}",
            headers=shop_a_headers,
        )
        assert del_resp.status_code == 204

        # Should not appear in list
        list_resp = await client.get(f"{BASE}/customers", headers=shop_a_headers)
        ids = [c["id"] for c in list_resp.json()["items"]]
        assert cid not in ids

    async def test_list_customers_search(
        self, client: AsyncClient, shop_a_headers: dict, shop_a_customer: dict
    ):
        resp = await client.get(
            f"{BASE}/customers",
            params={"search": "Alice"},
            headers=shop_a_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["total"] >= 1


class TestSearch:
    """Global search endpoint."""

    async def test_search_returns_results(
        self, client: AsyncClient, shop_a_headers: dict, shop_a_ticket: dict
    ):
        resp = await client.get(
            f"{BASE}/search",
            params={"query": "iPhone"},
            headers=shop_a_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "results" in data

    async def test_search_empty_query(
        self, client: AsyncClient, shop_a_headers: dict
    ):
        resp = await client.get(
            f"{BASE}/search",
            params={"query": "a"},  # too short
            headers=shop_a_headers,
        )
        # Should return 422 (min_length=2) or empty results
        assert resp.status_code in (200, 422)
