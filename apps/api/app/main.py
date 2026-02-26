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
from app.core.exceptions import RepairDeskException


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
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all, checkfirst=True)

    # Validate secrets
    import logging
    _logger = logging.getLogger("repairdesk.startup")
    insecure_defaults = {
        "jwt_secret": "change-me-in-production",
        "admin_password": "change_me_strong_admin_password",
    }
    for key, default_val in insecure_defaults.items():
        if getattr(settings, key) == default_val:
            if settings.is_production:
                raise RuntimeError(
                    f"FATAL: '{key}' is set to the insecure default. "
                    f"Set a strong value in .env before running in production."
                )
            _logger.warning(f"⚠️  '{key}' is using the default value. Change it before deploying.")

    yield
    await close_redis()


def create_app() -> FastAPI:
    app = FastAPI(
        title="RepairDesk API",
        description="Digital Repair Ticket Management System",
        version="1.0.0",
        docs_url="/docs" if not settings.is_production else None,
        redoc_url="/redoc" if not settings.is_production else None,
        lifespan=lifespan,
    )

    # CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
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

    # Attach sqladmin with authentication
    from app.core.db import engine
    from sqladmin.authentication import AuthenticationBackend
    from starlette.requests import Request as StarletteRequest
    from starlette.responses import RedirectResponse

    class AdminAuth(AuthenticationBackend):
        async def login(self, request: StarletteRequest) -> bool:
            form = await request.form()
            username = form.get("username", "")
            password = form.get("password", "")
            if username == settings.admin_email and password == settings.admin_password:
                request.session.update({"authenticated": True})
                return True
            return False

        async def logout(self, request: StarletteRequest) -> bool:
            request.session.clear()
            return True

        async def authenticate(self, request: StarletteRequest) -> bool:
            return request.session.get("authenticated", False)

    auth_backend = AdminAuth(secret_key=settings.jwt_secret)
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

        db_status = "connected"
        redis_status = "connected"

        try:
            async with engine.connect() as conn:
                await conn.execute(__import__("sqlalchemy").text("SELECT 1"))
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

    return app


app = create_app()
