"""GNews — recent articles about Bothell dining."""
import os
import httpx
from ._common import envelope

ENDPOINT = "https://gnews.io/api/v4/search"


async def fetch(client: httpx.AsyncClient) -> dict:
    key = os.getenv("GNEWS_API_KEY", "").strip()
    if not key:
        return envelope("gnews", error="GNEWS_API_KEY not set")

    try:
        resp = await client.get(
            ENDPOINT,
            params={
                "q": "Bothell restaurant OR dining",
                "country": "us",
                "lang": "en",
                "max": 10,
                "apikey": key,
            },
            timeout=12.0,
        )
        resp.raise_for_status()
        articles = resp.json().get("articles", [])
        return envelope("gnews", data=articles)
    except httpx.HTTPStatusError as e:
        return envelope("gnews", error=f"HTTP {e.response.status_code}")
    except httpx.HTTPError as e:
        return envelope("gnews", error=f"network error: {e}")
    except Exception as e:
        return envelope("gnews", error=f"unexpected: {e}")
