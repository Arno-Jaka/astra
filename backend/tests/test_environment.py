from fastapi.testclient import TestClient

from app import environment
from app.main import app

client = TestClient(app)

REQUIRED_ZONE_FIELDS = {
    "id", "name", "lon", "lat", "radius_km", "classification",
    "science_value", "scenic", "weather", "radiation", "basis", "source_url",
}


def test_zones_endpoint_is_labelled_and_classified():
    response = client.get("/environment/zones")
    assert response.status_code == 200
    body = response.json()
    assert body["basis"] == "derived"
    assert "measured dose" in body["note"].lower()
    zones = body["zones"]
    assert zones, "expected at least one screened zone"
    for zone in zones:
        assert REQUIRED_ZONE_FIELDS <= zone.keys()
        assert zone["classification"] in {"safe", "caution", "unsafe"}
        assert zone["weather"]["classification"] in {"safe", "caution", "unsafe"}
        assert zone["radiation"]["classification"] in {"safe", "caution", "unsafe"}
        assert zone["radiation"]["surface_dose_msv_day"] > 0
    # Some regions should read safe and some unsafe, so the map is meaningful.
    levels = {zone["classification"] for zone in zones}
    assert "safe" in levels
    assert "unsafe" in levels


def test_zone_screening_is_deterministic_and_ordered():
    first = client.get("/environment/zones").json()["zones"]
    second = client.get("/environment/zones").json()["zones"]
    assert first == second
    by_id = {zone["id"]: zone for zone in first}
    # The summit of Olympus Mons is high, cold and poorly shielded.
    assert by_id["olympus"]["classification"] == "unsafe"
    # Gale's low crater floor is a comparatively benign stop.
    assert by_id["gale"]["classification"] == "safe"
    # Elevation raises the modelled surface dose.
    assert (by_id["olympus"]["radiation"]["surface_dose_msv_day"]
            > by_id["gale"]["radiation"]["surface_dose_msv_day"])


def test_high_latitude_is_colder_than_equatorial():
    by_id = {zone["id"]: zone for zone in environment.zones()}
    assert by_id["argyre"]["weather"]["min_temp_c"] < by_id["gale"]["weather"]["min_temp_c"]


def test_point_screening_uses_nearest_zone():
    response = client.get("/environment/point", params={"lon": 137.8, "lat": -5.3})
    assert response.status_code == 200
    nearest = response.json()["nearest"]
    assert nearest["id"] == "gale"
    assert nearest["distance_km"] >= 0
    assert "measured dose" in response.json()["note"].lower()


def test_point_screening_rejects_invalid_coordinates():
    assert client.get("/environment/point?lon=200&lat=0").status_code == 400
    assert client.get("/environment/point?lon=0&lat=95").status_code == 400
