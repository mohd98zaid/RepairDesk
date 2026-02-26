import pytest
from httpx import AsyncClient
from tests.helpers import auth_headers

pytestmark = pytest.mark.asyncio


@pytest.fixture
async def headers(client: AsyncClient):
    return await auth_headers(client)


@pytest.fixture
async def sample_data(client: AsyncClient, headers):
    # Customer
    c_resp = await client.post(
        "/api/v1/customers",
        json={"name": "Searchable", "phone": "+23499999999"},
        headers=headers,
    )
    assert c_resp.status_code == 201
    cid = c_resp.json()["id"]

    # Ticket
    t_resp = await client.post(
        "/api/v1/tickets",
        json={
            "customer_id": cid,
            "device_type": "Laptop Search",
            "reported_issue": "Cannot boot",
        },
        headers=headers,
    )
    assert t_resp.status_code == 201
    ticket_num = t_resp.json()["ticket_number"]

    # Inventory
    i_resp = await client.post(
        "/api/v1/inventory",
        json={
            "name": "Searchable Screen",
            "sku": "SCR-12345",
            "purchase_price": "1000",
            "selling_price": "2000",
            "quantity": 10,
            "low_stock_threshold": 5,
        },
        headers=headers,
    )
    assert i_resp.status_code == 201
    
    return {"customer_id": cid, "ticket_number": ticket_num, "item_name": "Searchable Screen"}


async def test_global_search_success(client: AsyncClient, headers, sample_data):
    # Search for customer
    customer_resp = await client.get("/api/v1/search?query=Searchable", headers=headers)
    assert customer_resp.status_code == 200
    data = customer_resp.json()
    assert len(data["customers"]) >= 1
    assert data["customers"][0]["name"] == "Searchable"
    assert len(data["inventory"]) >= 1
    assert data["inventory"][0]["name"] == "Searchable Screen"

    # Search for ticket by number
    ticket_num = sample_data["ticket_number"]
    ticket_resp = await client.get(f"/api/v1/search?query={ticket_num}", headers=headers)
    assert ticket_resp.status_code == 200
    data = ticket_resp.json()
    assert len(data["tickets"]) >= 1
    assert data["tickets"][0]["ticket_number"] == ticket_num
