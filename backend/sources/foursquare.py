"""Foursquare Places — restaurants near a point.

Uses the current Foursquare Service API (`places-api.foursquare.com`)
with Bearer auth + version header. The legacy v3 endpoint
(`api.foursquare.com/v3/places/search`) returns 401 for keys issued
through the current developer console.

Returns the raw `results` array; the new shape is flatter than v3
(`fsq_place_id` + top-level `latitude`/`longitude` instead of
`fsq_id` + `geocodes.main.*`). The frontend parser handles both
shapes defensively.
"""
import os
import httpx
from ._common import envelope

ENDPOINT = "https://places-api.foursquare.com/places/search"
API_VERSION = "2025-06-17"
# 4d4b7105d754a06374d81259 = "Food" parent category in the Service API.
FOOD_CATEGORY = "4d4b7105d754a06374d81259"


async def fetch(client: httpx.AsyncClient, lat: float, lon: float, radius_m: int) -> dict:
    key = os.getenv("FOURSQUARE_API_KEY", "").strip()
    if not key:
        return envelope("foursquare", error="FOURSQUARE_API_KEY not set")

    try:
        resp = await client.get(
            ENDPOINT,
            headers={
                "Authorization": f"Bearer {key}",
                "X-Places-Api-Version": API_VERSION,
                "Accept": "application/json",
            },
            params={
                "ll": f"{lat},{lon}",
                "radius": radius_m,
                "fsq_category_ids": FOOD_CATEGORY,
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
