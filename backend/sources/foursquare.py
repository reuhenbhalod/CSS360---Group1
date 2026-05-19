"""Foursquare Places v3 — restaurants near a point.

Returns the raw `results` array verbatim so the frontend parser
(parseFoursquareRestaurant in src/parsers.js) can normalize it.
"""
import os
import httpx
from ._common import envelope

ENDPOINT = "https://api.foursquare.com/v3/places/search"
# 13000 is the Foursquare top-level category id for "Dining and Drinking".
FOOD_CATEGORY = "13000"


async def fetch(client: httpx.AsyncClient, lat: float, lon: float, radius_m: int) -> dict:
    key = os.getenv("FOURSQUARE_API_KEY", "").strip()
    if not key:
        return envelope("foursquare", error="FOURSQUARE_API_KEY not set")

    try:
        resp = await client.get(
            ENDPOINT,
            headers={"Authorization": key, "Accept": "application/json"},
            params={
                "ll": f"{lat},{lon}",
                "radius": radius_m,
                "categories": FOOD_CATEGORY,
                "sort": "DISTANCE",
                "limit": 20,
            },
            timeout=12.0,
        )
        resp.raise_for_status()
        results = resp.json().get("results", [])
        return envelope("foursquare", data=results)
    except httpx.HTTPStatusError as e:
        return envelope("foursquare", error=f"HTTP {e.response.status_code}: {e.response.text[:200]}")
    except httpx.HTTPError as e:
        return envelope("foursquare", error=f"network error: {e}")
    except Exception as e:
        return envelope("foursquare", error=f"unexpected: {e}")
