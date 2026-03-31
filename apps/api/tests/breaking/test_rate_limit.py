"""
RATE LIMITING & BRUTE FORCE PROTECTION TESTS
==============================================
Tests that verify rate limiting is enforced on sensitive endpoints.

Run: pytest tests/breaking/test_rate_limit.py -v
"""
import pytest
from httpx import AsyncClient

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REFRESH_URL = "/api/v1/auth/refresh"

SAMPLE_REGISTRATION = {
    "shop_name": "RateLimit Shop",
    "full_name": "Rate Tester",
    "email": "ratelimit@test.com",
    "phone": "+2348033333333",
    "password": "RatePass123",
}


# ─────────────────────────────────────────────
# LOGIN RATE LIMITING
# ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_login_rate_limiting_enforced(client: AsyncClient):
    """Rapid failed login attempts from same IP should trigger 429."""
    responses = []
    for i in range(20):
        resp = await client.post(
            LOGIN_URL,
            json={"email": "victim@test.com", "password": f"wrong{i}"},
        )
        responses.append(resp.status_code)

    rate_limited = [s for s in responses if s == 429]
    assert len(rate_limited) > 0, \
        f"No rate limiting after 20 failed attempts. Statuses: {responses}"


@pytest.mark.asyncio
async def test_login_rate_limit_allows_valid_credentials(client: AsyncClient):
    """Rate limiting should not block valid login attempts."""
    # First, register to have valid creds
    await client.post(REGISTER_URL, json=SAMPLE_REGISTRATION)

    # Make some failed attempts
    for i in range(5):
        await client.post(
            LOGIN_URL,
            json={"email": "nobody@test.com", "password": f"wrong{i}"},
        )

    # Valid login should still work
    resp = await client.post(
        LOGIN_URL,
        json={"email": SAMPLE_REGISTRATION["email"], "password": SAMPLE_REGISTRATION["password"]},
    )
    assert resp.status_code == 200, \
        f"Valid login blocked by rate limiting: {resp.status_code}"


# ─────────────────────────────────────────────
# REGISTRATION RATE LIMITING
# ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_registration_rate_limiting(client: AsyncClient):
    """Rapid registrations should be rate limited."""
    responses = []
    for i in range(10):
        data = {
            **SAMPLE_REGISTRATION,
            "email": f"rapid{i}@test.com",
            "phone": f"+23480333333{i:02d}",
        }
        resp = await client.post(REGISTER_URL, json=data)
        responses.append(resp.status_code)

    rate_limited = [s for s in responses if s == 429]
    # At least some should be rate limited
    assert len(rate_limited) > 0, \
        f"No rate limiting on registration. Statuses: {responses}"


# ─────────────────────────────────────────────
# REFRESH RATE LIMITING
# ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_refresh_rate_limiting(client: AsyncClient):
    """Rapid refresh attempts should be rate limited."""
    reg = await client.post(REGISTER_URL, json=SAMPLE_REGISTRATION)
    refresh_token = reg.json()["refresh_token"]

    responses = []
    for _ in range(20):
        resp = await client.post(
            REFRESH_URL,
            json={"refresh_token": refresh_token},
        )
        responses.append(resp.status_code)

    rate_limited = [s for s in responses if s == 429]
    assert len(rate_limited) > 0, \
        f"No rate limiting on refresh. Statuses: {responses}"


# ─────────────────────────────────────────────
# PROTECTED ROUTE RATE LIMITING
# ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_protected_route_rate_limiting(client: AsyncClient):
    """Rapid requests to protected routes should be rate limited."""
    reg = await client.post(REGISTER_URL, json=SAMPLE_REGISTRATION)
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    responses = []
    for _ in range(50):
        resp = await client.get("/api/v1/shops/me", headers=headers)
        responses.append(resp.status_code)

    rate_limited = [s for s in responses if s == 429]
    # With 50 rapid requests, at least some should be limited
    assert len(rate_limited) > 0, \
        f"No rate limiting on protected routes. Statuses: {responses}"


# ─────────────────────────────────────────────
# RATE LIMIT HEADERS
# ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_rate_limit_headers_present(client: AsyncClient):
    """Rate-limited responses should include retry information."""
    for i in range(20):
        resp = await client.post(
            LOGIN_URL,
            json={"email": "ratelimit-victim@test.com", "password": f"wrong{i}"},
        )
        if resp.status_code == 429:
            # Should have retry-after or similar header
            headers_lower = {k.lower(): v for k, v in resp.headers.items()}
            has_retry = "retry-after" in headers_lower or "x-ratelimit" in str(headers_lower)
            assert has_retry, \
                f"429 response missing rate limit headers: {dict(resp.headers)}"
            break
    else:
        pytest.fail("No rate limiting triggered after 20 attempts")
