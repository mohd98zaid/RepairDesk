"""
Integration tests — Customers API
Covers: create, list, get by ID, search, validation
"""
import uuid
import pytest
from httpx import AsyncClient
from tests.helpers import auth_headers

CUSTOMERS_URL = "/api/v1/customers"


@pytest.fixture
async def headers(client: AsyncClient):
    return await auth_headers(client)


@pytest.fixture
async def sample_customer(client: AsyncClient, headers):
    """Create a sample customer and return response JSON."""
    resp = await client.post(
        CUSTOMERS_URL,
        json={"name": "Ada Obi", "phone": "+2348099999999", "email": "ada@example.com"},
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()


# ──────────────────── Create ────────────────────

class TestCreateCustomer:
    async def test_create_success(self, client: AsyncClient, headers):
        resp = await client.post(
            CUSTOMERS_URL,
            json={"name": "John Doe", "phone": "+2348011111111"},
            headers=headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "John Doe"
        assert data["phone"] == "+2348011111111"
        assert "id" in data

    async def test_create_with_all_fields(self, client: AsyncClient, headers):
        resp = await client.post(
            CUSTOMERS_URL,
            json={"name": "Jane Smith", "phone": "+2348022222222", "email": "jane@test.com", "notes": "VIP"},
            headers=headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["email"] == "jane@test.com"

    async def test_create_requires_auth(self, client: AsyncClient):
        resp = await client.post(
            CUSTOMERS_URL,
            json={"name": "NoAuth", "phone": "+2340000000000"},
        )
        assert resp.status_code == 401

    async def test_create_missing_name(self, client: AsyncClient, headers):
        resp = await client.post(
            CUSTOMERS_URL,
            json={"phone": "+2348033333333"},
            headers=headers,
        )
        assert resp.status_code == 422

    async def test_create_missing_phone(self, client: AsyncClient, headers):
        resp = await client.post(
            CUSTOMERS_URL,
            json={"name": "NoPhone"},
            headers=headers,
        )
        assert resp.status_code == 422


# ──────────────────── List ────────────────────

class TestListCustomers:
    async def test_list_empty(self, client: AsyncClient, headers):
        resp = await client.get(CUSTOMERS_URL, headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert data["total"] == 0

    async def test_list_returns_created_customers(self, client: AsyncClient, headers, sample_customer):
        resp = await client.get(CUSTOMERS_URL, headers=headers)
        assert resp.status_code == 200
        assert resp.json()["total"] >= 1

    async def test_search_by_name(self, client: AsyncClient, headers, sample_customer):
        # API uses `search=` not `q=`
        resp = await client.get(CUSTOMERS_URL, params={"search": "Ada"}, headers=headers)
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert any("Ada" in c["name"] for c in items)

    async def test_search_no_match(self, client: AsyncClient, headers, sample_customer):
        resp = await client.get(CUSTOMERS_URL, params={"search": "zzznomatch99"}, headers=headers)
        assert resp.status_code == 200
        assert resp.json()["total"] == 0

    async def test_pagination_params(self, client: AsyncClient, headers):
        resp = await client.get(CUSTOMERS_URL, params={"page": 1, "per_page": 5}, headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["page"] == 1
        assert data["per_page"] == 5


# ──────────────────── Get by ID ────────────────────

class TestGetCustomer:
    async def test_get_existing(self, client: AsyncClient, headers, sample_customer):
        cid = sample_customer["id"]
        resp = await client.get(f"{CUSTOMERS_URL}/{cid}", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["id"] == cid

    async def test_get_nonexistent(self, client: AsyncClient, headers):
        fake_id = str(uuid.uuid4())
        resp = await client.get(f"{CUSTOMERS_URL}/{fake_id}", headers=headers)
        assert resp.status_code == 404
