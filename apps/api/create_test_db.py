import asyncio
import asyncpg

async def main():
    # connect to default postgres db
    conn = await asyncpg.connect('postgresql://repairdesk_user:change_me_in_prod@localhost:5432/postgres')
    try:
        await conn.execute('CREATE DATABASE repairdesk_test')
        print("Database created!")
    except asyncpg.exceptions.DuplicateDatabaseError:
        print("Database already exists!")
    await conn.close()

asyncio.run(main())
