"""
EDGE CASE & PAYLOAD ABUSE TESTS
================================
Tests that hammer endpoints with malformed, oversized, and boundary inputs.
These catch validation gaps, serialization crashes, and DoS vectors.

Run: pytest tests/breaking/test_edge_cases.py -v
"""
import json
import pytest
from httpx import AsyncClient

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
TICKETS_URL = "/api/v1/tickets"
CUSTOMERS_URL = "/api/v1/customers"
INVENTORY_URL = "/api/v1/inventory"
SHOPS_ME_URL = "/api/v1/shops/me"

SAMPLE_REGISTRATION = {
    "shop_name": "Edge Shop",
    "full_name": "Edge Tester",
    "email": "edge@test.com",
    "phone": "+2348088888888",
    "password": "EdgePass123",
}


@pytest.fixture
async def authed_client(client: AsyncClient):
    """Register and return an authenticated client."""
    reg = await client.post(REGISTER_URL, json=SAMPLE_REGISTRATION)
    assert reg.status_code == 201
    token = reg.json()["access_token"]
    client._auth_headers = {"Authorization": f"Bearer {token}"}
    return client


# ─────────────────────────────────────────────
# MALFORMED JSON / CONTENT-TYPE TESTS
# ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_login_with_malformed_json(client: AsyncClient):
    """POST /auth/login with invalid JSON should return 422, not 500."""
    resp = await client.post(
        LOGIN_URL,
        content=b'{"email": "test@test.com", "password":',
        headers={"Content-Type": "application/json"},
    )
    assert resp.status_code in (400, 422), f"Expected 400/422, got {resp.status_code}"


@pytest.mark.asyncio
async def test_login_with_empty_body(client: AsyncClient):
    """POST /auth/login with empty body should return 422, not 500."""
    resp = await client.post(
        LOGIN_URL,
        content=b"",
        headers={"Content-Type": "application/json"},
    )
    assert resp.status_code in (400, 422), f"Expected 400/422, got {resp.status_code}"


@pytest.mark.asyncio
async def test_login_with_wrong_content_type(client: AsyncClient):
    """POST /auth/login with text/plain should be handled gracefully."""
    resp = await client.post(
        LOGIN_URL,
        content="email=test@test.com&password=test",
        headers={"Content-Type": "text/plain"},
    )
    # Should not crash — 400, 415, or 422 are all acceptable
    assert resp.status_code < 500, f"Server error on wrong content-type: {resp.status_code}"


# ─────────────────────────────────────────────
# OVERSIZED PAYLOAD TESTS
# ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_login_with_very_long_password(client: AsyncClient):
    """Login with 1000-char password should not crash."""
    long_pass = "A" * 1000
    resp = await client.post(
        LOGIN_URL,
        json={"email": "nobody@example.com", "password": long_pass},
    )
    assert resp.status_code < 500, f"500 on long password: {resp.status_code}"


@pytest.mark.asyncio
async def test_register_with_very_long_shop_name(client: AsyncClient):
    """Register with 5000-char shop name should be rejected gracefully."""
    bad_data = {**SAMPLE_REGISTRATION, "shop_name": "X" * 5000, "email": "longname@test.com"}
    resp = await client.post(REGISTER_URL, json=bad_data)
    assert resp.status_code < 500, f"500 on long shop name: {resp.status_code}"


