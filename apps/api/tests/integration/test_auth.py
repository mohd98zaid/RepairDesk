import pytest
from httpx import AsyncClient

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REFRESH_URL = "/api/v1/auth/refresh"
LOGOUT_URL = "/api/v1/auth/logout"

SAMPLE_REGISTRATION = {
    "shop_name": "TechFix Lagos",
    "full_name": "Emeka Okafor",
    "email": "emeka@techfix.ng",
    "phone": "+2348012345678",
    "password": "SecurePass123",
}


@pytest.mark.asyncio
async def test_register_success(client: AsyncClient):
    """POST /auth/register should create a shop + user and return a JWT."""
    response = await client.post(REGISTER_URL, json=SAMPLE_REGISTRATION)
    assert response.status_code == 201
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == SAMPLE_REGISTRATION["email"]
    assert data["user"]["role"] == "OWNER"
    assert "shop_id" in data["user"]


@pytest.mark.asyncio
async def test_register_duplicate_email(client: AsyncClient):
    """Registering the same email twice should return 409."""
    await client.post(REGISTER_URL, json=SAMPLE_REGISTRATION)
    response = await client.post(REGISTER_URL, json=SAMPLE_REGISTRATION)
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_register_invalid_email(client: AsyncClient):
    """Registration with invalid email should return 422."""
    bad_data = {**SAMPLE_REGISTRATION, "email": "not-an-email"}
    response = await client.post(REGISTER_URL, json=bad_data)
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient):
    """POST /auth/login with correct credentials should return JWT."""
    await client.post(REGISTER_URL, json=SAMPLE_REGISTRATION)
    response = await client.post(
        LOGIN_URL,
        json={"email": SAMPLE_REGISTRATION["email"], "password": SAMPLE_REGISTRATION["password"]},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["user"]["role"] == "OWNER"


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient):
    """POST /auth/login with wrong password should return 401."""
    await client.post(REGISTER_URL, json=SAMPLE_REGISTRATION)
    response = await client.post(
        LOGIN_URL,
        json={"email": SAMPLE_REGISTRATION["email"], "password": "WrongPassword!"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_login_unknown_email(client: AsyncClient):
    """POST /auth/login with unknown email should return 401."""
    response = await client.post(
        LOGIN_URL,
        json={"email": "nobody@example.com", "password": "AnyPass123"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_logout_success(client: AsyncClient):
    """POST /auth/logout with valid Bearer token should return 204."""
    reg_resp = await client.post(REGISTER_URL, json=SAMPLE_REGISTRATION)
    token = reg_resp.json()["access_token"]
    response = await client.post(
        LOGOUT_URL, headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 204


@pytest.mark.asyncio
async def test_logout_no_token(client: AsyncClient):
    """POST /auth/logout without token should return 401."""
    response = await client.post(LOGOUT_URL)
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_health_endpoint(client: AsyncClient):
    """GET /api/v1/health should return 200 or 503 with status field."""
    response = await client.get("/api/v1/health")
    assert response.status_code in (200, 503)
    assert "status" in response.json()
