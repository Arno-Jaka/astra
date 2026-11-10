import math
from datetime import UTC, datetime
from typing import Any

from agno.tools import tool

from .channel import channel
from .commands import CommandError
from .dem import PACE_M_S
from .dem import SOURCE_URL as MOLA_URL
from .dem import plan as plan_dem_route
from .gazetteer import resolve
from .regions import briefing_for
from .rems import REMS_URL, latest_sol

IMAGERY_URL = "https://trek.nasa.gov/mars/"
MARS_RADIUS_KM = 3396.19


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


def _number(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _great_circle_km(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlon = math.radians(lon2 - lon1)
    cosine = math.sin(p1) * math.sin(p2) + math.cos(p1) * math.cos(p2) * math.cos(dlon)
    return MARS_RADIUS_KM * math.acos(max(-1.0, min(1.0, cosine)))


@tool
async def get_current_conditions(location: str) -> dict[str, Any]:
    """Get the latest Mars weather for a site.

    Args:
        location: Site name, e.g. "Gale Crater" or "Jezero Crater".
    """
    site = resolve(location)
    if site is None:
        return {"ok": False, "error": f"Unknown location: {location}"}

    try:
        sol = await latest_sol()
    except (OSError, ValueError, RuntimeError) as exc:
        return {"ok": False, "error": f"REMS feed unavailable: {exc}"}

    gale = resolve("Gale Crater")
    if gale is None:
        return {"ok": False, "error": "Gale Crater missing from gazetteer"}

    nearest = site.name != gale.name
    result: dict[str, Any] = {
        "ok": True,
        "requested_location": site.name,
        "station_location": gale.name,
        "is_nearest_station": nearest,
        "station": "Curiosity (MSL)",
        "sol": sol.get("sol"),
        "terrestrial_date": sol.get("terrestrial_date"),
        "season": sol.get("season"),
        "min_temp_c": _number(sol.get("min_temp")),
        "max_temp_c": _number(sol.get("max_temp")),
        "min_ground_temp_c": _number(sol.get("min_gts_temp")),
        "max_ground_temp_c": _number(sol.get("max_gts_temp")),
        "pressure_pa": _number(sol.get("pressure")),
        "atmo_opacity": sol.get("atmo_opacity"),
        "uv_index": sol.get("local_uv_irradiance_index"),
        "sunrise": sol.get("sunrise"),
        "sunset": sol.get("sunset"),
        "mission": "Mars Science Laboratory (Curiosity)",
        "instrument": "REMS",
        "source_url": REMS_URL,
        "retrieved_at": datetime.now(UTC).isoformat(),
        "data_note": "REMS feed is provided for outreach purposes.",
    }
    if nearest:
        result["distance_km"] = round(_great_circle_km(gale.lon, gale.lat, site.lon, site.lat))
        result["distance_method"] = "great-circle using Mars equatorial radius"
        result["note"] = (
            f"No live weather station at {site.name}; showing the nearest live station "
            f"at {gale.name}."
        )

    try:
        ack = await channel.send("show_conditions", result)
    except CommandError as exc:
        result["conditions_ack_status"] = "error"
        result["conditions_ack_detail"] = str(exc)
    else:
        result["conditions_ack_status"] = ack.get("status")
    return result


@tool
async def get_region_summary(location: str) -> dict[str, Any]:
    """Get the curated survival briefing and science targets for a site.

    Args:
        location: Site name, e.g. "Gale Crater" or "Jezero Crater".
    """
    site = resolve(location)
    if site is None:
        return {"ok": False, "error": f"Unknown location: {location}"}

    briefing = briefing_for(site.name)
    if briefing is None:
        return {"ok": False, "error": f"No curated briefing for {site.name}"}

    result: dict[str, Any] = {
        "ok": True,
        "location": site.name,
        "region": briefing["region"],
        "lon": site.lon,
        "lat": site.lat,
        "headline": briefing["headline"],
        "summary": briefing["summary"],
        "why_it_matters": list(briefing["why_it_matters"]),
        "hazards": [dict(hazard) for hazard in briefing["hazards"]],
        "science_targets": [
            dict(target) for target in briefing["science_targets"]
        ],
        "landing": dict(briefing["landing"]) if briefing["landing"] else None,
        "source_url": briefing["source_url"],
        "data_quality": (
            "Curated from NASA mission overviews; science targets are "
            "qualitative, not survey coordinates."
        ),
        "retrieved_at": datetime.now(UTC).isoformat(),
    }

    try:
        ack = await channel.send("show_briefing", result)
    except CommandError as exc:
        result["briefing_ack_status"] = "error"
        result["briefing_ack_detail"] = str(exc)
    else:
        result["briefing_ack_status"] = ack.get("status")
    return result


@tool
async def plan_route(
    start: str, end: str, max_slope_deg: float = 15.0
) -> dict[str, Any]:
    """Plan and draw a slope-limited route between two Mars sites.

    Args:
        start: Starting site, e.g. "Gale Crater".
        end: Destination site, e.g. "Mount Sharp (Aeolis Mons)".
        max_slope_deg: Maximum allowed slope in degrees (default 15).
    """
    start_site = resolve(start)
    end_site = resolve(end)
    if start_site is None:
        return {"ok": False, "error": f"Unknown location: {start}"}
    if end_site is None:
        return {"ok": False, "error": f"Unknown location: {end}"}
    if start_site.name == end_site.name:
        return {"ok": False, "error": "Start and end are the same site."}

    try:
        slope_limit = float(max_slope_deg)
    except (TypeError, ValueError):
        return {"ok": False, "error": "max_slope_deg must be a number"}
    if not 1.0 <= slope_limit <= 45.0:
        return {"ok": False, "error": "max_slope_deg must be between 1 and 45."}

    try:
        result = plan_dem_route(
            start_site.lon,
            start_site.lat,
            end_site.lon,
            end_site.lat,
            slope_limit,
        )
    except (OSError, ValueError, RuntimeError) as exc:
        return {"ok": False, "error": str(exc)}

    stats = result["stats"]
    eta_hours = stats["distance_km"] * 1000.0 / PACE_M_S / 3600.0
    summary: dict[str, Any] = {
        "start": start_site.name,
        "end": end_site.name,
        "slope_limit_deg": slope_limit,
        "slope_compliant": result["slope_compliant"],
        "distance_km": round(stats["distance_km"], 1),
        "ascent_m": round(stats["ascent_m"]),
        "descent_m": round(stats["descent_m"]),
        "min_elevation_m": stats["min_elevation_m"],
        "max_elevation_m": stats["max_elevation_m"],
        "max_grade_deg": round(stats["max_grade_deg"], 1),
        "mean_grade_deg": round(stats["mean_grade_deg"], 1),
        "eta_hours": round(eta_hours, 1),
        "pace_m_s": PACE_M_S,
        "eta_note": "Simulated scout pace; not a rover drive plan.",
        "note": result["note"],
        "mission": "Mars Global Surveyor",
        "instrument": "MOLA",
        "source_url": MOLA_URL,
        "resolution_note": "16 ppd MOLA (~3.7 km/px); regional estimate.",
        "retrieved_at": datetime.now(UTC).isoformat(),
    }

    try:
        ack = await channel.send(
            "show_route",
            {
                **summary,
                "coordinates": result["coordinates"],
                "profile": result["profile"],
            },
        )
    except CommandError as exc:
        return {"ok": False, "error": str(exc)}

    return {
        "ok": True,
        **summary,
        "waypoints": len(result["coordinates"]),
        "route_ack_status": ack.get("status"),
    }
