"""Map data endpoints, kept separate from the chat/command entry point."""

import math
from datetime import UTC, datetime
from io import BytesIO
from typing import Any

import numpy as np
from fastapi import APIRouter, HTTPException, Response
from PIL import Image
from pydantic import BaseModel, Field

from . import dem, environment
from .dem import MARS_RADIUS_KM, DemUnavailable, heightmap
from .gazetteer import SITES
from .location_context import location_context
from .mission import MISSION, CrewProfile, crew_estimate
from .regions import BRIEFINGS, briefing_for
from .rems import REMS_URL, latest_sol

router = APIRouter()


@router.get("/mission")
def mission() -> dict[str, Any]:
    return MISSION


@router.get("/locations/context")
def point_context(lon: float, lat: float) -> dict[str, Any]:
    if not (-180 <= lon <= 180 and -90 <= lat <= 90):
        raise HTTPException(400, "Invalid coordinates")
    return location_context(lon, lat)


@router.get("/locations/inspect")
def inspect_location(lon: float, lat: float) -> dict[str, Any]:
    if not (-180 <= lon <= 180 and -90 <= lat <= 90):
        raise HTTPException(400, "Invalid coordinates")
    nearest = min(SITES, key=lambda s: dem._great_circle_km(lon, lat, s.lon, s.lat))
    briefing = briefing_for(nearest.name)
    # NASA Trek's geographic tile matrix has twice as many columns as rows.
    x = (lon + 180) / 360 * 256
    y = (90 - lat) / 180 * 128
    col, row = min(255, int(x)), min(127, int(y))
    elevation = None
    note = ""
    try:
        elevation = dem.elevation_m(lon, lat)
        resolution = dem.pixel_size_km()
    except (OSError, RuntimeError) as exc:
        resolution = None
        note = f"Elevation unavailable: {exc}"
    return {
        "lon": lon, "lat": lat, "elevation_m": elevation,
        "resolution_km": resolution, "note": note,
        "background": {
            "title": briefing["headline"] if briefing else nearest.name,
            "text": briefing["summary"] if briefing else f"{nearest.name} is a {nearest.kind.lower()} on Mars. {nearest.description}.",
            "source_url": briefing["source_url"] if briefing else nearest.source_url,
            "context_site": nearest.name,
        },
        "nearest": location_context(lon, lat),
        "image_url": "https://trek.nasa.gov/tiles/Mars/EQ/"
                     "Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/"
                     f"7/{row}/{col}.jpg",
        "image_x": x - col, "image_y": y - row,
        "source_url": dem.SOURCE_URL, "imagery_source_url": "https://trek.nasa.gov/mars/",
    }


class RouteRequest(BaseModel):
    start_lon: float = Field(ge=-180, le=180)
    start_lat: float = Field(ge=-90, le=90)
    end_lon: float = Field(ge=-180, le=180)
    end_lat: float = Field(ge=-90, le=90)
    max_slope_deg: float = Field(default=15, ge=1, le=45)
    crew: CrewProfile | None = None


@router.post("/routes/plan")
def coordinate_route(request: RouteRequest) -> dict[str, Any]:
    distance = dem._great_circle_km(request.start_lon, request.start_lat,
                                    request.end_lon, request.end_lat)
    if distance < 0.001:
        raise HTTPException(400, "The same location cannot be both start and destination.")
    if distance < 1:
        raise HTTPException(400, "Choose locations at least 1 km apart.")
    try:
        result = dem.plan(**request.model_dump(exclude={"crew"}))
        resolution = dem.pixel_size_km()
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except (OSError, RuntimeError) as exc:
        raise HTTPException(503, str(exc)) from exc
    hazardous = result["hazardous"]
    if hazardous is not None and request.crew is not None:
        hazardous = {**hazardous, "crew_estimate": crew_estimate(hazardous["distance_km"], request.crew)}
    return {
        **{key: value for key, value in result["stats"].items() if key != "points"},
        "start": location_context(request.start_lon, request.start_lat)["label"],
        "end": location_context(request.end_lon, request.end_lat)["label"],
        "slope_limit_deg": request.max_slope_deg,
        "slope_compliant": result["slope_compliant"],
        "coordinates": result["coordinates"], "profile": result["profile"],
        "dangers": result["dangers"], "hazardous": hazardous,
        "crew_estimate": crew_estimate(result["stats"]["distance_km"], request.crew) if request.crew else None,
        "note": result["note"],
        "eta_hours": result["stats"]["distance_km"] * 1000 / dem.PACE_M_S / 3600,
        "pace_m_s": dem.PACE_M_S, "eta_note": "Simulated scout pace.",
        "resolution_note": f"NASA MOLA {resolution:.1f} km/px: regional grades only; unresolved rocks, sand and cliffs are not assessed.",
        "source_url": dem.SOURCE_URL, "retrieved_at": result["computed_at"],
    }


