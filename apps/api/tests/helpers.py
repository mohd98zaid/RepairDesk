"""
Shared test helper: registers a shop/owner and returns (token, user_data).
"""
import pytest
import pytest_asyncio
from httpx import AsyncClient


REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"


async def register_owner(client: AsyncClient, suffix: str = "") -> dict:
    """Register a shop + owner, return full login response JSON."""
    payload = {
        "shop_name": f"TestShop{suffix}",
        "full_name": f"Test Owner{suffix}",
        "email": f"owner{suffix}@test.com",
        "phone": "+2348011111111",
        "password": "TestPass123",
    }
    resp = await client.post(REGISTER_URL, json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def auth_headers(client: AsyncClient, suffix: str = "") -> dict:
    """Register an owner (idempotent for a suffix) and return auth headers."""
    data = await register_owner(client, suffix)
    return {"Authorization": f"Bearer {data['access_token']}"}
