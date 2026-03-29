from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.redis import close_redis
from app.modules.auth.router import router as auth_router
from app.modules.shops.router import router as shops_router
from app.modules.team.router import router as team_router
from app.modules.users.router import users_router
from app.modules.customers.router import router as customers_router
from app.modules.tickets.router import router as tickets_router
from app.core.admin import (
    UserAdmin, ShopAdmin, CustomerAdmin, TicketAdmin, 
    TicketStatusLogAdmin, InventoryItemAdmin, TicketPartAdmin, InvoiceAdmin
)
from sqladmin import Admin
from app.modules.inventory.router import router as inventory_router
from app.modules.reports.router import router as reports_router
from app.modules.invoices.router import router as invoices_router
from app.modules.admin.router import router as admin_router
from app.modules.search.router import router as search_router
from app.modules.notifications.router import router as notifications_router
from app.modules.payments.router import router as payments_router
from app.modules.billing.router import router as billing_router
from app.core.exceptions import RepairDeskException

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle."""
    # Auto-create all tables on startup only in development
    if not settings.is_production:
        from app.core.db import engine, Base
        # Import all models so their metadata is registered before create_all
        import app.modules.shops.models  # noqa
        import app.modules.users.models  # noqa
        import app.modules.customers.models  # noqa
        import app.modules.tickets.models  # noqa
        import app.modules.inventory.models  # noqa
        import app.modules.invoices.models  # noqa
        import app.modules.billing.models  # noqa
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all, checkfirst=True)

    # Validate secrets
    import logging
    _logger = logging.getLogger("repairdesk.startup")
    required_secrets = {
        "jwt_secret": "A strong random string for signing JWTs",
        "admin_password": "A strong password for the super-admin panel",
        "database_url": "PostgreSQL connection string",
    }
    for key, hint in required_secrets.items():
        val = getattr(settings, key, "")
        if not val:
            if settings.is_production:
                raise RuntimeError(
                    f"FATAL: '{key}' is not set. {hint}. Set it in .env before running in production."
                )
            _logger.warning(f"⚠️  '{key}' is not set. {hint}.")

    # Strong JWT_SECRET validation
    if settings.is_production:
        jwt_val = settings.jwt_secret
        if len(jwt_val) < 32:
            raise RuntimeError(
                f"FATAL: JWT_SECRET is too short ({len(jwt_val)} chars). "
                "Minimum 32 characters required in production."
            )
        if jwt_val in ("change-me-in-production", "change_me", "secret", "changeme"):
            raise RuntimeError(
                "FATAL: JWT_SECRET is a common default value. "
                "Use: python -c \"import secrets; print(secrets.token_urlsafe(48))\""
            )
        if settings.access_token_expire_minutes > 30:
            raise RuntimeError(
                "FATAL: access_token_expire_minutes exceeds 30 minutes in production. "
                "Set it to 15 in .env."
            )

    yield
    await close_redis()


def create_app() -> FastAPI:
    app = FastAPI(
        title="RepairDesk API",
        description="Digital Repair Ticket Management System",
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    # Rate limiter
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With"],
    )

    @app.exception_handler(RepairDeskException)
    async def repairdesk_exception_handler(request: Request, exc: RepairDeskException):
        """Handle custom RepairDesk API exceptions."""
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail, "code": exc.code},
        )

    # Register routers
    prefix = "/api/v1"
    app.include_router(auth_router, prefix=prefix)
    app.include_router(shops_router, prefix=prefix)
    app.include_router(team_router, prefix=prefix)
    app.include_router(users_router, prefix=prefix)
    app.include_router(customers_router, prefix=prefix)
    app.include_router(tickets_router, prefix=prefix)
    app.include_router(inventory_router, prefix=prefix)
    app.include_router(reports_router, prefix=prefix)
    app.include_router(invoices_router, prefix=prefix)
    app.include_router(admin_router, prefix=prefix)
    app.include_router(search_router, prefix=prefix)
    app.include_router(notifications_router, prefix=prefix)
    app.include_router(payments_router, prefix=prefix)
    app.include_router(billing_router, prefix=prefix)

    # Attach sqladmin with authentication
    from app.core.db import engine
    from sqladmin.authentication import AuthenticationBackend
    from starlette.requests import Request as StarletteRequest
    from starlette.responses import RedirectResponse

    class AdminAuth(AuthenticationBackend):
        async def login(self, request: StarletteRequest) -> bool:
            import hmac as _hmac
            form = await request.form()
            username = form.get("username", "")
            password = form.get("password", "")
            if (
                settings.admin_email
                and settings.admin_password
                and _hmac.compare_digest(username.strip().lower(), settings.admin_email.lower())
                and _hmac.compare_digest(password, settings.admin_password)
            ):
                request.session.update({"authenticated": True})
                return True
            return False

        async def logout(self, request: StarletteRequest) -> bool:
            request.session.clear()
            return True

        async def authenticate(self, request: StarletteRequest) -> bool:
            return request.session.get("authenticated", False)

    import hashlib
    _admin_session_key = hashlib.sha256(f"admin-session:{settings.jwt_secret}".encode()).hexdigest()
    auth_backend = AdminAuth(secret_key=_admin_session_key)
    admin = Admin(
        app, engine,
        title="RepairDesk Database Admin",
        base_url="/api/v1/sqladmin",
        authentication_backend=auth_backend,
    )
    admin.add_view(ShopAdmin)
    admin.add_view(UserAdmin)
    admin.add_view(CustomerAdmin)
    admin.add_view(TicketAdmin)
    admin.add_view(TicketStatusLogAdmin)
    admin.add_view(InventoryItemAdmin)
    admin.add_view(TicketPartAdmin)
    admin.add_view(InvoiceAdmin)

    # Health endpoint
    @app.get(f"{prefix}/health", tags=["Health"])
    async def health_check():
        """Health check endpoint for load balancers and monitoring."""
        from app.core.db import engine
        from app.core.redis import get_redis
        from sqlalchemy import text as sa_text

        db_status = "connected"
        redis_status = "connected"

        try:
            async with engine.connect() as conn:
                await conn.execute(sa_text("SELECT 1"))
        except Exception:
            db_status = "error"

        try:
            r = await get_redis()
            await r.ping()
        except Exception:
            redis_status = "error"

        is_healthy = db_status == "connected" and redis_status == "connected"
        return JSONResponse(
            status_code=200 if is_healthy else 503,
            content={"status": "ok" if is_healthy else "degraded", "db": db_status, "redis": redis_status},
        )

    # Analytics verification endpoint
    @app.get(f"{prefix}/analytics/verify", tags=["Health"])
    async def analytics_verify():
        """Verify that subscription analytics tables exist and return counts."""
        from app.core.db import AsyncSessionLocal
        from sqlalchemy import text as sa_text, func, select

        checks = {}
        all_ok = True

        async with AsyncSessionLocal() as session:
            # Check plans table
            try:
                result = await session.execute(select(func.count()).select_from(sa_text("plans")))
                checks["plans"] = {"exists": True, "count": result.scalar_one()}
            except Exception as e:
                checks["plans"] = {"exists": False, "error": str(e)}
                all_ok = False

            # Check features table
            try:
                result = await session.execute(select(func.count()).select_from(sa_text("features")))
                checks["features"] = {"exists": True, "count": result.scalar_one()}
            except Exception as e:
                checks["features"] = {"exists": False, "error": str(e)}
                all_ok = False

            # Check subscriptions table
            try:
                result = await session.execute(select(func.count()).select_from(sa_text("subscriptions")))
                checks["subscriptions"] = {"exists": True, "count": result.scalar_one()}
            except Exception as e:
                checks["subscriptions"] = {"exists": False, "error": str(e)}
                all_ok = False

            # Check shops with plan field
            try:
                result = await session.execute(
                    select(func.count()).select_from(sa_text("shops")).where(
                        sa_text("shops.plan IS NOT NULL")
                    )
                )
                checks["shops_with_plan"] = result.scalar_one()
            except Exception as e:
                checks["shops_with_plan"] = {"error": str(e)}

        return JSONResponse(
            status_code=200 if all_ok else 503,
            content={"status": "ok" if all_ok else "degraded", "checks": checks},
        )

    return app


app = create_app()
