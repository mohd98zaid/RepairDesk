"""
RepairDesk Seed Script
======================
Creates a demo shop + admin account + sample data for testing.

Usage (inside the api container):
    python scripts/seed.py

Or via Makefile:
    make seed

Admin credentials:
    Email   : admin@repairdesk.demo
    Password: Admin1234
"""

import asyncio
import sys
import os

# Ensure the app package is importable when run from /app/
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from decimal import Decimal
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.core.db import AsyncSessionLocal, engine, Base
from app.core.security import hash_password
from app.modules.shops.models import Shop
from app.modules.users.models import User
from app.modules.customers.models import Customer
from app.modules.tickets.models import Ticket, TicketStatusLog


# ── Seed data ─────────────────────────────────────────────────────────────────

ADMIN_EMAIL    = "admin@repairdesk.demo"
ADMIN_PASSWORD = "Admin1234"
ADMIN_NAME     = "Admin User"
SHOP_NAME      = "RepairDesk Demo Shop"

TECH_EMAIL     = "tech@repairdesk.demo"
TECH_PASSWORD  = "Tech1234"
TECH_NAME      = "Jane Technician"

SAMPLE_CUSTOMERS = [
    {"name": "Emeka Okafor",  "phone": "+2348012345678", "email": "emeka@example.ng"},
    {"name": "Fatima Al-Hassan", "phone": "+2348087654321", "email": None},
]

SAMPLE_TICKETS = [
    {
        "device_type":    "Smartphone",
        "device_model":   "iPhone 14 Pro",
        "reported_issue": "Screen cracked, touch not responding on left side",
        "status":         "IN_PROGRESS",
        "estimated_cost": Decimal("35000"),
    },
    {
        "device_type":    "Laptop",
        "device_model":   "HP Pavilion 15",
        "reported_issue": "Won't power on, fan spins for 2 seconds then stops",
        "status":         "RECEIVED",
        "estimated_cost": Decimal("18000"),
    },
]


# ── Seeder ────────────────────────────────────────────────────────────────────

async def seed() -> None:
    async with AsyncSessionLocal() as db:
        # Check if already seeded
        existing = await db.execute(select(User).where(User.email == ADMIN_EMAIL))
        if existing.scalar_one_or_none():
            print("✓ Seed data already present — skipping.")
            return

        # 1. Create shop
        shop = Shop(name=SHOP_NAME, email=ADMIN_EMAIL, phone="+23480000000", plan="pro")
        db.add(shop)
        await db.flush()
        print(f"✓ Shop created: {SHOP_NAME} (id={shop.id})")

        # 2. Create admin/owner
        admin = User(
            shop_id=shop.id,
            full_name=ADMIN_NAME,
            email=ADMIN_EMAIL,
            password_hash=hash_password(ADMIN_PASSWORD),
            role="OWNER",
        )
        db.add(admin)
        await db.flush()
        print(f"✓ Admin created: {ADMIN_EMAIL}  /  password: {ADMIN_PASSWORD}")

        # 3. Create technician
        tech = User(
            shop_id=shop.id,
            full_name=TECH_NAME,
            email=TECH_EMAIL,
            password_hash=hash_password(TECH_PASSWORD),
            role="TECHNICIAN",
        )
        db.add(tech)
        await db.flush()
        print(f"✓ Technician created: {TECH_EMAIL}  /  password: {TECH_PASSWORD}")

        # 4. Create customers
        customers = []
        for c_data in SAMPLE_CUSTOMERS:
            c = Customer(shop_id=shop.id, **c_data)
            db.add(c)
            customers.append(c)
        await db.flush()
        print(f"✓ {len(customers)} sample customers created")

        # 5. Create tickets
        for i, t_data in enumerate(SAMPLE_TICKETS):
            status = t_data.pop("status")
            ticket = Ticket(
                shop_id=shop.id,
                customer_id=customers[i % len(customers)].id,
                created_by=admin.id,
                assigned_to=tech.id,
                ticket_number=i + 1,
                **t_data,
                status="RECEIVED",
            )
            db.add(ticket)
            await db.flush()

            # Initial log
            db.add(TicketStatusLog(
                ticket_id=ticket.id,
                from_status=None,
                to_status="RECEIVED",
                changed_by=admin.id,
            ))

            # Advance to desired status
            if status != "RECEIVED":
                db.add(TicketStatusLog(
                    ticket_id=ticket.id,
                    from_status="RECEIVED",
                    to_status=status,
                    changed_by=tech.id,
                    notes="Initial status update from seed",
                ))
                ticket.status = status

        await db.flush()
        print(f"✓ {len(SAMPLE_TICKETS)} sample tickets created")

        await db.commit()
        print("\n🎉 Seed complete!")
        print(f"\n  Admin Login")
        print(f"  ─────────────────────────────")
        print(f"  Email   : {ADMIN_EMAIL}")
        print(f"  Password: {ADMIN_PASSWORD}")
        print(f"  Role    : OWNER")
        print(f"\n  Tech Login")
        print(f"  ─────────────────────────────")
        print(f"  Email   : {TECH_EMAIL}")
        print(f"  Password: {TECH_PASSWORD}")
        print(f"  Role    : TECHNICIAN")


if __name__ == "__main__":
    asyncio.run(seed())