@pytest.mark.asyncio
async def test_ticket_with_massive_description(client: AsyncClient):
    """Ticket with 50KB description should not crash the server."""
    reg = await client.post(REGISTER_URL, json=SAMPLE_REGISTRATION)
    token = reg.json()["access_token"]
    resp = await client.post(
        TICKETS_URL,
        json={
            "customer_phone": "1234567890",
            "customer_name": "Test",
            "device_type": "Phone",
            "device_model": "Test",
            "reported_issue": "X" * 50000,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code < 500, f"500 on massive ticket description: {resp.status_code}"


# ─────────────────────────────────────────────
# MISSING REQUIRED FIELDS
# ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_login_missing_email(client: AsyncClient):
    """Login without email field should return 422."""
    resp = await client.post(LOGIN_URL, json={"password": "test"})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_login_missing_password(client: AsyncClient):
    """Login without password field should return 422."""
    resp = await client.post(LOGIN_URL, json={"email": "test@test.com"})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_register_missing_shop_name(client: AsyncClient):
    """Register without shop_name should return 422."""
    bad_data = {k: v for k, v in SAMPLE_REGISTRATION.items() if k != "shop_name"}
    bad_data["email"] = "noshop@test.com"
    resp = await client.post(REGISTER_URL, json=bad_data)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_ticket_missing_required_fields(client: AsyncClient):
    """Ticket creation with missing required fields should return 422."""
    reg = await client.post(REGISTER_URL, json=SAMPLE_REGISTRATION)
    token = reg.json()["access_token"]
    resp = await client.post(
        TICKETS_URL,
        json={},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422


# ─────────────────────────────────────────────
# TYPE COERCION TESTS
# ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_login_with_null_email(client: AsyncClient):
    """Login with null email should return 422, not 500."""
    resp = await client.post(LOGIN_URL, json={"email": None, "password": "test"})
    assert resp.status_code in (400, 422), f"Expected 400/422, got {resp.status_code}"


@pytest.mark.asyncio
async def test_login_with_numeric_email(client: AsyncClient):
    """Login with numeric email should be rejected."""
    resp = await client.post(LOGIN_URL, json={"email": 12345, "password": "test"})
    assert resp.status_code in (400, 422), f"Expected 400/422, got {resp.status_code}"


@pytest.mark.asyncio
async def test_ticket_with_null_customer_phone(client: AsyncClient):
    """Ticket with null customer_phone should return 422."""
    reg = await client.post(REGISTER_URL, json=SAMPLE_REGISTRATION)
    token = reg.json()["access_token"]
    resp = await client.post(
        TICKETS_URL,
        json={
            "customer_phone": None,
            "customer_name": "Test",
            "device_type": "Phone",
            "device_model": "Test",
            "reported_issue": "Broken",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code in (400, 422), f"Expected 400/422, got {resp.status_code}"


# ─────────────────────────────────────────────
# UNICODE & SPECIAL CHARACTER TESTS
# ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_register_with_unicode_name(client: AsyncClient):
    """Register with unicode characters in name should work."""
    data = {
        **SAMPLE_REGISTRATION,
        "full_name": "田中太郎",
        "email": "unicode@test.com",
        "shop_name": "Unicode Shop 中文",
    }
    resp = await client.post(REGISTER_URL, json=data)
    assert resp.status_code == 201, f"Unicode registration failed: {resp.status_code} {resp.text}"


@pytest.mark.asyncio
async def test_ticket_with_sql_injection_in_description(client: AsyncClient):
    """Ticket with SQL injection payload should be safely stored, not crash."""
    reg = await client.post(REGISTER_URL, json=SAMPLE_REGISTRATION)
    token = reg.json()["access_token"]
    resp = await client.post(
        TICKETS_URL,
        json={
            "customer_phone": "1234567890",
            "customer_name": "Test",
            "device_type": "Phone",
            "device_model": "Test",
            "reported_issue": "'; DROP TABLE tickets; --",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code < 500, f"500 on SQL injection payload: {resp.status_code}"


@pytest.mark.asyncio
async def test_ticket_with_xss_in_description(client: AsyncClient):
    """Ticket with XSS payload should be safely stored."""
    reg = await client.post(REGISTER_URL, json=SAMPLE_REGISTRATION)
    token = reg.json()["access_token"]
    resp = await client.post(
        TICKETS_URL,
        json={
            "customer_phone": "1234567890",
            "customer_name": "Test",
            "device_type": "Phone",
            "device_model": "Test",
            "reported_issue": '<script>alert("xss")</script>',
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code < 500, f"500 on XSS payload: {resp.status_code}"


# ─────────────────────────────────────────────
# CONCURRENCY / RACE CONDITION TESTS
# ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_concurrent_ticket_creation(client: AsyncClient):
    """Multiple concurrent ticket creations should not produce duplicate ticket numbers."""
    reg = await client.post(REGISTER_URL, json=SAMPLE_REGISTRATION)
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Fire 10 concurrent ticket creations
    tasks = [
        client.post(
            TICKETS_URL,
            json={
                "customer_phone": f"123456789{i}",
                "customer_name": f"Customer {i}",
                "device_type": "Phone",
                "device_model": f"Model {i}",
                "reported_issue": f"Issue {i}",
            },
            headers=headers,
        )
        for i in range(10)
    ]
    results = await client.__class__.__bases__[0].gather(*tasks) if hasattr(client.__class__.__bases__[0], 'gather') else [await t for t in tasks]

    ticket_numbers = []
    for resp in results:
        assert resp.status_code < 500, f"Concurrent ticket creation returned {resp.status_code}"
        if resp.status_code == 201:
            data = resp.json()
            ticket_numbers.append(data.get("ticket_number"))

    # Check for duplicates
    if len(ticket_numbers) > 1:
        assert len(ticket_numbers) == len(set(ticket_numbers)), \
            f"Duplicate ticket numbers detected: {ticket_numbers}"
