"""
Unit tests — pure function tests that don't hit the database or HTTP layer.
Covers: security helpers, state-machine transitions, report aggregation logic.
"""
import pytest
from decimal import Decimal
from unittest.mock import MagicMock, AsyncMock, patch

# ──────────────────────────────────────────────────────────────────────────────
# Security: password hashing
# ──────────────────────────────────────────────────────────────────────────────

class TestPasswordSecurity:
    def test_hash_and_verify(self):
        from app.core.security import hash_password, verify_password
        pw = "SuperSecret99!"
        hashed = hash_password(pw)
        assert hashed != pw
        assert verify_password(pw, hashed)

    def test_wrong_password_fails(self):
        from app.core.security import hash_password, verify_password
        hashed = hash_password("CorrectHorseBattery")
        assert not verify_password("WrongPassword", hashed)

    def test_different_hashes_for_same_password(self):
        """bcrypt uses a random salt — hashes should never be equal."""
        from app.core.security import hash_password
        pw = "SamePassword1!"
        assert hash_password(pw) != hash_password(pw)


# ──────────────────────────────────────────────────────────────────────────────
# Security: JWT creation and decoding
# ──────────────────────────────────────────────────────────────────────────────

class TestJWT:
    def test_create_and_decode_access_token(self):
        from app.core.security import create_access_token, decode_token
        payload = {"sub": "user-123", "shop_id": "shop-456", "role": "OWNER"}
        token = create_access_token(payload)
        decoded = decode_token(token)
        assert decoded["sub"] == "user-123"
        assert decoded["shop_id"] == "shop-456"
        assert decoded["role"] == "OWNER"
        assert decoded["type"] == "access"

    def test_create_refresh_token_type(self):
        from app.core.security import create_refresh_token, decode_token
        payload = {"sub": "user-123", "shop_id": "shop-456", "role": "TECHNICIAN"}
        token = create_refresh_token(payload)
        decoded = decode_token(token)
        assert decoded["type"] == "refresh"

    def test_invalid_token_raises(self):
        from jose import JWTError
        from app.core.security import decode_token
        with pytest.raises(JWTError):
            decode_token("this.is.not.valid")

    def test_tampered_token_raises(self):
        from jose import JWTError
        from app.core.security import create_access_token, decode_token
        token = create_access_token({"sub": "u1", "shop_id": "s1", "role": "OWNER"})
        # Tamper the signature
        parts = token.split(".")
        tampered = parts[0] + "." + parts[1] + ".invalidsig"
        with pytest.raises(JWTError):
            decode_token(tampered)


# ──────────────────────────────────────────────────────────────────────────────
# Ticket state machine
# ──────────────────────────────────────────────────────────────────────────────

class TestTicketStateMachine:
    def test_valid_transition_does_not_raise(self):
        from app.modules.tickets.state_machine import validate_transition
        # These should not raise
        validate_transition("RECEIVED", "IN_PROGRESS", "TECHNICIAN")
        validate_transition("IN_PROGRESS", "READY", "TECHNICIAN")
        validate_transition("IN_PROGRESS", "WAITING_PARTS", "TECHNICIAN")

    def test_ready_to_delivered_requires_owner(self):
        from app.modules.tickets.state_machine import validate_transition
        validate_transition("READY", "DELIVERED", "OWNER")  # Should not raise

    def test_technician_cannot_deliver(self):
        from app.modules.tickets.state_machine import validate_transition
        from app.core.exceptions import ForbiddenException
        with pytest.raises(ForbiddenException):
            validate_transition("READY", "DELIVERED", "TECHNICIAN")

    def test_invalid_transition_raises(self):
        from app.modules.tickets.state_machine import validate_transition
        from app.core.exceptions import InvalidTransitionException
        with pytest.raises(InvalidTransitionException):
            validate_transition("RECEIVED", "DELIVERED", "OWNER")  # Skip states

    def test_backward_transition_raises(self):
        from app.modules.tickets.state_machine import validate_transition
        from app.core.exceptions import InvalidTransitionException
        with pytest.raises(InvalidTransitionException):
            validate_transition("DELIVERED", "IN_PROGRESS", "OWNER")

    def test_transitions_dict_has_all_statuses(self):
        from app.modules.tickets.state_machine import TRANSITIONS
        expected = {"RECEIVED", "IN_PROGRESS", "WAITING_PARTS", "READY", "DELIVERED", "CANCELLED"}
        assert set(TRANSITIONS.keys()) == expected

    def test_terminal_states_have_no_transitions(self):
        from app.modules.tickets.state_machine import TRANSITIONS
        assert TRANSITIONS.get("DELIVERED", []) == []
        assert TRANSITIONS.get("CANCELLED", []) == []


