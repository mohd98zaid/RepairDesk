"""
API CONTRACT VALIDATION TESTS
==============================
Strict response structure validation for all critical endpoints.
These tests FAIL if the backend changes its response format,
which would silently break the frontend.

Run: pytest tests/breaking/test_contracts.py -v
"""
import pytest
from httpx import AsyncClient

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REFRESH_URL = "/api/v1/auth/refresh"
LOGOUT_URL = "/api/v1/auth/logout"
TICKETS_URL = "/api/v1/tickets"
CUSTOMERS_URL = "/api/v1/customers"
INVENTORY_URL = "/api/v1/inventory"
SHOPS_ME_URL = "/api/v1/shops/me"
USERS_URL = "/api/v1/users"

SAMPLE_REGISTRATION = {
    "shop_name": "Contract Shop",
    "full_name": "Contract Tester",
    "email": "contract@test.com",
    "phone": "+2348022222222",
    "password": "ContractPass123",
}


def _assert_response_keys(data: dict, required_keys: list, endpoint: str):
    """Assert all required keys are present in response."""
    missing = [k for k in required_keys if k not in data]
    assert not missing, \
        f"API contract violation on {endpoint}: missing keys {missing} in {list(data.keys())}"


def _assert_type(value, expected_type, field_name: str, endpoint: str):
    """Assert value is of expected type."""
    assert isinstance(value, expected_type), \
        f"API contract violation on {endpoint}: {field_name} should be {expected_type.__name__}, got {type(value).__name__}"


# ─────────────────────────────────────────────
# AUTH CONTRACTS
# ─────────────────────────────────────────────

class TestLoginContract:
    """POST /auth/login response must match frontend expectations exactly."""

    @pytest.mark.asyncio
    async def test_login_response_structure(self, client: AsyncClient):
        await client.post(REGISTER_URL, json=SAMPLE_REGISTRATION)
        resp = await client.post(
            LOGIN_URL,
            json={"email": SAMPLE_REGISTRATION["email"], "password": SAMPLE_REGISTRATION["password"]},
        )
        assert resp.status_code == 200
        data = resp.json()

        # Top-level required fields
        _assert_response_keys(data, ["access_token", "refresh_token", "token_type", "user"], "login")

        # Type checks
        _assert_type(data["access_token"], str, "access_token", "login")
        _assert_type(data["refresh_token"], str, "refresh_token", "login")
        _assert_type(data["token_type"], str, "token_type", "login")
        _assert_type(data["user"], dict, "user", "login")

        # User object required fields
        _assert_response_keys(data["user"], ["id", "full_name", "email", "role", "shop_id"], "login.user")
        _assert_type(data["user"]["id"], str, "user.id", "login")
        _assert_type(data["user"]["full_name"], str, "user.full_name", "login")
        _assert_type(data["user"]["email"], str, "user.email", "login")
        _assert_type(data["user"]["role"], str, "user.role", "login")
        _assert_type(data["user"]["shop_id"], str, "user.shop_id", "login")

    @pytest.mark.asyncio
    async def test_login_401_response_structure(self, client: AsyncClient):
        """401 response must have consistent error format."""
        resp = await client.post(
            LOGIN_URL,
            json={"email": "nobody@test.com", "password": "wrong"},
        )
        assert resp.status_code == 401
        data = resp.json()
        _assert_response_keys(data, ["detail"], "login/401")

    @pytest.mark.asyncio
    async def test_login_422_response_structure(self, client: AsyncClient):
        """422 response must have consistent validation error format."""
        resp = await client.post(LOGIN_URL, json={"email": "not-an-email", "password": "test"})
        assert resp.status_code == 422
        data = resp.json()
        assert "detail" in data, "422 response missing 'detail' field"


