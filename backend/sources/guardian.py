"""The Guardian Content API — food-section articles.

Returns the inner `response.results` array verbatim so the frontend
parser (which expects one Guardian result item at a time) can normalize.
"""
import os
import httpx
from ._common import envelope

ENDPOINT = "https://content.guardianapis.com/search"


async def fetch(client: httpx.AsyncClient) -> dict:
    key = os.getenv("GUARDIAN_API_KEY", "").strip()
    if not key:
        return envelope("guardian", error="GUARDIAN_API_KEY not set")

    try:
        resp = await client.get(
            ENDPOINT,
            params={
                "q": "restaurant OR dining",
                "section": "food",
                "order-by": "newest",
                "show-fields": "trailText,byline,bodyText",
                "page-size": 10,
                "api-key": key,
            },
            timeout=12.0,
        )
        resp.raise_for_status()
        results = resp.json().get("response", {}).get("results", [])
        return envelope("guardian", data=results)
    except httpx.HTTPStatusError as e:
        return envelope("guardian", error=f"HTTP {e.response.status_code}")
    except httpx.HTTPError as e:
        return envelope("guardian", error=f"network error: {e}")
    except Exception as e:
        return envelope("guardian", error=f"unexpected: {e}")