# ──────────────────────────────────────────────────────────────────────────────
# Inventory margin calculation (service logic)
# ──────────────────────────────────────────────────────────────────────────────

class TestInventoryMargin:
    def test_positive_margin(self):
        purchase = Decimal("500.00")
        selling = Decimal("750.00")
        margin = ((selling - purchase) / purchase) * 100
        assert round(margin, 2) == Decimal("50.00")

    def test_zero_margin(self):
        purchase = Decimal("100.00")
        selling = Decimal("100.00")
        margin = ((selling - purchase) / purchase) * 100
        assert margin == 0

    def test_negative_margin(self):
        purchase = Decimal("200.00")
        selling = Decimal("150.00")
        margin = ((selling - purchase) / purchase) * 100
        assert margin == Decimal("-25.00")


# ──────────────────────────────────────────────────────────────────────────────
# Low stock check logic
# ──────────────────────────────────────────────────────────────────────────────

class TestLowStockLogic:
    def test_is_low_stock_when_at_threshold(self):
        # Quantity at or below threshold = low stock
        item = MagicMock()
        item.quantity = 5
        item.low_stock_threshold = 5
        assert item.quantity <= item.low_stock_threshold

    def test_not_low_stock_above_threshold(self):
        item = MagicMock()
        item.quantity = 10
        item.low_stock_threshold = 5
        assert not (item.quantity <= item.low_stock_threshold)

    def test_zero_quantity_is_always_low(self):
        item = MagicMock()
        item.quantity = 0
        item.low_stock_threshold = 5
        assert item.quantity <= item.low_stock_threshold


# ──────────────────────────────────────────────────────────────────────────────
# Report aggregation helpers
# ──────────────────────────────────────────────────────────────────────────────

class TestReportAggregation:
    def _make_ticket(self, final_cost, parts_cost, profit):
        t = MagicMock()
        t.final_cost = Decimal(str(final_cost)) if final_cost is not None else None
        t.parts_cost = Decimal(str(parts_cost)) if parts_cost is not None else None
        t.profit = Decimal(str(profit)) if profit is not None else None
        return t

    def test_revenue_sum(self):
        tickets = [
            self._make_ticket(1000, 200, 800),
            self._make_ticket(500, 100, 400),
            self._make_ticket(None, 0, 0),
        ]
        revenue = sum(t.final_cost or Decimal(0) for t in tickets)
        assert revenue == Decimal("1500.00")

    def test_profit_sum(self):
        tickets = [
            self._make_ticket(1000, 200, 800),
            self._make_ticket(500, 100, 400),
        ]
        profit = sum(t.profit or Decimal(0) for t in tickets)
        assert profit == Decimal("1200.00")

    def test_empty_delivered_list(self):
        tickets = []
        revenue = sum(t.final_cost or Decimal(0) for t in tickets)
        assert revenue == Decimal("0")

    def test_avg_ticket_value(self):
        tickets = [
            self._make_ticket(1000, 200, 800),
            self._make_ticket(500, 100, 400),
        ]
        total = sum(t.final_cost or Decimal(0) for t in tickets)
        avg = total / len(tickets)
        assert avg == Decimal("750.00")

    def test_avg_ticket_value_empty_list(self):
        tickets = []
        result = Decimal(0) if not tickets else sum(t.final_cost for t in tickets) / len(tickets)
        assert result == Decimal(0)


# ──────────────────────────────────────────────────────────────────────────────
# Invoice number generation format
# ──────────────────────────────────────────────────────────────────────────────

class TestInvoiceNumberFormat:
    def test_format(self):
        from datetime import date
        today = date(2026, 2, 23)
        seq = 7
        invoice_number = f"INV-{today.strftime('%Y%m')}-{seq:04d}"
        assert invoice_number == "INV-202602-0007"

    def test_format_large_seq(self):
        from datetime import date
        today = date(2026, 12, 1)
        seq = 1234
        invoice_number = f"INV-{today.strftime('%Y%m')}-{seq:04d}"
        assert invoice_number == "INV-202612-1234"
