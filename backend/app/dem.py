import heapq
import math
from datetime import UTC, datetime
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np

from .config import settings

WIDTH = 5760
HEIGHT = 2880
PPD = 16.0
NODATA = -32768
MARS_RADIUS_KM = 3396.19
MAX_ROUTE_KM = 400.0
PACE_M_S = 1.0
SOURCE_URL = (
    "https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/"
    "mgsl_300x/meg016/"
)
DEFAULT_DEM = (
    Path(__file__).resolve().parents[1] / "data" / "dem" / "megt90n000eb.img"
)


class DemUnavailable(RuntimeError):
    pass


def dem_file() -> Path:
    if settings.mola_dem_path:
        path = Path(settings.mola_dem_path).expanduser()
        return path if path.is_absolute() else DEFAULT_DEM.parent / path
    return DEFAULT_DEM


@lru_cache(maxsize=1)
def _dem() -> np.memmap:
    path = dem_file()
    if not path.exists():
        raise DemUnavailable(
            f"MOLA DEM not found at {path}. Download megt90n000eb.img from "
            f"{SOURCE_URL} into backend/data/dem/."
        )
    return np.memmap(path, dtype=">i2", mode="r", shape=(HEIGHT, WIDTH))


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
    lon1: float, lat1: float, lon2: float, lat2: float, step_km: float = 3.7
) -> list[dict[str, Any]]:
    start, end = _vector(lon1, lat1), _vector(lon2, lat2)
    total_km = MARS_RADIUS_KM * _omega(start, end)
    samples = max(2, min(200, math.ceil(total_km / step_km) + 1))
    points: list[dict[str, Any]] = []
    for index in range(samples):
        t = index / (samples - 1)
        lon, lat = _angles(_interpolate(start, end, t))
        points.append(_point(lon, lat))
    return points


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
    step = max(span / 100.0, 0.034)
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


def plan(
    start_lon: float,
    start_lat: float,
    end_lon: float,
    end_lat: float,
    max_slope_deg: float,
) -> dict[str, Any]:
    direct_km = _great_circle_km(start_lon, start_lat, end_lon, end_lat)
    if direct_km > MAX_ROUTE_KM:
        raise ValueError(
            f"Route is {direct_km:.0f} km; the route planner supports up to "
            f"{MAX_ROUTE_KM:.0f} km."
        )

    direct = _finalize(
        _resample(start_lon, start_lat, end_lon, end_lat, step_km=3.7)
    )
    if direct["max_grade_deg"] <= max_slope_deg + 0.05:
        stats = direct
        compliant = True
        note = "Direct profile satisfies the slope limit."
    else:
        path = _astar(start_lon, start_lat, end_lon, end_lat, max_slope_deg)
        if path is not None:
            stats = _finalize(path)
            compliant = True
            note = "Detour found within the slope limit."
        else:
            stats = direct
            compliant = False
            note = (
                f"No compliant path found under {max_slope_deg:.0f}°; "
                "showing the direct profile."
            )

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
        "slope_compliant": compliant,
        "note": note,
        "distance_km": stats["distance_km"],
        "computed_at": datetime.now(UTC).isoformat(),
    }
