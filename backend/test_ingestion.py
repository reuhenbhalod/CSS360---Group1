# ─────────────────────────────────────────────────────────────
# test_ingestion.py
# Tests for G1-5 (schema) and G1-6 (ingestion pipeline)
# Run: python -m pytest test_ingestion.py -v
# ─────────────────────────────────────────────────────────────

import json

import pytest

from database import get_conn
from ingestion import (
    get_cached_envelope,
    ingest_feed_items,
    ingest_venues,
    save_cached_envelope,
)


# Point DB at a temp file so tests never touch the real DB.
@pytest.fixture(autouse=True)
def temp_db(monkeypatch, tmp_path):
    db_file = tmp_path / "test.db"
    import database
    monkeypatch.setattr(database, "DB_PATH", db_file)
    database.init_db()
    yield db_file

# ── Sample data ───────────────────────────────────────────────

GOOD_REDDIT = {
    "id": "r1", "source": "reddit", "title": "Best brunch in Bothell?",
    "raw_text": "Looking for weekend brunch spots.", "url": "https://reddit.com/r/1",
    "author": "u/foodie", "score": 47, "num_comments": 12,
    "publishedAt": "2026-04-21T14:00:00Z",
}

GOOD_NEWS = {
    "id": "n1", "source": "gnews",
    "title": "Main Street gets 6 new restaurants",
    "description": "The corridor is booming.", "url": "https://example.com/1",
    "publishedAt": "2026-04-21T14:00:00Z",
}

GOOD_VENUE = {
    "id": "fsq-1", "source": "foursquare", "kind": "restaurant",
    "name": "Beardslee Public House", "address": "11700 Beardslee Blvd",
    "city": "Bothell", "lat": 47.7623, "lon": -122.2054,
    "categories": ["American", "Brewery"], "distance_m": 120,
}

# ── G1-5: Schema tests ────────────────────────────────────────

class TestSchema:
    def test_trend_records_table_exists(self):
        with get_conn() as conn:
            tables = [r[0] for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()]
        assert "trend_records" in tables

    def test_venues_table_exists(self):
        with get_conn() as conn:
            tables = [r[0] for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()]
        assert "venues" in tables

    def test_api_cache_table_exists(self):
        with get_conn() as conn:
            tables = [r[0] for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()]
        assert "api_cache" in tables

    def test_trend_records_has_required_columns(self):
        with get_conn() as conn:
            cols = [r[1] for r in conn.execute(
                "PRAGMA table_info(trend_records)"
            ).fetchall()]
        for col in ("id", "source", "fetched_at", "raw_text", "sentiment_score"):
            assert col in cols, f"Missing column: {col}"

    def test_sentiment_score_is_nullable(self):
        """sentiment_score must be NULL-able (Phase 2 placeholder)."""
        ingest_feed_items([GOOD_REDDIT])
        with get_conn() as conn:
            row = conn.execute(
                "SELECT sentiment_score FROM trend_records WHERE id = ?", ("r1",)
            ).fetchone()
        assert row is not None
        assert row["sentiment_score"] is None

# ── G1-6: Ingestion pipeline tests ───────────────────────────

class TestFeedIngestion:
    def test_inserts_valid_reddit_post(self):
        result = ingest_feed_items([GOOD_REDDIT])
        assert result["inserted"] == 1
        assert result["skipped_invalid"] == 0

    def test_inserts_valid_news_article(self):
        result = ingest_feed_items([GOOD_NEWS])
        assert result["inserted"] == 1

    def test_deduplicates_same_id(self):
        ingest_feed_items([GOOD_REDDIT])
        result = ingest_feed_items([GOOD_REDDIT])   # second insert same id
        assert result["skipped_duplicate"] == 1
        assert result["inserted"] == 0

    def test_rejects_missing_id(self):
        bad = {**GOOD_REDDIT, "id": ""}
        result = ingest_feed_items([bad])
        assert result["skipped_invalid"] == 1

    def test_rejects_unknown_source(self):
        bad = {**GOOD_REDDIT, "source": "twitter"}
        result = ingest_feed_items([bad])
        assert result["skipped_invalid"] == 1

    def test_rejects_no_content(self):
        bad = {**GOOD_REDDIT, "title": "", "raw_text": ""}
        result = ingest_feed_items([bad])
        assert result["skipped_invalid"] == 1

    def test_batch_insert_multiple(self):
        items = [GOOD_REDDIT, GOOD_NEWS]
        result = ingest_feed_items(items)
        assert result["inserted"] == 2

    def test_raw_json_stored(self):
        ingest_feed_items([GOOD_REDDIT])
        with get_conn() as conn:
            row = conn.execute(
                "SELECT raw_json FROM trend_records WHERE id = ?", ("r1",)
            ).fetchone()
        stored = json.loads(row["raw_json"])
        assert stored["title"] == GOOD_REDDIT["title"]

    def test_mixed_valid_and_invalid(self):
        bad = {**GOOD_REDDIT, "id": "r-bad", "source": "unknown"}
        result = ingest_feed_items([GOOD_REDDIT, bad])
        assert result["inserted"] == 1
        assert result["skipped_invalid"] == 1

class TestVenueIngestion:
    def test_inserts_valid_venue(self):
        result = ingest_venues([GOOD_VENUE])
        assert result["inserted"] == 1

    def test_upserts_on_conflict(self):
        ingest_venues([GOOD_VENUE])
        updated = {**GOOD_VENUE, "name": "Beardslee v2"}
        result = ingest_venues([updated])
        assert result["updated"] == 1
        with get_conn() as conn:
            row = conn.execute(
                "SELECT name FROM venues WHERE id = ?", ("fsq-1",)
            ).fetchone()
        assert row["name"] == "Beardslee v2"

    def test_rejects_missing_latlon(self):
        bad = {**GOOD_VENUE, "lat": None, "lon": None}
        result = ingest_venues([bad])
        assert result["skipped_invalid"] == 1

class TestCache:
    def test_cache_miss_returns_none(self):
        assert get_cached_envelope("foursquare") is None

    def test_save_and_retrieve_cache(self):
        envelope = {
            "source": "gnews", "ok": True, "count": 1,
            "data": [GOOD_NEWS], "error": None
        }
        save_cached_envelope("gnews", envelope)
        cached = get_cached_envelope("gnews")
        assert cached is not None
        assert cached["count"] == 1
