"""Short-lived Excel download links."""

from __future__ import annotations

from datetime import datetime, timezone

from services.report_downloads import ReportDownloadStore


def test_store_returns_bytes_until_the_link_expires() -> None:
    now = [0.0]
    store = ReportDownloadStore(clock=lambda: now[0])

    report_id, expires_at = store.put(b"PK\x03\x04", "sizing_report.xlsx", ttl_seconds=10)

    assert expires_at > datetime.now(timezone.utc)
    assert store.get(report_id) == (b"PK\x03\x04", "sizing_report.xlsx")

    now[0] = 10
    assert store.get(report_id) is None
    assert store.get("missing") is None
