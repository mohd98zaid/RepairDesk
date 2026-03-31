"""
AUTH LIFECYCLE TESTS
=====================
Tests the complete token lifecycle:
- Login → access token + refresh token
- Access token expiry
- Refresh token rotation
- Invalid/expired refresh tokens
- Logout invalidates session
- Concurrent session handling

Run: pytest tests/breaking/test_auth_lifecycle.py -v
"""
import time
import pytest
from httpx import AsyncClient

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REFRESH_URL = "/api/v1/auth/refresh"
LOGOUT_URL = "/api/v1/auth/logout"
SHOPS_ME_URL = "/api/v1/shops/me"

SAMPLE_REGISTRATION = {
    "shop_name": "Lifecycle Shop",
    "full_name": "Lifecycle Tester",
    "email": "lifecycle@test.com",
    "phone": "+2348044444444",
    "password": "LifePass123",
}


# ─────────────────────────────────────────────
# LOGIN → TOKEN ISSUANCE
# ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_login_returns_both_tokens(client: AsyncClient):
    """Login must return both access_token and refresh_token."""
    await client.post(REGISTER_URL, json=SAMPLE_REGISTRATION)
    resp = await client.post(
        LOGIN_URL,
        json={"email": SAMPLE_REGISTRATION["email"], "password": SAMPLE_REGISTRATION["password"]},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["access_token"] != data["refresh_token"]


@pytest.mark.asyncio
async def test_login_sets_http_only_cookie(client: AsyncClient):
    """Login response must set repairdesk_refresh as httpOnly cookie."""
    await client.post(REGISTER_URL, json=SAMPLE_REGISTRATION)
    resp = await client.post(
        LOGIN_URL,
        json={"email": SAMPLE_REGISTRATION["email"], "password": SAMPLE_REGISTRATION["password"]},
    )
    assert resp.status_code == 200
    set_cookie = resp.headers.get("set-cookie", "")
    assert "repairdesk_refresh" in set_cookie, "Missing repairdesk_refresh cookie"
    assert "httponly" in set_cookie.lower(), "Cookie is not httpOnly"


@pytest.mark.asyncio
async def test_access_token_is_jwt(client: AsyncClient):
    """Access token must be a valid JWT (three dot-separated parts)."""
    await client.post(REGISTER_URL, json=SAMPLE_REGISTRATION)
    resp = await client.post(
        LOGIN_URL,
        json={"email": SAMPLE_REGISTRATION["email"], "password": SAMPLE_REGISTRATION["password"]},
    )
    token = resp.json()["access_token"]
    parts = token.split(".")
    assert len(parts) == 3, f"Access token is not a valid JWT: {len(parts)} parts"


@pytest.mark.asyncio
async def test_access_token_contains_user_claims(client: AsyncClient):
    """Access token payload must contain sub, shop_id, role."""
    import base64, json
    await client.post(REGISTER_URL, json=SAMPLE_REGISTRATION)
    resp = await client.post(
        LOGIN_URL,
        json={"email": SAMPLE_REGISTRATION["email"], "password": SAMPLE_REGISTRATION["password"]},
    )
    token = resp.json()["access_token"]
    payload_b64 = token.split(".")[1]
    # Add padding
    payload_b64 += "=" * (4 - len(payload_b64) % 4)
    payload = json.loads(base64.urlsafe_b64decode(payload_b64))
    assert "sub" in payload, "Token missing 'sub' claim"
    assert "shop_id" in payload, "Token missing 'shop_id' claim"
    assert "role" in payload, "Token missing 'role' claim"
    assert "exp" in payload, "Token missing 'exp' claim"


# ─────────────────────────────────────────────
# TOKEN REFRESH
# ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_refresh_returns_new_access_token(client: AsyncClient):
    """Valid refresh token must return a new access token."""
    reg = await client.post(REGISTER_URL, json=SAMPLE_REGISTRATION)
    refresh_token = reg.json()["refresh_token"]

    resp = await client.post(
        REFRESH_URL,
        json={"refresh_token": refresh_token},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["access_token"] != reg.json()["access_token"], "Refresh returned same token"


@pytest.mark.asyncio
async def test_refresh_with_invalid_token(client: AsyncClient):
    """Invalid refresh token must return 401."""
    resp = await client.post(
        REFRESH_URL,
        json={"refresh_token": "invalid.token.here"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_refresh_with_empty_token(client: AsyncClient):
    """Empty refresh token must return 401."""
    resp = await client.post(
        REFRESH_URL,
        json={"refresh_token": ""},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_refresh_without_body(client: AsyncClient):
    """Refresh without any token must return 401."""
    resp = await client.post(REFRESH_URL, json={})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_refresh_without_content_type(client: AsyncClient):
    """Refresh without Content-Type must be handled gracefully."""
    resp = await client.post(
        REFRESH_URL,
        content='{"refresh_token": "test"}',
    )
    # Should not crash — 400, 401, or 422 are acceptable
    assert resp.status_code < 500


@pytest.mark.asyncio
async def test_refresh_token_rotation(client: AsyncClient):
    """Each refresh should work — tokens are not single-use (current design)."""
    reg = await client.post(REGISTER_URL, json=SAMPLE_REGISTRATION)
    refresh_token = reg.json()["refresh_token"]

    # First refresh
    resp1 = await client.post(
        REFRESH_URL,
        json={"refresh_token": refresh_token},
    )
    assert resp1.status_code == 200

    # Second refresh with same token (current design allows reuse)
    resp2 = await client.post(
        REFRESH_URL,
        json={"refresh_token": refresh_token},
    )
    assert resp2.status_code in (200, 401), \
        f"Second refresh returned unexpected status: {resp2.status_code}"


# ─────────────────────────────────────────────
# LOGOUT
# ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_logout_returns_204(client: AsyncClient):
    """Logout with valid token must return 204 No Content."""
    reg = await client.post(REGISTER_URL, json=SAMPLE_REGISTRATION)
    token = reg.json()["access_token"]

    resp = await client.post(
        LOGOUT_URL,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_logout_without_token(client: AsyncClient):
    """Logout without token must return 401."""
    resp = await client.post(LOGOUT_URL)
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_logout_invalidates_refresh_token(client: AsyncClient):
    """After logout, refresh token must be invalid."""
    reg = await client.post(REGISTER_URL, json=SAMPLE_REGISTRATION)
    access_token = reg.json()["access_token"]
    refresh_token = reg.json()["refresh_token"]

    # Logout
    await client.post(
        LOGOUT_URL,
        headers={"Authorization": f"Bearer {access_token}"},
    )

    # Try to refresh — should fail
    resp = await client.post(
        REFRESH_URL,
        json={"refresh_token": refresh_token},
    )
    assert resp.status_code == 401, \
        f"Refresh succeeded after logout: {resp.status_code}"


@pytest.mark.asyncio
async def test_logout_then_access_protected_route(client: AsyncClient):
    """After logout, access token should still work until expiry (stateless JWT)."""
    reg = await client.post(REGISTER_URL, json=SAMPLE_REGISTRATION)
    access_token = reg.json()["access_token"]

    # Logout
    await client.post(
        LOGOUT_URL,
        headers={"Authorization": f"Bearer {access_token}"},
    )

    # Access token is stateless — it will still work until expiry
    # This is expected behavior for JWT
    resp = await client.get(
        SHOPS_ME_URL,
        headers={"Authorization": f"Bearer {access_token}"},
    )
    # Either 200 (JWT still valid) or 401 (if logout blacklists it)
    assert resp.status_code in (200, 401)


# ─────────────────────────────────────────────
# SESSION MANAGEMENT
# ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_multiple_concurrent_sessions(client: AsyncClient):
    """User should be able to have multiple active sessions."""
    await client.post(REGISTER_URL, json=SAMPLE_REGISTRATION)

    # Login twice
    resp1 = await client.post(
        LOGIN_URL,
        json={"email": SAMPLE_REGISTRATION["email"], "password": SAMPLE_REGISTRATION["password"]},
    )
    resp2 = await client.post(
        LOGIN_URL,
        json={"email": SAMPLE_REGISTRATION["email"], "password": SAMPLE_REGISTRATION["password"]},
    )

    assert resp1.status_code == 200
    assert resp2.status_code == 200

    # Both tokens should work
    token1 = resp1.json()["access_token"]
    token2 = resp2.json()["access_token"]

    r1 = await client.get(SHOPS_ME_URL, headers={"Authorization": f"Bearer {token1}"})
    r2 = await client.get(SHOPS_ME_URL, headers={"Authorization": f"Bearer {token2}"})

    assert r1.status_code == 200
    assert r2.status_code == 200


@pytest.mark.asyncio
async def test_login_with_wrong_password_does_not_issue_token(client: AsyncClient):
    """Failed login must not return any tokens."""
    await client.post(REGISTER_URL, json=SAMPLE_REGISTRATION)
    resp = await client.post(
        LOGIN_URL,
        json={"email": SAMPLE_REGISTRATION["email"], "password": "WrongPassword!"},
    )
    assert resp.status_code == 401
    data = resp.json()
    assert "access_token" not in data
    assert "refresh_token" not in data
