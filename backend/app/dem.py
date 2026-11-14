import heapq
import itertools
import math
import re
from datetime import UTC, datetime
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np

from .config import settings

# Populated by _dem() from the PDS label or the raw file size. The defaults
# match the 16 ppd MOLA MEGDR grid; the 32 ppd grid is preferred when present.
WIDTH = 5760
HEIGHT = 2880
PPD = 16.0
NODATA = -32768
MARS_RADIUS_KM = 3396.19
PACE_M_S = 1.0
# Danger classification thresholds along a traverse (degrees of grade).
# 10 deg is a steep grade (slip risk for a rover); grades beyond the mission
# slope envelope (the requested limit plus a small margin, floored at 12
# deg) exceed the vehicle's certified stability envelope, so the scout
# simulation loses control there (rollover); 35 deg is cliff-like (fall and
# impact in the scout simulation). The floor keeps very low mission
# limits from triggering rollovers on gentle terrain, and the margin keeps
# compliant routes (max grade <= limit + 0.05) always below the envelope.
DANGER_STEEP_DEG = 10.0
DANGER_ROLLOVER_DEG = 12.0
DANGER_ROLLOVER_MARGIN_DEG = 0.25
DANGER_CLIFF_DEG = 35.0


def danger_envelope_deg(slope_limit_deg: float) -> float:
    """Grade beyond which the scout simulation loses control (rollover)."""
    return max(
        DANGER_ROLLOVER_DEG, slope_limit_deg + DANGER_ROLLOVER_MARGIN_DEG
    )
SOURCE_URL = settings.mola_source_url
DEFAULT_DEM = (
    Path(__file__).resolve().parents[1] / "data" / "dem" / "megt90n000fb.img"
)
LEGACY_DEM = (
    Path(__file__).resolve().parents[1] / "data" / "dem" / "megt90n000eb.img"
)


class DemUnavailable(RuntimeError):
    pass


def dem_file() -> Path:
    if settings.mola_dem_path:
        path = Path(settings.mola_dem_path).expanduser()
        return path if path.is_absolute() else DEFAULT_DEM.parent / path
    if DEFAULT_DEM.exists():
        return DEFAULT_DEM
    return LEGACY_DEM


def _dem_grid(path: Path) -> tuple[int, int, float]:
    """Return (width, height, pixels-per-degree) for a MOLA MEGDR grid."""
    size = path.stat().st_size
    lbl = path.with_suffix(".lbl")
    if lbl.exists():
        text = lbl.read_text(encoding="utf-8", errors="ignore")
        samples = re.search(r"LINE_SAMPLES\s*=\s*(\d+)", text)
        lines = re.search(r"LINES\s*=\s*(\d+)", text)
        if samples and lines:
            width, height = int(samples.group(1)), int(lines.group(1))
            if width * height * 2 == size:
                return width, height, width / 360.0
    # Global equirectangular grids are 2:1 and 2 bytes per sample.
    height = round(math.sqrt(size / 4))
    width = 2 * height
    if width * height * 2 == size:
        return width, height, width / 360.0
    raise DemUnavailable(
        f"Cannot determine DEM dimensions for {path} ({size} bytes). "
        "Expected a global equirectangular MOLA grid with a .lbl sidecar."
    )


@lru_cache(maxsize=1)
def _dem() -> np.memmap:
    global WIDTH, HEIGHT, PPD
    path = dem_file()
    if not path.exists():
        raise DemUnavailable(
            f"MOLA DEM not found at {path}. Download megt90n000fb.img from "
            f"{SOURCE_URL} into backend/data/dem/."
        )
    WIDTH, HEIGHT, PPD = _dem_grid(path)
    return np.memmap(path, dtype=">i2", mode="r", shape=(HEIGHT, WIDTH))


def pixel_size_km() -> float:
    """Approximate ground size of one DEM pixel at the equator."""
    _dem()
    return 2.0 * math.pi * MARS_RADIUS_KM / 360.0 / PPD


