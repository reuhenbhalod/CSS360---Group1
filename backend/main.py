# ─────────────────────────────────────────────────────────────
# main.py
# FastAPI app — GoodEats backend
# Run: uvicorn main:app --reload --port 8000
# ─────────────────────────────────────────────────────────────

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import init_db
from ingestion import get_cached_envelope, save_cached_envelope

# ── Placeholder fetchers (replace with your real API calls) ──
# Each returns an envelope: { source, ok, count, data, error }
async def fetch_foursquare():
    # TODO: replace with real httpx call to Foursquare Places v3
    return {
        "source": "foursquare", "ok": False,
        "count": 0, "data": [], "error": "not implemented yet"
    }

async def fetch_overpass():
    return {
        "source": "overpass", "ok": False,
        "count": 0, "data": [], "error": "not implemented yet"
    }

async def fetch_reddit():
    return {
        "source": "reddit", "ok": False,
        "count": 0, "data": [], "error": "not implemented yet"
    }

async def fetch_gnews():
    return {
        "source": "gnews", "ok": False,
        "count": 0, "data": [], "error": "not implemented yet"
    }

async def fetch_guardian():
    return {
        "source": "guardian", "ok": False,
        "count": 0, "data": [], "error": "not implemented yet"
    }

FETCHERS = {
    "foursquare": fetch_foursquare,
    "overpass":   fetch_overpass,
    "reddit":     fetch_reddit,
    "gnews":      fetch_gnews,
    "guardian":   fetch_guardian,
}

# ── App ───────────────────────────────────────────────────────

app = FastAPI(title="GoodEats API", version="0.5.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup():
    init_db()
    print("[GoodEats] Backend ready on http://localhost:8000")

# Map frontend response keys → source names
SOURCE_KEYS = {
    "restaurants": "foursquare",
    "places":      "overpass",
    "reddit":      "reddit",
    "news":        "gnews",
    "articles":    "guardian",
}

@app.get("/api/all")
async def get_all():
    """
    Main endpoint consumed by the React frontend.
    1. Try SQLite cache (TTL = 1 hour).
    2. On cache miss → fetch external API → save to DB → return.
    """
    result = {}
    for key, source in SOURCE_KEYS.items():
        cached = get_cached_envelope(source)
        if cached:
            result[key] = cached
            continue
        try:
            envelope = await FETCHERS[source]()
        except Exception as e:
            envelope = {
                "source": source, "ok": False,
                "count": 0, "data": [], "error": str(e)
            }
        if envelope.get("ok"):
            save_cached_envelope(source, envelope)
        result[key] = envelope
    return result

@app.get("/api/health")
def health():
    return {"status": "ok"}
