"""Regional weather and radiation screening for Mars surface exploration.

This is an *illustrative regional screening*, not a measured dose map, a dust
forecast, or a validated EVA-safety certification. The ranges are anchored to
published planetary-scale values:

- Curiosity's RAD measured a surface dose of roughly 0.64 mSv/day (NASA/JPL).
- Equatorial daytime highs reach a few °C, while polar nights fall below -120 °C.
- Surface pressure is ~600-700 Pa, so the atmosphere provides little shielding;
  dose and cold risk rise with elevation and latitude.

ASTRA scales those ranges by each zone's latitude and approximate regional
elevation. Per-zone numbers are ASTRA estimates and are labelled as such; the
route planner's terrain/slope assessment is separate.
"""

from dataclasses import dataclass
from typing import Any, Literal

from .config import settings
from .rems import REMS_URL

RAD_SOURCE_URL = settings.rad_source_url

# Curiosity RAD surface dose average, mSv/day (NASA/JPL).
RAD_BASELINE_MSV_DAY = 0.64
# Model tuning: thinner atmosphere at altitude and weaker shielding toward the
# poles raise the surface dose.
RAD_ELEVATION_PER_KM = 0.05
RAD_LATITUDE_WEIGHT = 0.35
# Equatorial mean air temperature and its latitude/elevation scaling (°C).
TEMP_EQUATOR_MEAN_C = -20.0
TEMP_PER_DEGREE_LAT = 0.55
TEMP_PER_KM_ELEVATION = 1.8
TEMP_SWING_BASE_C = 55.0

Level = Literal["safe", "caution", "unsafe"]


@dataclass(frozen=True)
class Zone:
    key: str
    name: str
    lon: float
    lat: float
    radius_km: float
    elevation_m: int
    dust: float
    science_value: Literal["high", "medium", "low"]
    scenic: str
    source_url: str = ""


# Anchored at IAU/USGS Gazetteer sites. Elevations are approximate regional
# values (MOLA datum) used only to scale the screening model.
ZONES: tuple[Zone, ...] = (
    Zone("gale", "Gale Crater", 137.81, -5.37, 90, -4400, 0.40, "high",
         "Layered Mount Sharp and ancient lakebeds: the default science stop.", source_url=RAD_SOURCE_URL),
    Zone("mount-sharp", "Mount Sharp (Aeolis Mons)", 137.85, -5.08, 55, 3000, 0.40, "high",
         "A km-scale stack of exposed strata recording early Mars climate change.", source_url=REMS_URL),
    Zone("jezero", "Jezero Crater", 77.69, 18.41, 45, -2600, 0.40, "high",
         "A river delta built into an ancient lake: prime biosignature ground.", source_url=RAD_SOURCE_URL),
    Zone("olympus", "Olympus Mons", 226.20, 18.65, 260, 21200, 0.30, "high",
         "The tallest volcano in the solar system; sheer scale and lava flows.", source_url=RAD_SOURCE_URL),
    Zone("valles-marineris", "Valles Marineris", 301.41, -14.01, 300, -4000, 0.55, "high",
         "The largest canyon system on Mars, with walls exposing deep crust.", source_url=RAD_SOURCE_URL),
    Zone("hellas", "Hellas Planitia", 70.50, -42.43, 300, -7000, 0.60, "high",
         "A vast impact basin, the deepest exposed terrain in the southern hemisphere.", source_url=RAD_SOURCE_URL),
    Zone("elysium", "Elysium Mons", 147.21, 25.02, 160, 14000, 0.35, "medium",
         "A broad shield volcano on the Elysium rise.", source_url=RAD_SOURCE_URL),
    Zone("argyre", "Argyre Planitia", 316.69, -49.84, 260, -5300, 0.35, "medium",
         "A bright southern impact basin ringed by rugged highlands.", source_url=RAD_SOURCE_URL),
    Zone("syrtis", "Syrtis Major Planitia", 69.50, 9.39, 220, 1000, 0.50, "medium",
         "A dark, wind-sculpted volcanic region with a striking albedo contrast.", source_url=RAD_SOURCE_URL),
    Zone("meridiani", "Meridiani Planum", 356.86, -0.04, 160, -1400, 0.40, "medium",
         "Flat hematite-bearing plains explored by Opportunity.", source_url=RAD_SOURCE_URL),
    Zone("gusev", "Gusev Crater", 175.52, -14.53, 90, -1900, 0.40, "medium",
         "An ancient crater lakebed explored by Spirit.", source_url=RAD_SOURCE_URL),
    Zone("isidis", "Isidis Planitia", 88.38, 13.94, 220, -3800, 0.40, "medium",
         "A low basin on the edge of the northern plains.", source_url=RAD_SOURCE_URL),
    Zone("utopia", "Utopia Planitia", 117.52, 46.74, 300, -5000, 0.35, "medium",
         "Northern plains with patterned ground and buried ice.", source_url=RAD_SOURCE_URL),
    Zone("chryse", "Chryse Planitia", 319.69, 28.43, 220, -2500, 0.40, "medium",
         "Low northern plains where Viking 1 landed.", source_url=RAD_SOURCE_URL),
    Zone("noctis", "Noctis Labyrinthus", 258.81, -6.36, 180, -3000, 0.55, "high",
         "A maze of interconnected canyons west of Valles Marineris.", source_url=RAD_SOURCE_URL),
    Zone("ascraeus", "Ascraeus Mons", 255.92, 11.92, 140, 18000, 0.30, "medium",
         "A Tharsis shield volcano with complex summit calderas.", source_url=RAD_SOURCE_URL),
    Zone("pavonis", "Pavonis Mons", 247.04, 1.48, 130, 14000, 0.30, "medium",
         "A Tharsis shield volcano straddling the equator.", source_url=RAD_SOURCE_URL),
    Zone("arsia", "Arsia Mons", 239.91, -8.26, 130, 17000, 0.30, "medium",
         "A Tharsis shield volcano with a prominent summit caldera.", source_url=RAD_SOURCE_URL),
    Zone("alba", "Alba Mons", 249.29, 41.08, 300, 9000, 0.35, "medium",
         "A low, wide volcano with a vast flow field.", source_url=RAD_SOURCE_URL),
    Zone("huygens", "Huygens Crater", 55.58, -13.88, 120, 1000, 0.45, "low",
         "A large degraded impact crater in the southern highlands.", source_url=RAD_SOURCE_URL),
    Zone("schiaparelli", "Schiaparelli Crater", 16.77, -2.71, 60, -2000, 0.45, "low",
         "An equatorial crater and the ExoMars Schiaparelli landing site.", source_url=RAD_SOURCE_URL),
)


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _level(value: float, safe_below: float, caution_below: float,
           low_is_safe: bool = True) -> Level:
    if low_is_safe:
        if value < safe_below:
            return "safe"
        return "caution" if value < caution_below else "unsafe"
    if value > safe_below:
        return "safe"
    return "caution" if value > caution_below else "unsafe"


