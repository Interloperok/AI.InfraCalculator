"""Short-lived Excel downloads for the MCP report tool.

The public site runs one uvicorn process, so the bytes stay in memory.
A link is valid for ``TTL_SECONDS`` and then disappears.
"""

from __future__ import annotations

import secrets
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Callable

from pydantic import BaseModel

TTL_SECONDS = 30 * 60


class ReportDownload(BaseModel):
    """Link a chat client can show the user."""

    filename: str
    download_url: str
    expires_at: datetime


@dataclass
class _StoredReport:
    content: bytes
    filename: str
    expires_at_monotonic: float


class ReportDownloadStore:
    """Process-local map of report id to workbook bytes."""

    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._items: dict[str, _StoredReport] = {}
        self._lock = threading.Lock()

    def put(self, content: bytes, filename: str, ttl_seconds: int = TTL_SECONDS) -> tuple[str, datetime]:
        """Store a workbook and return its id plus the wall-clock expiry."""
        report_id = secrets.token_urlsafe(18)
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
        stored = _StoredReport(
            content=content,
            filename=filename,
            expires_at_monotonic=self._clock() + ttl_seconds,
        )
        with self._lock:
            self._purge_locked()
            self._items[report_id] = stored
        return report_id, expires_at

    def get(self, report_id: str) -> tuple[bytes, str] | None:
        """Return workbook bytes and filename, or None when missing or expired."""
        with self._lock:
            self._purge_locked()
            stored = self._items.get(report_id)
            if stored is None:
                return None
            return stored.content, stored.filename

    def clear(self) -> None:
        """Drop every stored workbook. Tests use this between cases."""
        with self._lock:
            self._items.clear()

    def _purge_locked(self) -> None:
        now = self._clock()
        expired = [key for key, item in self._items.items() if item.expires_at_monotonic <= now]
        for key in expired:
            del self._items[key]


report_downloads = ReportDownloadStore()
