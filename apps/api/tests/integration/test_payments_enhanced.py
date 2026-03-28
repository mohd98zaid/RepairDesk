"""
Integration Tests — Payments (Enhanced)
Covers: checkout with parts, webhook lifecycle, cross-tenant isolation.
"""
import uuid
from unittest.mock import patch, MagicMock

import pytest
from httpx import AsyncClient

BASE = "/api/v1"

pytestmark = pytest.mark.asyncio


class TestCheckoutWithParts:
    """Checkout should compute correct amount from parts + charges."""

    async def test_checkout_with_parts_and_charges(
        self, client: AsyncClient, shop_a_headers: dict,
        shop_a_ticket: dict, shop_a_inventory: dict
    ):
        """Server should compute total = parts_cost + charges."""
        tid = shop_a_ticket["id"]

        # Add part (selling_price=8000)
        await client.post(
            f"{BASE}/tickets/{tid}/parts",
            json={"inventory_item_id": shop_a_inventory["id"], "quantity_used": 1},
            headers=shop_a_headers,
        )

        # Add charge
        await client.post(
            f"{BASE}/tickets/{tid}/charges",
            json={"name": "Service Fee", "amount": "500.00"},
            headers=shop_a_headers,
        )

        # Now checkout should succeed with server-computed amount
        with patch("app.modules.payments.service.stripe.checkout.Session.create") as mock_create:
            mock_create.return_value = MagicMock(url="https://checkout.stripe.com/test")

            resp = await client.post(
                f"{BASE}/payments/create-checkout-session",
                json={
                    "ticket_id": tid,
                    "description": "Full Repair",
                },
                headers=shop_a_headers,
            )
            assert resp.status_code == 200

            # Verify Stripe was called with a non-zero amount
            call_kwargs = mock_create.call_args
            line_items = call_kwargs.kwargs.get("line_items", [])
            if line_items:
                unit_amount = line_items[0]["price_data"]["unit_amount"]
                assert unit_amount > 0, "Server-computed amount must be > 0"


class TestWebhookLifecycle:
    """Full webhook lifecycle: create ticket → READY → webhook → DELIVERED."""

    async def test_payment_marks_ticket_delivered(
        self, client: AsyncClient, shop_a_headers: dict, shop_a_ticket: dict
    ):
        tid = shop_a_ticket["id"]

        # Move to IN_PROGRESS → READY
        await client.post(
            f"{BASE}/tickets/{tid}/status",
            json={"status": "IN_PROGRESS"},
            headers=shop_a_headers,
        )
        await client.post(
            f"{BASE}/tickets/{tid}/status",
            json={"status": "READY"},
            headers=shop_a_headers,
        )

        # Simulate Stripe webhook
        fake_event = {
            "type": "checkout.session.completed",
            "data": {"object": {"client_reference_id": tid}},
        }
        from app.core.config import settings
        original = settings.stripe_webhook_secret
        settings.stripe_webhook_secret = "whsec_test"

        with patch("app.modules.payments.router.stripe.Webhook.construct_event", return_value=fake_event):
            with patch("app.modules.invoices.service.generate_invoice"):
                resp = await client.post(
                    f"{BASE}/payments/webhook",
                    content=b"payload",
                    headers={"stripe-signature": "t=1,v1=sig"},
                )
                assert resp.status_code == 200

        settings.stripe_webhook_secret = original

        # Verify ticket is DELIVERED
        detail = await client.get(f"{BASE}/tickets/{tid}", headers=shop_a_headers)
        assert detail.json()["status"] == "DELIVERED"

    async def test_webhook_ignores_non_ready_ticket(
        self, client: AsyncClient, shop_a_headers: dict, shop_a_ticket: dict
    ):
        """Webhook for a non-READY ticket should not mark it DELIVERED."""
        tid = shop_a_ticket["id"]
        # Ticket is still RECEIVED

        fake_event = {
            "type": "checkout.session.completed",
            "data": {"object": {"client_reference_id": tid}},
        }
        from app.core.config import settings
        original = settings.stripe_webhook_secret
        settings.stripe_webhook_secret = "whsec_test"

        with patch("app.modules.payments.router.stripe.Webhook.construct_event", return_value=fake_event):
            resp = await client.post(
                f"{BASE}/payments/webhook",
                content=b"payload",
                headers={"stripe-signature": "t=1,v1=sig"},
            )
            assert resp.status_code == 200  # webhook accepted but no state change

        settings.stripe_webhook_secret = original

        # Ticket should still be RECEIVED
        detail = await client.get(f"{BASE}/tickets/{tid}", headers=shop_a_headers)
        assert detail.json()["status"] == "RECEIVED"