def elevation_m(lon: float, lat: float) -> float | None:
    dem = _dem()
    x = (lon % 360.0) * PPD - 0.5
    y = (90.0 - lat) * PPD - 0.5
    x_floor = math.floor(x)
    y_floor = math.floor(y)
    fx = x - x_floor
    fy = y - y_floor

    x0 = x_floor % WIDTH
    x1 = (x0 + 1) % WIDTH
    y0 = min(max(y_floor, 0), HEIGHT - 1)
    y1 = min(y0 + 1, HEIGHT - 1)

    v00 = int(dem[y0, x0])
    v01 = int(dem[y0, x1])
    v10 = int(dem[y1, x0])
    v11 = int(dem[y1, x1])

    corners = (v00, v01, v10, v11)
    if NODATA in corners:
        valid = [value for value in corners if value != NODATA]
        if not valid:
            return None
        return float(sum(valid)) / len(valid)

    top = v00 + (v01 - v00) * fx
    bottom = v10 + (v11 - v10) * fx
    return top + (bottom - top) * fy


def _sample_grid(lons: np.ndarray, lats: np.ndarray) -> np.ndarray:
    dem = _dem()
    xs = np.mod(lons, 360.0) * PPD - 0.5
    ys = (90.0 - lats) * PPD - 0.5
    x_grid, y_grid = np.meshgrid(xs, ys)
    x_floor = np.floor(x_grid).astype(np.int64)
    y_floor = np.floor(y_grid).astype(np.int64)
    fx = x_grid - x_floor
    fy = y_grid - y_floor

    x0 = x_floor % WIDTH
    x1 = (x0 + 1) % WIDTH
    y0 = np.clip(y_floor, 0, HEIGHT - 1)
    y1 = np.clip(y0 + 1, 0, HEIGHT - 1)

    v00 = dem[y0, x0].astype(np.float64)
    v01 = dem[y0, x1].astype(np.float64)
    v10 = dem[y1, x0].astype(np.float64)
    v11 = dem[y1, x1].astype(np.float64)

    top = v00 + (v01 - v00) * fx
    bottom = v10 + (v11 - v10) * fx
    values = top + (bottom - top) * fy
    nodata = (v00 == NODATA) | (v01 == NODATA) | (v10 == NODATA) | (v11 == NODATA)
    return np.where(nodata, 0.0, values)


@lru_cache(maxsize=512)
def _heightmap(
    west: float,
    south: float,
    east: float,
    north: float,
    width: int,
    height: int,
    dem_width: int,
    dem_height: int,
) -> np.ndarray:
    lons = np.linspace(west, east, width)
    lats = np.linspace(north, south, height)
    return _sample_grid(lons, lats).astype(np.float32)


def heightmap(
    west: float,
    south: float,
    east: float,
    north: float,
    width: int = 64,
    height: int = 64,
) -> np.ndarray:
    _dem()
    return _heightmap(
        round(west, 6),
        round(south, 6),
        round(east, 6),
        round(north, 6),
        width,
        height,
        WIDTH,
        HEIGHT,
    )


def _vector(lon: float, lat: float) -> tuple[float, float, float]:
    lon_r, lat_r = math.radians(lon), math.radians(lat)
    cos_lat = math.cos(lat_r)
    return (cos_lat * math.cos(lon_r), cos_lat * math.sin(lon_r), math.sin(lat_r))


def _angles(vector: tuple[float, float, float]) -> tuple[float, float]:
    x, y, z = vector
    lon = math.degrees(math.atan2(y, x)) % 360.0
    lat = math.degrees(math.asin(max(-1.0, min(1.0, z))))
    return lon, lat


def _omega(a: tuple[float, float, float], b: tuple[float, float, float]) -> float:
    dot = max(-1.0, min(1.0, sum(p * q for p, q in zip(a, b, strict=True))))
    return math.acos(dot)


