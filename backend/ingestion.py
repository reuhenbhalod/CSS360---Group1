# ─────────────────────────────────────────────────────────────
# ingestion.py
# G1-6: Ingestion pipeline — validates, deduplicates,
#        and batch-inserts incoming records.
# ─────────────────────────────────────────────────────────────

import json
import time
import sqlite3
from database import get_conn

# ── Validation helpers ────────────────────────────────────────

VALID_SOURCES = {"foursquare", "overpass", "reddit", "gnews", "guardian"}

def _validate_trend(item: dict) -> list:
    errors = []
    if not item.get("id"):
        errors.append("missing id")
    if item.get("source") not in VALID_SOURCES:
        errors.append(f"unknown source: {item.get('source')!r}")
    if not item.get("title") and not item.get("raw_text"):
        errors.append("no content (title and raw_text both empty)")
    return errors

def _validate_venue(item: dict) -> list:
    errors = []
    if not item.get("id"):
        errors.append("missing id")
    if item.get("source") not in VALID_SOURCES:
        errors.append(f"unknown source: {item.get('source')!r}")
    if item.get("lat") is None or item.get("lon") is None:
        errors.append("missing lat/lon")
    return errors

# ── Ingest trend_records (Reddit, GNews, Guardian) ────────────

def ingest_feed_items(items: list) -> dict:
    """
    Validate, deduplicate, and batch-insert feed items.
    Returns { inserted, skipped_duplicate, skipped_invalid, errors }
    """
    inserted = 0
    skipped_dup = 0
    skipped_inv = 0
    error_log = []
    now = int(time.time())

    valid_rows = []
    for item in items:
        errs = _validate_trend(item)
        if errs:
            skipped_inv += 1
            error_log.append({"id": item.get("id"), "errors": errs})
            continue
        valid_rows.append(item)

    if not valid_rows:
        return {
            "inserted": 0,
            "skipped_duplicate": 0,
            "skipped_invalid": skipped_inv,
            "errors": error_log,
        }

    with get_conn() as conn:
        for item in valid_rows:
            try:
                conn.execute(
                    """
                    INSERT INTO trend_records
                        (id, source, fetched_at, published_at, title,
                         raw_text, url, author, score, num_comments,
                         sentiment_score, raw_json)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO NOTHING
                    """,
                    (
                        item["id"],
                        item.get("source"),
                        now,
                        item.get("publishedAt") or item.get("published_at"),
                        item.get("title"),
                        item.get("raw_text") or item.get("selftext") or item.get("description") or item.get("trail_text"),
                        item.get("url") or item.get("permalink"),
                        item.get("author"),
                        item.get("score"),
                        item.get("num_comments"),
                        None,  # sentiment_score — Phase 2 placeholder
                        json.dumps(item),
                    ),
                )
                if conn.execute("SELECT changes()").fetchone()[0] == 1:
                    inserted += 1
                else:
                    skipped_dup += 1
            except sqlite3.Error as e:
                error_log.append({"id": item.get("id"), "errors": [str(e)]})
                skipped_inv += 1

    return {
        "inserted": inserted,
        "skipped_duplicate": skipped_dup,
        "skipped_invalid": skipped_inv,
        "errors": error_log,
    }

# ── Ingest venues (Foursquare, OSM) ──────────────────────────

def ingest_venues(items: list) -> dict:
    """
    Validate, deduplicate, and batch-insert venue rows.
    Uses UPSERT so venue data stays fresh on re-fetch.
    Returns { inserted, updated, skipped_invalid, errors }
    """
    inserted = 0
    updated = 0
    skipped_inv = 0
    error_log = []
    now = int(time.time())

    with get_conn() as conn:
        for item in items:
            errs = _validate_venue(item)
            if errs:
                skipped_inv += 1
                error_log.append({"id": item.get("id"), "errors": errs})
                continue
            try:
                # Check existence BEFORE upsert to distinguish insert vs update
                already_exists = conn.execute(
                    "SELECT 1 FROM venues WHERE id = ?", (item["id"],)
                ).fetchone() is not None

                conn.execute(
                    """
                    INSERT INTO venues
                        (id, kind, source, name, address, city, lat, lon,
                         categories, amenity, outdoor_seating, takeaway,
                         distance_m, fetched_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        name            = excluded.name,
                        address         = excluded.address,
                        lat             = excluded.lat,
                        lon             = excluded.lon,
                        categories      = excluded.categories,
                        outdoor_seating = excluded.outdoor_seating,
                        takeaway        = excluded.takeaway,
                        distance_m      = excluded.distance_m,
                        fetched_at      = excluded.fetched_at
                    """,
                    (
                        item["id"],
                        item.get("kind"),
                        item.get("source"),
                        item.get("name"),
                        item.get("address"),
                        item.get("city"),
                        item.get("lat"),
                        item.get("lon"),
                        json.dumps(item.get("categories") or item.get("cuisine") or []),
                        item.get("amenity"),
                        1 if item.get("outdoor_seating") is True else (0 if item.get("outdoor_seating") is False else None),
                        1 if item.get("takeaway") is True else (0 if item.get("takeaway") is False else None),
                        item.get("distance_m"),
                        now,
                    ),
                )
                if already_exists:
                    updated += 1
                else:
                    inserted += 1
            except sqlite3.Error as e:
                error_log.append({"id": item.get("id"), "errors": [str(e)]})
                skipped_inv += 1

    return {
        "inserted": inserted,
        "updated": updated,
        "skipped_invalid": skipped_inv,
        "errors": error_log,
    }

# ── Cache helpers ─────────────────────────────────────────────

CACHE_TTL = 3600  # 1 hour

def get_cached_envelope(source: str):
    """Return the cached envelope dict if still within TTL, else None."""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT payload, fetched_at FROM api_cache WHERE source = ?",
            (source,),
        ).fetchone()
    if row and (time.time() - row["fetched_at"]) < CACHE_TTL:
        return json.loads(row["payload"])
    return None

def save_cached_envelope(source: str, envelope: dict):
    """Upsert a full envelope into api_cache AND ingest its items."""
    payload = json.dumps(envelope)
    now = int(time.time())

    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO api_cache (source, payload, fetched_at)
            VALUES (?, ?, ?)
            ON CONFLICT(source) DO UPDATE SET
                payload    = excluded.payload,
                fetched_at = excluded.fetched_at
            """,
            (source, payload, now),
        )

    # Also write individual rows for future search/query
    items = envelope.get("data", [])
    if source in ("foursquare", "overpass"):
        for item in items:
            item["source"] = source
        ingest_venues(items)
    elif source in ("reddit", "gnews", "guardian"):
        for item in items:
            item["source"] = source
        ingest_feed_items(items)
