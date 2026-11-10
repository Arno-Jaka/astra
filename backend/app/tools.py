from datetime import UTC, datetime
from typing import Any

from agno.tools import tool

from .channel import channel
from .commands import CommandError
from .gazetteer import resolve

IMAGERY_URL = "https://trek.nasa.gov/mars/"


@tool
async def fly_to_location(location: str) -> dict[str, Any]:
    """Fly the Mars map camera to a named site.

    Args:
        location: Site name, e.g. "Gale Crater" or "Jezero Crater".
    """
    site = resolve(location)
    if site is None:
        return {"ok": False, "error": f"Unknown location: {location}"}

    try:
        ack = await channel.send(
            "fly_to",
            {"lon": site.lon, "lat": site.lat, "height": 250_000, "duration": 2.0},
        )
    except CommandError as exc:
        return {"ok": False, "error": str(exc)}

    return {
        "ok": True,
        "location": site.name,
        "lon": site.lon,
        "lat": site.lat,
        "ack_status": ack.get("status"),
        "mission": "Mars Trek",
        "instrument": "Viking MDIM 2.1",
        "source_url": site.source_url,
        "imagery_url": IMAGERY_URL,
        "retrieved_at": datetime.now(UTC).isoformat(),
    }
