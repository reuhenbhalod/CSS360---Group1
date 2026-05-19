# ─────────────────────────────────────────────────────────────
# database.py
# G1-5: Schema for trend records + migration
#
# Tables:
#   trend_records  — raw ingested items from all 5 sources
#   venues         — restaurants & OSM places
#   api_cache      — per-source cache envelope (TTL-based)
# ─────────────────────────────────────────────────────────────

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "goodeats.db"

# ── Connection ────────────────────────────────────────────────

def get_conn() -> sqlite3.Connection:
    """Return a connection with row_factory set so rows behave like dicts."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    # Enable WAL mode for better concurrent read performance
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn

# ── Migration (G1-5) ─────────────────────────────────────────

MIGRATION_SQL = """
-- ── trend_records ─────────────────────────────────────────
-- One row per feed item (Reddit post, news article, Guardian piece).
-- Satisfies G1-5: source, timestamp, raw_text, sentiment_score columns.
CREATE TABLE IF NOT EXISTS trend_records (
    id              TEXT PRIMARY KEY,          -- e.g. "r1", "gnews-0-...", "guardian-0"
    source          TEXT NOT NULL,             -- 'reddit' | 'gnews' | 'guardian'
    fetched_at      INTEGER NOT NULL,          -- Unix timestamp when WE fetched it
    published_at    TEXT,                      -- ISO-8601 string from upstream
    title           TEXT,
    raw_text        TEXT,                      -- selftext / description / trail_text
    url             TEXT,
    author          TEXT,                      -- Reddit author; NULL for news
    score           INTEGER,                   -- Reddit upvotes; NULL for news
    num_comments    INTEGER,                   -- Reddit comment count; NULL for news
    sentiment_score REAL,                      -- Phase 2 ML placeholder; NULL for now
    raw_json        TEXT NOT NULL              -- full upstream JSON, never discarded
);

-- ── venues ────────────────────────────────────────────────
-- One row per restaurant or OSM place.
CREATE TABLE IF NOT EXISTS venues (
    id              TEXT PRIMARY KEY,          -- fsq_id or osm-node-NNN
    kind            TEXT NOT NULL,             -- 'restaurant' | 'place'
    source          TEXT NOT NULL,             -- 'foursquare' | 'overpass'
    name            TEXT,
    address         TEXT,
    city            TEXT,
    lat             REAL,
    lon             REAL,
    categories      TEXT,                      -- JSON array  e.g. '["Italian","Bar"]'
    amenity         TEXT,                      -- OSM only
    outdoor_seating INTEGER,                   -- 1/0/NULL
    takeaway        INTEGER,                   -- 1/0/NULL
    distance_m      REAL,
    fetched_at      INTEGER NOT NULL
);

-- ── api_cache ─────────────────────────────────────────────
-- Stores the last full envelope per source so we can serve
-- the frontend without hitting external APIs on every request.
CREATE TABLE IF NOT EXISTS api_cache (
    source      TEXT PRIMARY KEY,              -- 'foursquare' | 'overpass' | 'reddit' | 'gnews' | 'guardian'
    payload     TEXT NOT NULL,                 -- JSON string of full envelope
    fetched_at  INTEGER NOT NULL               -- Unix timestamp of last fetch
);

-- ── Indexes ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_trend_source      ON trend_records(source);
CREATE INDEX IF NOT EXISTS idx_trend_fetched_at  ON trend_records(fetched_at);
CREATE INDEX IF NOT EXISTS idx_trend_published   ON trend_records(published_at);
CREATE INDEX IF NOT EXISTS idx_venues_source     ON venues(source);
CREATE INDEX IF NOT EXISTS idx_venues_latlon     ON venues(lat, lon);
"""

def init_db():
    """Create all tables and indexes if they don't already exist (safe to run multiple times)."""
    with get_conn() as conn:
        conn.executescript(MIGRATION_SQL)
    print(f"[DB] Initialized → {DB_PATH}")
