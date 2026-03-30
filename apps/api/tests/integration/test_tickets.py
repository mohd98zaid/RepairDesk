"""
Integration tests — Tickets API
Covers: create, list, get, status transitions, parts, pagination, auth
"""
import uuid
import pytest
from httpx import AsyncClient
from tests.helpers import auth_headers

CUSTOMERS_URL = "/api/v1/customers"
TICKETS_URL = "/api/v1/tickets"


@pytest.fixture
async def headers(client: AsyncClient):
    return await auth_headers(client)


@pytest.fixture
async def customer(client: AsyncClient, headers):
    resp = await client.post(
        CUSTOMERS_URL,
        json={"name": "Ticket Customer", "phone": "+2348055555555"},
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()


@pytest.fixture
async def sample_ticket(client: AsyncClient, headers, customer):
    resp = await client.post(
        TICKETS_URL,
        json={
            "customer_id": customer["id"],
            "device_type": "iPhone 13",
            "reported_issue": "Cracked screen",
            "estimated_cost": "25000.00",
        },
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()


# ────────────────────────── Create ──────────────────────────

class TestCreateTicket:
    async def test_create_success(self, client: AsyncClient, headers, customer):
        resp = await client.post(
            TICKETS_URL,
            json={
                "customer_id": customer["id"],
                "device_type": "Samsung S21",
                "reported_issue": "Battery drain",
            },
            headers=headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        # create_ticket returns {id, ticket_number, status, created_at}
        assert "id" in data
        assert "ticket_number" in data
        assert data["status"] == "RECEIVED"
        assert isinstance(data["ticket_number"], int)
        assert data["ticket_number"] >= 1

    async def test_create_with_estimated_cost(self, client: AsyncClient, headers, customer):
        resp = await client.post(
            TICKETS_URL,
            json={
                "customer_id": customer["id"],
                "device_type": "MacBook Pro",
                "reported_issue": "No display",
                "estimated_cost": "80000.00",
            },
            headers=headers,
        )
        assert resp.status_code == 201
        assert "id" in resp.json()

    async def test_create_requires_auth(self, client: AsyncClient, customer):
        resp = await client.post(
            TICKETS_URL,
            json={"customer_id": customer["id"], "device_type": "X", "reported_issue": "Y"},
        )
        assert resp.status_code == 401

    async def test_create_nonexistent_customer(self, client: AsyncClient, headers):
        resp = await client.post(
            TICKETS_URL,
            json={
                "customer_id": str(uuid.uuid4()),
                "device_type": "Phone",
                "reported_issue": "Broken",
            },
            headers=headers,
        )
        assert resp.status_code == 404

    async def test_create_missing_required_fields(self, client: AsyncClient, headers, customer):
        resp = await client.post(
            TICKETS_URL,
            json={"customer_id": customer["id"]},  # Missing device_type + reported_issue
            headers=headers,
        )
        assert resp.status_code == 422


# ────────────────────────── List ──────────────────────────

class TestListTickets:
    async def test_list_empty(self, client: AsyncClient, headers):
        resp = await client.get(TICKETS_URL, headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "total" in data
        assert "items" in data
        assert data["total"] == 0

    async def test_list_includes_created_ticket(self, client: AsyncClient, headers, sample_ticket):
        resp = await client.get(TICKETS_URL, headers=headers)
        assert resp.status_code == 200
        assert resp.json()["total"] >= 1

    async def test_filter_by_status(self, client: AsyncClient, headers, sample_ticket):
        resp = await client.get(TICKETS_URL, params={"status": "RECEIVED"}, headers=headers)
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert len(items) >= 1
        for ticket in items:
            assert ticket["status"] == "RECEIVED"

    async def test_filter_by_nonexistent_status_returns_empty(self, client: AsyncClient, headers, sample_ticket):
        resp = await client.get(TICKETS_URL, params={"status": "DELIVERED"}, headers=headers)
        assert resp.status_code == 200
        assert resp.json()["total"] == 0

    async def test_search_by_customer_name(self, client: AsyncClient, headers, sample_ticket):
        # Tickets search= param filters on customer name (not device_type)
        # The sample_ticket fixture creates customer "Ticket Customer"
        resp = await client.get(TICKETS_URL, params={"search": "Ticket Customer"}, headers=headers)
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert len(items) >= 1


# ────────────────────────── Get by ID ──────────────────────────

class TestGetTicket:
    async def test_get_existing(self, client: AsyncClient, headers, sample_ticket):
        tid = sample_ticket["id"]
        resp = await client.get(f"{TICKETS_URL}/{tid}", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == tid
        assert "parts" in data
        assert "status_logs" in data
        assert "images" in data

    async def test_get_nonexistent(self, client: AsyncClient, headers):
        resp = await client.get(f"{TICKETS_URL}/{uuid.uuid4()}", headers=headers)
        assert resp.status_code == 404

    async def test_get_requires_auth(self, client: AsyncClient, sample_ticket):
        tid = sample_ticket["id"]
        # No headers provided
        resp = await client.get(f"{TICKETS_URL}/{tid}")
        assert resp.status_code == 401


# ────────────────────────── Status Changes ──────────────────────────

class TestTicketStatusChange:
    async def test_move_received_to_in_progress(self, client: AsyncClient, headers, sample_ticket):
        tid = sample_ticket["id"]
        resp = await client.post(
            f"{TICKETS_URL}/{tid}/status",
            json={"status": "IN_PROGRESS"},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "IN_PROGRESS"

    async def test_invalid_transition_returns_error(self, client: AsyncClient, headers, sample_ticket):
        """RECEIVED → DELIVERED is not a valid direct transition."""
        tid = sample_ticket["id"]
        resp = await client.post(
            f"{TICKETS_URL}/{tid}/status",
            json={"status": "DELIVERED"},
            headers=headers,
        )
        assert resp.status_code in (422, 400)

    async def test_full_lifecycle(self, client: AsyncClient, headers, customer):
        """Create → IN_PROGRESS → READY → DELIVERED."""
        create = await client.post(
            TICKETS_URL,
            json={"customer_id": customer["id"], "device_type": "Laptop", "reported_issue": "No boot"},
            headers=headers,
        )
        tid = create.json()["id"]

        for to_status in ["IN_PROGRESS", "READY", "DELIVERED"]:
            resp = await client.post(
                f"{TICKETS_URL}/{tid}/status",
                json={"status": to_status},
                headers=headers,
            )
            assert resp.status_code == 200, f"Transition to {to_status} failed: {resp.text}"

        final = await client.get(f"{TICKETS_URL}/{tid}", headers=headers)
        assert final.json()["status"] == "DELIVERED"

    async def test_status_change_logs_activity(self, client: AsyncClient, headers, customer):
        """Create ticket, move to IN_PROGRESS, verify status_log has to_status entry."""
        create = await client.post(
            TICKETS_URL,
            json={"customer_id": customer["id"], "device_type": "Log Phone", "reported_issue": "Logs test"},
            headers=headers,
        )
        tid = create.json()["id"]

        # Change status
        status_resp = await client.post(
            f"{TICKETS_URL}/{tid}/status",
            json={"status": "IN_PROGRESS", "notes": "Starting repair"},
            headers=headers,
        )
        assert status_resp.status_code == 200
        assert status_resp.json()["status"] == "IN_PROGRESS"

        # Verify in detail
        detail = await client.get(f"{TICKETS_URL}/{tid}", headers=headers)
        logs = detail.json()["status_logs"]
        # First log is RECEIVED (from create), second is IN_PROGRESS change
        assert len(logs) >= 1
        statuses_logged = [log["to_status"] for log in logs]
        assert "IN_PROGRESS" in statuses_logged
