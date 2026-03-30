"""
Quick migration: adds customer_rating and customer_feedback columns to the tickets table.
Run with: python add_rating_columns.py
"""
import asyncio
from sqlalchemy import text
from app.core.db import engine


async def run():
    async with engine.begin() as conn:
        print("Adding customer_rating and customer_feedback columns to tickets...")
        await conn.execute(text("""
            ALTER TABLE tickets
            ADD COLUMN IF NOT EXISTS customer_rating INTEGER,
            ADD COLUMN IF NOT EXISTS customer_feedback TEXT;
        """))
        print("Done! Columns added successfully.")


if __name__ == "__main__":
    asyncio.run(run())