class TestRegisterContract:
    """POST /auth/register response must match login response structure."""

    @pytest.mark.asyncio
    async def test_register_response_structure(self, client: AsyncClient):
        resp = await client.post(REGISTER_URL, json=SAMPLE_REGISTRATION)
        assert resp.status_code == 201
        data = resp.json()

        _assert_response_keys(data, ["access_token", "refresh_token", "token_type", "user"], "register")
        _assert_response_keys(data["user"], ["id", "full_name", "email", "role", "shop_id"], "register.user")
        assert data["user"]["role"] == "OWNER"


class TestRefreshContract:
    """POST /auth/refresh response must return new access token."""

    @pytest.mark.asyncio
    async def test_refresh_response_structure(self, client: AsyncClient):
        reg = await client.post(REGISTER_URL, json=SAMPLE_REGISTRATION)
        refresh_token = reg.json()["refresh_token"]

        resp = await client.post(
            REFRESH_URL,
            json={"refresh_token": refresh_token},
        )
        assert resp.status_code == 200
        data = resp.json()

        _assert_response_keys(data, ["access_token"], "refresh")
        _assert_type(data["access_token"], str, "access_token", "refresh")


class TestLogoutContract:
    """POST /auth/logout must return 204 with no body."""

    @pytest.mark.asyncio
    async def test_logout_response(self, client: AsyncClient):
        reg = await client.post(REGISTER_URL, json=SAMPLE_REGISTRATION)
        token = reg.json()["access_token"]

        resp = await client.post(
            LOGOUT_URL,
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 204
        assert resp.content == b"", "Logout should return empty body"


# ─────────────────────────────────────────────
# TICKET CONTRACTS
# ─────────────────────────────────────────────

class TestTicketContract:
    """Ticket CRUD responses must have consistent structure."""

    @pytest.mark.asyncio
    async def test_create_ticket_response(self, client: AsyncClient):
        reg = await client.post(REGISTER_URL, json=SAMPLE_REGISTRATION)
        token = reg.json()["access_token"]

        resp = await client.post(
            TICKETS_URL,
            json={
                "customer_phone": "1234567890",
                "customer_name": "Test Customer",
                "device_type": "Phone",
                "device_model": "iPhone 14",
                "reported_issue": "Screen cracked",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 201
        data = resp.json()

        _assert_response_keys(data, ["id", "ticket_number", "status", "created_at"], "create_ticket")
        _assert_type(data["id"], str, "ticket.id", "create_ticket")
        _assert_type(data["ticket_number"], int, "ticket.ticket_number", "create_ticket")
        _assert_type(data["status"], str, "ticket.status", "create_ticket")

    @pytest.mark.asyncio
    async def test_list_tickets_response(self, client: AsyncClient):
        reg = await client.post(REGISTER_URL, json=SAMPLE_REGISTRATION)
        token = reg.json()["access_token"]

        resp = await client.get(
            TICKETS_URL,
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()

        _assert_response_keys(data, ["total", "page", "per_page", "pages", "items"], "list_tickets")
        _assert_type(data["total"], int, "total", "list_tickets")
        _assert_type(data["page"], int, "page", "list_tickets")
        _assert_type(data["per_page"], int, "per_page", "list_tickets")
        _assert_type(data["pages"], int, "pages", "list_tickets")
        _assert_type(data["items"], list, "items", "list_tickets")

    @pytest.mark.asyncio
    async def test_ticket_404_response(self, client: AsyncClient):
        """Getting a non-existent ticket must return 404 with error format."""
        reg = await client.post(REGISTER_URL, json=SAMPLE_REGISTRATION)
        token = reg.json()["access_token"]

        resp = await client.get(
            f"{TICKETS_URL}/00000000-0000-0000-0000-000000000000",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 404
        data = resp.json()
        _assert_response_keys(data, ["detail"], "ticket/404")


# ─────────────────────────────────────────────
# CUSTOMER CONTRACTS
# ─────────────────────────────────────────────

class TestCustomerContract:
    """Customer CRUD responses must have consistent structure."""

    @pytest.mark.asyncio
    async def test_create_customer_response(self, client: AsyncClient):
        reg = await client.post(REGISTER_URL, json=SAMPLE_REGISTRATION)
        token = reg.json()["access_token"]

        resp = await client.post(
            CUSTOMERS_URL,
            json={"name": "Test Customer", "phone": "9876543210"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 201
        data = resp.json()

        _assert_response_keys(data, ["id", "short_id", "name", "phone", "created_at"], "create_customer")
        _assert_type(data["id"], str, "customer.id", "create_customer")
        _assert_type(data["name"], str, "customer.name", "create_customer")
        _assert_type(data["phone"], str, "customer.phone", "create_customer")

    @pytest.mark.asyncio
    async def test_list_customers_response(self, client: AsyncClient):
        reg = await client.post(REGISTER_URL, json=SAMPLE_REGISTRATION)
        token = reg.json()["access_token"]

        resp = await client.get(
            CUSTOMERS_URL,
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()

        _assert_response_keys(data, ["total", "page", "per_page", "pages", "items"], "list_customers")
        _assert_type(data["items"], list, "items", "list_customers")


# ─────────────────────────────────────────────
# SHOP CONTRACTS
# ─────────────────────────────────────────────

class TestShopContract:
    """Shop endpoint responses must have consistent structure."""

    @pytest.mark.asyncio
    async def test_shop_me_response(self, client: AsyncClient):
        reg = await client.post(REGISTER_URL, json=SAMPLE_REGISTRATION)
        token = reg.json()["access_token"]

        resp = await client.get(
            SHOPS_ME_URL,
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()

        _assert_response_keys(
            data,
            ["id", "short_id", "name", "phone", "email", "plan", "is_active", "created_at"],
            "shop_me"
        )
        _assert_type(data["id"], str, "shop.id", "shop_me")
        _assert_type(data["name"], str, "shop.name", "shop_me")
        _assert_type(data["plan"], str, "shop.plan", "shop_me")


# ─────────────────────────────────────────────
# INVENTORY CONTRACTS
# ─────────────────────────────────────────────

class TestInventoryContract:
    """Inventory endpoint responses must have consistent structure."""

    @pytest.mark.asyncio
    async def test_list_inventory_response(self, client: AsyncClient):
        reg = await client.post(REGISTER_URL, json=SAMPLE_REGISTRATION)
        token = reg.json()["access_token"]

        resp = await client.get(
            INVENTORY_URL,
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()

        _assert_response_keys(data, ["total", "page", "per_page", "pages", "items"], "list_inventory")
        _assert_type(data["items"], list, "items", "list_inventory")
        _assert_type(data["total"], int, "total", "list_inventory")


# ─────────────────────────────────────────────
# ERROR RESPONSE CONTRACT
# ─────────────────────────────────────────────

class TestErrorContract:
    """All error responses must follow a consistent format."""

    @pytest.mark.asyncio
    async def test_401_error_format(self, client: AsyncClient):
        resp = await client.get(SHOPS_ME_URL)
        assert resp.status_code == 401
        data = resp.json()
        assert "detail" in data, "401 response missing 'detail' field"
        _assert_type(data["detail"], str, "detail", "401")

    @pytest.mark.asyncio
    async def test_404_error_format(self, client: AsyncClient):
        resp = await client.get("/api/v1/nonexistent-endpoint")
        assert resp.status_code == 404
        data = resp.json()
        assert "detail" in data, "404 response missing 'detail' field"

    @pytest.mark.asyncio
    async def test_422_error_format(self, client: AsyncClient):
        resp = await client.post(LOGIN_URL, json={"email": "bad"})
        assert resp.status_code == 422
        data = resp.json()
        assert "detail" in data, "422 response missing 'detail' field"

    @pytest.mark.asyncio
    async def test_409_error_format(self, client: AsyncClient):
        await client.post(REGISTER_URL, json=SAMPLE_REGISTRATION)
        resp = await client.post(REGISTER_URL, json=SAMPLE_REGISTRATION)
        assert resp.status_code == 409
        data = resp.json()
        assert "detail" in data, "409 response missing 'detail' field"
