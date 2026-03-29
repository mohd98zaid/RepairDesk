"""
Centralized Audit Logger
-------------------------
Structured logging for security-sensitive events.
All entries include shop_id for traceability.
"""
import logging
import json
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger("repairdesk.audit")


def _log(event_type: str, shop_id: str | None, detail: dict[str, Any], level: str = "info"):
    """Structured audit log entry."""
    entry = {
        "event": event_type,
        "shop_id": str(shop_id) if shop_id else None,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        **detail,
    }
    msg = json.dumps(entry, default=str)
    getattr(logger, level, logger.info)(msg)


# ─── Subscription Events ───

def log_subscription_created(shop_id: str, plan_name: str, plan_slug: str, billing_cycle: str):
    _log("subscription.created", shop_id, {
        "plan_name": plan_name,
        "plan_slug": plan_slug,
        "billing_cycle": billing_cycle,
    })


def log_subscription_cancelled(shop_id: str, plan_slug: str):
    _log("subscription.cancelled", shop_id, {
        "plan_slug": plan_slug,
    })


def log_subscription_changed(shop_id: str, old_plan: str, new_plan: str):
    _log("subscription.changed", shop_id, {
        "old_plan": old_plan,
        "new_plan": new_plan,
    })


# ─── Limit Block Events ───

def log_limit_blocked(shop_id: str, feature_key: str, limit: int, current_count: int):
    _log("limit.blocked", shop_id, {
        "feature": feature_key,
        "limit": limit,
        "current_count": current_count,
    }, level="warning")


# ─── Payment Events ───

def log_payment_created(shop_id: str, ticket_id: str, amount: float):
    _log("payment.created", shop_id, {
        "ticket_id": ticket_id,
        "amount": amount,
    })


def log_payment_success(shop_id: str, ticket_id: str):
    _log("payment.success", shop_id, {
        "ticket_id": ticket_id,
    })


def log_payment_failed(shop_id: str | None, ticket_id: str, reason: str):
    _log("payment.failed", shop_id, {
        "ticket_id": ticket_id,
        "reason": reason,
    }, level="error")


def log_payment_webhook_invalid(reason: str):
    _log("payment.webhook_invalid", None, {
        "reason": reason,
    }, level="warning")


# ─── Auth Events ───

def log_login_failed(email: str, reason: str, ip: str | None = None):
    _log("auth.login_failed", None, {
        "email": email,
        "reason": reason,
        "ip": ip,
    }, level="warning")


def log_rate_limited(endpoint: str, ip: str | None = None):
    _log("auth.rate_limited", None, {
        "endpoint": endpoint,
        "ip": ip,
    }, level="warning")
