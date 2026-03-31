"""
CORS & NETWORK INTEGRATION TESTS
=================================
Tests cross-origin request handling, preflight, and header validation.

Run: pytest tests/breaking/test_cors_network.py -v
"""
import pytest
from httpx import AsyncClient

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REFRESH_URL = "/api/v1/auth/refresh"
TICKETS_URL = "/api/v1/tickets"
SHOPS_ME_URL = "/api/v1/shops/me"

SAMPLE_REGISTRATION = {
    "shop_name": "CorsTest Shop",
    "full_name": "Cors Tester",
    "email": "cors@test.com",
    "phone": "+2348055555555",
    "password": "CorsPass123",
}

PRODUCTION_ORIGIN = "https://repairdeskz.vercel.app"
LOCAL_ORIGIN = "http://localhost:3000"
EVIL_ORIGIN = "https://evil.com"


@pytest.mark.asyncio
async def test_cors_preflight_on_login(client: AsyncClient):
    """OPTIONS preflight on /auth/login should return 200 with CORS headers."""
    resp = await client.options(
        LOGIN_URL,
        headers={
            "Origin": PRODUCTION_ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Content-Type, Authorization",
        },
    )
    assert resp.status_code == 200, f"Preflight returned {resp.status_code}"
    acao = resp.headers.get("access-control-allow-origin")
    assert acao == PRODUCTION_ORIGIN, f"Missing/incorrect ACAO header: {acao}"


@pytest.mark.asyncio
async def test_cors_preflight_on_protected_route(client: AsyncClient):
    """OPTIONS preflight on /shops/me should return 200 with CORS headers."""
    resp = await client.options(
        SHOPS_ME_URL,
        headers={
            "Origin": PRODUCTION_ORIGIN,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Authorization",
        },
    )
    assert resp.status_code == 200, f"Preflight returned {resp.status_code}"
    acao = resp.headers.get("access-control-allow-origin")
    assert acao == PRODUCTION_ORIGIN, f"Missing/incorrect ACAO header: {acao}"


@pytest.mark.asyncio
async def test_cors_preflight_on_tickets(client: AsyncClient):
    """OPTIONS preflight on /tickets should return 200 with CORS headers."""
    resp = await client.options(
        TICKETS_URL,
        headers={
            "Origin": PRODUCTION_ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Content-Type, Authorization",
        },
    )
    assert resp.status_code == 200, f"Preflight returned {resp.status_code}"
    acao = resp.headers.get("access-control-allow-origin")
    assert acao == PRODUCTION_ORIGIN, f"Missing/incorrect ACAO header: {acao}"


@pytest.mark.asyncio
async def test_cors_allows_localhost_for_development(client: AsyncClient):
    """Localhost origin should be allowed for development."""
    resp = await client.options(
        LOGIN_URL,
        headers={
            "Origin": LOCAL_ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Content-Type",
        },
    )
    assert resp.status_code == 200
    acao = resp.headers.get("access-control-allow-origin")
    assert acao == LOCAL_ORIGIN, f"Localhost origin not allowed: {acao}"


@pytest.mark.asyncio
async def test_cors_blocks_unknown_origin(client: AsyncClient):
    """Unknown origins should NOT be allowed."""
    resp = await client.options(
        LOGIN_URL,
        headers={
            "Origin": EVIL_ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Content-Type",
        },
    )
    # Starlette's CORSMiddleware returns 200 but without ACAO for blocked origins
    acao = resp.headers.get("access-control-allow-origin")
    assert acao != EVIL_ORIGIN, f"EVIL origin was allowed: {acao}"


@pytest.mark.asyncio
async def test_actual_request_has_cors_headers(client: AsyncClient):
    """Actual POST request with Origin header should include CORS headers in response."""
    resp = await client.post(
        LOGIN_URL,
        json={"email": "nobody@test.com", "password": "wrong"},
        headers={"Origin": PRODUCTION_ORIGIN},
    )
    acao = resp.headers.get("access-control-allow-origin")
    assert acao == PRODUCTION_ORIGIN, f"Actual request missing CORS headers: {acao}"


@pytest.mark.asyncio
async def test_cors_headers_on_error_responses(client: AsyncClient):
    """Error responses (401, 404, 500) must include CORS headers."""
    # 401 error
    resp = await client.post(
        LOGIN_URL,
        json={"email": "test@test.com", "password": "wrong"},
        headers={"Origin": PRODUCTION_ORIGIN},
    )
    assert resp.headers.get("access-control-allow-origin") == PRODUCTION_ORIGIN

    # 404 error
    resp = await client.get(
        "/api/v1/nonexistent",
        headers={"Origin": PRODUCTION_ORIGIN},
    )
    assert resp.headers.get("access-control-allow-origin") == PRODUCTION_ORIGIN


@pytest.mark.asyncio
async def test_cors_credentials_header(client: AsyncClient):
    """CORS responses should include Access-Control-Allow-Credentials."""
    resp = await client.post(
        LOGIN_URL,
        json={"email": "test@test.com", "password": "wrong"},
        headers={"Origin": PRODUCTION_ORIGIN},
    )
    acac = resp.headers.get("access-control-allow-credentials")
    assert acac == "true", f"Missing credentials header: {acac}"


@pytest.mark.asyncio
async def test_cookie_set_on_login(client: AsyncClient):
    """Login should set httpOnly refresh cookie."""
    reg = await client.post(REGISTER_URL, json=SAMPLE_REGISTRATION)
    # Check response cookies
    cookies = dict(reg.cookies)
    assert "repairdesk_refresh" in cookies, "Login did not set repairdesk_refresh cookie"

    # Verify cookie attributes
    set_cookie = reg.headers.get("set-cookie", "")
    assert "httponly" in set_cookie.lower(), "Cookie is not httpOnly"
    assert "samesite" in set_cookie.lower(), "Cookie missing samesite attribute"
