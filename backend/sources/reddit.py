"""Reddit — recent r/Seattle posts mentioning Bothell dining.

Implementation note: Reddit's bot filter blocks the public `.json`
endpoint based on TLS fingerprint. httpx is rejected; curl_cffi
(with curl-style TLS + an honest non-browser User-Agent) succeeds
from standalone scripts but for reasons we couldn't pin down still
gets 403 when called from inside this uvicorn process specifically.
A plain `curl` subprocess works reliably in every case, so we shell
out. curl is universally available on macOS/Linux.

Returns the listing children verbatim so the frontend parser can
normalize the {kind, data} shape.
"""
import asyncio
import json
import os
from ._common import envelope

# r/SeattleFood is exclusively food content (restaurant reviews, menu
# spotlights, reservation tips, etc.) for the greater Seattle metro
# — including Bothell. Hitting `/hot.json` directly is cleaner than
# search-based filtering and avoids the false positives we got with
# r/Seattle (J6 town halls, missing-person alerts, etc.).
URL = "https://www.reddit.com/r/SeattleFood/hot.json"
DEFAULT_UA = "goodeats/0.5 (class project)"
QUERY = {"limit": "25"}


def _build_url() -> str:
    from urllib.parse import urlencode
    return f"{URL}?{urlencode(QUERY)}"


async def fetch(_unused_httpx_client=None) -> dict:
    ua = os.getenv("REDDIT_USER_AGENT", DEFAULT_UA)
    try:
        proc = await asyncio.create_subprocess_exec(
            "curl", "-sS", "--max-time", "15",
            "-H", f"User-Agent: {ua}",
            "-H", "Accept: application/json",
            _build_url(),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=18.0)
        if proc.returncode != 0:
            return envelope("reddit", error=f"curl exit {proc.returncode}: {stderr.decode()[:200]}")
        body = stdout.decode("utf-8", errors="replace")
        if not body.lstrip().startswith("{"):
            # Reddit's bot-block response is HTML. Surface a clear error.
            return envelope("reddit", error="non-JSON response (likely bot-blocked)")
        children = json.loads(body).get("data", {}).get("children", [])
        return envelope("reddit", data=children)
    except FileNotFoundError:
        return envelope("reddit", error="curl not found on PATH")
    except asyncio.TimeoutError:
        return envelope("reddit", error="curl timed out")
    except Exception as e:
        return envelope("reddit", error=f"unexpected: {e}")
