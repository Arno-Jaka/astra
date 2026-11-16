import asyncio
import json
import time
import urllib.request
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .config import settings

REMS_URL = settings.rems_url
CACHE_TTL_S = 1800.0
CACHE_PATH = Path(__file__).resolve().parents[1] / "data" / "cache" / "rems_latest.json"

# Latest in-process snapshot: {"sol": dict, "monotonic": float, "fetched_at": str}
_memory: dict[str, Any] = {"sol": None, "monotonic": 0.0, "fetched_at": None}


def _download() -> dict[str, Any]:
    request = urllib.request.Request(
        REMS_URL, headers={"User-Agent": settings.rems_user_agent}
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        payload = json.load(response)
    soles = payload.get("soles") or []
    if not soles:
        raise RuntimeError("REMS feed returned no sols")
    return soles[0]


def _fetch_with_retry(attempts: int = 2, delay_s: float = 0.8) -> dict[str, Any]:
    """Retry transient feed/network failures before giving up on the live feed."""
    last: Exception | None = None
    for attempt in range(attempts):
        try:
            return _download()
        except Exception as exc:  # noqa: BLE001 - any feed failure triggers fallback
            last = exc
            if attempt + 1 < attempts:
                time.sleep(delay_s)
    raise RuntimeError(str(last) if last is not None else "REMS feed unavailable")


def _read_disk_cache() -> dict[str, Any] | None:
    try:
        data = json.loads(CACHE_PATH.read_text())
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict) or not data.get("sol"):
        return None
    return data


def _write_disk_cache(sol: dict[str, Any], fetched_at: str) -> None:
    """Persist the last good snapshot so restarts keep serving NASA data."""
    try:
        CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        temporary = CACHE_PATH.with_name(f"{CACHE_PATH.name}.tmp")
        temporary.write_text(json.dumps({"sol": sol, "fetched_at": fetched_at}, indent=2))
        temporary.replace(CACHE_PATH)
    except OSError:
        pass  # caching is best effort


def _snapshot(sol: dict[str, Any], status: str, fetched_at: str | None,
              error: str | None = None) -> dict[str, Any]:
    snapshot = dict(sol)
    snapshot["_status"] = status
    snapshot["_fetched_at"] = fetched_at
    if error is not None:
        snapshot["_error"] = error
    return snapshot


async def latest_sol() -> dict[str, Any]:
    """Return the newest REMS sol plus live/cached provenance.

    A live-feed outage falls back to the last successful snapshot (memory,
    then disk) so the weather card keeps showing real NASA-sourced
    observations—with their retrieval time—instead of an error.
    """
    now = time.monotonic()
    if (
        _memory["sol"] is not None
        and now - _memory["monotonic"] < CACHE_TTL_S
    ):
        return _snapshot(_memory["sol"], "live", _memory["fetched_at"])

    try:
        sol = await asyncio.to_thread(_fetch_with_retry)
    except Exception as exc:  # noqa: BLE001 - fall back to the cached snapshot
        if _memory["sol"] is not None:
            return _snapshot(_memory["sol"], "cached", _memory["fetched_at"], str(exc))
        cached = _read_disk_cache()
        if cached is not None:
            return _snapshot(cached["sol"], "cached", cached.get("fetched_at"), str(exc))
        raise RuntimeError(str(exc)) from exc

    fetched_at = datetime.now(UTC).isoformat()
    _memory.update({"sol": sol, "monotonic": now, "fetched_at": fetched_at})
    _write_disk_cache(sol, fetched_at)
    return _snapshot(sol, "live", fetched_at)
