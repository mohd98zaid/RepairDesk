"""
Super-Admin API Router
----------------------
Platform-level admin endpoints. Credentials are stored in env vars (not DB).
All endpoints require a valid admin JWT (role=SUPER_ADMIN).
"""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_db
from app.modules.customers.models import Customer
from app.modules.inventory.models import InventoryItem
from app.modules.shops.models import Shop
from app.modules.tickets.models import Ticket
from app.modules.users.models import User
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

router = APIRouter(prefix="/admin", tags=["Super-Admin"])

_ADMIN_TOKEN_EXPIRE_HOURS = 8
_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/admin/auth/login", auto_error=False)


# ─────────────────────────── Auth helpers ───────────────────────────

def _create_admin_token() -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=_ADMIN_TOKEN_EXPIRE_HOURS)
    return jwt.encode(
        {"sub": "super_admin", "role": "SUPER_ADMIN", "exp": expire},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )


async def _get_admin_user(token: str = Depends(_oauth2_scheme)) -> dict:
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        if payload.get("role") != "SUPER_ADMIN":
            raise HTTPException(status_code=403, detail="Admin access required")
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired admin token")


AdminUser = Depends(_get_admin_user)


# ─────────────────────────── Migrations (TEMPORARY) ───────────────────────────

@router.get("/run-migrations")
async def run_migrations_endpoint(command: str = "upgrade head"):
    """Run alembic command and return the output."""
    import subprocess
    import sys
    import os
    import shlex
    try:
        alembic_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
        executable = sys.executable
        args = shlex.split(command)
        result = subprocess.run([executable, "-m", "alembic"] + args, cwd=alembic_dir, capture_output=True, text=True)
        return {
            "cwd": alembic_dir,
            "executable": executable,
            "returncode": result.returncode,
            "stdout": result.stdout,
            "stderr": result.stderr,
        }
    except Exception as e:
        return {"error": str(e)}


# ─────────────────────────── Login ───────────────────────────

@router.post("/auth/login")
@limiter.limit("5/minute")
async def admin_login(request: Request, body: dict):
    """Authenticate with platform admin credentials from .env."""
    import hmac as _hmac
    email = body.get("email", "").strip().lower()
    password = body.get("password", "")

    if (
        not settings.admin_email
        or not settings.admin_password
        or not _hmac.compare_digest(email, settings.admin_email.lower())
        or not _hmac.compare_digest(password, settings.admin_password)
    ):
        raise HTTPException(status_code=401, detail="Invalid admin credentials")

    token = _create_admin_token()
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"email": settings.admin_email, "role": "SUPER_ADMIN"},
    }


@router.get("/auth/me")
async def admin_me(admin: dict = AdminUser):
    """Return current admin identity."""
    return {"email": settings.admin_email, "role": "SUPER_ADMIN"}


# ─────────────────────────── Analytics ───────────────────────────

