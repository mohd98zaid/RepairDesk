import uuid
from unittest.mock import patch, MagicMock

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from tests.helpers import auth_headers
from app.core.config import settings
from app.modules.tickets.models import Ticket

pytestmark = pytest.mark.asyncio


@pytest.fixture
async def headers(client: AsyncClient):
    return await auth_headers(client)


@pytest.fixture
async def sample_ticket(client: AsyncClient, headers):
    # Create customer
    cust_resp = await client.post(
        "/api/v1/customers",
        json={"name": "Payment Customer", "phone": "+23455555555"},
        headers=headers,
    )
    assert cust_resp.status_code == 201
    customer_id = cust_resp.json()["id"]

    # Create ticket
    tick_resp = await client.post(
        "/api/v1/tickets",
        json={
            "customer_id": customer_id,
            "device_type": "Phone",
            "reported_issue": "Broken screen",
        },
        headers=headers,
    )
    assert tick_resp.status_code == 201
    return tick_resp.json()


async def test_create_checkout_session(client: AsyncClient, headers, sample_ticket):
    ticket_id = sample_ticket["id"]

    with patch("app.modules.payments.service.stripe.checkout.Session.create") as mock_create:
        mock_create.return_value = MagicMock(url="https://checkout.stripe.com/pay/cs_test_123")
        
        # Override settings just for this test
        original_secret = settings.stripe_secret_key
        settings.stripe_secret_key = "sk_test_123"

        resp = await client.post(
            "/api/v1/payments/create-checkout-session",
            json={
                "ticket_id": ticket_id,
                "amount": 5000,
                "description": "Screen Repair",
            },
            headers=headers,
        )

        settings.stripe_secret_key = original_secret

        assert resp.status_code == 200
        data = resp.json()
        assert "url" in data
        assert "checkout.stripe.com" in data["url"]


async def test_stripe_webhook_success(client: AsyncClient, headers, sample_ticket, db_session):
    # Transition ticket to READY
    ticket_id = sample_ticket["id"]
    resp = await client.post(
        f"/api/v1/tickets/{ticket_id}/status",
        json={"status": "IN_PROGRESS"},
        headers=headers,
    )
    assert resp.status_code == 200
    resp = await client.post(
        f"/api/v1/tickets/{ticket_id}/status",
        json={"status": "READY"},
        headers=headers,
    )
    assert resp.status_code == 200

    fake_event = {
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "client_reference_id": ticket_id
            }
        }
    }

    with patch("app.modules.payments.router.stripe.Webhook.construct_event", return_value=fake_event):
        with patch("app.modules.invoices.service.generate_invoice"):  # Prevent real PDF generation
            original_secret = settings.stripe_webhook_secret
            settings.stripe_webhook_secret = "whsec_test_123"

            resp = await client.post(
                "/api/v1/payments/webhook",
                content=b"fake_payload",
                headers={"stripe-signature": "t=1,v1=fake_signature"}
            )
            settings.stripe_webhook_secret = original_secret
            assert resp.status_code == 200

    # Verify ticket is now DELIVERED
    resp = await client.get(f"/api/v1/tickets/{ticket_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "DELIVERED"
