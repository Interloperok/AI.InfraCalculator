from __future__ import annotations

from fastapi import HTTPException


class AppError(Exception):
    """Base backend domain error."""

    status_code = 500

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


class ValidationAppError(AppError):
    """Input validation / request parameter error."""

    status_code = 400


class NotFoundAppError(AppError):
    """Requested resource not found."""

    status_code = 404


class ServiceAppError(AppError):
    """Internal backend service error."""

    status_code = 500


def to_http_exception(error: AppError) -> HTTPException:
    """Convert a domain error into an HTTPException."""
    return HTTPException(status_code=error.status_code, detail=error.message)
