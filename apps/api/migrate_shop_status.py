import asyncio
from app.core.db import engine
from sqlalchemy import text

async def migrate():
    async with engine.begin() as conn:
        await conn.execute(text("ALTER TABLE shops ADD COLUMN IF NOT EXISTS shop_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'"))
        await conn.execute(text("ALTER TABLE shops ADD COLUMN IF NOT EXISTS admin_note TEXT"))
        print("Migration done: shop_status and admin_note columns added")

asyncio.run(migrate())
