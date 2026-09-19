import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.core.config import settings
from app.core.db import Base

# Import all models so Alembic can detect them
from app.modules.shops.models import Shop  # noqa
from app.modules.users.models import Invitation, User  # noqa
from app.modules.customers.models import Customer  # noqa
from app.modules.tickets.models import Ticket, TicketImage, TicketStatusLog  # noqa
from app.modules.inventory.models import InventoryItem, TicketPart  # noqa
from app.modules.invoices.models import Invoice  # noqa
from app.modules.billing.models import Plan, Feature, PlanFeature, Subscription  # noqa
from app.modules.activity.models import ActivityLog  # noqa

config = context.config
if settings.database_url:
    config.set_main_option("sqlalchemy.url", settings.database_url.replace("%", "%%"))


if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    from sqlalchemy.ext.asyncio import create_async_engine
    _connect_args = {}
    if ":6543" in settings.database_url or "pooler.supabase.com" in settings.database_url:
        _connect_args["statement_cache_size"] = 0

    connectable = create_async_engine(
        settings.database_url,
        poolclass=pool.NullPool,
        connect_args=_connect_args,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
