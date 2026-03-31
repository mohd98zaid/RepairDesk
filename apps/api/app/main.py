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
    # WARNING: Disabled completely to prevent asyncpg race conditions with multiple uvicorn workers
    # if not settings.is_production:
    #     from app.core.db import engine, Base
    #     import app.modules.shops.models  # noqa
    #     import app.modules.users.models  # noqa
    #     import app.modules.customers.models  # noqa
    #     import app.modules.tickets.models  # noqa
    #     import app.modules.inventory.models  # noqa
    #     import app.modules.invoices.models  # noqa
    #     import app.modules.billing.models  # noqa
    #     # async with engine.begin() as conn:
    #     #     await conn.run_sync(Base.metadata.create_all, checkfirst=True)

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

    @app.exception_handler(Exception)
    async def generic_exception_handler(request: Request, exc: Exception):
        """Catch-all handler to prevent raw 500s without CORS headers."""
        import logging, traceback
        logger = logging.getLogger("repairdesk.error")
        tb = traceback.format_exc()
        logger.error(f"Unhandled exception on {request.url.path}: {exc}\n{tb}")
        headers = {}
        origin = request.headers.get("origin", "")
        if origin and origin in settings.cors_origins:
            headers["Access-Control-Allow-Origin"] = origin
            headers["Access-Control-Allow-Credentials"] = "true"
        return JSONResponse(
            status_code=500,
            content={
                "detail": "Internal server error",
                "error_type": type(exc).__name__,
                "error_message": str(exc),
                "traceback": tb,
            },
            headers=headers,
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

    # Temporary Migration Endpoint to create ALL tables on production DB
    @app.get(f"{prefix}/debug/migrate", tags=["Health"])
    async def apply_migrations():
        """Create all tables and columns needed for production. Idempotent — safe to run multiple times."""
        from app.core.db import AsyncSessionLocal
        from sqlalchemy import text
        import traceback

        results = []
        try:
            async with AsyncSessionLocal() as session:
                # 1. Shops table
                try:
                    await session.execute(text("""
                        CREATE TABLE IF NOT EXISTS shops (
                            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                            short_id VARCHAR(12) NOT NULL DEFAULT ('SHOP-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', '') FROM 1 FOR 6))),
                            name VARCHAR(255) NOT NULL,
                            phone VARCHAR(30),
                            email VARCHAR(255),
                            logo_key TEXT,
                            address TEXT,
                            pincode VARCHAR(10),
                            gst_number VARCHAR(20),
                            logo_data TEXT,
                            plan VARCHAR(20) NOT NULL DEFAULT 'free',
                            plan_expires_at TIMESTAMPTZ,
                            is_active BOOLEAN NOT NULL DEFAULT true,
                            shop_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
                            admin_note TEXT,
                            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
                        );
                    """))
                    results.append("shops: created/exists")
                except Exception as e:
                    results.append(f"shops: error ({type(e).__name__})")

                # 2. Users table
                try:
                    await session.execute(text("""
                        DO $$ BEGIN
                            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
                                CREATE TYPE user_role AS ENUM ('OWNER', 'TECHNICIAN');
                            END IF;
                        END $$;
                    """))
                    await session.execute(text("""
                        CREATE TABLE IF NOT EXISTS users (
                            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                            shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
                            full_name VARCHAR(255) NOT NULL,
                            email VARCHAR(255) NOT NULL UNIQUE,
                            password_hash TEXT NOT NULL,
                            role user_role NOT NULL DEFAULT 'TECHNICIAN',
                            is_active BOOLEAN NOT NULL DEFAULT true,
                            avatar_data TEXT,
                            last_login_at TIMESTAMPTZ,
                            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
                        );
                    """))
                    await session.execute(text("CREATE INDEX IF NOT EXISTS idx_users_shop_id ON users(shop_id)"))
                    await session.execute(text("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)"))
                    results.append("users: created/exists")
                except Exception as e:
                    results.append(f"users: error ({type(e).__name__})")

                # 3. Invitations table
                try:
                    await session.execute(text("""
                        CREATE TABLE IF NOT EXISTS invitations (
                            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                            shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
                            email VARCHAR(255) NOT NULL,
                            role user_role NOT NULL DEFAULT 'TECHNICIAN',
                            token TEXT NOT NULL UNIQUE,
                            accepted BOOLEAN NOT NULL DEFAULT false,
                            expires_at TIMESTAMPTZ NOT NULL,
                            created_by UUID NOT NULL REFERENCES users(id),
                            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                        );
                    """))
                    results.append("invitations: created/exists")
                except Exception as e:
                    results.append(f"invitations: error ({type(e).__name__})")

                # 4. Customers table
                try:
                    await session.execute(text("""
                        CREATE TABLE IF NOT EXISTS customers (
                            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                            short_id VARCHAR(10) NOT NULL DEFAULT ('CUS-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', '') FROM 1 FOR 6))),
                            shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
                            name VARCHAR(255) NOT NULL,
                            phone VARCHAR(30),
                            email VARCHAR(255),
                            address TEXT,
                            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
                        );
                    """))
                    await session.execute(text("CREATE INDEX IF NOT EXISTS idx_customers_shop_id ON customers(shop_id)"))
                    await session.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_short_id ON customers(short_id)"))
                    results.append("customers: created/exists")
                except Exception as e:
                    results.append(f"customers: error ({type(e).__name__})")

                # 5. Tickets table
                try:
                    await session.execute(text("""
                        DO $$ BEGIN
                            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_status') THEN
                                CREATE TYPE ticket_status AS ENUM ('RECEIVED', 'DIAGNOSING', 'WAITING_PARTS', 'IN_PROGRESS', 'READY', 'DELIVERED', 'CANCELLED');
                            END IF;
                            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_priority') THEN
                                CREATE TYPE ticket_priority AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
                            END IF;
                        END $$;
                    """))
                    await session.execute(text("""
                        CREATE TABLE IF NOT EXISTS tickets (
                            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                            short_id VARCHAR(12) NOT NULL DEFAULT ('TKT-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', '') FROM 1 FOR 6))),
                            shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
                            customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
                            device_type VARCHAR(100),
                            brand VARCHAR(100),
                            model VARCHAR(100),
                            serial_number VARCHAR(100),
                            password VARCHAR(100),
                            problem_description TEXT,
                            diagnosis TEXT,
                            status ticket_status NOT NULL DEFAULT 'RECEIVED',
                            priority ticket_priority NOT NULL DEFAULT 'MEDIUM',
                            estimated_cost DECIMAL(10,2),
                            final_cost DECIMAL(10,2),
                            advance_paid DECIMAL(10,2) DEFAULT 0,
                            expected_pickup_date DATE,
                            assigned_to UUID REFERENCES users(id),
                            customer_rating INTEGER,
                            customer_feedback TEXT,
                            warranty_days INTEGER,
                            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
                        );
                    """))
                    await session.execute(text("CREATE INDEX IF NOT EXISTS idx_tickets_shop_id ON tickets(shop_id)"))
                    await session.execute(text("CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(shop_id, status)"))
                    results.append("tickets: created/exists")
                except Exception as e:
                    results.append(f"tickets: error ({type(e).__name__})")

                # 6. Ticket status logs
                try:
                    await session.execute(text("""
                        CREATE TABLE IF NOT EXISTS ticket_status_logs (
                            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                            ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
                            from_status ticket_status,
                            to_status ticket_status NOT NULL,
                            notes TEXT,
                            changed_by UUID REFERENCES users(id),
                            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                        );
                    """))
                    await session.execute(text("CREATE INDEX IF NOT EXISTS idx_status_logs_ticket_id ON ticket_status_logs(ticket_id)"))
                    results.append("ticket_status_logs: created/exists")
                except Exception as e:
                    results.append(f"ticket_status_logs: error ({type(e).__name__})")

                # 7. Inventory items
                try:
                    await session.execute(text("""
                        CREATE TABLE IF NOT EXISTS inventory_items (
                            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                            short_id VARCHAR(10) NOT NULL DEFAULT ('PRD-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', '') FROM 1 FOR 6))),
                            shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
                            name VARCHAR(255) NOT NULL,
                            sku VARCHAR(100),
                            category VARCHAR(100),
                            description TEXT,
                            quantity INTEGER NOT NULL DEFAULT 0,
                            min_quantity INTEGER NOT NULL DEFAULT 0,
                            cost_price DECIMAL(10,2),
                            selling_price DECIMAL(10,2),
                            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
                        );
                    """))
                    await session.execute(text("CREATE INDEX IF NOT EXISTS idx_inventory_shop_id ON inventory_items(shop_id)"))
                    await session.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_short_id ON inventory_items(short_id)"))
                    results.append("inventory_items: created/exists")
                except Exception as e:
                    results.append(f"inventory_items: error ({type(e).__name__})")

                # 8. Invoices
                try:
                    await session.execute(text("""
                        CREATE TABLE IF NOT EXISTS invoices (
                            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                            ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
                            invoice_number VARCHAR(50) NOT NULL UNIQUE,
                            subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
                            tax DECIMAL(10,2) NOT NULL DEFAULT 0,
                            discount DECIMAL(10,2) NOT NULL DEFAULT 0,
                            total DECIMAL(10,2) NOT NULL DEFAULT 0,
                            status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
                            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
                        );
                    """))
                    results.append("invoices: created/exists")
                except Exception as e:
                    results.append(f"invoices: error ({type(e).__name__})")

                # 9. Ticket charges
                try:
                    await session.execute(text("""
                        CREATE TABLE IF NOT EXISTS ticket_charges (
                            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                            ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
                            description TEXT NOT NULL,
                            amount DECIMAL(10,2) NOT NULL,
                            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                        );
                    """))
                    results.append("ticket_charges: created/exists")
                except Exception as e:
                    results.append(f"ticket_charges: error ({type(e).__name__})")

                # 10. Vendors
                try:
                    await session.execute(text("""
                        CREATE TABLE IF NOT EXISTS vendors (
                            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                            shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
                            name VARCHAR(255) NOT NULL,
                            contact_person VARCHAR(255),
                            phone VARCHAR(30),
                            email VARCHAR(255),
                            address TEXT,
                            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
                        );
                    """))
                    results.append("vendors: created/exists")
                except Exception as e:
                    results.append(f"vendors: error ({type(e).__name__})")

                # 11. Purchase orders
                try:
                    await session.execute(text("""
                        CREATE TABLE IF NOT EXISTS purchase_orders (
                            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                            shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
                            vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
                            order_number VARCHAR(50) NOT NULL,
                            status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
                            total_amount DECIMAL(10,2) DEFAULT 0,
                            notes TEXT,
                            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
                        );
                    """))
                    results.append("purchase_orders: created/exists")
                except Exception as e:
                    results.append(f"purchase_orders: error ({type(e).__name__})")

                # 12. Billing tables (plans, features, plan_features, subscriptions)
                try:
                    await session.execute(text("""
                        CREATE TABLE IF NOT EXISTS plans (
                            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                            name VARCHAR(100) NOT NULL UNIQUE,
                            slug VARCHAR(50) NOT NULL UNIQUE,
                            description TEXT,
                            price_monthly DECIMAL(10,2) NOT NULL DEFAULT 0,
                            price_yearly DECIMAL(10,2) NOT NULL DEFAULT 0,
                            is_active BOOLEAN NOT NULL DEFAULT true,
                            is_public BOOLEAN NOT NULL DEFAULT true,
                            sort_order INTEGER NOT NULL DEFAULT 0,
                            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
                        );
                    """))
                    await session.execute(text("""
                        CREATE TABLE IF NOT EXISTS features (
                            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                            key VARCHAR(100) NOT NULL UNIQUE,
                            name VARCHAR(200) NOT NULL,
                            description TEXT,
                            feature_type VARCHAR(20) NOT NULL DEFAULT 'boolean',
                            default_value VARCHAR(100) NOT NULL DEFAULT 'false',
                            is_active BOOLEAN NOT NULL DEFAULT true,
                            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                        );
                    """))
                    await session.execute(text("""
                        CREATE TABLE IF NOT EXISTS plan_features (
                            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                            plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
                            feature_id UUID NOT NULL REFERENCES features(id) ON DELETE CASCADE,
                            value VARCHAR(100) NOT NULL DEFAULT 'true',
                            UNIQUE(plan_id, feature_id)
                        );
                    """))
                    await session.execute(text("""
                        CREATE TABLE IF NOT EXISTS subscriptions (
                            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                            shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
                            plan_id UUID NOT NULL REFERENCES plans(id),
                            status VARCHAR(20) NOT NULL DEFAULT 'active',
                            billing_cycle VARCHAR(10) NOT NULL DEFAULT 'monthly',
                            current_period_start TIMESTAMPTZ NOT NULL,
                            current_period_end TIMESTAMPTZ NOT NULL,
                            stripe_subscription_id VARCHAR(255),
                            cancelled_at TIMESTAMPTZ,
                            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                            UNIQUE(shop_id)
                        );
                    """))
                    await session.execute(text("CREATE INDEX IF NOT EXISTS ix_subscriptions_status ON subscriptions(status)"))

                    # Seed default features
                    await session.execute(text("""
                        INSERT INTO features (key, name, description, feature_type, default_value, is_active)
                        VALUES
                            ('ticket_limit', 'Ticket Limit', 'Maximum active tickets', 'numeric', '25', true),
                            ('team_limit', 'Team Members', 'Maximum team members', 'numeric', '2', true),
                            ('inventory_limit', 'Inventory Items', 'Maximum inventory items', 'numeric', '100', true),
                            ('customer_limit', 'Customers', 'Maximum customers', 'numeric', '200', true),
                            ('analytics_access', 'Analytics Dashboard', 'Access to shop analytics', 'boolean', 'true', true),
                            ('reports_access', 'Reports', 'Access to detailed reports', 'boolean', 'false', true),
                            ('api_access', 'API Access', 'REST API access', 'boolean', 'false', true),
                            ('custom_branding', 'Custom Branding', 'Custom logo and colors', 'boolean', 'false', true),
                            ('priority_support', 'Priority Support', 'Priority customer support', 'boolean', 'false', true),
                            ('image_storage_mb', 'Image Storage', 'Storage for ticket images in MB', 'numeric', '500', true)
                        ON CONFLICT (key) DO NOTHING;
                    """))

                    # Seed default plans
                    await session.execute(text("""
                        INSERT INTO plans (name, slug, description, price_monthly, price_yearly, is_active, is_public, sort_order)
                        VALUES
                            ('Free', 'free', 'Basic plan for small shops', 0, 0, true, true, 0),
                            ('Pro', 'pro', 'Professional plan with all features', 29.99, 299.99, true, true, 1),
                            ('Enterprise', 'enterprise', 'Unlimited everything', 99.99, 999.99, true, true, 2)
                        ON CONFLICT (slug) DO NOTHING;
                    """))
                    results.append("billing tables: created/exists + seeded")
                except Exception as e:
                    results.append(f"billing tables: error ({type(e).__name__})")

                await session.commit()
            return {"status": "ok", "results": results}
        except Exception as e:
            return {"status": "error", "message": str(e), "traceback": traceback.format_exc(), "results": results}

    return app


app = create_app()