@router.get("/analytics")
async def get_platform_analytics(
    admin: dict = AdminUser,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Platform-wide analytics: totals, revenue, monthly trends (last 6 months)."""
    now = datetime.now(timezone.utc)

    # Totals
    total_shops = (await db.execute(select(func.count()).select_from(select(Shop).subquery()))).scalar_one()
    active_shops = (await db.execute(select(func.count()).where(Shop.shop_status == "ACTIVE"))).scalar_one()
    total_tickets = (await db.execute(select(func.count()).select_from(select(Ticket).subquery()))).scalar_one()
    total_users = (await db.execute(select(func.count()).select_from(select(User).subquery()))).scalar_one()

    # Total revenue (sum of final_cost across all tickets)
    from sqlalchemy import cast, Float
    revenue_result = await db.execute(
        select(func.coalesce(func.sum(cast(Ticket.final_cost, Float)), 0.0))
    )
    total_revenue = float(revenue_result.scalar_one() or 0)

    # Ticket status breakdown
    from sqlalchemy import case
    status_rows = await db.execute(
        select(Ticket.status, func.count()).group_by(Ticket.status)
    )
    ticket_by_status = {row[0]: row[1] for row in status_rows.fetchall()}

    # Shop status breakdown
    shop_status_rows = await db.execute(
        select(Shop.shop_status, func.count()).group_by(Shop.shop_status)
    )
    shops_by_status = {row[0]: row[1] for row in shop_status_rows.fetchall()}

    # Monthly trends — last 6 months
    monthly = []
    for i in range(5, -1, -1):
        month_start = (now.replace(day=1) - timedelta(days=i * 30)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        # Align to first of month
        month_start = month_start.replace(day=1)
        if month_start.month == 12:
            month_end = month_start.replace(year=month_start.year + 1, month=1, day=1)
        else:
            month_end = month_start.replace(month=month_start.month + 1, day=1)

        m_tickets = (await db.execute(
            select(func.count()).where(
                Ticket.created_at >= month_start, Ticket.created_at < month_end
            )
        )).scalar_one()

        m_revenue = float((await db.execute(
            select(func.coalesce(func.sum(cast(Ticket.final_cost, Float)), 0.0)).where(
                Ticket.created_at >= month_start, Ticket.created_at < month_end
            )
        )).scalar_one() or 0)

        m_shops = (await db.execute(
            select(func.count()).where(
                Shop.created_at >= month_start, Shop.created_at < month_end
            )
        )).scalar_one()

        monthly.append({
            "month": month_start.strftime("%b %Y"),
            "tickets": m_tickets,
            "revenue": m_revenue,
            "new_shops": m_shops,
        })

    # Top 5 shops by revenue
    top_revenue_rows = await db.execute(
        select(
            Shop.id, Shop.name,
            func.coalesce(func.sum(cast(Ticket.final_cost, Float)), 0.0).label("revenue"),
            func.count(Ticket.id).label("tickets"),
        )
        .outerjoin(Ticket, Ticket.shop_id == Shop.id)
        .group_by(Shop.id, Shop.name)
        .order_by(func.coalesce(func.sum(cast(Ticket.final_cost, Float)), 0.0).desc())
        .limit(5)
    )
    top_shops = [
        {"id": str(r[0]), "name": r[1], "revenue": float(r[2]), "tickets": r[3]}
        for r in top_revenue_rows.fetchall()
    ]

    # Plan distribution
    plan_rows = await db.execute(
        select(Shop.plan, func.count()).where(Shop.is_active == True).group_by(Shop.plan)
    )
    plan_distribution = {row[0]: row[1] for row in plan_rows.fetchall()}

    # Subscription stats (if billing module exists)
    subscription_stats = {}
    try:
        from app.modules.billing.service import get_subscription_stats
        subscription_stats = await get_subscription_stats(db)
    except Exception as e:
        import logging
        logging.getLogger("admin.analytics").debug(f"Subscription stats unavailable: {e}")

    return {
        "totals": {
            "shops": total_shops,
            "active_shops": active_shops,
            "tickets": total_tickets,
            "users": total_users,
            "revenue": total_revenue,
        },
        "shops_by_status": shops_by_status,
        "tickets_by_status": ticket_by_status,
        "plan_distribution": plan_distribution,
        "subscriptions": subscription_stats,
        "monthly": monthly,
        "top_shops": top_shops,
    }


# ─────────────────────────── Audit Log ───────────────────────────

async def _emit_audit(action: str, admin_email: str, target: str = "", detail: str = ""):
    """Write an audit log entry to Redis LPUSH (capped list, survives worker restarts)."""
    from app.core.redis import get_redis
    import json as _json
    entry = {
        "id": str(uuid.uuid4()),
        "action": action,
        "admin": admin_email,
        "target": target,
        "detail": detail,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    try:
        r = await get_redis()
        await r.lpush("admin:audit_log", _json.dumps(entry))
        await r.ltrim("admin:audit_log", 0, 999)  # keep last 1000
    except Exception:
        pass  # never block an admin action due to Redis hiccup


@router.get("/audit-logs")
async def get_audit_logs(
    admin: dict = AdminUser,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
) -> dict[str, Any]:
    """Return recent admin audit log entries (Redis-backed, survives worker restarts)."""
    from app.core.redis import get_redis
    import json as _json
    r = await get_redis()
    logs_raw = await r.lrange("admin:audit_log", 0, -1)  # already newest-first (LPUSH)
    logs = [_json.loads(entry) for entry in logs_raw]
    total = len(logs)
    offset = (page - 1) * per_page
    return {"total": total, "page": page, "per_page": per_page, "items": logs[offset:offset + per_page]}


# ─────────────────────────── Impersonation ───────────────────────────

@router.post("/shops/{shop_id}/impersonate")
async def impersonate_shop(
    shop_id: uuid.UUID,
    admin: dict = AdminUser,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Generate a short-lived token (15 min) to log in as a shop owner."""
    from app.core.security import create_access_token

    result = await db.execute(
        select(User).where(User.shop_id == shop_id, User.role == "OWNER", User.is_active == True)
    )
    owner = result.scalar_one_or_none()
    if not owner:
        raise HTTPException(status_code=404, detail="Shop owner not found.")

    shop_result = await db.execute(select(Shop).where(Shop.id == shop_id))
    shop = shop_result.scalar_one_or_none()

    import uuid as _uuid_mod
    session_id = str(_uuid_mod.uuid4())
    token_data = {
        "sub": str(owner.id),
        "shop_id": str(owner.shop_id),
        "role": owner.role,
        "shop_status": getattr(shop, "shop_status", "ACTIVE"),
        "session_id": session_id,
        "_impersonated_by": admin.get("email", "admin"),
    }
    # Short-lived: 15 minutes
    token = create_access_token(token_data, expires_delta=timedelta(minutes=15))

    await _emit_audit("IMPERSONATE", admin.get("email", "admin"), str(shop_id),
                f"Impersonated owner {owner.email}")

    return {
        "access_token": token,
        "owner_email": owner.email,
        "shop_name": shop.name if shop else "",
        "expires_in_minutes": 15,
    }


# ─────────────────────────── Global Search ───────────────────────────

@router.get("/search")
async def global_search(
    q: str = Query(..., min_length=2),
    admin: dict = AdminUser,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Search shops, users, and tickets across the entire platform."""
    pattern = f"%{q}%"

    shops = await db.execute(
        select(Shop.id, Shop.name, Shop.email, Shop.shop_status)
        .where(Shop.name.ilike(pattern) | Shop.email.ilike(pattern))
        .limit(8)
    )
    shop_results = [
        {"type": "shop", "id": str(r[0]), "title": r[1], "subtitle": r[2], "status": r[3]}
        for r in shops.fetchall()
    ]

    users = await db.execute(
        select(User.id, User.full_name, User.email, User.role, User.shop_id)
        .where(User.full_name.ilike(pattern) | User.email.ilike(pattern))
        .limit(8)
    )
    user_results = [
        {"type": "user", "id": str(r[0]), "title": r[1], "subtitle": r[2],
         "status": r[3], "shop_id": str(r[4])}
        for r in users.fetchall()
    ]

    tickets = await db.execute(
        select(Ticket.id, Ticket.ticket_number, Ticket.device_type, Ticket.status, Ticket.shop_id)
        .where(Ticket.device_type.ilike(pattern) | Ticket.reported_issue.ilike(pattern))
        .limit(8)
    )
    ticket_results = [
        {"type": "ticket", "id": str(r[0]), "title": f"#{r[1]} — {r[2]}",
         "subtitle": r[3], "shop_id": str(r[4])}
        for r in tickets.fetchall()
    ]

    return {
        "query": q,
        "results": shop_results + user_results + ticket_results,
        "counts": {
            "shops": len(shop_results),
            "users": len(user_results),
            "tickets": len(ticket_results),
        }
    }


# ─────────────────────────── Broadcasts ───────────────────────────

@router.post("/broadcast", status_code=201)
async def create_broadcast(
    body: dict,
    admin: dict = AdminUser,
) -> dict[str, Any]:
    """Send a platform-wide message to all shop owners (Redis-backed)."""
    from app.core.redis import get_redis
    import json as _json
    title = (body.get("title") or "").strip()
    message = (body.get("message") or "").strip()
    if not title or not message:
        raise HTTPException(status_code=422, detail="title and message are required.")

    duration_minutes = body.get("duration_minutes")
    if duration_minutes is not None:
        try:
            duration_minutes = int(duration_minutes)
            if duration_minutes < 0:
                duration_minutes = None
        except (ValueError, TypeError):
            duration_minutes = None

    entry = {
        "id": str(uuid.uuid4()),
        "title": title,
        "message": message,
        "type": body.get("type", "INFO"),   # INFO | WARNING | MAINTENANCE
        "sent_by": admin.get("email", "admin"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "duration_minutes": duration_minutes,
    }
    r = await get_redis()
    await r.lpush("admin:broadcasts", _json.dumps(entry))
    await r.ltrim("admin:broadcasts", 0, 199)  # keep last 200
    await _emit_audit("BROADCAST", admin.get("email", "admin"), "", f"Sent: {title}")
    return entry


@router.get("/broadcasts/latest")
async def get_latest_broadcasts() -> list[dict]:
    """Return latest 10 active (non-expired) broadcasts. Public endpoint — no admin auth required."""
    from app.core.redis import get_redis
    import json as _json
    r = await get_redis()
    raw = await r.lrange("admin:broadcasts", 0, -1)
    all_broadcasts = [_json.loads(b) for b in raw]
    now = datetime.now(timezone.utc)
    active = []
    for b in all_broadcasts:
        dm = b.get("duration_minutes")
        if dm is None or dm == 0:
            active.append(b)
            continue
        try:
            created = datetime.fromisoformat(b["created_at"])
            expires_at = created + timedelta(minutes=int(dm))
            if now < expires_at:
                active.append(b)
        except (KeyError, ValueError, TypeError):
            active.append(b)
        if len(active) >= 10:
            break
    return active


@router.get("/broadcasts")
async def list_broadcasts(admin: dict = AdminUser) -> list[dict]:
    """List all broadcasts sent by admin (Redis-backed)."""
    from app.core.redis import get_redis
    import json as _json
    r = await get_redis()
    raw = await r.lrange("admin:broadcasts", 0, -1)
    return [_json.loads(b) for b in raw]


@router.delete("/broadcasts/{broadcast_id}", status_code=204)
async def delete_broadcast(
    broadcast_id: str,
    admin: dict = AdminUser,
) -> None:
    """Delete a specific broadcast by ID."""
    from app.core.redis import get_redis
    import json as _json
    r = await get_redis()
    raw = await r.lrange("admin:broadcasts", 0, -1)
    found = False
    for entry_raw in raw:
        entry = _json.loads(entry_raw)
        if entry.get("id") == broadcast_id:
            await r.lrem("admin:broadcasts", 0, entry_raw)
            found = True
            break
    if not found:
        raise HTTPException(status_code=404, detail="Broadcast not found.")
    await _emit_audit("DELETE_BROADCAST", admin.get("email", "admin"), broadcast_id, f"Deleted broadcast")


# ─────────────────────────── CSV Export ───────────────────────────

@router.get("/export/shops")
async def export_shops_csv(
    admin: dict = AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Download all shops as a CSV file."""
    import csv, io
    from fastapi.responses import StreamingResponse

    rows = await db.execute(
        select(Shop.id, Shop.name, Shop.email, Shop.phone, Shop.plan,
               Shop.shop_status, Shop.created_at)
        .order_by(Shop.created_at.desc())
    )

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["ID", "Name", "Email", "Phone", "Plan", "Status", "Created"])
    for r in rows.fetchall():
        writer.writerow([str(r[0]), r[1], r[2] or "", r[3] or "", r[4] or "", r[5] or "", str(r[6])])

    buf.seek(0)
    await _emit_audit("EXPORT", admin.get("email", "admin"), "shops", "Exported shops CSV")
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=shops.csv"},
    )


