"""
Test configuration with TRANSACTION ROLLBACK ISOLATION.

Each test runs inside a database transaction that is rolled back
after the test completes. This gives:
- Full isolation (no shared state between tests)
- Fast execution (no drop/create per test)
- Deterministic results (clean DB state every time)

Usage:
    pytest tests/ -v
    pytest tests/breaking/ -v
    pytest tests/security/ -v
"""
import os
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.db import Base, get_db
from app.main import app


# ─────────────────────────────────────────────
# Database URL resolution
# ─────────────────────────────────────────────

def _test_db_url() -> str:
    """Build a PostgreSQL URL for the test database."""
    url = os.getenv(
        "TEST_DATABASE_URL",
        "postgresql+asyncpg://repairdesk_user:change_me_in_prod@postgres:5432/repairdesk_test",
    )
    return url


# ─────────────────────────────────────────────
# Session-scoped engine & table creation
# Tables are created ONCE for the entire test session
# ─────────────────────────────────────────────

@pytest_asyncio.fixture(scope="session")
async def test_engine():
    """Create engine and tables once per test session."""
    db_url = _test_db_url()
    engine = create_async_engine(db_url, echo=False)

    # Import all models so Base.metadata knows about them
    import app.modules.shops.models      # noqa
    import app.modules.users.models      # noqa
    import app.modules.customers.models  # noqa
    import app.modules.tickets.models    # noqa
    import app.modules.inventory.models  # noqa
    import app.modules.invoices.models   # noqa
    import app.modules.billing.models    # noqa

    async with engine.begin() as conn:
        # Drop all tables at session start (clean slate)
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    # Cleanup at session end
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


# ─────────────────────────────────────────────
# Per-test transaction rollback isolation
# Each test gets its own transaction that rolls back
# ─────────────────────────────────────────────

@pytest_asyncio.fixture(scope="function")
async def db_session(test_engine):
    """
    Per-test DB session with TRANSACTION ROLLBACK.

    Creates a connection, begins a transaction, yields a session.
    After the test, the transaction is rolled back — no data persists.
    This is MUCH faster than drop/create and guarantees isolation.
    """
    # Create a connection that we'll use for the transaction
    async with test_engine.connect() as connection:
        # Begin a non-committing transaction
        transaction = await connection.begin()

        # Create a sessionmaker bound to this connection
        AsyncTestSession = async_sessionmaker(
            bind=connection,
            class_=AsyncSession,
            expire_on_commit=False,
            autocommit=False,
            autoflush=False,
        )

        async with AsyncTestSession() as session:
            # Patch the session's begin to use our transaction
            # This prevents nested transaction issues
            yield session

        # Rollback the transaction — all changes from this test are discarded
        await transaction.rollback()


# ─────────────────────────────────────────────
# HTTP test client with overridden dependencies
# ─────────────────────────────────────────────

@pytest_asyncio.fixture(scope="function")
async def client(db_session):
    """
    HTTP test client with:
    - Overridden DB dependency (uses isolated transaction session)
    - Mocked Redis (no real Redis needed)
    """
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    import unittest.mock as mock

    # Mock Redis — all operations succeed but don't persist
    mock_redis = mock.AsyncMock()
    mock_redis.setex = mock.AsyncMock(return_value=True)
    mock_redis.get = mock.AsyncMock(return_value=None)
    mock_redis.delete = mock.AsyncMock(return_value=1)
    mock_redis.ping = mock.AsyncMock(return_value=True)
    mock_redis.scan = mock.AsyncMock(return_value=["0", []])
    mock_redis.keys = mock.AsyncMock(return_value=[])

    with mock.patch("app.core.redis._redis_client", mock_redis):
        with mock.patch("app.modules.auth.service.get_redis", return_value=mock_redis):
            async with AsyncClient(
                transport=ASGITransport(app=app),
                base_url="http://test",
            ) as ac:
                yield ac

    app.dependency_overrides.clear()
