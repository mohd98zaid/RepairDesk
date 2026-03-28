"""
Security Tests — Payment Tampering
Verifies that client-provided amounts are ignored and server computes from ticket data.
"""
import uuid
from decimal import Decimal
from unittest.mock import patch, MagicMock

import pytest
from httpx import AsyncClient

BASE = "/api/v1"

pytestmark = pytest.mark.asyncio


class TestPaymentAmountServerSide:
    """Payment amount must be computed server-side, never from client input."""

    async def test_checkout_ignores_client_amount(
        self, client: AsyncClient, shop_a_headers: dict, shop_a_ticket: dict
    ):
        """Sending amount in the body should not affect the Stripe session amount."""
        with patch("app.modules.payments.service.stripe.checkout.Session.create") as mock_create:
            mock_create.return_value = MagicMock(url="https://checkout.stripe.com/test")

            resp = await client.post(
                f"{BASE}/payments/create-checkout-session",
                json={
                    "ticket_id": shop_a_ticket["id"],
                    "description": "Repair",
                    "amount": 0.01,  # Attacker tries to pay 1 cent
                },
                headers=shop_a_headers,
            )
            assert resp.status_code == 200

            # Verify the Stripe call used server-computed amount, NOT 0.01
            call_kwargs = mock_create.call_args
            line_items = call_kwargs.kwargs.get("line_items", call_kwargs[1].get("line_items", []) if len(call_kwargs) > 1 else [])
            if line_items:
                unit_amount = line_items[0]["price_data"]["unit_amount"]
                # Ticket has no parts or charges yet, so server should reject or use 0
                # The key assertion: amount was NOT 1 (0.01 * 100)
                assert unit_amount != 1, "Server must not use client-provided amount"

    async def test_checkout_rejects_zero_amount_ticket(
        self, client: AsyncClient, shop_a_headers: dict, shop_a_ticket: dict
    ):
        """Checkout for a ticket with no parts/charges should fail."""
        with patch("app.modules.payments.service.stripe.checkout.Session.create"):
            resp = await client.post(
                f"{BASE}/payments/create-checkout-session",
                json={
                    "ticket_id": shop_a_ticket["id"],
                    "description": "Empty ticket",
                },
                headers=shop_a_headers,
            )
            # Ticket has no parts_cost and no charges, so total = 0
            assert resp.status_code in (400, 422), "Zero-amount checkout must be rejected"

    async def test_checkout_rejects_other_shop_ticket(
        self, client: AsyncClient,
        shop_b_headers: dict,
        shop_a_ticket: dict,
    ):
        """Shop B must NOT be able to initiate checkout for Shop A's ticket."""
        resp = await client.post(
            f"{BASE}/payments/create-checkout-session",
            json={
                "ticket_id": shop_a_ticket["id"],
                "description": "Steal attempt",
            },
            headers=shop_b_headers,
        )
        assert resp.status_code == 404, "Cross-tenant payment must return 404"

    async def test_checkout_requires_authentication(self, client: AsyncClient, shop_a_ticket: dict):
        """Unauthenticated checkout must be rejected."""
        resp = await client.post(
            f"{BASE}/payments/create-checkout-session",
            json={
                "ticket_id": shop_a_ticket["id"],
                "description": "No auth",
            },
        )
        assert resp.status_code == 401

    async def test_checkout_invalid_ticket_id(self, client: AsyncClient, shop_a_headers: dict):
        """Invalid UUID must be rejected."""
        resp = await client.post(
            f"{BASE}/payments/create-checkout-session",
            json={
                "ticket_id": "not-a-uuid",
                "description": "Bad ID",
            },
            headers=shop_a_headers,
        )
        assert resp.status_code in (400, 422)

    async def test_checkout_nonexistent_ticket(
        self, client: AsyncClient, shop_a_headers: dict
    ):
        """Valid UUID but nonexistent ticket must return 404."""
        resp = await client.post(
            f"{BASE}/payments/create-checkout-session",
            json={
                "ticket_id": str(uuid.uuid4()),
                "description": "Ghost ticket",
            },
            headers=shop_a_headers,
        )
        assert resp.status_code == 404


class TestWebhookSecurity:
    """Stripe webhook must validate signatures."""

    async def test_webhook_rejects_missing_secret(self, client: AsyncClient):
        """Webhook should return 400 if stripe_webhook_secret is not configured."""
        resp = await client.post(
            f"{BASE}/payments/webhook",
            content=b"{}",
            headers={"stripe-signature": "t=1,v1=sig"},
        )
        # Should return 400 because webhook secret is empty in test env
        assert resp.status_code == 400

    async def test_webhook_rejects_invalid_signature(self, client: AsyncClient):
        """Webhook with invalid signature must be rejected."""
        from app.core.config import settings
        original = settings.stripe_webhook_secret
        settings.stripe_webhook_secret = "whsec_test_123"

        from unittest.mock import patch
        import stripe as stripe_lib
        with patch.object(stripe_lib.Webhook, "construct_event", side_effect=stripe_lib.error.SignatureVerificationError("bad", "sig")):
            resp = await client.post(
                f"{BASE}/payments/webhook",
                content=b"fake",
                headers={"stripe-signature": "t=1,v1=invalid"},
            )
            assert resp.status_code == 400

        settings.stripe_webhook_secret = original