@router.get("/export/shops/json")
async def export_shops_json(
    admin: dict = AdminUser,
    db: AsyncSession = Depends(get_db),
    ids: str | None = Query(None, description="Comma-separated shop UUIDs to export (omit for all)"),
):
    """Download shops as a JSON file. Pass ?ids=uuid1,uuid2,... to export specific shops."""
    import json, uuid as uuid_mod
    from fastapi.responses import Response

    q = select(Shop).order_by(Shop.created_at.desc())
    if ids:
        id_list = [i.strip() for i in ids.split(",") if i.strip()]
        try:
            uid_list = [uuid_mod.UUID(i) for i in id_list]
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid UUID in ids parameter.")
        q = q.where(Shop.id.in_(uid_list))

    shops_q = await db.execute(q)
    shops = shops_q.scalars().all()

    items = []
    for shop in shops:
        owner_q = await db.execute(
            select(User).where(User.shop_id == shop.id, User.role == "OWNER")
        )
        owner = owner_q.scalar_one_or_none()
        items.append({
            "name": shop.name,
            "email": shop.email,
            "phone": shop.phone,
            "plan": shop.plan,
            "shop_status": shop.shop_status or "ACTIVE",
            "created_at": shop.created_at.isoformat(),
            "owner": {
                "full_name": owner.full_name if owner else None,
                "email": owner.email if owner else None,
            },
        })

    filename = f"shops_selected_{len(items)}.json" if ids else "shops_export.json"
    payload = json.dumps({"exported_at": datetime.now(timezone.utc).isoformat(), "count": len(items), "shops": items}, indent=2)
    await _emit_audit("EXPORT", admin.get("email", "admin"), "shops", f"Exported {len(items)} shops as JSON{' (filtered)' if ids else ''}")
    return Response(
        content=payload,
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post("/import/shops")
async def import_shops(
    admin: dict = AdminUser,
    db: AsyncSession = Depends(get_db),
    request: "Request" = None,
):
    """Import shops from uploaded JSON file. Accepts multipart/form-data with 'file' field."""
    from app.core.security import hash_password
    import json, secrets

    form = await request.form()
    file = form.get("file")
    if file is None:
        raise HTTPException(status_code=422, detail="No file uploaded. Send multipart/form-data with 'file' field.")

    raw = await file.read()
    try:
        data = json.loads(raw)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON file.")

    shops_list = data if isinstance(data, list) else data.get("shops", [])
    if not isinstance(shops_list, list):
        raise HTTPException(status_code=400, detail='JSON must be a list or {"shops": [...]}.')

    created, skipped, failed = 0, 0, []

    for entry in shops_list:
        try:
            owner_data = entry.get("owner") or {}
            owner_email = (owner_data.get("email") or entry.get("email") or "").strip().lower()
            if not owner_email:
                failed.append({"entry": entry.get("name", "?"), "reason": "Missing owner email"})
                continue

            # Skip if owner email already exists
            existing = await db.execute(select(User).where(User.email == owner_email))
            if existing.scalar_one_or_none():
                skipped += 1
                continue

            # Create shop
            ALLOWED_PLANS = {"free", "basic", "pro", "enterprise"}
            ALLOWED_SHOP_STATUSES = {"ACTIVE", "INACTIVE", "BLOCKED", "RESTRICTED"}
            import_plan = (entry.get("plan") or "free").lower()
            import_status = (entry.get("shop_status") or "ACTIVE").upper()
            shop = Shop(
                name=(entry.get("name") or "Imported Shop").strip(),
                email=owner_email,
                phone=entry.get("phone"),
                plan=import_plan if import_plan in ALLOWED_PLANS else "free",
                shop_status=import_status if import_status in ALLOWED_SHOP_STATUSES else "ACTIVE",
            )
            db.add(shop)
            await db.flush()

            # Create owner user
            password = owner_data.get("password") or secrets.token_urlsafe(10)
            user = User(
                full_name=(owner_data.get("full_name") or entry.get("name") or "Owner").strip(),
                email=owner_email,
                password_hash=hash_password(password),
                role="OWNER",
                shop_id=shop.id,
                is_active=True,
            )
            db.add(user)
            created += 1
        except Exception as exc:
            await db.rollback()
            failed.append({"entry": entry.get("name", "?"), "reason": str(exc)})
            continue

    await db.commit()
    await _emit_audit("IMPORT", admin.get("email", "admin"), "shops", f"Imported {created} shops, skipped {skipped}, failed {len(failed)}")
    return {"ok": True, "created": created, "skipped": skipped, "failed": failed}


@router.get("/export/tickets")
async def export_tickets_csv(
    admin: dict = AdminUser,
    db: AsyncSession = Depends(get_db),
    shop_id: str | None = Query(None),
):
    """Download tickets as a CSV file (optionally filtered by shop)."""
    import csv, io
    from fastapi.responses import StreamingResponse
    from sqlalchemy import cast, Float

    q = select(
        Ticket.id, Ticket.ticket_number, Ticket.shop_id, Ticket.device_type,
        Ticket.status, Ticket.final_cost, Ticket.created_at
    )
    if shop_id:
        try:
            q = q.where(Ticket.shop_id == uuid.UUID(shop_id))
        except (ValueError, AttributeError):
            raise HTTPException(status_code=400, detail="Invalid shop_id format.")

    rows = await db.execute(q.order_by(Ticket.created_at.desc()))

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["ID", "Ticket#", "Shop ID", "Device", "Status", "Revenue", "Created"])
    for r in rows.fetchall():
        writer.writerow([str(r[0]), r[1], str(r[2]), r[3], r[4],
                        str(r[5] or ""), str(r[6])])

    buf.seek(0)
    await _emit_audit("EXPORT", admin.get("email", "admin"), "tickets", "Exported tickets CSV")
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=tickets.csv"},
    )


