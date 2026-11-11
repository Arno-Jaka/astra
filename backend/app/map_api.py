"""Map data endpoints, kept separate from the chat/command entry point."""

import math
from datetime import UTC, datetime
from io import BytesIO
from typing import Any

import numpy as np
from fastapi import APIRouter, HTTPException, Response
from PIL import Image

from .dem import MARS_RADIUS_KM, DemUnavailable, heightmap
from .gazetteer import SITES
from .regions import BRIEFINGS
from .rems import REMS_URL, latest_sol

router = APIRouter()


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
