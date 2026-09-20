"""
Unit tests for the 8 security audit remediations (RD-01 through RD-08).
"""
import inspect
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException

from app.core.dependencies import OwnerUser, CurrentUser
from app.core.exceptions import ValidationException


# ──────────────────────────────────────────────────────────────────────────────
# RD-01: Object storage key traversal & prefix validation
# ──────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_rd01_confirm_image_upload_traversal_rejected():
    from app.modules.tickets.service import confirm_image_upload
    from app.modules.tickets.schemas import ConfirmUploadRequest

    shop_id = uuid.uuid4()
    ticket_id = uuid.uuid4()
    traversal_key = f"{shop_id}/tickets/{ticket_id}/../../etc/passwd"

    data = ConfirmUploadRequest(
        object_key=traversal_key,
        filename="passwd",
        size_bytes=100,
    )
    db = AsyncMock()

    with patch("app.modules.tickets.service.get_ticket", new_callable=AsyncMock) as mock_get_ticket:
        mock_get_ticket.return_value = MagicMock()
        with pytest.raises(ValidationException, match="Invalid object key for this ticket"):
            await confirm_image_upload(shop_id, ticket_id, data, db)


@pytest.mark.asyncio
async def test_rd01_confirm_image_upload_mismatched_shop_prefix():
    from app.modules.tickets.service import confirm_image_upload
    from app.modules.tickets.schemas import ConfirmUploadRequest

    shop_id = uuid.uuid4()
    other_shop = uuid.uuid4()
    ticket_id = uuid.uuid4()
    wrong_key = f"{other_shop}/tickets/{ticket_id}/photo.jpg"

    data = ConfirmUploadRequest(
        object_key=wrong_key,
        filename="photo.jpg",
        size_bytes=100,
    )
    db = AsyncMock()

    with patch("app.modules.tickets.service.get_ticket", new_callable=AsyncMock) as mock_get_ticket:
        mock_get_ticket.return_value = MagicMock()
        with pytest.raises(ValidationException, match="Invalid object key for this ticket"):
            await confirm_image_upload(shop_id, ticket_id, data, db)


# ──────────────────────────────────────────────────────────────────────────────
# RD-02: Technician cross-tenant & inactive assignment validation
# ──────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_rd02_create_ticket_rejects_inactive_or_cross_tenant_tech():
    from app.modules.tickets.service import create_ticket

    shop_id = uuid.uuid4()
    creator_id = uuid.uuid4()
    fake_tech_id = uuid.uuid4()
    db = AsyncMock()

    mock_customer = MagicMock()
    mock_customer.id = uuid.uuid4()

    # Sequence of queries: customer check, feature limit check, next ticket num, tech check
    res_customer = MagicMock()
    res_customer.scalar_one_or_none.return_value = mock_customer

    res_limit = MagicMock()
    res_limit.scalar_one.return_value = 0

    res_max = MagicMock()
    res_max.scalar_one_or_none.return_value = 1

    res_tech = MagicMock()
    res_tech.scalar_one_or_none.return_value = None  # Tech not found or not in shop

    db.execute.side_effect = [res_customer, res_limit, res_max, res_tech]

    ticket_data = MagicMock()
    ticket_data.customer_id = mock_customer.id
    ticket_data.customer_phone = None
    ticket_data.assigned_to = fake_tech_id
    ticket_data.images = []

    with patch("app.modules.billing.service.has_feature", new_callable=AsyncMock) as mock_feat:
        mock_feat.return_value = None
        with pytest.raises(ValidationException, match="Assigned user does not belong to this shop"):
            await create_ticket(shop_id, creator_id, ticket_data, db)


# ──────────────────────────────────────────────────────────────────────────────
# RD-03: Purchase order vendor tenant isolation
# ──────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_rd03_create_purchase_order_rejects_other_shop_vendor():
    from app.modules.inventory.service import create_purchase_order

    shop_id = uuid.uuid4()
    foreign_vendor_id = uuid.uuid4()
    db = AsyncMock()

    mock_scalar = MagicMock()
    mock_scalar.scalar_one_or_none.return_value = None
    db.execute.return_value = mock_scalar

    po_data = MagicMock()
    po_data.vendor_id = foreign_vendor_id

    with pytest.raises(ValidationException, match="Selected vendor was not found in your shop"):
        await create_purchase_order(shop_id, po_data, db)


