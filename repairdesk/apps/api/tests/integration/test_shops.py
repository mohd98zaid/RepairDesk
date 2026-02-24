"""
Integration tests — Shops API
Covers: GET /shops/me, PATCH /shops/me (owner only)
"""
import pytest
from httpx import AsyncClient
from tests.helpers import auth_headers, register_owner

SHOPS_URL = "/api/v1/shops"


@pytest.fixture
async def headers(client: AsyncClient):
    return await auth_headers(client)


class TestGetShop:
    async def test_get_my_shop(self, client: AsyncClient, headers):
        resp = await client.get(f"{SHOPS_URL}/me", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "name" in data
        assert "plan" in data
        assert "id" in data

    async def test_get_my_shop_requires_auth(self, client: AsyncClient):
        resp = await client.get(f"{SHOPS_URL}/me")
        assert resp.status_code == 401


class TestUpdateShop:
    async def test_patch_shop_name(self, client: AsyncClient, headers):
        resp = await client.patch(
            f"{SHOPS_URL}/me",
            json={"name": "Updated Shop Name"},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Updated Shop Name"

    async def test_patch_phone_and_email(self, client: AsyncClient, headers):
        resp = await client.patch(
            f"{SHOPS_URL}/me",
            json={"phone": "+2348099441122", "email": "updated@shop.com"},
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["phone"] == "+2348099441122"
        assert data["email"] == "updated@shop.com"

    async def test_patch_is_idempotent(self, client: AsyncClient, headers):
        await client.patch(f"{SHOPS_URL}/me", json={"name": "ShopV1"}, headers=headers)
        resp = await client.patch(f"{SHOPS_URL}/me", json={"name": "ShopV1"}, headers=headers)
        assert resp.status_code == 200

    async def test_patch_requires_auth(self, client: AsyncClient):
        resp = await client.patch(f"{SHOPS_URL}/me", json={"name": "NoAuth"})
        assert resp.status_code == 401
