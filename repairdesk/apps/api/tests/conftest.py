"""
Test configuration.

- **Unit tests** (tests/unit/) → No DB needed; pure Python.
- **Integration tests** (tests/integration/) → Use a real PostgreSQL DB
  (same service as dev, but with a dedicated `test_` schema that is
  dropped/re-created for every test function for full isolation).

The PostgreSQL connection string is read from the DATABASE_URL env var
(automatically set inside the Docker compose service), with `repairdesk`
replaced by `repairdesk_test` as the database name.
"""
import os
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.db import Base, get_db
from app.main import app

# ─────────────────────────────────────────────
# Database URL resolution
# ─────────────────────────────────────────────

def _test_db_url() -> str:
    """
    Build a PostgreSQL URL for the test database.
    Falls back to a sensible default matching the compose service.
    """
    url = os.getenv(
        "TEST_DATABASE_URL",
        "postgresql+asyncpg://repairdesk_user:change_me_in_prod@postgres:5432/repairdesk_test",
    )
    return url


# ─────────────────────────────────────────────
# Engine & session fixtures
# ─────────────────────────────────────────────

@pytest_asyncio.fixture(scope="function")
async def test_engine():
    db_url = _test_db_url()
    engine = create_async_engine(db_url, echo=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def db_session(test_engine):
    AsyncTestSession = async_sessionmaker(
        bind=test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autocommit=False,
        autoflush=False,
    )
    async with AsyncTestSession() as session:
        yield session


@pytest_asyncio.fixture(scope="function")
async def client(db_session):
    """HTTP test client with overridden DB dependency and mocked Redis."""

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    import unittest.mock as mock
    mock_redis = mock.AsyncMock()
    mock_redis.setex = mock.AsyncMock(return_value=True)
    mock_redis.get = mock.AsyncMock(return_value=None)
    mock_redis.delete = mock.AsyncMock(return_value=1)
    mock_redis.ping = mock.AsyncMock(return_value=True)

    with mock.patch("app.core.redis._redis_client", mock_redis):
        with mock.patch("app.modules.auth.service.get_redis", return_value=mock_redis):
            async with AsyncClient(
                transport=ASGITransport(app=app),
                base_url="http://test",
            ) as ac:
                yield ac

    app.dependency_overrides.clear()
