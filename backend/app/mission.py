"""Science context and explicitly user-assumed EVA timing; not suit certification."""

from pydantic import BaseModel, Field

BOXWORK_SOURCE = "https://science.nasa.gov/photojournal/curiosity-views-boxwork-patterns-at-a-distance/"
MISSION = {
    "title": "Gale / Mount Sharp surface-science mission",
    "objective": "Investigate boxwork ridges for evidence of ancient groundwater",
    "summary": "Curiosity imaged low boxwork ridges in Mount Sharp's foothills on May 22, 2025 (sol 4536). Scientists interpret them as mineral-cemented fractures exposed by erosion, recording ancient groundwater.",
    "tasks": ["Compare ridge and surrounding rock textures in optical imagery.",
              "Record fracture orientation and candidate observation stations.",
              "Plan a return traverse with time for imaging and sampling."],
    "source_url": BOXWORK_SOURCE,
    "image_url": "https://assets.science.nasa.gov/content/dam/science/psd/photojournal/pia/pia26/pia26560/PIA26560.jpg",
    "image_credit": "NASA/JPL-Caltech/MSSS · Mastcam · May 22, 2025 · PIA26560 (Earth-like color balance)",
    "region": {"lon": 137.85, "lat": -5.08, "name": "Mount Sharp (Aeolis Mons)"},
    "location_note": "The map focus is a regional gazetteer coordinate, not a surveyed boxwork outcrop. Select a candidate science destination; exact outcrop access and obstacles require higher-resolution mapping.",
}


class CrewProfile(BaseModel):
    objective: str = Field(min_length=1, max_length=200)
    pace_m_s: float = Field(default=0.5, ge=0.1, le=2)
    mobility_allowance_pct: float = Field(default=50, ge=0, le=300)
    science_minutes: float = Field(default=45, ge=0, le=480)
    reserve_minutes: float = Field(default=60, ge=0, le=480)
    budget_hours: float = Field(default=6, ge=0.5, le=24)
    high_physical_risk: bool = False
    strict_contamination: bool = False
    repetitive_work: bool = False


def crew_estimate(distance_km: float, profile: CrewProfile) -> dict:
    outbound = distance_km * 1000 / profile.pace_m_s / 3600 * (1 + profile.mobility_allowance_pct / 100)
    planned = 2 * outbound + (profile.science_minutes + profile.reserve_minutes) / 60
    return {
        "profile": profile.model_dump(), "outbound_hours": outbound,
        "return_hours": outbound, "planned_hours": planned,
        "budget_margin_hours": profile.budget_hours - planned,
        "within_budget": planned <= profile.budget_hours,
        "note": "User-assumed walking pace and suit/equipment time allowance; return retraces the same route. Includes science time and reserve. No oxygen, metabolic, radiation or suit certification model.",
    }