def _worst(*levels: Level) -> Level:
    order = {"safe": 0, "caution": 1, "unsafe": 2}
    return max(levels, key=order.__getitem__)


def assess_zone(zone: Zone) -> dict[str, Any]:
    """Derive a weather + radiation screening for one region."""
    latitude = abs(zone.lat)
    elevation_km = zone.elevation_m / 1000.0

    dose = RAD_BASELINE_MSV_DAY
    dose *= 1 + max(0.0, elevation_km) * RAD_ELEVATION_PER_KM
    dose *= 1 + (latitude / 90.0) ** 2 * RAD_LATITUDE_WEIGHT
    dose = round(dose, 2)

    mean_c = (TEMP_EQUATOR_MEAN_C - latitude * TEMP_PER_DEGREE_LAT
              - max(0.0, elevation_km) * TEMP_PER_KM_ELEVATION)
    swing = TEMP_SWING_BASE_C + latitude * 0.25 + max(0.0, elevation_km) * 0.8
    max_temp_c = round(mean_c + swing / 2)
    min_temp_c = round(mean_c - swing / 2)

    dust = round(_clamp(zone.dust + (latitude / 90.0) * 0.1, 0.0, 1.0), 2)

    # Weather: dust loading and cold both shut down an EVA.
    dust_level = _level(dust, 0.45, 0.7)
    cold_level = _level(min_temp_c, -80, -110, low_is_safe=False)
    weather_level = _worst(dust_level, cold_level)
    radiation_level = _level(dose, 0.7, 0.95)
    overall = _worst(weather_level, radiation_level)

    return {
        "id": zone.key,
        "name": zone.name,
        "lon": zone.lon,
        "lat": zone.lat,
        "radius_km": zone.radius_km,
        "elevation_m": zone.elevation_m,
        "science_value": zone.science_value,
        "scenic": zone.scenic,
        "classification": overall,
        "weather": {
            "classification": weather_level,
            "dust_index": dust,
            "min_temp_c": min_temp_c,
            "max_temp_c": max_temp_c,
            "note": "Derived from latitude and regional elevation; not a dust-storm forecast.",
        },
        "radiation": {
            "classification": radiation_level,
            "surface_dose_msv_day": dose,
            "note": "Scaled from the Curiosity RAD surface average (~0.64 mSv/day) by elevation and latitude; not a measured dose for this spot.",
        },
        "basis": "derived",
        "source_url": zone.source_url,
        "note": "Regional screening only. Terrain/slope suitability is assessed separately by the route planner.",
    }


def zones() -> list[dict[str, Any]]:
    return [assess_zone(zone) for zone in ZONES]


def assess_point(lon: float, lat: float) -> dict[str, Any]:
    """Nearest-zone screening for an arbitrary point."""
    import math

    def distance_km(zone: Zone) -> float:
        dlat = math.radians(zone.lat - lat)
        dlon = math.radians(zone.lon - lon)
        a = (math.sin(dlat / 2) ** 2
             + math.cos(math.radians(lat)) * math.cos(math.radians(zone.lat))
             * math.sin(dlon / 2) ** 2)
        return 2 * 3390.0 * math.asin(min(1.0, math.sqrt(a)))

    nearest = min(ZONES, key=distance_km)
    result = assess_zone(nearest)
    return {
        "requested": {"lon": lon, "lat": lat},
        "nearest": {**result, "distance_km": round(distance_km(nearest), 1)},
        "note": (
            "Point screening uses the nearest mapped region; local weather and "
            "radiation can differ. Not a measured dose or dust forecast."
        ),
    }
