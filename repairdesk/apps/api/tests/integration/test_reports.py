"""
Integration tests — Reports API
Covers: daily report (today, specific date), range report (valid, field check)
"""
import pytest
from datetime import date
from httpx import AsyncClient
from tests.helpers import auth_headers

REPORTS_URL = "/api/v1/reports"
CUSTOMERS_URL = "/api/v1/customers"
TICKETS_URL = "/api/v1/tickets"


@pytest.fixture
async def headers(client: AsyncClient):
    return await auth_headers(client)


class TestDailyReport:
    async def test_daily_today_empty(self, client: AsyncClient, headers):
        resp = await client.get(f"{REPORTS_URL}/daily", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "date" in data
        assert "tickets_created" in data
        assert "total_revenue" in data
        assert "net_profit" in data
        assert "tickets_by_status" in data
        assert "avg_ticket_value" in data

    async def test_daily_specific_date(self, client: AsyncClient, headers):
        resp = await client.get(f"{REPORTS_URL}/daily", params={"report_date": "2026-01-01"}, headers=headers)
        assert resp.status_code == 200
        assert resp.json()["date"] == "2026-01-01"

    async def test_daily_zero_values_when_no_activity(self, client: AsyncClient, headers):
        resp = await client.get(f"{REPORTS_URL}/daily", params={"report_date": "2020-01-01"}, headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["tickets_created"] == 0
        assert float(data["total_revenue"]) == 0.0

    async def test_daily_requires_auth(self, client: AsyncClient):
        resp = await client.get(f"{REPORTS_URL}/daily")
        assert resp.status_code == 401

    async def test_daily_counts_created_tickets(self, client: AsyncClient, headers):
        today = date.today().isoformat()
        # Create a ticket
        cust = await client.post(
            CUSTOMERS_URL,
            json={"name": "Report Customer", "phone": "+2348088888888"},
            headers=headers,
        )
        await client.post(
            TICKETS_URL,
            json={"customer_id": cust.json()["id"], "device_type": "Test", "reported_issue": "Test"},
            headers=headers,
        )
        resp = await client.get(f"{REPORTS_URL}/daily", params={"report_date": today}, headers=headers)
        assert resp.status_code == 200
        assert resp.json()["tickets_created"] >= 1


class TestRangeReport:
    async def test_range_returns_expected_shape(self, client: AsyncClient, headers):
        resp = await client.get(
            f"{REPORTS_URL}/range",
            params={"from_date": "2026-01-01", "to_date": "2026-01-03"},
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "from_date" in data
        assert "to_date" in data
        assert "days" in data
        assert "totals" in data
        assert isinstance(data["days"], list)

    async def test_range_day_count(self, client: AsyncClient, headers):
        resp = await client.get(
            f"{REPORTS_URL}/range",
            params={"from_date": "2026-01-01", "to_date": "2026-01-07"},
            headers=headers,
        )
        assert resp.status_code == 200
        # Should have 7 days
        assert len(resp.json()["days"]) == 7

    async def test_range_totals_are_strings(self, client: AsyncClient, headers):
        """Decimal fields should be returned as strings for precision."""
        resp = await client.get(
            f"{REPORTS_URL}/range",
            params={"from_date": "2026-01-01", "to_date": "2026-01-02"},
            headers=headers,
        )
        totals = resp.json()["totals"]
        assert isinstance(totals["total_revenue"], str)
        assert isinstance(totals["net_profit"], str)

    async def test_range_requires_auth(self, client: AsyncClient):
        resp = await client.get(f"{REPORTS_URL}/range", params={"from_date": "2026-01-01", "to_date": "2026-01-01"})
        assert resp.status_code == 401

    async def test_range_missing_from_date_returns_422(self, client: AsyncClient, headers):
        resp = await client.get(f"{REPORTS_URL}/range", headers=headers)
        assert resp.status_code == 422