@router.get("/sites")
def sites() -> list[dict[str, object]]:
    return [
        {
            "name": site.name,
            "lon": site.lon,
            "lat": site.lat,
            "kind": site.kind,
            "description": site.description,
            "source_url": site.source_url,
        }
        for site in SITES
    ]


@router.get("/environment/zones")
def environment_zones() -> dict[str, Any]:
    try:
        zones = environment.zones()
    except (OSError, RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=503, detail=f"Environment screening unavailable: {exc}") from exc
    return {
        "zones": zones,
        "basis": "derived",
        "note": (
            "Illustrative regional weather/radiation screening derived from "
            "published planetary ranges and latitude/elevation. Not a measured "
            "dose map, a dust forecast, or a certified EVA-safety assessment; "
            "terrain/slope suitability is assessed separately by the route planner."
        ),
        "radiation_source_url": environment.RAD_SOURCE_URL,
        "weather_source_url": REMS_URL,
    }


@router.get("/environment/point")
def environment_point(lon: float, lat: float) -> dict[str, Any]:
    if not (-180 <= lon <= 180 and -90 <= lat <= 90):
        raise HTTPException(400, "Invalid coordinates")
    return environment.assess_point(lon, lat)


def _to_float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


@router.get("/weather/station")
async def weather_station() -> dict[str, object]:
    try:
        sol = await latest_sol()
    except (OSError, ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=503, detail=f"REMS feed unavailable: {exc}") from exc
    landing = BRIEFINGS["Gale Crater"]["landing"]
    return {
        "ok": True,
        "station_name": "Curiosity (MSL)",
        "site_name": landing["name"],
        "lon": landing["lon"],
        "lat": landing["lat"],
        "sol": sol.get("sol"),
        "terrestrial_date": sol.get("terrestrial_date"),
        "min_temp_c": _to_float(sol.get("min_temp")),
        "max_temp_c": _to_float(sol.get("max_temp")),
        "pressure_pa": _to_float(sol.get("pressure")),
        "atmo_opacity": sol.get("atmo_opacity"),
        "mission": "Mars Science Laboratory (Curiosity)",
        "instrument": "REMS",
        "source_url": REMS_URL,
        "data_note": "REMS feed is provided for outreach purposes.",
        "retrieved_at": datetime.now(UTC).isoformat(),
    }


@router.get("/dem/tile")
def dem_tile(west: float, south: float, east: float, north: float,
             width: int = 64, height: int = 64) -> Response:
    span = east - west
    if not (-360.0 <= west <= 360.0 and 0.0 < span <= 360.0):
        raise HTTPException(status_code=400, detail="invalid tile bounds")
    if not (-90.0 <= south < north <= 90.0):
        raise HTTPException(status_code=400, detail="invalid tile bounds")
    if not (2 <= width <= 128 and 2 <= height <= 128):
        raise HTTPException(status_code=400, detail="width/height must be 2-128")
    try:
        data = heightmap(west, south, east, north, width, height)
    except DemUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return Response(
        content=data.astype("<f4", copy=False).tobytes(),
        media_type="application/octet-stream",
        headers={"Cache-Control": "public, max-age=86400"},
    )


SLOPE_BREAKS_DEG = (5.0, 10.0, 15.0, 25.0)
SLOPE_COLORS = ((94, 213, 92, 70), (250, 204, 21, 110),
                (251, 146, 60, 150), (239, 68, 68, 190))


@router.get("/dem/slopetile/{z}/{x}/{y}")
def slope_tile(z: int, x: int, y: int) -> Response:
    if not 0 <= z <= 8:
        raise HTTPException(status_code=400, detail="level out of range")
    tiles_x, tiles_y = 2 ** (z + 1), 2 ** z
    if not 0 <= x < tiles_x or not 0 <= y < tiles_y:
        raise HTTPException(status_code=400, detail="tile index out of range")
    tile_w, tile_h = 360.0 / tiles_x, 180.0 / tiles_y
    west, north = -180.0 + x * tile_w, 90.0 - y * tile_h
    east, south = west + tile_w, north - tile_h
    size = 256
    try:
        grid = heightmap(west, south, east, north, width=size + 1, height=size + 1)
    except DemUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    radius_m = MARS_RADIUS_KM * 1000.0
    step_x = tile_w * math.pi / 180 * radius_m * math.cos(math.radians((north + south) / 2)) / size
    step_y = tile_h * math.pi / 180 * radius_m / size
    grad_y, grad_x = np.gradient(grid.astype(np.float64))
    slope = np.degrees(np.arctan(np.hypot(grad_x / step_x, grad_y / step_y)))[:size, :size]
    classes = np.digitize(slope, SLOPE_BREAKS_DEG)
    rgba = np.zeros((size, size, 4), dtype=np.uint8)
    for cls, color in enumerate(SLOPE_COLORS, start=1):
        rgba[classes == cls] = color
    buffer = BytesIO()
    Image.fromarray(rgba).save(buffer, format="PNG")
    return Response(content=buffer.getvalue(), media_type="image/png",
                    headers={"Cache-Control": "public, max-age=86400"})
