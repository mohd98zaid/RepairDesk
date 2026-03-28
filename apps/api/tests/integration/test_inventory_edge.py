"""
Integration Tests — Inventory Edge Cases & Race Conditions
"""
import uuid
import pytest
import asyncio
from httpx import AsyncClient

BASE = "/api/v1"

pytestmark = pytest.mark.asyncio


class TestInventoryEdgeCases:
    """Edge cases for inventory operations."""

    async def test_update_with_empty_body_succeeds(
        self, client: AsyncClient, shop_a_headers: dict, shop_a_inventory: dict
    ):
        """PATCH with empty body should return current item unchanged."""
        resp = await client.patch(
            f"{BASE}/inventory/{shop_a_inventory['id']}",
            json={},
            headers=shop_a_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == shop_a_inventory["name"]

    async def test_update_nonexistent_item(
        self, client: AsyncClient, shop_a_headers: dict
    ):
        resp = await client.patch(
            f"{BASE}/inventory/{uuid.uuid4()}",
            json={"name": "Ghost"},
            headers=shop_a_headers,
        )
        assert resp.status_code == 404

    async def test_stock_adjustment_zero_delta(
        self, client: AsyncClient, shop_a_headers: dict, shop_a_inventory: dict
    ):
        """Zero delta should succeed but not change quantity."""
        original_qty = shop_a_inventory["quantity"]
        resp = await client.post(
            f"{BASE}/inventory/{shop_a_inventory['id']}/stock",
            json={"delta": 0},
            headers=shop_a_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["quantity"] == original_qty

    async def test_delete_nonexistent_item(
        self, client: AsyncClient, shop_a_headers: dict
    ):
        resp = await client.delete(
            f"{BASE}/inventory/{uuid.uuid4()}",
            headers=shop_a_headers,
        )
        assert resp.status_code == 404

    async def test_list_pagination(
        self, client: AsyncClient, shop_a_headers: dict
    ):
        """Pagination parameters should work correctly."""
        resp = await client.get(
            f"{BASE}/inventory",
            params={"page": 1, "per_page": 5},
            headers=shop_a_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["page"] == 1
        assert data["per_page"] == 5


class TestInventoryPartsIntegration:
    """Parts removal should restore stock correctly."""

    async def test_remove_part_restores_stock(
        self, client: AsyncClient, shop_a_headers: dict,
        shop_a_ticket: dict, shop_a_inventory: dict
    ):
        # Add part
        add_resp = await client.post(
            f"{BASE}/tickets/{shop_a_ticket['id']}/parts",
            json={"inventory_item_id": shop_a_inventory["id"], "quantity_used": 2},
            headers=shop_a_headers,
        )
        assert add_resp.status_code == 201
        part_id = add_resp.json()["id"]

        # Verify stock reduced
        item = await client.get(
            f"{BASE}/inventory/{shop_a_inventory['id']}",
            headers=shop_a_headers,
        )
        assert item.json()["quantity"] == 8  # 10 - 2

        # Remove part
        await client.delete(
            f"{BASE}/tickets/{shop_a_ticket['id']}/parts/{part_id}",
            headers=shop_a_headers,
        )

        # Verify stock restored
        item = await client.get(
            f"{BASE}/inventory/{shop_a_inventory['id']}",
            headers=shop_a_headers,
        )
        assert item.json()["quantity"] == 10  # restored
