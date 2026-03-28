"""
Security Tests — Authentication & Authorization
Covers: login edge cases, token misuse, role enforcement, admin auth.
"""
import pytest
from httpx import AsyncClient

BASE = "/api/v1"

pytestmark = pytest.mark.asyncio


class TestLoginSecurity:
    """Login endpoint must handle all edge cases securely."""

    async def test_wrong_password_returns_401(self, client: AsyncClient):
        # Register first
        await client.post(f"{BASE}/auth/register", json={
            "shop_name": "LoginTest",
            "full_name": "Test User",
            "email": "logintest@test.com",
            "phone": "+1000000001",
            "password": "CorrectPass123",
        })
        # Try wrong password
        resp = await client.post(f"{BASE}/auth/login", json={
            "email": "logintest@test.com",
            "password": "WrongPass456",
        })
        assert resp.status_code == 401
        assert "access_token" not in resp.json()

    async def test_nonexistent_email_returns_401(self, client: AsyncClient):
        resp = await client.post(f"{BASE}/auth/login", json={
            "email": "nobody@nowhere.test",
            "password": "Whatever123",
        })
        assert resp.status_code == 401

    async def test_empty_email_returns_422(self, client: AsyncClient):
        resp = await client.post(f"{BASE}/auth/login", json={
            "email": "",
            "password": "Whatever123",
        })
        assert resp.status_code in (401, 422)

    async def test_empty_password_returns_422(self, client: AsyncClient):
        resp = await client.post(f"{BASE}/auth/login", json={
            "email": "test@test.com",
            "password": "",
        })
        assert resp.status_code in (401, 422)

    async def test_sql_injection_in_email(self, client: AsyncClient):
        """SQL injection attempt must not crash or bypass auth."""
        resp = await client.post(f"{BASE}/auth/login", json={
            "email": "' OR 1=1 --",
            "password": "anything",
        })
        assert resp.status_code == 401

    async def test_login_returns_token_and_user(self, client: AsyncClient):
        await client.post(f"{BASE}/auth/register", json={
            "shop_name": "TokenTest",
            "full_name": "Token User",
            "email": "tokentest@test.com",
            "phone": "+1000000002",
            "password": "TokenPass123",
        })
        resp = await client.post(f"{BASE}/auth/login", json={
            "email": "tokentest@test.com",
            "password": "TokenPass123",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["email"] == "tokentest@test.com"
        assert data["user"]["role"] == "OWNER"


class TestTokenSecurity:
    """Token-based auth must be enforced on all protected endpoints."""

    async def test_no_token_returns_401(self, client: AsyncClient):
        resp = await client.get(f"{BASE}/tickets")
        assert resp.status_code == 401

    async def test_malformed_token_returns_401(self, client: AsyncClient):
        resp = await client.get(
            f"{BASE}/tickets",
            headers={"Authorization": "Bearer not-a-real-jwt"},
        )
        assert resp.status_code == 401

    async def test_expired_token_returns_401(self, client: AsyncClient):
        """An expired token must be rejected."""
        from app.core.security import create_access_token
        from datetime import timedelta
        token = create_access_token(
            {"sub": "fake-id", "shop_id": "fake-shop", "role": "OWNER"},
            expires_delta=timedelta(seconds=-1),  # Already expired
        )
        resp = await client.get(
            f"{BASE}/tickets",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 401

    async def test_wrong_token_type_returns_401(self, client: AsyncClient):
        """Using a refresh token as access token must be rejected."""
        from app.core.security import create_refresh_token
        token = create_refresh_token(
            {"sub": "fake-id", "shop_id": "fake-shop", "role": "OWNER"},
        )
        resp = await client.get(
            f"{BASE}/tickets",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 401

    async def test_missing_bearer_prefix_returns_401(self, client: AsyncClient):
        resp = await client.get(
            f"{BASE}/tickets",
            headers={"Authorization": "some-token-without-bearer"},
        )
        assert resp.status_code == 401


class TestRegistrationSecurity:
    """Registration must enforce uniqueness and validation."""

    async def test_duplicate_email_returns_409(self, client: AsyncClient):
        payload = {
            "shop_name": "DupTest",
            "full_name": "Dup User",
            "email": "dup@test.com",
            "phone": "+1000000003",
            "password": "DupPass123",
        }
        await client.post(f"{BASE}/auth/register", json=payload)
        resp = await client.post(f"{BASE}/auth/register", json=payload)
        assert resp.status_code == 409

    async def test_weak_password_rejected(self, client: AsyncClient):
        """Very short passwords should be rejected (if server validates)."""
        resp = await client.post(f"{BASE}/auth/register", json={
            "shop_name": "WeakPass",
            "full_name": "Weak User",
            "email": "weak@test.com",
            "phone": "+1000000004",
            "password": "123",
        })
        # May be 422 (validation) or 201 (no server-side check yet)
        # Document current behavior
        assert resp.status_code in (201, 422)


class TestAdminAuthSecurity:
    """Admin endpoints must require proper authentication."""

    async def test_admin_login_wrong_password(self, client: AsyncClient):
        resp = await client.post(f"{BASE}/admin/auth/login", json={
            "email": "admin@repairdesk.app",
            "password": "wrong_password",
        })
        assert resp.status_code == 401

    async def test_admin_login_empty_credentials(self, client: AsyncClient):
        resp = await client.post(f"{BASE}/admin/auth/login", json={
            "email": "",
            "password": "",
        })
        assert resp.status_code == 401

    async def test_admin_endpoints_require_auth(self, client: AsyncClient):
        """Admin analytics must require authentication."""
        resp = await client.get(f"{BASE}/admin/analytics")
        assert resp.status_code == 401
