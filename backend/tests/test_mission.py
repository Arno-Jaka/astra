from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.mission import CrewProfile, crew_estimate


def test_round_trip_includes_mobility_science_and_reserve():
    profile = CrewProfile(objective="Inspect fractures", pace_m_s=1, mobility_allowance_pct=50,
                          science_minutes=30, reserve_minutes=60, budget_hours=5)
    estimate = crew_estimate(3.6, profile)
    assert estimate["outbound_hours"] == 1.5
    assert estimate["return_hours"] == 1.5
    assert estimate["planned_hours"] == 4.5
    assert estimate["budget_margin_hours"] == 0.5
    assert estimate["within_budget"] is True
    assert crew_estimate(7.2, profile)["within_budget"] is False


@pytest.mark.parametrize("values", [{"pace_m_s": 0}, {"mobility_allowance_pct": -1}, {"reserve_minutes": -1}, {"budget_hours": float('nan')}, {"objective": ""}])
def test_invalid_scenario_values_rejected(values):
    with pytest.raises(ValidationError):
        CrewProfile(**{"objective": "Science", **values})


def test_route_alternatives_use_same_crew_snapshot_and_separate_distances():
    result = {"stats": {"distance_km": 3.6}, "coordinates": [], "profile": [], "dangers": [],
              "hazardous": {"distance_km": 1.8}, "slope_compliant": True,
              "note": "Detour", "computed_at": "2026-11-12"}
    profile = CrewProfile(objective="Boxwork survey")
    with patch("app.dem.plan", return_value=result), patch("app.dem.pixel_size_km", return_value=1.85):
        response = TestClient(app).post("/routes/plan", json={"start_lon": 0, "start_lat": 0,
            "end_lon": 0.1, "end_lat": 0, "crew": profile.model_dump()})
    assert response.status_code == 200
    data = response.json()
    assert data["crew_estimate"]["profile"] == profile.model_dump()
    assert data["hazardous"]["crew_estimate"]["profile"] == profile.model_dump()
    assert data["crew_estimate"]["outbound_hours"] == 2 * data["hazardous"]["crew_estimate"]["outbound_hours"]
    assert data["crew_estimate"]["within_budget"] is False
    assert data["hazardous"]["crew_estimate"]["within_budget"] is True
    assert data["slope_compliant"] is True  # Time feasibility and slope compliance are independent.


def test_science_context_has_nasa_source_and_region_limitation():
    data = TestClient(app).get("/mission").json()
    assert data["source_url"].startswith("https://science.nasa.gov/")
    assert "2025" in data["summary"]
    assert "not a surveyed" in data["location_note"]
