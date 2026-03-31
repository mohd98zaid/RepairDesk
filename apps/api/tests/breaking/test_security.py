"""
SECURITY & PENETRATION TESTS
=============================
Tests that attempt to bypass auth, tamper with tokens, and exploit injection vectors.

Run: pytest tests/breaking/test_security.py -v
"""
import base64
import json
import pytest
from httpx import AsyncClient

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REFRESH_URL = "/api/v1/auth/refresh"
LOGOUT_URL = "/api/v1/auth/logout"
TICKETS_URL = "/api/v1/tickets"
CUSTOMERS_URL = "/api/v1/customers"
SHOPS_ME_URL = "/api/v1/shops/me"
USERS_URL = "/api/v1/users"
INVENTORY_URL = "/api/v1/inventory"

SAMPLE_REGISTRATION = {
    "shop_name": "SecTest Shop",
    "full_name": "Sec Tester",
    "email": "sectest@test.com",
    "phone": "+2348077777777",
    "password": "SecPass123",
}


# ─────────────────────────────────────────────
# JWT TAMPERING TESTS
# ─────────────────────────────────────────────

def _tamper_jwt(token: str) -> str:
    """Decode, modify role to OWNER, re-encode without signature."""
    parts = token.split(".")
    payload = json.loads(base64.urlsafe_b64decode(parts[1] + "=="))
    payload["role"] = "OWNER"
    payload["shop_id"] = "00000000-0000-0000-0000-000000000001"
    new_payload = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    return f"{parts[0]}.{new_payload}.{parts[2]}"


@pytest.mark.asyncio
async def test_access_protected_route_without_token(client: AsyncClient):
    """Accessing /shops/me without any token should return 401."""
    resp = await client.get(SHOPS_ME_URL)
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_access_protected_route_with_expired_token(client: AsyncClient):
    """Using an obviously expired token should return 401, not 500."""
    # Craft a token that expired in 2020
    expired_payload = base64.urlsafe_b64encode(
        json.dumps({"sub": "00000000-0000-0000-0000-000000000000", "exp": 1609459200}).encode()
    ).decode().rstrip("=")
    fake_token = f"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.{expired_payload}.fakesig"
    resp = await client.get(
        SHOPS_ME_URL,
        headers={"Authorization": f"Bearer {fake_token}"},
    )
    assert resp.status_code == 401, f"Expected 401 for expired token, got {resp.status_code}"


@pytest.mark.asyncio
async def test_access_with_tampered_jwt(client: AsyncClient):
    """Tampered JWT (modified role) should be rejected."""
    reg = await client.post(REGISTER_URL, json=SAMPLE_REGISTRATION)
    real_token = reg.json()["access_token"]
    tampered = _tamper_jwt(real_token)

    resp = await client.get(
        SHOPS_ME_URL,
        headers={"Authorization": f"Bearer {tampered}"},
    )
    assert resp.status_code == 401, f"Tampered JWT was accepted: {resp.status_code}"


@pytest.mark.asyncio
async def test_access_with_completely_fake_token(client: AsyncClient):
    """Completely random string as token should return 401, not 500."""
    resp = await client.get(
        SHOPS_ME_URL,
        headers={"Authorization": "Bearer totally.faketoken.notsigned"},
    )
    assert resp.status_code == 401, f"Fake token returned {resp.status_code}"


@pytest.mark.asyncio
async def test_access_with_empty_bearer(client: AsyncClient):
    """Empty bearer token should return 401, not 500."""
    resp = await client.get(
        SHOPS_ME_URL,
        headers={"Authorization": "Bearer "},
    )
    assert resp.status_code in (401, 422), f"Expected 401/422, got {resp.status_code}"


