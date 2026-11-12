"""Derived positions relative to ASTRA's curated, sourced site catalog."""

import math
from typing import Any

from .dem import _great_circle_km
from .gazetteer import SITES


def initial_bearing_deg(lon1: float, lat1: float, lon2: float, lat2: float) -> float | None:
    """Initial great-circle bearing from the reference site, clockwise from north."""
    a, b = math.radians(lat1), math.radians(lat2)
    delta = math.radians(lon2 - lon1)
    y = math.sin(delta) * math.cos(b)
    x = math.cos(a) * math.sin(b) - math.sin(a) * math.cos(b) * math.cos(delta)
    if math.hypot(x, y) < 1e-12 or abs(lat1) == 90:
        return None  # Coincident/antipodal points, or undefined north at a pole.
    return math.degrees(math.atan2(y, x)) % 360


def location_context(lon: float, lat: float) -> dict[str, Any]:
    site = min(SITES, key=lambda s: _great_circle_km(s.lon, s.lat, lon, lat))
    distance = _great_circle_km(site.lon, site.lat, lon, lat)
    bearing = initial_bearing_deg(site.lon, site.lat, lon, lat) if distance >= 0.001 else None
    compass = ("N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
               "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW")
    direction = compass[int((bearing + 11.25) / 22.5) % 16] if bearing is not None else None
    if distance < 0.001:
        label = site.name
    elif bearing is None:
        label = f"{distance:.1f} km from {site.name} (bearing undefined)"
    else:
        label = f"{distance:.1f} km {direction} ({round(bearing) % 360}°) from {site.name}"
    return {
        "name": site.name, "description": site.description,
        "distance_km": round(distance, 1), "bearing_deg": round(bearing, 1) % 360 if bearing is not None else None,
        "direction": direction, "label": label, "source_url": site.source_url,
        "note": "Derived from the nearest site in ASTRA's curated catalog; bearing is from that site to this point, clockwise from north. Not a travel heading or route distance.",
    }
