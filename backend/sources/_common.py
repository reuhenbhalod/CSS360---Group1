"""Shared helpers for source fetchers."""
from __future__ import annotations
from typing import Any


def envelope(source: str, data: list[Any] | None = None, error: str | None = None) -> dict:
    """Build the {source, ok, count, data, error} envelope the frontend expects."""
    items = data or []
    ok = error is None
    return {
        "source": source,
        "ok": ok,
        "count": len(items) if ok else 0,
        "data": items if ok else [],
        "error": error,
    }
