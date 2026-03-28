"""
Integration Tests — Admin Flow
Covers: admin login, shop management, analytics, exports.
"""
import pytest
from httpx import AsyncClient

BASE = "/api/v1"

pytestmark = pytest.mark.asyncio


class TestAdminLogin:
    """Admin authentication."""

    async def test_admin_login_success(self, client: AsyncClient):
        """Admin login with correct credentials returns token."""
        from app.core.config import settings
        if not settings.admin_email or not settings.admin_password:
            pytest.skip("Admin credentials not configured")

        resp = await client.post(f"{BASE}/admin/auth/login", json={
            "email": settings.admin_email,
            "password": settings.admin_password,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["user"]["role"] == "SUPER_ADMIN"

    async def test_admin_login_wrong_password(self, client: AsyncClient):
        resp = await client.post(f"{BASE}/admin/auth/login", json={
            "email": "admin@repairdesk.app",
            "password": "definitely_wrong",
        })
        assert resp.status_code == 401

    async def test_admin_analytics_requires_auth(self, client: AsyncClient):
        resp = await client.get(f"{BASE}/admin/analytics")
        assert resp.status_code == 401


class TestAdminShopManagement:
    """Admin shop management operations."""

    async def _get_admin_token(self, client: AsyncClient) -> str:
        from app.core.config import settings
        if not settings.admin_email or not settings.admin_password:
            pytest.skip("Admin credentials not configured")
        resp = await client.post(f"{BASE}/admin/auth/login", json={
            "email": settings.admin_email,
            "password": settings.admin_password,
        })
        return resp.json()["access_token"]

    async def test_list_shops(self, client: AsyncClient):
        token = await self._get_admin_token(client)
        resp = await client.get(
            f"{BASE}/admin/shops",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        assert "items" in resp.json()

    async def test_admin_create_shop(self, client: AsyncClient):
        token = await self._get_admin_token(client)
        resp = await client.post(
            f"{BASE}/admin/shops",
            json={
                "shop_name": "Admin Created Shop",
                "owner_name": "Admin Owner",
                "email": "adminshop@test.com",
                "password": "AdminShopPass123",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Admin Created Shop"
        assert data["owner"]["email"] == "adminshop@test.com"
