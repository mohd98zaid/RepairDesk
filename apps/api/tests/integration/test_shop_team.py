"""
Integration Tests — Shop Export & Team Management
"""
import pytest
from httpx import AsyncClient

BASE = "/api/v1"

pytestmark = pytest.mark.asyncio


class TestShopExport:
    """Shop data export must exclude sensitive fields."""

    async def test_export_excludes_password_hash(
        self, client: AsyncClient, shop_a_headers: dict
    ):
        """Exported JSON must not contain password_hash for any user."""
        resp = await client.get(f"{BASE}/shops/export", headers=shop_a_headers)
        assert resp.status_code == 200
        data = resp.json()

        # Check users list
        for user in data.get("users", []):
            assert "password_hash" not in user, "Export must not include password_hash"
            assert "password" not in user, "Export must not include password"

    async def test_export_includes_shop_data(
        self, client: AsyncClient, shop_a_headers: dict
    ):
        resp = await client.get(f"{BASE}/shops/export", headers=shop_a_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "shop" in data
        assert "users" in data
        assert "customers" in data
        assert "tickets" in data
        assert "inventory" in data


class TestShopProfile:
    """Shop profile operations."""

    async def test_get_my_shop(
        self, client: AsyncClient, shop_a_headers: dict
    ):
        resp = await client.get(f"{BASE}/shops/me", headers=shop_a_headers)
        assert resp.status_code == 200
        assert "name" in resp.json()

    async def test_update_shop_name(
        self, client: AsyncClient, shop_a_headers: dict
    ):
        resp = await client.patch(
            f"{BASE}/shops/me",
            json={"name": "Updated Shop Name"},
            headers=shop_a_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Updated Shop Name"


class TestTeamManagement:
    """Team member management."""

    async def test_list_team(
        self, client: AsyncClient, shop_a_headers: dict
    ):
        resp = await client.get(f"{BASE}/team", headers=shop_a_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "members" in data
        assert len(data["members"]) >= 1  # At least the owner

    async def test_invite_technician(
        self, client: AsyncClient, shop_a_headers: dict
    ):
        resp = await client.post(
            f"{BASE}/team/invite",
            json={"email": "tech@shopa.test"},
            headers=shop_a_headers,
        )
        assert resp.status_code == 201
        # Response must NOT contain temp_password in the response
        data = resp.json()
        assert "temp_password" not in data, "Temp password must not be in API response"
