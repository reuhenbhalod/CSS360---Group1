"""GoodEats backend — FastAPI service that aggregates 5 upstream APIs
and caches the results in SQLite.

Endpoints:
  GET /api/all          — cache-first; on miss, fetches in parallel,
                          normalizes, persists, and returns. Response is
                          a dict of envelopes keyed by the frontend slot
                          names:
                            restaurants -> Foursquare
                            places      -> OpenStreetMap (Overpass)
                            reddit      -> Reddit
                            news        -> GNews
                            articles    -> The Guardian
  GET /api/all?fresh=1  — bypass cache; force a live fetch.
  GET /api/health       — liveness probe.

Cache TTL is 1 hour (see ingestion.CACHE_TTL). Each persisted envelope
is fanned out to per-row tables (`venues`, `trend_records`) via the
ingestion pipeline so future search / analytics queries have something
to work with.
"""
import asyncio
import os
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import init_db
from ingestion import get_cached_envelope, save_cached_envelope
from parsers import normalize_envelope
from sources import foursquare, gnews, guardian, overpass, reddit

load_dotenv(Path(__file__).parent / ".env")


# Map frontend slot names → upstream source names.
SOURCE_KEYS = {
    "restaurants": "foursquare",
    "places":      "overpass",
    "reddit":      "reddit",
    "news":        "gnews",
    "articles":    "guardian",
}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(title="GoodEats Backend", version="0.6", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
        "http://localhost:8080",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8080",
    ],
    allow_methods=["GET"],
    allow_headers=["*"],
)


def _float_env(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, ""))
    except ValueError:
        return default


def _int_env(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, ""))
    except ValueError:
        return default


async def _fetch_live(client: httpx.AsyncClient, source: str, lat: float, lon: float, radius_m: int) -> dict:
    """Call the appropriate live fetcher and normalize the result."""
    if source == "foursquare":
        raw = await foursquare.fetch(client, lat, lon, radius_m)
    elif source == "overpass":
        raw = await overpass.fetch(client, lat, lon, radius_m)
    elif source == "reddit":
        raw = await reddit.fetch()
    elif source == "gnews":
        raw = await gnews.fetch(client)
    elif source == "guardian":
        raw = await guardian.fetch(client)
    else:
        return {"source": source, "ok": False, "count": 0, "data": [], "error": "unknown source"}

    normalized = normalize_envelope(raw)
    if normalized.get("ok"):
        try:
            save_cached_envelope(source, normalized)
        except Exception as e:
            # Persistence failures should never break the API response —
            # surface them on the envelope's `error` for visibility but
            # still return the freshly-fetched data.
            normalized = {**normalized, "error": f"fetched ok; DB write failed: {e}"}
    return normalized


@app.get("/api/health")
async def health() -> dict:
    return {"ok": True}


@app.get("/api/all")
async def api_all(fresh: int = 0) -> dict:
    """Cache-first aggregator.

    For each source: serve from `api_cache` if the row is younger than
    CACHE_TTL, otherwise fetch live, normalize, write back, and return.
    Pass `?fresh=1` to bypass the cache.
    """
    lat = _float_env("GOODEATS_LAT", 47.7623)
    lon = _float_env("GOODEATS_LON", -122.2054)
    radius_m = _int_env("GOODEATS_RADIUS_M", 2000)

    result: dict = {key: None for key in SOURCE_KEYS}
    to_fetch: list[tuple[str, str]] = []  # (slot_key, source)

    if not fresh:
        for key, source in SOURCE_KEYS.items():
            cached = get_cached_envelope(source)
            if cached is not None:
                result[key] = cached
            else:
                to_fetch.append((key, source))
    else:
        to_fetch = list(SOURCE_KEYS.items())

    if to_fetch:
        async with httpx.AsyncClient() as client:
            envelopes = await asyncio.gather(
                *[_fetch_live(client, source, lat, lon, radius_m) for _, source in to_fetch]
            )
        for (key, _), env in zip(to_fetch, envelopes):
            result[key] = env

    return result


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