# ──────────────────────────────────────────────────────────────────────────────
# RD-04: Prevent duplicate / repeated customer rating overwrite
# ──────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_rd04_submit_ticket_rating_rejects_duplicate():
    from app.modules.tickets.router import submit_ticket_rating

    ticket_id = uuid.uuid4()
    request = MagicMock()

    mock_ticket = MagicMock()
    mock_ticket.customer_rating = 5  # Already reviewed

    db = AsyncMock()
    mock_scalar = MagicMock()
    mock_scalar.scalar_one_or_none.return_value = mock_ticket
    db.execute.return_value = mock_scalar

    rating_data = MagicMock()
    rating_data.rating = 4
    rating_data.feedback = "Updated review"

    with pytest.raises(HTTPException) as exc_info:
        # Call unwrapped route function to bypass slowapi limiter Request check in unit test
        func = getattr(submit_ticket_rating, "__wrapped__", submit_ticket_rating)
        await func(request, ticket_id, rating_data, db)
    assert exc_info.value.status_code == 409
    assert "already been submitted" in exc_info.value.detail


# ──────────────────────────────────────────────────────────────────────────────
# RD-05: RBAC customer deletion requires OwnerUser
# ──────────────────────────────────────────────────────────────────────────────

def test_rd05_delete_customer_requires_owner_user():
    from app.modules.customers.router import delete_customer

    sig = inspect.signature(delete_customer)
    current_user_param = sig.parameters.get("current_user")
    assert current_user_param is not None
    assert current_user_param.annotation == OwnerUser


# ──────────────────────────────────────────────────────────────────────────────
# RD-06: OTP is never printed to stdout
# ──────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_rd06_send_otp_does_not_print_to_stdout(capsys):
    from app.modules.auth.service import send_otp

    db = AsyncMock()
    mock_scalar = MagicMock()
    mock_scalar.scalar_one_or_none.return_value = None
    db.execute.return_value = mock_scalar

    with patch("app.modules.auth.service.get_redis", new_callable=AsyncMock) as mock_redis, \
         patch("app.modules.notifications.email.EmailService.send_email", new_callable=AsyncMock):
        mock_redis_inst = AsyncMock()
        mock_redis_inst.ttl.return_value = 0  # No existing OTP — allow send
        mock_redis.return_value = mock_redis_inst

        await send_otp("user@example.com", db)
        captured = capsys.readouterr()
        assert "Code for" not in captured.out
        assert "REGISTRATION OTP" not in captured.out


@pytest.mark.asyncio
async def test_rd06_send_force_logout_otp_does_not_print_to_stdout(capsys):
    from app.modules.auth.service import send_force_logout_otp

    db = AsyncMock()
    mock_user = MagicMock()
    mock_user.full_name = "Test User"
    mock_scalar = MagicMock()
    mock_scalar.scalar_one_or_none.return_value = mock_user
    db.execute.return_value = mock_scalar

    with patch("app.modules.auth.service.get_redis", new_callable=AsyncMock) as mock_redis, \
         patch("app.modules.notifications.email.EmailService.send_email", new_callable=AsyncMock):
        mock_redis_inst = AsyncMock()
        mock_redis.return_value = mock_redis_inst

        await send_force_logout_otp("user@example.com", db)
        captured = capsys.readouterr()
        assert "Code for" not in captured.out
        assert "FORCE LOGOUT OTP" not in captured.out


# ──────────────────────────────────────────────────────────────────────────────
# RD-07: create_sse_token requires authenticated CurrentUser
# ──────────────────────────────────────────────────────────────────────────────

def test_rd07_create_sse_token_requires_current_user():
    from app.modules.notifications.router import create_sse_token

    sig = inspect.signature(create_sse_token)
    user_param = sig.parameters.get("current_user")
    assert user_param is not None
    assert user_param.annotation == CurrentUser


# ──────────────────────────────────────────────────────────────────────────────
# RD-08: Activity logs endpoint requires OwnerUser
# ──────────────────────────────────────────────────────────────────────────────

def test_rd08_list_activity_logs_requires_owner_user():
    from app.modules.activity.router import list_activity_logs

    sig = inspect.signature(list_activity_logs)
    user_param = sig.parameters.get("current_user")
    assert user_param is not None
    assert user_param.annotation == OwnerUser
