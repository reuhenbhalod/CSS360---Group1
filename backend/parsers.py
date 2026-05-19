"""Python port of src/parsers.js.

Normalizes raw upstream payloads (Foursquare, Overpass, Reddit, GNews,
Guardian) into the consistent shapes the SQL ingestion layer and the
frontend components expect:

  Venue    { id, kind: 'restaurant' | 'place', source, name, categories,
             address, city, lat, lon, distance_m,
             amenity?, cuisine?, outdoor_seating?, takeaway? }
  FeedItem { id, kind: 'reddit' | 'gnews' | 'guardian', source,
             title, body, url, publishedAt (ISO 8601 str),
             ...type-specific fields preserved for the React components }

Every parser is defensive — a missing/malformed field never raises, it
just falls through to a safe default. Mirrors the JS implementation
(intentionally) so backend and frontend agree on the schema.
"""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Any


# ── Coercion helpers ─────────────────────────────────────────

def _num(v: Any):
    if v is None:
        return None
    try:
        n = float(v)
        return n if n == n else None  # NaN guard
    except (TypeError, ValueError):
        return None


def _str(v: Any, fallback: str = "") -> str:
    if v is None:
        return fallback
    return v if isinstance(v, str) else str(v)


def _arr(v: Any) -> list:
    return v if isinstance(v, list) else []


def _osm_yes_no(v: Any):
    if v is True or v == "yes":
        return True
    if v is False or v == "no":
        return False
    return None


# ── Venue parsers ────────────────────────────────────────────

def parse_foursquare_restaurant(raw: dict) -> dict | None:
    """Foursquare Places v3 → normalized venue."""
    if not isinstance(raw, dict):
        return None
    loc = raw.get("location") or {}
    geo = (raw.get("geocodes") or {}).get("main") or {}
    cats = []
    for c in _arr(raw.get("categories")):
        if isinstance(c, str):
            cats.append(c)
        elif isinstance(c, dict) and c.get("name"):
            cats.append(_str(c["name"]))
    return {
        "id": _str(raw.get("fsq_id") or raw.get("id")),
        "kind": "restaurant",
        "source": "foursquare",
        "name": _str(raw.get("name")),
        "categories": cats,
        "address": _str(raw.get("address") or loc.get("address") or loc.get("formatted_address")),
        "city": raw.get("city") or loc.get("locality"),
        "lat": _num(raw.get("lat") if raw.get("lat") is not None else geo.get("latitude")),
        "lon": _num(raw.get("lon") if raw.get("lon") is not None else geo.get("longitude")),
        "distance_m": _num(raw.get("distance_m") if raw.get("distance_m") is not None else raw.get("distance")),
    }


def parse_overpass_place(raw: dict) -> dict | None:
    """Overpass element (node or way with `center` lifted) → normalized place."""
    if not isinstance(raw, dict):
        return None
    tags = raw.get("tags") or {}

    address = _str(raw.get("address"))
    if not address and (tags.get("addr:housenumber") or tags.get("addr:street")):
        address = f"{tags.get('addr:housenumber') or ''} {tags.get('addr:street') or ''}".strip()

    cuisine = raw.get("cuisine") if raw.get("cuisine") is not None else tags.get("cuisine")
    if isinstance(cuisine, str):
        cuisine = [s.strip() for s in cuisine.split(";") if s.strip()]
    else:
        cuisine = _arr(cuisine)

    raw_id = raw.get("id")
    if isinstance(raw_id, str) and raw_id.startswith("osm-"):
        node_id = raw_id
    elif raw_id is not None:
        node_id = f"osm-{raw.get('type') or 'node'}-{raw_id}"
    else:
        node_id = ""

    outdoor = bool(raw["outdoor_seating"]) if raw.get("outdoor_seating") is not None else _osm_yes_no(tags.get("outdoor_seating"))
    takeaway = bool(raw["takeaway"]) if raw.get("takeaway") is not None else _osm_yes_no(tags.get("takeaway"))

    return {
        "id": node_id,
        "kind": "place",
        "source": "overpass",
        "name": _str(raw.get("name") or tags.get("name")),
        "amenity": raw.get("amenity") or tags.get("amenity"),
        "categories": cuisine,
        "cuisine": cuisine,
        "address": address,
        "city": raw.get("city"),
        "lat": _num(raw.get("lat")),
        "lon": _num(raw.get("lon")),
        "distance_m": _num(raw.get("distance_m")),
        "outdoor_seating": outdoor,
        "takeaway": takeaway,
    }


# ── Feed-item parsers ────────────────────────────────────────

