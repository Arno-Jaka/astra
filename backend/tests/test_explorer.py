from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app import dem
from app.main import app

client = TestClient(app)


def test_inspection_coordinates_image_and_provenance():
    with patch("app.dem.elevation_m", return_value=-4500), patch("app.dem.pixel_size_km", return_value=1.85):
        for lon, lat in [(137.81, -5.37), (-180, 90), (180, -90)]:
            response = client.get("/locations/inspect", params={"lon": lon, "lat": lat})
            assert response.status_code == 200
            data = response.json()
            assert data["lon"] == lon
            assert data["elevation_m"] == -4500
            assert 0 <= data["image_x"] <= 1
            assert 0 <= data["image_y"] <= 1
            assert data["image_url"].startswith("https://trek.nasa.gov/")
            assert data["source_url"] == dem.SOURCE_URL
    assert client.get("/locations/inspect?lon=nan&lat=0").status_code == 400


def test_inspection_survives_missing_dem():
    with patch("app.dem.elevation_m", side_effect=dem.DemUnavailable("missing")):
        data = client.get("/locations/inspect?lon=0&lat=0").json()
    assert data["elevation_m"] is None
    assert data["image_url"]


@pytest.mark.parametrize("compliant,alternative", [(True, None), (False, None), (True, {"distance_km": 12})])
def test_route_preserves_actual_planner_outcomes(compliant, alternative):
    result = {
        "stats": {"distance_km": 10}, "coordinates": [[0, 0], [0.1, 0], [0.2, 0]],
        "profile": [], "dangers": [], "hazardous": alternative,
        "slope_compliant": compliant, "note": "Planner outcome", "computed_at": "2026-11-11",
    }
    with patch("app.dem.plan", return_value=result) as planner, patch("app.dem.pixel_size_km", return_value=1.85):
        response = client.post("/routes/plan", json={"start_lon": 0, "start_lat": 0, "end_lon": 0.2, "end_lat": 0})
    assert response.status_code == 200
    assert response.json()["slope_compliant"] == compliant
    assert response.json()["hazardous"] == alternative
    planner.assert_called_once_with(start_lon=0, start_lat=0, end_lon=0.2, end_lat=0, max_slope_deg=15)


def test_route_input_and_distance_limits():
    data = {"start_lon": 0, "start_lat": 0, "end_lon": 0, "end_lat": 0}
    assert client.post("/routes/plan", json=data).status_code == 400
    assert client.post("/routes/plan", json={**data, "max_slope_deg": 0}).status_code == 422
    assert client.post("/routes/plan", json={**data, "end_lon": 0.005}).status_code == 400


def test_route_beyond_400_km_is_planned():
    # About 592 km at the equator; the former regional cap rejected this.
    with patch("app.dem.elevation_m", return_value=-4500), patch("app.dem.pixel_size_km", return_value=1.85):
        response = client.post("/routes/plan", json={
            "start_lon": 0, "start_lat": 0, "end_lon": 10, "end_lat": 0,
        })
    assert response.status_code == 200
    route = response.json()
    assert route["distance_km"] > 400
    assert route["slope_compliant"] is True
    assert len(route["coordinates"]) == len(route["profile"])
    assert route["profile"][-1]["distance_km"] > 400


def test_background_is_sourced_and_duplicate_endpoints_are_rejected():
    with patch("app.dem.elevation_m", return_value=-4500), patch("app.dem.pixel_size_km", return_value=1.85):
        background = client.get("/locations/inspect?lon=137.81&lat=-5.37").json()["background"]
    assert "Curiosity" in background["text"]
    assert background["source_url"].startswith("https://science.nasa.gov/")
    with patch("app.dem.plan") as planner:
        response = client.post("/routes/plan", json={"start_lon": 180, "end_lon": -180, "start_lat": 0, "end_lat": 0})
    assert response.status_code == 400
    assert "same location" in response.json()["detail"]
    planner.assert_not_called()
