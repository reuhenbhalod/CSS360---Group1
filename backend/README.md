# GoodEats Backend

FastAPI service that aggregates 5 upstream APIs and persists everything
to SQLite. The frontend hits `GET /api/all`, which is cache-first:
results are served from the local database when they're younger than
the cache TTL, and re-fetched from upstream otherwise.

## Sources

| Slot          | Source           | Needs API key? |
| ------------- | ---------------- | -------------- |
| `restaurants` | Foursquare v3    | yes            |
| `places`      | Overpass / OSM   | no             |
| `reddit`      | Reddit (public)  | no             |
| `news`        | GNews            | yes            |
| `articles`    | The Guardian     | yes            |

Each source is fetched in parallel. A failure in one (missing key,
network error, rate limit) returns `ok: false` for that source with an
error message — the other sources are unaffected. Only `ok: true`
envelopes are written to the cache, so a transient failure on one
source won't poison the next hour of requests.

## Setup

From the repo root:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Edit `.env` and paste in whichever API keys you have. Leaving a key
blank is fine — that source will simply report `ok: false` with a
"key not set" error, and the rest of the dashboard still works.

Get keys at:
- Foursquare: <https://foursquare.com/developers/>
- GNews: <https://gnews.io/>
- The Guardian: <https://open-platform.theguardian.com/>

## Run

```bash
python main.py
```

The server starts on `http://localhost:8000`, which is the `API_BASE`
the frontend (`src/App.jsx`) calls. On first launch it creates
`backend/goodeats.db` automatically.

## Endpoints

- `GET /api/health` → `{"ok": true}`
- `GET /api/all` → cache-first aggregated response (see below)
- `GET /api/all?fresh=1` → bypass the cache, force a live fetch

```jsonc
{
  "restaurants": { "source": "foursquare", "ok": true, "count": N, "data": [...], "error": null },
  "places":      { "source": "overpass",   "ok": true, "count": N, "data": [...], "error": null },
  "reddit":      { "source": "reddit",     "ok": true, "count": N, "data": [...], "error": null },
  "news":        { "source": "gnews",      "ok": true, "count": N, "data": [...], "error": null },
  "articles":    { "source": "guardian",   "ok": true, "count": N, "data": [...], "error": null }
}
```

`data` items are normalized by `backend/parsers.py` (a Python port of
`src/parsers.js`) into the shared shape both the SQL layer and the React
components consume.

## Storage layer

SQLite database at `backend/goodeats.db`. Three tables (see
`backend/database.py` for the full schema):

| Table           | Purpose                                                     |
| --------------- | ----------------------------------------------------------- |
| `venues`        | Restaurants (Foursquare) and places (OSM) — UPSERT-ed       |
| `trend_records` | Reddit posts + news articles — append-only, deduped by id   |
| `api_cache`     | One row per source: latest envelope JSON + fetch timestamp  |

`trend_records` has a `sentiment_score REAL` column reserved for the
Phase 2 ML pipeline; it's `NULL` for all ingestion done in Phase 1.

Cache TTL is 1 hour (`CACHE_TTL` in `ingestion.py`). Override by
editing the constant — there's no env variable for it yet.

## Tests

```bash
python -m pytest test_ingestion.py -v
```

19 tests covering the SQL schema (table presence, column types,
nullability of `sentiment_score`), the ingestion pipeline
(insert, dedupe, upsert, validation rejections, batch mixed
valid/invalid), and the cache layer (miss returns None,
save-then-retrieve round-trip).

The fixture in `test_ingestion.py` monkey-patches `DB_PATH` to a
`tmp_path` per test, so tests never touch the real `goodeats.db`.

## Configuration

Search area defaults to downtown Bothell, WA. Override in `.env`:

```
GOODEATS_LAT=47.7623
GOODEATS_LON=-122.2054
GOODEATS_RADIUS_M=2000
```

## Architecture notes

**Why a Python port of `src/parsers.js`?** The SQL ingestion validates
that each item has an `id`, a `source`, and (for venues) lat/lon at the
top level. Raw upstream payloads don't always provide those — Reddit
nests its fields under `data`, Foursquare uses `fsq_id` and
`geocodes.main.latitude`, etc. Normalizing on the backend lets the
ingestion accept everything and lets the frontend's `parseApiResponse`
act as a defensive no-op against future schema drift.

**Why does Reddit shell out to `curl`?** Reddit's bot filter blocks
Python HTTP clients (`httpx`, `curl_cffi`) at the TLS-fingerprint
level. The system `curl` binary is the only client we found that gets
through consistently. See the docstring in `sources/reddit.py` for the
investigation trail.
