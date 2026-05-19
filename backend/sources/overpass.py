"""OpenStreetMap Overpass API — food-and-drink places near a point.

Queries both nodes and ways. For ways, Overpass returns the geometry
centroid under `center: { lat, lon }`; we lift that onto the element
itself so the frontend parser (which expects top-level lat/lon) works
for both element types without modification.
"""
import httpx
from ._common import envelope

ENDPOINT = "https://overpass-api.de/api/interpreter"
AMENITIES = "restaurant|cafe|pub|bar|fast_food|food_court|ice_cream"


def _build_query(lat: float, lon: float, radius_m: int) -> str:
    return f"""
[out:json][timeout:25];
(
  node["amenity"~"{AMENITIES}"](around:{radius_m},{lat},{lon});
  way["amenity"~"{AMENITIES}"](around:{radius_m},{lat},{lon});
);
out center tags;
""".strip()


async def fetch(client: httpx.AsyncClient, lat: float, lon: float, radius_m: int) -> dict:
    try:
        resp = await client.post(
            ENDPOINT,
            data={"data": _build_query(lat, lon, radius_m)},
            headers={"User-Agent": "goodeats/0.5 (class project)"},
            timeout=30.0,
        )
        resp.raise_for_status()
        elements = resp.json().get("elements", [])
        for el in elements:
            if "lat" not in el and isinstance(el.get("center"), dict):
                el["lat"] = el["center"].get("lat")
                el["lon"] = el["center"].get("lon")
        return envelope("overpass", data=elements)
    except httpx.HTTPStatusError as e:
        return envelope("overpass", error=f"HTTP {e.response.status_code}")
    except httpx.HTTPError as e:
        return envelope("overpass", error=f"network error: {e}")
    except Exception as e:
        return envelope("overpass", error=f"unexpected: {e}")
