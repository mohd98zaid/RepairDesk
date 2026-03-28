"""
Shared fixtures for security tests.

Provides:
- Two isolated shop owners (Shop A, Shop B) for cross-tenant testing
- Pre-created resources (customers, tickets, inventory) per shop
- Helper to generate auth headers for each tenant
"""
import uuid
import pytest
import pytest_asyncio
from httpx import AsyncClient

BASE = "/api/v1"


@pytest_asyncio.fixture
async def shop_a_headers(client: AsyncClient) -> dict:
    """Register Shop A owner and return auth headers."""
    resp = await client.post(f"{BASE}/auth/register", json={
        "shop_name": "ShopAlpha",
        "full_name": "Alice Alpha",
        "email": "alice@shopa.test",
        "phone": "+1111111111",
        "password": "StrongPass123!",
    })
    assert resp.status_code == 201, f"Shop A registration failed: {resp.text}"
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest_asyncio.fixture
async def shop_b_headers(client: AsyncClient) -> dict:
    """Register Shop B owner and return auth headers."""
    resp = await client.post(f"{BASE}/auth/register", json={
        "shop_name": "ShopBeta",
        "full_name": "Bob Beta",
        "email": "bob@shopb.test",
        "phone": "+2222222222",
        "password": "StrongPass456!",
    })
    assert resp.status_code == 201, f"Shop B registration failed: {resp.text}"
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest_asyncio.fixture
async def shop_a_customer(client: AsyncClient, shop_a_headers: dict) -> dict:
    """Create a customer under Shop A."""
    resp = await client.post(f"{BASE}/customers", json={
        "name": "Alice Customer",
        "phone": "+1111111112",
    }, headers=shop_a_headers)
    assert resp.status_code == 201
    return resp.json()


@pytest_asyncio.fixture
async def shop_b_customer(client: AsyncClient, shop_b_headers: dict) -> dict:
    """Create a customer under Shop B."""
    resp = await client.post(f"{BASE}/customers", json={
        "name": "Bob Customer",
        "phone": "+2222222223",
    }, headers=shop_b_headers)
    assert resp.status_code == 201
    return resp.json()


@pytest_asyncio.fixture
async def shop_a_ticket(client: AsyncClient, shop_a_headers: dict, shop_a_customer: dict) -> dict:
    """Create a ticket under Shop A."""
    resp = await client.post(f"{BASE}/tickets", json={
        "customer_id": shop_a_customer["id"],
        "device_type": "iPhone 14",
        "reported_issue": "Cracked screen",
    }, headers=shop_a_headers)
    assert resp.status_code == 201
    return resp.json()


@pytest_asyncio.fixture
async def shop_b_ticket(client: AsyncClient, shop_b_headers: dict, shop_b_customer: dict) -> dict:
    """Create a ticket under Shop B."""
    resp = await client.post(f"{BASE}/tickets", json={
        "customer_id": shop_b_customer["id"],
        "device_type": "Samsung S23",
        "reported_issue": "Battery drain",
    }, headers=shop_b_headers)
    assert resp.status_code == 201
    return resp.json()


@pytest_asyncio.fixture
async def shop_a_inventory(client: AsyncClient, shop_a_headers: dict) -> dict:
    """Create an inventory item under Shop A."""
    resp = await client.post(f"{BASE}/inventory", json={
        "name": "iPhone Screen",
        "sku": "SEC-A-001",
        "purchase_price": "5000.00",
        "selling_price": "8000.00",
        "quantity": 10,
    }, headers=shop_a_headers)
    assert resp.status_code == 201
    return resp.json()
