import math
from datetime import UTC, datetime
from io import BytesIO
from typing import Any

import numpy as np
from fastapi import FastAPI, HTTPException, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from PIL import Image
from pydantic import BaseModel

from .agent import build_agent
from .channel import channel
from .commands import CommandError
from .dem import MARS_RADIUS_KM, DemUnavailable, heightmap
from .gazetteer import SITES
from .regions import BRIEFINGS
from .rems import REMS_URL, latest_sol
from .tts import TTSRequest, synthesize

app = FastAPI(title="ASTRA", version="0.1.0")

MARS_RADIUS_M = MARS_RADIUS_KM * 1000.0

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "astra-backend"}


@app.get("/sites")
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


@app.get("/weather/station")
async def weather_station() -> dict[str, object]:
    """Latest REMS sol for the map station pin (Curiosity at Bradbury Landing)."""
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


@app.get("/debug/status")
def debug_status() -> dict[str, bool]:
    return {"frontend_connected": channel.connected}


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket) -> None:
    await ws.accept()
    channel.attach(ws)
    try:
        while True:
            channel.resolve(await ws.receive_json())
    except WebSocketDisconnect:
        pass
    finally:
        channel.detach(ws)


class FlyRequest(BaseModel):
    lon: float
    lat: float
    height: float = 250_000.0
    duration: float = 1.6


@app.post("/debug/fly")
async def debug_fly(req: FlyRequest) -> dict[str, object]:
    try:
        ack = await channel.send("fly_to", req.model_dump())
    except CommandError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"ack": ack}


class ChatRequest(BaseModel):
    message: str


@app.post("/agent/chat")
async def agent_chat(req: ChatRequest) -> dict[str, object]:
    output = await build_agent().arun(req.message)
    tools = [
        {"name": t.tool_name, "args": t.tool_args, "result": t.result}
        for t in (output.tools or [])
    ]
    return {"content": output.content, "tools": tools}


@app.post("/tts")
async def tts(req: TTSRequest) -> FileResponse:
    return await synthesize(req)


@app.get("/dem/tile")
def dem_tile(
    west: float,
    south: float,
    east: float,
    north: float,
    width: int = 64,
    height: int = 64,
) -> Response:
    # The MOLA grid is 0-360 deg E; sampling normalizes, so accept either
    # -180..180 (Cesium geographic tiles) or 0..360 (PDS convention).
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
        content=data.tobytes(),
        media_type="application/octet-stream",
        headers={"Cache-Control": "public, max-age=86400"},
    )


# Slope-hazard overlay classes (degrees) and RGBA colors, derived from the
# MOLA DEM. Breaks follow common rover trafficability bands.
SLOPE_BREAKS_DEG = (5.0, 10.0, 15.0, 25.0)
SLOPE_COLORS = (
    (94, 213, 92, 70),
    (250, 204, 21, 110),
    (251, 146, 60, 150),
    (239, 68, 68, 190),
)


@app.get("/dem/slopetile/{z}/{x}/{y}")
def slope_tile(z: int, x: int, y: int) -> Response:
    """Colorized slope-hazard PNG tile computed from the MOLA DEM.

    Uses Cesium's GeographicTilingScheme layout: level z has 2^(z+1) x-tiles
    and 2^z y-tiles, x from -180 deg E, y from +90 (north) down.
    """
    if not 0 <= z <= 8:
        raise HTTPException(status_code=400, detail="level out of range")
    tiles_x = 2 ** (z + 1)
    tiles_y = 2**z
    if not 0 <= x < tiles_x or not 0 <= y < tiles_y:
        raise HTTPException(status_code=400, detail="tile index out of range")

    tile_w = 360.0 / tiles_x
    tile_h = 180.0 / tiles_y
    west = -180.0 + x * tile_w
    east = west + tile_w
    north = 90.0 - y * tile_h
    south = north - tile_h

    size = 256
    try:
        # One extra row/column so np.gradient has forward differences at the
        # top/left edges; the crop keeps tile-internal pixels only.
        grid = heightmap(
            west, south, east, north, width=size + 1, height=size + 1
        )
    except DemUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    lat_mid = math.radians((north + south) / 2)
    step_x_m = (
        tile_w
        * math.pi
        / 180.0
        * MARS_RADIUS_M
        * math.cos(lat_mid)
        / size
    )
    step_y_m = tile_h * math.pi / 180.0 * MARS_RADIUS_M / size

    grad_y, grad_x = np.gradient(grid.astype(np.float64))
    slope_deg = np.degrees(
        np.arctan(np.hypot(grad_x / step_x_m, grad_y / step_y_m))
    )[:size, :size]

    classes = np.digitize(slope_deg, SLOPE_BREAKS_DEG)
    rgba = np.zeros((size, size, 4), dtype=np.uint8)
    for cls, (r, g, b, a) in enumerate(SLOPE_COLORS, start=1):
        mask = classes == cls
        rgba[mask, 0] = r
        rgba[mask, 1] = g
        rgba[mask, 2] = b
        rgba[mask, 3] = a

    buffer = BytesIO()
    Image.fromarray(rgba, mode="RGBA").save(buffer, format="PNG")
    return Response(
        content=buffer.getvalue(),
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=86400"},
    )
