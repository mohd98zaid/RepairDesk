import asyncio
import uuid
import secrets
import sys
import os
from decimal import Decimal

# Add current path or specific path if needed, so that 'app.x' can be imported
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

os.environ["DATABASE_URL"] = "postgresql+asyncpg://repairdesk_user:change_me_in_prod@localhost:5432/repairdesk"

from app.core.db import AsyncSessionLocal
from app.modules.shops.models import Shop
from app.modules.users.models import User
from app.modules.customers.models import Customer
from app.modules.tickets.models import Ticket
from app.modules.inventory.models import InventoryItem
from app.core.security import hash_password

async def seed():
    async with AsyncSessionLocal() as db:
        for i in range(1, 7):
            shop_id = uuid.uuid4()
            rand_prefix = secrets.token_hex(2)
            
            shop = Shop(
                id=shop_id,
                name=f"Dummy Shop {rand_prefix} {i}",
                email=f"dummy_{rand_prefix}_{i}@example.com",
                phone=f"123{rand_prefix}456789{i}",
                plan="free",
                shop_status="ACTIVE"
            )
            db.add(shop)
            await db.flush()
            
            user_id = uuid.uuid4()
            user = User(
                id=user_id,
                shop_id=shop_id,
                full_name=f"Owner {rand_prefix} {i}",
                email=f"owner_{rand_prefix}_{i}@example.com",
                password_hash=hash_password("password123"),
                role="OWNER",
                is_active=True
            )
            db.add(user)
            await db.flush()
            
            customer_id = uuid.uuid4()
            customer = Customer(
                id=customer_id,
                shop_id=shop_id,
                name=f"Customer {rand_prefix} {i}",
                phone=f"987{rand_prefix}654321{i}"
            )
            db.add(customer)
            await db.flush()
            
            inv_id = uuid.uuid4()
            inv = InventoryItem(
                id=inv_id,
                shop_id=shop_id,
                name=f"Screen Protector {rand_prefix}",
                purchase_price=Decimal("5.00"),
                selling_price=Decimal("15.00"),
                quantity=10,
                low_stock_threshold=2
            )
            db.add(inv)
            await db.flush()

            ticket_id = uuid.uuid4()
            ticket = Ticket(
                id=ticket_id,
                shop_id=shop_id,
                customer_id=customer_id,
                ticket_number=1000 + i,
                device_type="Smartphone",
                reported_issue="Broken Screen",
                status="RECEIVED",
                parts_cost=Decimal("0.00"),
                created_by=user_id
            )
            db.add(ticket)
            
        try:
            await db.commit()
            print("Successfully created 6 dummy shops with data.")
        except Exception as e:
            await db.rollback()
            import traceback
            traceback.print_exc()
            print(f"Error creating dummy shops: {e}")

if __name__ == "__main__":
    asyncio.run(seed())
