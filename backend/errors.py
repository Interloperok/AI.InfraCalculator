from __future__ import annotations

from fastapi import HTTPException


class AppError(Exception):
    """Базовая доменная ошибка backend."""

    status_code = 500

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


class ValidationAppError(AppError):
    """Ошибка валидации входных данных/параметров запроса."""

    status_code = 400


class NotFoundAppError(AppError):
    """Запрошенный ресурс не найден."""

    status_code = 404


class ServiceAppError(AppError):
    """Внутренняя ошибка backend-сервиса."""

    status_code = 500


def to_http_exception(error: AppError) -> HTTPException:
    """Преобразовать доменную ошибку в HTTPException."""
    return HTTPException(status_code=error.status_code, detail=error.message)