# ─────────────────────────── Bulk Actions ───────────────────────────

@router.post("/shops/bulk-action")
async def bulk_shop_action(
    body: dict,
    admin: dict = AdminUser,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Apply an action to multiple shops at once.
    Body: { shop_ids: [str], action: 'restrict'|'block'|'reactivate'|'deactivate' }
    """
    action = (body.get("action") or "").upper()
    shop_ids = body.get("shop_ids") or []
    if not shop_ids:
        raise HTTPException(status_code=422, detail="shop_ids is required.")
    if action not in ("RESTRICT", "BLOCK", "REACTIVATE", "DEACTIVATE"):
        raise HTTPException(status_code=422, detail="Invalid action.")

    STATUS_MAP = {
        "RESTRICT": "RESTRICTED",
        "BLOCK": "BLOCKED",
        "REACTIVATE": "ACTIVE",
        "DEACTIVATE": "INACTIVE",
    }
    new_status = STATUS_MAP[action]

    updated = 0
    for sid in shop_ids:
        try:
            # Fix #13: cast string IDs to uuid.UUID before querying UUID column
            try:
                shop_uuid = uuid.UUID(str(sid))
            except (ValueError, AttributeError):
                continue  # skip malformed IDs
            result = await db.execute(select(Shop).where(Shop.id == shop_uuid))
            shop = result.scalar_one_or_none()
            if shop:
                shop.shop_status = new_status
                updated += 1
        except Exception:
            pass

    await db.commit()
    await _emit_audit("BULK_ACTION", admin.get("email", "admin"),
                f"{len(shop_ids)} shops", f"Action: {action} → {updated} updated")
    return {"ok": True, "updated": updated, "action": action, "new_status": new_status}



# ─────────────────────────── Shops ───────────────────────────

@router.get("/shops")
async def list_all_shops(
    admin: dict = AdminUser,
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: str | None = Query(None),
) -> dict[str, Any]:
    """List all shops with aggregate stats."""
    q = select(Shop).where(Shop.is_active == True)
    if search:
        q = q.where(Shop.name.ilike(f"%{search}%"))

    count_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = count_result.scalar_one()

    offset = (page - 1) * per_page
    shops_result = await db.execute(
        q.order_by(Shop.created_at.desc()).offset(offset).limit(per_page)
    )
    shops = shops_result.scalars().all()

    items = []
    for shop in shops:
        # Ticket count
        tc = await db.execute(
            select(func.count()).where(Ticket.shop_id == shop.id, Ticket.is_deleted == False)
        )
        ticket_count = tc.scalar_one()

        # Member count
        mc = await db.execute(
            select(func.count()).where(User.shop_id == shop.id, User.is_active == True)
        )
        member_count = mc.scalar_one()

        # Owner
        owner_result = await db.execute(
            select(User).where(User.shop_id == shop.id, User.role == "OWNER")
        )
        owner = owner_result.scalar_one_or_none()

        items.append({
            "id": str(shop.id),
            "name": shop.name,
            "email": shop.email,
            "phone": shop.phone,
            "is_active": shop.is_active,
            "shop_status": shop.shop_status or "ACTIVE",
            "created_at": shop.created_at.isoformat(),
            "owner": {"full_name": owner.full_name, "email": owner.email} if owner else None,
            "ticket_count": ticket_count,
            "member_count": member_count,
        })

    return {"total": total, "page": page, "per_page": per_page, "items": items}


@router.get("/shops/{shop_id}")
async def get_shop_detail(
    shop_id: uuid.UUID,
    admin: dict = AdminUser,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Get detail for a specific shop."""
    result = await db.execute(select(Shop).where(Shop.id == shop_id))
    shop = result.scalar_one_or_none()
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")

    # Stats
    tc = await db.execute(
        select(func.count()).where(Ticket.shop_id == shop_id, Ticket.is_deleted == False)
    )
    cc = await db.execute(select(func.count()).where(Customer.shop_id == shop_id))
    mc = await db.execute(
        select(func.count()).where(User.shop_id == shop_id, User.is_active == True)
    )
    ic = await db.execute(select(func.count()).where(InventoryItem.shop_id == shop_id))

    owner_result = await db.execute(
        select(User).where(User.shop_id == shop_id, User.role == "OWNER")
    )
    owner = owner_result.scalar_one_or_none()

    return {
        "id": str(shop.id),
        "name": shop.name,
        "email": shop.email,
        "phone": shop.phone,
        "is_active": shop.is_active,
        "shop_status": shop.shop_status,
        "admin_note": shop.admin_note,
        "custom_device_limit": shop.custom_device_limit,
        "plan": shop.plan,
        "created_at": shop.created_at.isoformat(),
        "owner": {"full_name": owner.full_name, "email": owner.email, "id": str(owner.id)} if owner else None,
        "stats": {
            "tickets": tc.scalar_one(),
            "customers": cc.scalar_one(),
            "members": mc.scalar_one(),
            "inventory_items": ic.scalar_one(),
        },
    }


@router.patch("/shops/{shop_id}")
async def update_shop_admin(
    shop_id: uuid.UUID,
    body: dict,
    admin: dict = AdminUser,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Admin-only: update shop_status, admin_note, and/or custom_device_limit."""
    result = await db.execute(select(Shop).where(Shop.id == shop_id))
    shop = result.scalar_one_or_none()
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")

    ALLOWED = {"shop_status", "admin_note", "custom_device_limit"}
    VALID_STATUSES = {"ACTIVE", "RESTRICTED", "BLOCKED", "INACTIVE"}
    changed_fields = []

    for field in ALLOWED:
        if field not in body:
            continue
        value = body[field]

        if field == "shop_status":
            if value not in VALID_STATUSES:
                raise HTTPException(status_code=422, detail=f"Invalid shop_status '{value}'.")

        if field == "custom_device_limit":
            # Accept None (reset to plan default), or a non-negative integer
            if value is not None:
                if not isinstance(value, int) or value < 0:
                    raise HTTPException(
                        status_code=422,
                        detail="custom_device_limit must be a non-negative integer or null."
                    )

        setattr(shop, field, value)
        changed_fields.append(field)

    # Fix #5: get_db() commits on exit; db.refresh() still needed to get updated state
    await db.flush()
    await db.refresh(shop)

    await _emit_audit(
        "UPDATE_SHOP", admin.get("email", "admin"), str(shop_id),
        f"Updated fields: {', '.join(changed_fields)}"
    )

    return {
        "id": str(shop.id),
        "shop_status": shop.shop_status,
        "admin_note": shop.admin_note,
        "custom_device_limit": shop.custom_device_limit,
    }


@router.post("/shops", status_code=201)
async def create_shop(
    body: dict,
    admin: dict = AdminUser,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Create a new shop with an owner account."""
    from app.core.security import hash_password
    from sqlalchemy import select as sa_select

    shop_name = (body.get("shop_name") or "").strip()
    owner_name = (body.get("owner_name") or "").strip()
    email = (body.get("email") or "").strip().lower()
    password = (body.get("password") or "").strip()
    phone = (body.get("phone") or "").strip() or None

    if not shop_name or not owner_name or not email or not password:
        raise HTTPException(status_code=422, detail="shop_name, owner_name, email and password are required.")
    if len(password) < 6:
        raise HTTPException(status_code=422, detail="Password must be at least 6 characters.")

    # Check duplicate email
    existing = await db.execute(sa_select(User).where(User.email == email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"An account with email '{email}' already exists.")

    # Create shop
    shop = Shop(name=shop_name, phone=phone, email=email, plan="free")
    db.add(shop)
    await db.flush()

    # Create owner user
    user = User(
        shop_id=shop.id,
        full_name=owner_name,
        email=email,
        password_hash=hash_password(password),
        role="OWNER",
    )
    db.add(user)
    await db.flush()  # Fix #5: get_db() commits on exit; flush makes IDs available
    await db.refresh(shop)

    return {
        "id": str(shop.id),
        "name": shop.name,
        "email": shop.email,
        "phone": shop.phone,
        "is_active": shop.is_active,
        "created_at": shop.created_at.isoformat(),
        "owner": {"full_name": user.full_name, "email": user.email, "id": str(user.id)},
    }


@router.delete("/shops/{shop_id}", status_code=204)
async def delete_shop(
    shop_id: uuid.UUID,
    admin: dict = AdminUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Permanently delete a shop and all its data (manual CASCADE, skips missing tables)."""
    from sqlalchemy import text
    from sqlalchemy.exc import ProgrammingError

    result = await db.execute(select(Shop).where(Shop.id == shop_id))
    shop = result.scalar_one_or_none()
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")

    async def safe_delete(sql: str, params: dict):
        """Execute a DELETE, silently skip if the table doesn't exist."""
        sp = f"sp_{sql[:20].replace(' ', '_').replace('*', '')}"
        try:
            await db.execute(text(f"SAVEPOINT {sp}"))
            await db.execute(text(sql), params)
            await db.execute(text(f"RELEASE SAVEPOINT {sp}"))
        except ProgrammingError:
            await db.execute(text(f"ROLLBACK TO SAVEPOINT {sp}"))

    sid = {"sid": shop_id}
    await safe_delete("DELETE FROM invoices WHERE shop_id = :sid", sid)
    # Fix #3: ticket_items does not exist; ticket_parts is the correct table
    await safe_delete("DELETE FROM ticket_parts WHERE ticket_id IN (SELECT id FROM tickets WHERE shop_id = :sid)", sid)
    await safe_delete("DELETE FROM tickets WHERE shop_id = :sid", sid)
    await safe_delete("DELETE FROM inventory_items WHERE shop_id = :sid", sid)
    await safe_delete("DELETE FROM customers WHERE shop_id = :sid", sid)
    await safe_delete("DELETE FROM users WHERE shop_id = :sid", sid)
    await db.execute(text("DELETE FROM shops WHERE id = :sid"), sid)
    await db.commit()  # explicit commit — delete_shop uses a raw text session
    await _emit_audit("DELETE", admin.get("email", "admin"), "shops", f"Deleted shop {shop_id}")


# ─────────────────────────── Shop — Account Management ───────────────────────────

async def _get_shop_or_404(shop_id: uuid.UUID, db: AsyncSession) -> Shop:
    result = await db.execute(select(Shop).where(Shop.id == shop_id))
    shop = result.scalar_one_or_none()
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")
    return shop


@router.post("/shops/{shop_id}/restrict")
async def restrict_shop(
    shop_id: uuid.UUID,
    admin: dict = AdminUser,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Restrict shop: owner can still log in but cannot create/modify data (read-only)."""
    shop = await _get_shop_or_404(shop_id, db)
    shop.shop_status = "RESTRICTED"
    shop.is_active = True  # still accessible, just read-only
    # Fix #5: get_db() commits on exit — no manual commit needed
    return {"id": str(shop.id), "shop_status": shop.shop_status}


@router.post("/shops/{shop_id}/block")
async def block_shop(
    shop_id: uuid.UUID,
    admin: dict = AdminUser,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Block shop: owner cannot log in at all. Auth will return 403."""
    shop = await _get_shop_or_404(shop_id, db)
    shop.shop_status = "BLOCKED"
    shop.is_active = True  # keeps data but login is rejected
    # Fix #5: get_db() commits on exit — no manual commit needed
    return {"id": str(shop.id), "shop_status": shop.shop_status}


@router.post("/shops/{shop_id}/deactivate")
async def deactivate_shop(
    shop_id: uuid.UUID,
    admin: dict = AdminUser,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Deactivate shop: soft-delete — hidden from normal queries."""
    shop = await _get_shop_or_404(shop_id, db)
    shop.shop_status = "INACTIVE"
    shop.is_active = False
    # Fix #5: get_db() commits on exit
    return {"id": str(shop.id), "shop_status": shop.shop_status}


@router.post("/shops/{shop_id}/reactivate")
async def reactivate_shop(
    shop_id: uuid.UUID,
    admin: dict = AdminUser,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Restore shop to fully active state."""
    shop = await _get_shop_or_404(shop_id, db)
    shop.shop_status = "ACTIVE"
    shop.is_active = True
    # Fix #5: get_db() commits on exit
    return {"id": str(shop.id), "shop_status": shop.shop_status}


@router.patch("/shops/{shop_id}/note")
async def update_shop_note(
    shop_id: uuid.UUID,
    body: dict,
    admin: dict = AdminUser,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Set or clear the admin's internal note for a shop."""
    shop = await _get_shop_or_404(shop_id, db)
    shop.admin_note = (body.get("note") or "").strip() or None
    # Fix #5: get_db() commits on exit
    return {"id": str(shop.id), "admin_note": shop.admin_note}


@router.post("/shops/{shop_id}/reset-password")
async def reset_shop_owner_password(
    shop_id: uuid.UUID,
    body: dict,
    admin: dict = AdminUser,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Reset the password for the shop owner (or a specific user by user_id).
    Body: { new_password: str, user_id?: str }
    """
    from app.core.security import hash_password

    new_password = (body.get("new_password") or "").strip()
    if len(new_password) < 6:
        raise HTTPException(status_code=422, detail="Password must be at least 6 characters.")

    target_user_id = body.get("user_id")

    if target_user_id:
        try:
            target_user_uuid = uuid.UUID(str(target_user_id))
        except (ValueError, AttributeError):
            raise HTTPException(status_code=422, detail="Invalid user_id format.")
        result = await db.execute(
            select(User).where(User.id == target_user_uuid, User.shop_id == shop_id)
        )
    else:
        # Reset the shop owner's password
        result = await db.execute(
            select(User).where(User.shop_id == shop_id, User.role == "OWNER")
        )

    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found in this shop.")

    user.password_hash = hash_password(new_password)
    # Fix #5: get_db() commits on exit — no manual commit needed
    return {"ok": True, "email": user.email, "message": f"Password reset for {user.email}"}


@router.get("/shops/{shop_id}/tickets")
async def get_shop_tickets(
    shop_id: uuid.UUID,
    admin: dict = AdminUser,
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status: str | None = Query(None),
) -> dict[str, Any]:
    from app.modules.customers.models import Customer as C
    q = (
        select(Ticket)
        .join(C, Ticket.customer_id == C.id)
        .where(Ticket.shop_id == shop_id, Ticket.is_deleted == False)
    )
    if status:
        q = q.where(Ticket.status == status)

    count_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = count_result.scalar_one()
    offset = (page - 1) * per_page
    result = await db.execute(q.order_by(Ticket.created_at.desc()).offset(offset).limit(per_page))
    tickets = result.scalars().all()

    return {
        "total": total, "page": page, "per_page": per_page,
        "items": [
            {
                "id": str(t.id),
                "ticket_number": t.ticket_number,
                "status": t.status,
                "device_type": t.device_type,
                "device_model": t.device_model,
                "reported_issue": t.reported_issue,
                "estimated_cost": str(t.estimated_cost) if t.estimated_cost else None,
                "final_cost": str(t.final_cost) if t.final_cost else None,
                "created_at": t.created_at.isoformat(),
            }
            for t in tickets
        ],
    }


@router.get("/shops/{shop_id}/tickets/{ticket_id}")
async def get_shop_ticket_detail(
    shop_id: uuid.UUID,
    ticket_id: uuid.UUID,
    admin: dict = AdminUser,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    from app.modules.tickets.service import get_ticket_detail
    return await get_ticket_detail(shop_id, ticket_id, db)


@router.get("/shops/{shop_id}/tickets/{ticket_id}/invoice")
async def get_shop_ticket_invoice(
    shop_id: uuid.UUID,
    ticket_id: uuid.UUID,
    admin: dict = AdminUser,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    from app.modules.invoices.service import get_invoice
    return await get_invoice(shop_id, ticket_id, db)

# ─────────────────────────── Shop — Customers ───────────────────────────

@router.get("/shops/{shop_id}/customers")
async def get_shop_customers(
    shop_id: uuid.UUID,
    admin: dict = AdminUser,
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
) -> dict[str, Any]:
    q = select(Customer).where(Customer.shop_id == shop_id)
    count_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = count_result.scalar_one()
    offset = (page - 1) * per_page
    result = await db.execute(q.order_by(Customer.created_at.desc()).offset(offset).limit(per_page))
    customers = result.scalars().all()

    return {
        "total": total, "page": page, "per_page": per_page,
        "items": [
            {
                "id": str(c.id),
                "name": c.name,
                "phone": c.phone,
                "email": c.email,
                "created_at": c.created_at.isoformat(),
            }
            for c in customers
        ],
    }


# ─────────────────────────── Shop — Team ───────────────────────────

@router.get("/shops/{shop_id}/team")
async def get_shop_team(
    shop_id: uuid.UUID,
    admin: dict = AdminUser,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    result = await db.execute(
        select(User).where(User.shop_id == shop_id).order_by(User.created_at.asc())
    )
    members = result.scalars().all()
    return {
        "members": [
            {
                "id": str(m.id),
                "full_name": m.full_name,
                "email": m.email,
                "role": m.role,
                "is_active": m.is_active,
                "created_at": m.created_at.isoformat(),
            }
            for m in members
        ]
    }


# ─────────────────────────── Shop — Inventory ───────────────────────────

@router.get("/shops/{shop_id}/inventory")
async def get_shop_inventory(
    shop_id: uuid.UUID,
    admin: dict = AdminUser,
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
) -> dict[str, Any]:
    q = select(InventoryItem).where(InventoryItem.shop_id == shop_id)
    count_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = count_result.scalar_one()
    offset = (page - 1) * per_page
    result = await db.execute(q.order_by(InventoryItem.created_at.desc()).offset(offset).limit(per_page))
    items = result.scalars().all()

    return {
        "total": total, "page": page, "per_page": per_page,
        "items": [
            {
                "id": str(i.id),
                "name": i.name,
                "sku": i.sku,
                "quantity": i.quantity,
                "selling_price": str(i.selling_price),
                "purchase_price": str(i.purchase_price),
                "is_low_stock": i.is_low_stock,
            }
            for i in items
        ],
    }


# ─────────────────────────── Shop — Active Sessions ───────────────────────────

@router.get("/shops/{shop_id}/sessions")
async def get_shop_sessions(
    shop_id: uuid.UUID,
    admin: dict = AdminUser,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """
    List all active Redis sessions for every user in this shop.
    Returns user info, session_id, TTL, and a human-readable age string.
    """
    from app.core.redis import get_redis

    # All active users in this shop
    user_result = await db.execute(
        select(User).where(User.shop_id == shop_id, User.is_active == True)
    )
    users = user_result.scalars().all()

    redis = await get_redis()
    sessions: list[dict] = []
    MAX_TTL = 60 * 60 * 24 * 7  # 7 days (the refresh token lifetime)

    for user in users:
        cursor = b"0"
        while cursor:
            cursor, keys = await redis.scan(
                cursor=cursor, match=f"refresh:{user.id}:*"
            )
            for key in keys:
                # key looks like  b"refresh:<user_id>:<session_id>"
                key_str = key.decode() if isinstance(key, bytes) else key
                parts = key_str.split(":")
                session_id = parts[-1] if len(parts) >= 3 else key_str

                ttl = await redis.ttl(key)
                if ttl < 0:
                    # Key has already expired or has no TTL — skip
                    continue

                # Approximate age: how long ago the session was created
                # (MAX_TTL - remaining_ttl)
                age_seconds = MAX_TTL - ttl
                if age_seconds < 60:
                    created_ago = "just now"
                elif age_seconds < 3600:
                    created_ago = f"{age_seconds // 60}m ago"
                elif age_seconds < 86400:
                    created_ago = f"{age_seconds // 3600}h ago"
                else:
                    created_ago = f"{age_seconds // 86400}d ago"

                sessions.append({
                    "user_id": str(user.id),
                    "user_name": user.full_name,
                    "user_email": user.email,
                    "user_role": user.role,
                    "session_id": session_id,
                    "session_key": f"{user.id}:{session_id}",
                    "ttl_seconds": ttl,
                    "ttl_max": MAX_TTL,
                    "created_ago": created_ago,
                })
            if cursor == b"0":
                break

    # Sort newest first (smallest ttl = was refreshed most recently... actually
    # largest ttl means most recently issued, so sort descending by ttl)
    sessions.sort(key=lambda s: s["ttl_seconds"], reverse=True)

    return {"total": len(sessions), "sessions": sessions}


@router.delete("/shops/{shop_id}/sessions/{session_key:path}", status_code=200)
async def kill_shop_session(
    shop_id: uuid.UUID,
    session_key: str,
    admin: dict = AdminUser,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """
    Force-logout a specific session by deleting its Redis refresh token key.
    session_key format: '{user_id}:{session_id}'
    """
    from app.core.redis import get_redis

    # Validate that the user belongs to this shop (security check)
    parts = session_key.split(":")
    if len(parts) < 2:
        raise HTTPException(status_code=422, detail="Invalid session_key format. Expected '{user_id}:{session_id}'.")

    user_id_str = parts[0]
    try:
        user_uuid = uuid.UUID(user_id_str)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid user_id in session_key.")

    user_result = await db.execute(
        select(User).where(User.id == user_uuid, User.shop_id == shop_id)
    )
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Session not found or does not belong to this shop.")

    redis = await get_redis()
    redis_key = f"refresh:{session_key}"
    deleted = await redis.delete(redis_key)

    if deleted == 0:
        raise HTTPException(status_code=404, detail="Session not found or already expired.")

    await _emit_audit(
        "KILL_SESSION",
        admin.get("email", "admin"),
        str(shop_id),
        f"Killed session for {user.email} (session: {session_key})",
    )

    return {"ok": True, "message": f"Session for {user.email} has been terminated."}

