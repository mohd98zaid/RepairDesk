import asyncio
from sqlalchemy import text
from app.core.db import engine

async def run_migrations():
    async with engine.begin() as conn:
        print("Creating vendors table...")
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS vendors (
                id UUID PRIMARY KEY,
                shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                contact_name VARCHAR(255),
                email VARCHAR(255),
                phone VARCHAR(50),
                address TEXT,
                website VARCHAR(255),
                notes TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
            );
            CREATE INDEX IF NOT EXISTS ix_vendors_shop_id ON vendors (shop_id);
        """))

        print("Creating purchase_orders table...")
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS purchase_orders (
                id UUID PRIMARY KEY,
                shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
                vendor_id UUID NOT NULL REFERENCES vendors(id),
                po_number VARCHAR(100) NOT NULL,
                status VARCHAR(50) NOT NULL,
                total_amount NUMERIC(10, 2) NOT NULL,
                notes TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
            );
            CREATE INDEX IF NOT EXISTS ix_purchase_orders_shop_id ON purchase_orders (shop_id);
            CREATE INDEX IF NOT EXISTS ix_purchase_orders_po_number ON purchase_orders (po_number);
        """))

        print("Creating purchase_order_items table...")
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS purchase_order_items (
                id UUID PRIMARY KEY,
                po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
                inventory_item_id UUID NOT NULL REFERENCES inventory_items(id),
                quantity INTEGER NOT NULL,
                unit_cost NUMERIC(10, 2) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
            );
            CREATE INDEX IF NOT EXISTS ix_purchase_order_items_po_id ON purchase_order_items (po_id);
        """))
        
        print("Migrations complete!")

if __name__ == "__main__":
    asyncio.run(run_migrations())
