import asyncio
import json
import time
import urllib.request
from typing import Any

from .config import settings

REMS_URL = settings.rems_url
CACHE_TTL_S = 1800.0

_cache: dict[str, Any] = {"sol": None, "fetched_at": 0.0}


def _download() -> dict[str, Any]:
    request = urllib.request.Request(
        REMS_URL, headers={"User-Agent": settings.rems_user_agent}
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.load(response)
    soles = payload.get("soles") or []
    if not soles:
        raise RuntimeError("REMS feed returned no sols")
    return soles[0]


async def latest_sol() -> dict[str, Any]:
    now = time.monotonic()
    if _cache["sol"] is not None and now - _cache["fetched_at"] < CACHE_TTL_S:
        return _cache["sol"]
    sol = await asyncio.to_thread(_download)
    _cache["sol"] = sol
    _cache["fetched_at"] = time.monotonic()
    return sol
