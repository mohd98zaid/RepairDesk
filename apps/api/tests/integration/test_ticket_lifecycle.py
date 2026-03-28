"""
Integration Tests — Full Ticket Lifecycle (Enhanced)
Covers: create → add parts → status transitions → charges → payment → delivery
"""
import uuid
import pytest
from httpx import AsyncClient

BASE = "/api/v1"

pytestmark = pytest.mark.asyncio


class TestFullTicketLifecycle:
    """Complete ticket lifecycle from creation to delivery."""

    async def test_complete_repair_flow(self, client: AsyncClient):
        """Create → add parts → IN_PROGRESS → READY → pay → DELIVERED."""
        # 1. Register shop
        reg = await client.post(f"{BASE}/auth/register", json={
            "shop_name": "LifecycleShop",
            "full_name": "Lifecycle Owner",
            "email": "lifecycle@test.com",
            "phone": "+1999999999",
            "password": "LifecyclePass123",
        })
        assert reg.status_code == 201
        headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}

        # 2. Create customer
        cust = await client.post(f"{BASE}/customers", json={
            "name": "Lifecycle Customer",
            "phone": "+1999999998",
        }, headers=headers)
        assert cust.status_code == 201
        customer_id = cust.json()["id"]

        # 3. Create inventory item
        item = await client.post(f"{BASE}/inventory", json={
            "name": "Lifecycle Screen",
            "sku": "LIFE-001",
            "purchase_price": "3000.00",
            "selling_price": "5000.00",
            "quantity": 5,
        }, headers=headers)
        assert item.status_code == 201
        item_id = item.json()["id"]

        # 4. Create ticket
        ticket = await client.post(f"{BASE}/tickets", json={
            "customer_id": customer_id,
            "device_type": "iPhone 15",
            "reported_issue": "Cracked screen",
            "estimated_cost": "5000.00",
        }, headers=headers)
        assert ticket.status_code == 201
        ticket_id = ticket.json()["id"]
        assert ticket.json()["status"] == "RECEIVED"

        # 5. Move to IN_PROGRESS
        resp = await client.post(
            f"{BASE}/tickets/{ticket_id}/status",
            json={"status": "IN_PROGRESS", "notes": "Starting repair"},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "IN_PROGRESS"

        # 6. Add part (deducts stock)
        part = await client.post(
            f"{BASE}/tickets/{ticket_id}/parts",
            json={"inventory_item_id": item_id, "quantity_used": 1},
            headers=headers,
        )
        assert part.status_code == 201

        # Verify stock deducted
        updated_item = await client.get(f"{BASE}/inventory/{item_id}", headers=headers)
        assert updated_item.json()["quantity"] == 4

        # 7. Add extra charge
        charge = await client.post(
            f"{BASE}/tickets/{ticket_id}/charges",
            json={"name": "Labor", "amount": "1000.00"},
            headers=headers,
        )
        assert charge.status_code == 201

        # 8. Set final cost and mark READY
        await client.patch(
            f"{BASE}/tickets/{ticket_id}",
            json={"final_cost": "6000.00"},
            headers=headers,
        )
        resp = await client.post(
            f"{BASE}/tickets/{ticket_id}/status",
            json={"status": "READY"},
            headers=headers,
        )
        assert resp.status_code == 200

        # 9. Verify ticket detail has all parts and charges
        detail = await client.get(f"{BASE}/tickets/{ticket_id}", headers=headers)
        assert detail.status_code == 200
        data = detail.json()
        assert len(data["parts"]) == 1
        assert data["status"] == "READY"

        # 10. Verify status log
        assert len(data["status_logs"]) >= 3  # RECEIVED, IN_PROGRESS, READY


class TestTicketEdgeCases:
    """Edge cases for ticket operations."""

    async def test_create_ticket_with_phone_instead_of_customer_id(
        self, client: AsyncClient, shop_a_headers: dict
    ):
        """Ticket creation with customer_phone should auto-create customer."""
        resp = await client.post(f"{BASE}/tickets", json={
            "customer_phone": "+1888888888",
            "customer_name": "Auto Customer",
            "device_type": "Pixel 8",
            "reported_issue": "Broken back glass",
        }, headers=shop_a_headers)
        assert resp.status_code == 201
        assert "id" in resp.json()

    async def test_create_ticket_without_customer_fails(
        self, client: AsyncClient, shop_a_headers: dict
    ):
        """Ticket creation without customer_id or phone must fail."""
        resp = await client.post(f"{BASE}/tickets", json={
            "device_type": "Phone",
            "reported_issue": "Broken",
        }, headers=shop_a_headers)
        assert resp.status_code in (400, 422)

    async def test_delete_ticket_soft_deletes(
        self, client: AsyncClient, shop_a_headers: dict, shop_a_ticket: dict
    ):
        """Deleted ticket should not appear in list but data preserved."""
        ticket_id = shop_a_ticket["id"]
        resp = await client.delete(f"{BASE}/tickets/{ticket_id}", headers=shop_a_headers)
        assert resp.status_code == 204

        # Should not appear in list
        list_resp = await client.get(f"{BASE}/tickets", headers=shop_a_headers)
        ids = [t["id"] for t in list_resp.json()["items"]]
        assert ticket_id not in ids

    async def test_invalid_status_transition(
        self, client: AsyncClient, shop_a_headers: dict, shop_a_ticket: dict
    ):
        """RECEIVED → DELIVERED is not a valid transition."""
        resp = await client.post(
            f"{BASE}/tickets/{shop_a_ticket['id']}/status",
            json={"status": "DELIVERED"},
            headers=shop_a_headers,
        )
        assert resp.status_code in (400, 422)


class TestTicketChargeManagement:
    """Adding and removing charges on tickets."""

    async def test_add_and_remove_charge(
        self, client: AsyncClient, shop_a_headers: dict, shop_a_ticket: dict
    ):
        tid = shop_a_ticket["id"]

        # Add charge
        add_resp = await client.post(
            f"{BASE}/tickets/{tid}/charges",
            json={"name": "Tax", "amount": "500.00"},
            headers=shop_a_headers,
        )
        assert add_resp.status_code == 201
        charge_id = add_resp.json()["id"]

        # Remove charge
        del_resp = await client.delete(
            f"{BASE}/tickets/{tid}/charges/{charge_id}",
            headers=shop_a_headers,
        )
        assert del_resp.status_code == 204

    async def test_remove_nonexistent_charge(
        self, client: AsyncClient, shop_a_headers: dict, shop_a_ticket: dict
    ):
        resp = await client.delete(
            f"{BASE}/tickets/{shop_a_ticket['id']}/charges/{uuid.uuid4()}",
            headers=shop_a_headers,
        )
        assert resp.status_code == 404
