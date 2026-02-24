"""
Ticket Status State Machine

Valid transitions:
  RECEIVED      → IN_PROGRESS, WAITING_PARTS, CANCELLED
  IN_PROGRESS   → WAITING_PARTS, READY, CANCELLED
  WAITING_PARTS → IN_PROGRESS, READY, CANCELLED
  READY         → DELIVERED, CANCELLED
  DELIVERED     → (terminal)
  CANCELLED     → (terminal)

Role rules:
  - TECHNICIAN can move: RECEIVED→IN_PROGRESS, IN_PROGRESS→WAITING_PARTS, WAITING_PARTS→IN_PROGRESS, IN_PROGRESS→READY
  - OWNER can move any transition including CANCEL and READY→DELIVERED
"""

from app.core.exceptions import ForbiddenException, InvalidTransitionException

TRANSITIONS: dict[str, list[str]] = {
    "RECEIVED":      ["IN_PROGRESS", "WAITING_PARTS", "CANCELLED"],
    "IN_PROGRESS":   ["WAITING_PARTS", "READY", "CANCELLED"],
    "WAITING_PARTS": ["IN_PROGRESS", "READY", "CANCELLED"],
    "READY":         ["DELIVERED", "CANCELLED"],
    "DELIVERED":     [],
    "CANCELLED":     [],
}

OWNER_ONLY_TRANSITIONS: set[tuple[str, str]] = {
    ("READY", "DELIVERED"),
    ("RECEIVED", "CANCELLED"),
    ("IN_PROGRESS", "CANCELLED"),
    ("WAITING_PARTS", "CANCELLED"),
    ("READY", "CANCELLED"),
}


def validate_transition(from_status: str, to_status: str, role: str) -> None:
    """
    Raise InvalidTransitionException if the transition is not allowed.
    Raise ForbiddenException if the role cannot perform this transition.
    """
    allowed = TRANSITIONS.get(from_status, [])
    if to_status not in allowed:
        raise InvalidTransitionException(
            f"Cannot transition from {from_status} to {to_status}."
        )
    if (from_status, to_status) in OWNER_ONLY_TRANSITIONS and role != "OWNER":
        raise ForbiddenException(
            f"Only shop owners can transition from {from_status} to {to_status}."
        )