def _great_circle_km(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    return MARS_RADIUS_KM * _omega(_vector(lon1, lat1), _vector(lon2, lat2))


def _interpolate(
    a: tuple[float, float, float], b: tuple[float, float, float], t: float
) -> tuple[float, float, float]:
    omega = _omega(a, b)
    if omega < 1e-9:
        return a
    sin_omega = math.sin(omega)
    ca = math.sin((1.0 - t) * omega) / sin_omega
    cb = math.sin(t * omega) / sin_omega
    return tuple(ca * p + cb * q for p, q in zip(a, b, strict=True))


def _point(lon: float, lat: float) -> dict[str, Any]:
    elevation = elevation_m(lon, lat)
    return {
        "lon": round(lon, 5),
        "lat": round(lat, 5),
        "elevation_m": None if elevation is None else round(elevation, 1),
    }


def _resample(
    lon1: float, lat1: float, lon2: float, lat2: float, step_km: float = 0.5
) -> list[dict[str, Any]]:
    start, end = _vector(lon1, lat1), _vector(lon2, lat2)
    total_km = MARS_RADIUS_KM * _omega(start, end)
    samples = max(2, min(4000, math.ceil(total_km / step_km) + 1))
    points: list[dict[str, Any]] = []
    for index in range(samples):
        t = index / (samples - 1)
        lon, lat = _angles(_interpolate(start, end, t))
        points.append(_point(lon, lat))
    return points


def _densify(
    points: list[dict[str, Any]], step_km: float = 0.5
) -> list[dict[str, Any]]:
    """Insert interpolated samples along a coarse path (short segments)."""
    if len(points) < 2:
        return points
    dense: list[dict[str, Any]] = [points[0]]
    for previous, current in itertools.pairwise(points):
        segment_km = _great_circle_km(
            previous["lon"], previous["lat"], current["lon"], current["lat"]
        )
        samples = max(1, math.ceil(segment_km / step_km))
        for index in range(1, samples + 1):
            t = index / samples
            lon = previous["lon"] + (current["lon"] - previous["lon"]) * t
            lat = previous["lat"] + (current["lat"] - previous["lat"]) * t
            dense.append(_point(lon, lat))
    return dense


def _finalize(points: list[dict[str, Any]]) -> dict[str, Any]:
    if len(points) < 2:
        raise ValueError("route needs at least two points")

    enriched: list[dict[str, Any]] = [
        {**points[0], "distance_km": 0.0, "grade_deg": None}
    ]
    distance_km = 0.0
    ascent_m = 0.0
    descent_m = 0.0
    grades: list[float] = []
    previous = points[0]

    for point in points[1:]:
        segment_km = _great_circle_km(
            previous["lon"], previous["lat"], point["lon"], point["lat"]
        )
        distance_km += segment_km
        previous_elev = previous["elevation_m"]
        current_elev = point["elevation_m"]
        grade: float | None = None
        if previous_elev is not None and current_elev is not None and segment_km > 0:
            dz = current_elev - previous_elev
            grade = math.degrees(math.atan2(dz, segment_km * 1000.0))
            ascent_m += max(dz, 0.0)
            descent_m += max(-dz, 0.0)
            grades.append(abs(grade))
        enriched.append(
            {
                **point,
                "distance_km": round(distance_km, 3),
                "grade_deg": None if grade is None else round(grade, 2),
            }
        )
        previous = point

    elevations = [
        point["elevation_m"]
        for point in points
        if point["elevation_m"] is not None
    ]
    return {
        "points": enriched,
        "distance_km": distance_km,
        "ascent_m": ascent_m,
        "descent_m": descent_m,
        "max_grade_deg": max(grades) if grades else 0.0,
        "mean_grade_deg": sum(grades) / len(grades) if grades else 0.0,
        "min_elevation_m": min(elevations) if elevations else None,
        "max_elevation_m": max(elevations) if elevations else None,
    }


def _astar(
    lon1: float, lat1: float, lon2: float, lat2: float, max_slope_deg: float
) -> list[dict[str, Any]] | None:
    pad = 0.4
    lon_min = min(lon1, lon2) - pad
    lon_max = max(lon1, lon2) + pad
    lat_min = min(lat1, lat2) - pad
    lat_max = max(lat1, lat2) + pad

    span = max(lon_max - lon_min, lat_max - lat_min)
    step = max(span / 100.0, 360.0 / WIDTH)
    nx = math.ceil((lon_max - lon_min) / step) + 1
    ny = math.ceil((lat_max - lat_min) / step) + 1

    def coord(ix: int, iy: int) -> tuple[float, float]:
        return (lon_min + ix * step, lat_min + iy * step)

    def index(lon: float, lat: float) -> tuple[int, int]:
        ix = min(nx - 1, max(0, round((lon - lon_min) / step)))
        iy = min(ny - 1, max(0, round((lat - lat_min) / step)))
        return ix, iy

    start_index = index(lon1, lat1)
    goal_index = index(lon2, lat2)
    elevations: dict[tuple[int, int], float | None] = {}

    def elevation_at(node: tuple[int, int]) -> float | None:
        if node not in elevations:
            lon, lat = coord(*node)
            elevations[node] = elevation_m(lon, lat)
        return elevations[node]

    def heuristic(node: tuple[int, int]) -> float:
        lon, lat = coord(*node)
        return _great_circle_km(lon, lat, lon2, lat2)

    neighbors = (
        (-1, 0),
        (1, 0),
        (0, -1),
        (0, 1),
        (-1, -1),
        (-1, 1),
        (1, -1),
        (1, 1),
    )
    start_cost = {start_index: 0.0}
    came_from: dict[tuple[int, int], tuple[int, int]] = {}
    queue: list[tuple[float, tuple[int, int]]] = [(heuristic(start_index), start_index)]
    expanded = 0

    while queue and expanded < 50_000:
        _, current = heapq.heappop(queue)
        if current == goal_index:
            path = [current]
            while path[-1] in came_from:
                path.append(came_from[path[-1]])
            path.reverse()
            return [_point(*coord(*node)) for node in path]

        expanded += 1
        current_elev = elevation_at(current)
        current_lon, current_lat = coord(*current)
        for dx, dy in neighbors:
            neighbor = (current[0] + dx, current[1] + dy)
            if not (0 <= neighbor[0] < nx and 0 <= neighbor[1] < ny):
                continue
            neighbor_elev = elevation_at(neighbor)
            if current_elev is None or neighbor_elev is None:
                continue
            neighbor_lon, neighbor_lat = coord(*neighbor)
            segment_km = _great_circle_km(
                current_lon, current_lat, neighbor_lon, neighbor_lat
            )
            if segment_km <= 0:
                continue
            grade = abs(
                math.degrees(
                    math.atan2(neighbor_elev - current_elev, segment_km * 1000.0)
                )
            )
            if grade > max_slope_deg:
                continue
            cost = segment_km * (1.0 + 2.0 * (grade / max_slope_deg))
            tentative = start_cost[current] + cost
            if tentative < start_cost.get(neighbor, math.inf):
                came_from[neighbor] = current
                start_cost[neighbor] = tentative
                heapq.heappush(
                    queue, (tentative + heuristic(neighbor), neighbor)
                )

    return None


def _danger_label(
    peak_deg: float, slope_limit_deg: float
) -> tuple[str, str]:
    """Classify a danger zone peak and build a human label."""
    if peak_deg >= DANGER_CLIFF_DEG:
        return (
            "cliff",
            f"Cliff ({peak_deg:.0f}° drop) — fall and impact risk",
        )
    if peak_deg >= danger_envelope_deg(slope_limit_deg):
        return (
            "rollover",
            (
                f"Rollover risk ({peak_deg:.0f}° — over the "
                f"{slope_limit_deg:.0f}° mission slope envelope)"
            ),
        )
    return "steep", f"Steep grade ({peak_deg:.0f}° — slip risk)"


def find_dangers(
    points: list[dict[str, Any]], slope_limit_deg: float
) -> list[dict[str, Any]]:
    """Find danger zones along a traverse profile.

    Groups consecutive samples with |grade| >= DANGER_STEEP_DEG into zones
    (merged when separated by less than 1 km), then classifies each zone by
    its peak grade. A route under the mission slope limit typically returns
    zones only where regional grades still exceed the steep threshold.
    """
    zones: list[dict[str, Any]] = []
    current: list[dict[str, Any]] = []

    def flush() -> None:
        if not current:
            return
        grades = [abs(p["grade_deg"]) for p in current if p["grade_deg"] is not None]
        if not grades:
            current.clear()
            return
        peak = max(grades)
        kind, label = _danger_label(peak, slope_limit_deg)
        mid = current[len(current) // 2]
        start_km = current[0]["distance_km"]
        end_km = current[-1]["distance_km"]
        zones.append(
            {
                "type": kind,
                "label": label,
                "lon": round(mid["lon"], 5),
                "lat": round(mid["lat"], 5),
                "distance_km": round((start_km + end_km) / 2, 2),
                "start_km": round(start_km, 2),
                "span_km": round(max(end_km - start_km, 0.5), 2),
                "max_grade_deg": round(peak, 1),
                "over_limit": peak > slope_limit_deg,
            }
        )
        current.clear()

    for point in points:
        grade = point["grade_deg"]
        if grade is None or abs(grade) < DANGER_STEEP_DEG:
            flush()
            continue
        if current:
            gap_km = point["distance_km"] - current[-1]["distance_km"]
            if gap_km > 1.0:
                flush()
        current.append(point)
    flush()
    return zones


def _route_payload(
    stats: dict[str, Any],
    coordinates: list[list[float]],
    profile: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "distance_km": round(stats["distance_km"], 1),
        "ascent_m": round(stats["ascent_m"]),
        "descent_m": round(stats["descent_m"]),
        "max_grade_deg": round(stats["max_grade_deg"], 1),
        "mean_grade_deg": round(stats["mean_grade_deg"], 1),
        "coordinates": coordinates,
        "profile": profile,
    }


def plan(
    start_lon: float,
    start_lat: float,
    end_lon: float,
    end_lat: float,
    max_slope_deg: float,
) -> dict[str, Any]:
    direct = _finalize(
        _resample(start_lon, start_lat, end_lon, end_lat, step_km=0.5)
    )
    direct_dangers = find_dangers(direct["points"], max_slope_deg)

    if direct["max_grade_deg"] <= max_slope_deg + 0.05:
        stats = direct
        compliant = True
        note = "Direct profile satisfies the slope limit."
        hazardous = None
    else:
        # The A* grid grades and the densified 0.5 km profile can drift a
        # few degrees apart, so retry with progressively stricter internal
        # limits until the final profile genuinely satisfies the request.
        stats = None
        for factor in (1.0, 0.85, 0.7, 0.55):
            internal_limit = max(2.0, max_slope_deg * factor)
            path = _astar(
                start_lon, start_lat, end_lon, end_lat, internal_limit
            )
            if path is None:
                continue
            candidate = _finalize(_densify(path, step_km=0.5))
            if candidate["max_grade_deg"] <= max_slope_deg + 0.05:
                stats = candidate
                break
        if stats is not None:
            compliant = True
            note = "Detour found within the slope limit."
            # The straight-line profile becomes the hazardous comparison
            # route, with its own danger zones.
            direct_profile = [
                {
                    "distance_km": point["distance_km"],
                    "elevation_m": point["elevation_m"],
                    "grade_deg": point["grade_deg"],
                }
                for point in direct["points"]
            ]
            direct_coordinates = [
                [point["lon"], point["lat"]] for point in direct["points"]
            ]
            hazardous = {
                **_route_payload(direct, direct_coordinates, direct_profile),
                "dangers": direct_dangers,
                "note": (
                    "Direct route exceeds the slope limit; shown for "
                    "comparison."
                ),
            }
        else:
            stats = direct
            compliant = False
            note = (
                f"No compliant path found under {max_slope_deg:.0f}°; "
                "showing the direct profile."
            )
            hazardous = None

    dangers = find_dangers(stats["points"], max_slope_deg)
    profile = [
        {
            "distance_km": point["distance_km"],
            "elevation_m": point["elevation_m"],
            "grade_deg": point["grade_deg"],
        }
        for point in stats["points"]
    ]
    coordinates = [
        [point["lon"], point["lat"]] for point in stats["points"]
    ]
    return {
        "stats": stats,
        "profile": profile,
        "coordinates": coordinates,
        "dangers": dangers,
        "hazardous": hazardous,
        "slope_compliant": compliant,
        "note": note,
        "distance_km": stats["distance_km"],
        "computed_at": datetime.now(UTC).isoformat(),
    }
