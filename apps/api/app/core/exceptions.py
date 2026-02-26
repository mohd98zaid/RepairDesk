from fastapi import HTTPException, status


class RepairDeskException(HTTPException):
    """Base exception for RepairDesk API errors."""

    def __init__(self, status_code: int, detail: str, code: str = "INTERNAL_ERROR"):
        self.code = code
        super().__init__(
            status_code=status_code,
            detail=detail,
        )


class UnauthorizedException(RepairDeskException):
    def __init__(self, detail: str = "Authentication required."):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail,
            code="UNAUTHORIZED",
        )


class ForbiddenException(RepairDeskException):
    def __init__(self, detail: str = "You do not have permission to perform this action."):
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=detail,
            code="FORBIDDEN",
        )


class NotFoundException(RepairDeskException):
    def __init__(self, detail: str = "Resource not found."):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=detail,
            code="NOT_FOUND",
        )


class ConflictException(RepairDeskException):
    def __init__(self, detail: str = "Resource already exists."):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            detail=detail,
            code="CONFLICT",
        )


class ValidationException(RepairDeskException):
    def __init__(self, detail: str = "Invalid input."):
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=detail,
            code="VALIDATION_ERROR",
        )


class InvalidTransitionException(RepairDeskException):
    def __init__(self, detail: str = "Invalid status transition."):
        super().__init__(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=detail,
            code="INVALID_TRANSITION",
        )


class RateLimitedException(RepairDeskException):
    def __init__(self, detail: str = "Too many requests."):
        super().__init__(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=detail,
            code="RATE_LIMITED",
        )
