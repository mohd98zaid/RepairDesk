from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

_db_url = settings.database_url

if not _db_url:
    raise ValueError(
        "\n"
        "====================================================================\n"
        "FATAL STARTUP ERROR: DATABASE_URL is missing or empty.\n"
        "If you are on Render, you MUST copy the 'Internal Database URL'\n"
        "from your PostgreSQL instance and paste it as the 'DATABASE_URL'\n"
        "Environment Variable in your API web service.\n"
        "====================================================================\n"
    )

_engine_kwargs = {
    "echo": settings.environment == "development",
    "pool_pre_ping": True,
    "pool_size": 10,
    "max_overflow": 20,
}

engine = create_async_engine(_db_url, **_engine_kwargs)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy ORM models."""
    pass


async def get_db() -> AsyncSession:  # type: ignore[return]
    """FastAPI dependency that provides an async DB session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