def parse_reddit_post(raw: dict) -> dict | None:
    """Reddit listing child {kind, data} OR an already-flat post → normalized feed item."""
    if not isinstance(raw, dict):
        return None
    inner = raw.get("data")
    r = inner if isinstance(inner, dict) and (inner.get("title") or inner.get("id")) else raw

    permalink_raw = _str(r.get("permalink"))
    if permalink_raw.startswith("http"):
        url = permalink_raw
    elif permalink_raw:
        url = f"https://reddit.com{permalink_raw}"
    else:
        url = ""

    author_raw = _str(r.get("author"))
    author = f"u/{author_raw}" if author_raw and not author_raw.startswith("u/") else author_raw

    subreddit = _str(r.get("subreddit_name_prefixed") or r.get("subreddit"))
    created_utc = _num(r.get("created_utc"))

    published_at = None
    if created_utc is not None:
        published_at = datetime.fromtimestamp(created_utc, tz=timezone.utc).isoformat().replace("+00:00", "Z")

    return {
        "id": _str(r.get("id")),
        "kind": "reddit",
        "source": "reddit",
        "title": _str(r.get("title")),
        "selftext": _str(r.get("selftext")),
        "body": _str(r.get("selftext")),
        "raw_text": _str(r.get("selftext")),
        "url": url,
        "permalink": url,
        "author": author,
        "subreddit": subreddit,
        "score": int(_num(r.get("score")) or 0),
        "num_comments": int(_num(r.get("num_comments")) or 0),
        "created_utc": created_utc,
        "publishedAt": published_at,
    }


def parse_gnews_article(raw: dict, idx: int = 0) -> dict | None:
    """GNews article → normalized feed item."""
    if not isinstance(raw, dict):
        return None
    source_obj = raw.get("source")
    source_name = _str(source_obj.get("name")) if isinstance(source_obj, dict) else ""
    return {
        "id": _str(raw.get("id") or f"gnews-{idx}-{raw.get('url') or raw.get('title') or ''}"),
        "kind": "gnews",
        "source": "gnews",
        "title": _str(raw.get("title")),
        "description": _str(raw.get("description")),
        "content": _str(raw.get("content")),
        "body": _str(raw.get("description") or raw.get("content")),
        "raw_text": _str(raw.get("description") or raw.get("content")),
        "url": _str(raw.get("url")),
        "publishedAt": _str(raw.get("publishedAt")) or None,
        # preserved nested shape for the NewsArticle component
        "source_obj": {"name": source_name},
    }


def parse_guardian_article(raw: dict, idx: int = 0) -> dict | None:
    """Guardian Content API result item → normalized feed item."""
    if not isinstance(raw, dict):
        return None
    fields = raw.get("fields") or {}
    trail = _str(raw.get("trail_text") or fields.get("trailText"))
    return {
        "id": _str(raw.get("id") or f"guardian-{idx}"),
        "kind": "guardian",
        "source": "guardian",
        "title": _str(raw.get("webTitle") or raw.get("title")),
        "section": _str(raw.get("sectionName") or raw.get("section")),
        "url": _str(raw.get("webUrl") or raw.get("url")),
        "publishedAt": _str(raw.get("webPublicationDate") or raw.get("publishedAt")) or None,
        "trail_text": trail,
        "body": _str(raw.get("trail_text") or fields.get("trailText") or fields.get("bodyText")),
        "raw_text": trail,
        "byline": _str(raw.get("byline") or fields.get("byline")),
    }


# ── Envelope parsers ─────────────────────────────────────────

SOURCE_TO_PARSER = {
    "foursquare": lambda raw, i=0: parse_foursquare_restaurant(raw),
    "overpass":   lambda raw, i=0: parse_overpass_place(raw),
    "reddit":     lambda raw, i=0: parse_reddit_post(raw),
    "gnews":      lambda raw, i: parse_gnews_article(raw, i),
    "guardian":   lambda raw, i: parse_guardian_article(raw, i),
}


def normalize_envelope(envelope: dict) -> dict:
    """Map every item in `envelope.data` through the matching parser.

    Returns the same envelope shape with normalized data and an accurate count.
    Items that can't be parsed (None) are dropped.
    """
    source = (envelope or {}).get("source")
    parser = SOURCE_TO_PARSER.get(source)
    if not envelope or parser is None:
        return {
            "source": source or "unknown",
            "ok": False,
            "count": 0,
            "data": [],
            "error": (envelope or {}).get("error") or "unknown source",
        }

    raw_list = envelope.get("data") if isinstance(envelope.get("data"), list) else []
    items = []
    for i, raw in enumerate(raw_list):
        parsed = parser(raw, i)
        if parsed is not None:
            items.append(parsed)

    return {
        "source": source,
        "ok": envelope.get("ok") is not False and not envelope.get("error"),
        "count": len(items),
        "data": items,
        "error": envelope.get("error"),
    }
