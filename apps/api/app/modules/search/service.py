import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, cast, String

from app.modules.tickets.models import Ticket
from app.modules.customers.models import Customer
from app.modules.inventory.models import InventoryItem


class SearchService:
    @staticmethod
    async def global_search(db: AsyncSession, shop_id: uuid.UUID, query: str, limit: int = 5) -> dict:
        """
        Searches across tickets, customers, and inventory for the given shop.
        """
        if not query or len(query.strip()) < 1:
            return {"tickets": [], "customers": [], "inventory": []}

        search_term = f"%{query.strip()}%"

        # 1. Search Tickets (by ticket_number, device type, or reported issue)
        ticket_stmt = (
            select(Ticket)
            .where(Ticket.shop_id == shop_id, Ticket.is_deleted == False)
            .where(
                or_(
                    cast(Ticket.ticket_number, String).ilike(search_term),
                    Ticket.device_type.ilike(search_term),
                    Ticket.device_model.ilike(search_term),
                    Ticket.reported_issue.ilike(search_term),
                )
            )
            .limit(limit)
        )
        tickets_result = await db.execute(ticket_stmt)
        tickets = tickets_result.scalars().all()

        # 2. Search Customers (by name, email, or phone)
        customer_stmt = (
            select(Customer)
            .where(Customer.shop_id == shop_id, Customer.is_deleted == False)
            .where(
                or_(
                    Customer.name.ilike(search_term),
                    Customer.email.ilike(search_term),
                    Customer.phone.ilike(search_term),
                )
            )
            .limit(limit)
        )
        customers_result = await db.execute(customer_stmt)
        customers = customers_result.scalars().all()

        # 3. Search Inventory (by name, sku, or description)
        inventory_stmt = (
            select(InventoryItem)
            .where(InventoryItem.shop_id == shop_id, InventoryItem.is_deleted == False)
            .where(
                or_(
                    InventoryItem.name.ilike(search_term),
                    InventoryItem.sku.ilike(search_term),
                    InventoryItem.description.ilike(search_term),
                )
            )
            .limit(limit)
        )
        inventory_result = await db.execute(inventory_stmt)
        inventory = inventory_result.scalars().all()

        return {
            "tickets": [
                {
                    "id": str(t.id),
                    "ticket_number": t.ticket_number,
                    "device_type": t.device_type,
                    "device_model": t.device_model,
                    "reported_issue": t.reported_issue,
                    "status": t.status,
                }
                for t in tickets
            ],
            "customers": [
                {
                    "id": str(c.id),
                    "name": c.name,
                    "phone": c.phone,
                    "email": c.email,
                }
                for c in customers
            ],
            "inventory": [
                {
                    "id": str(i.id),
                    "name": i.name,
                    "sku": i.sku,
                    "quantity": i.quantity,
                    "selling_price": str(i.selling_price),
                }
                for i in inventory
            ],
        }