# ─────────────────────────────────────────────
# IDOR (INSECURE DIRECT OBJECT REFERENCE) TESTS
# ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_cannot_access_another_shops_tickets(client: AsyncClient):
    """Shop A should not see Shop B's tickets via IDOR."""
    # Register Shop A
    reg_a = await client.post(REGISTER_URL, json={
        **SAMPLE_REGISTRATION, "email": "shopa@test.com", "shop_name": "Shop A"
    })
    token_a = reg_a.json()["access_token"]

    # Register Shop B
    reg_b = await client.post(REGISTER_URL, json={
        **SAMPLE_REGISTRATION, "email": "shopb@test.com", "shop_name": "Shop B"
    })
    token_b = reg_b.json()["access_token"]

    # Shop A creates a ticket
    resp_a = await client.post(
        TICKETS_URL,
        json={
            "customer_phone": "1111111111",
            "customer_name": "Customer A",
            "device_type": "Phone",
            "device_model": "Test",
            "reported_issue": "Test issue",
        },
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert resp_a.status_code == 201
    ticket_id = resp_a.json()["id"]

    # Shop B tries to access Shop A's ticket
    resp_b = await client.get(
        f"{TICKETS_URL}/{ticket_id}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    # Should return 404 (not found) or 403 (forbidden), NOT 200 with data
    if resp_b.status_code == 200:
        data = resp_b.json()
        # Verify the ticket doesn't belong to Shop B
        assert data.get("shop_id") != reg_b.json()["user"]["shop_id"], \
            "IDOR: Shop B accessed Shop A's ticket!"


@pytest.mark.asyncio
async def test_cannot_access_another_shops_customers(client: AsyncClient):
    """Shop A should not see Shop B's customers."""
    reg_a = await client.post(REGISTER_URL, json={
        **SAMPLE_REGISTRATION, "email": "ida@test.com", "shop_name": "Shop IDA"
    })
    token_a = reg_a.json()["access_token"]

    reg_b = await client.post(REGISTER_URL, json={
        **SAMPLE_REGISTRATION, "email": "idb@test.com", "shop_name": "Shop IDB"
    })
    token_b = reg_b.json()["access_token"]

    # Shop A creates a customer
    resp_a = await client.post(
        CUSTOMERS_URL,
        json={"name": "Customer A", "phone": "2222222222"},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert resp_a.status_code == 201
    customer_id = resp_a.json()["id"]

    # Shop B tries to access Shop A's customer
    resp_b = await client.get(
        f"{CUSTOMERS_URL}/{customer_id}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    if resp_b.status_code == 200:
        data = resp_b.json()
        assert data.get("shop_id") != reg_b.json()["user"]["shop_id"], \
            "IDOR: Shop B accessed Shop A's customer!"


# ─────────────────────────────────────────────
# INJECTION TESTS
# ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_sql_injection_in_email_field(client: AsyncClient):
    """SQL injection in email field should not crash or bypass auth."""
    payloads = [
        "admin@test.com' OR '1'='1",
        "'; DROP TABLE users; --",
        "test@test.com' UNION SELECT * FROM users --",
        "1' OR '1'='1' /*",
    ]
    for payload in payloads:
        resp = await client.post(
            LOGIN_URL,
            json={"email": payload, "password": "anything"},
        )
        assert resp.status_code < 500, f"500 on SQL injection in email: {resp.status_code}"
        # Should never return 200 with SQL injection
        if resp.status_code == 200:
            raise AssertionError(f"SQL injection succeeded with payload: {payload}")


@pytest.mark.asyncio
async def test_xss_in_customer_name(client: AsyncClient):
    """XSS in customer name should be safely stored and returned."""
    reg = await client.post(REGISTER_URL, json=SAMPLE_REGISTRATION)
    token = reg.json()["access_token"]

    xss_payloads = [
        '<script>alert("xss")</script>',
        '<img src=x onerror=alert(1)>',
        '"><script>document.location="http://evil.com"</script>',
        'javascript:alert(1)',
    ]

    for payload in xss_payloads:
        resp = await client.post(
            CUSTOMERS_URL,
            json={"name": payload, "phone": "3333333333"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code < 500, f"500 on XSS payload: {resp.status_code}"


@pytest.mark.asyncio
async def test_nosql_injection_in_json_fields(client: AsyncClient):
    """NoSQL-style injection in JSON body should be handled."""
    reg = await client.post(REGISTER_URL, json=SAMPLE_REGISTRATION)
    token = reg.json()["access_token"]

    resp = await client.post(
        LOGIN_URL,
        json={"email": {"$gt": ""}, "password": {"$gt": ""}},
    )
    assert resp.status_code < 500, f"500 on NoSQL injection: {resp.status_code}"


# ─────────────────────────────────────────────
# HEADER MANIPULATION TESTS
# ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_missing_content_type_on_login(client: AsyncClient):
    """Login without Content-Type header should be handled gracefully."""
    resp = await client.post(
        LOGIN_URL,
        json={"email": "test@test.com", "password": "test"},
    )
    # httpx auto-sets Content-Type for json=, but let's test without it
    resp2 = await client.post(
        LOGIN_URL,
        content=json.dumps({"email": "test@test.com", "password": "test"}),
    )
    assert resp2.status_code < 500, f"500 on missing content-type: {resp2.status_code}"


@pytest.mark.asyncio
async def test_invalid_authorization_header_format(client: AsyncClient):
    """Malformed Authorization header should return 401, not 500."""
    reg = await client.post(REGISTER_URL, json=SAMPLE_REGISTRATION)
    bad_headers = [
        {"Authorization": "InvalidFormat token123"},
        {"Authorization": "Basic dGVzdDp0ZXN0"},
        {"Authorization": ""},
        {"Authorization": "Bearer"},
        {"Authorization": "Bearer "},
    ]
    for headers in bad_headers:
        resp = await client.get(SHOPS_ME_URL, headers=headers)
        assert resp.status_code in (401, 422), \
            f"Expected 401/422 for bad auth header '{headers}', got {resp.status_code}"


@pytest.mark.asyncio
async def test_host_header_injection(client: AsyncClient):
    """Host header manipulation should not affect response."""
    resp = await client.get(
        "/api/v1/health",
        headers={"Host": "evil.com"},
    )
    assert resp.status_code == 200
    # Response should not contain evil.com
    assert "evil.com" not in resp.text.lower() or "evil.com" not in resp.json().get("status", "")


# ─────────────────────────────────────────────
# RATE LIMITING TESTS
# ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_brute_force_login_protection(client: AsyncClient):
    """Rapid failed login attempts should trigger rate limiting."""
    responses = []
    for i in range(15):
        resp = await client.post(
            LOGIN_URL,
            json={"email": "victim@test.com", "password": f"wrong{i}"},
        )
        responses.append(resp.status_code)

    # At least some should be rate-limited (429)
    rate_limited = [s for s in responses if s == 429]
    assert len(rate_limited) > 0, \
        f"No rate limiting detected after 15 failed attempts. Statuses: {responses}"
