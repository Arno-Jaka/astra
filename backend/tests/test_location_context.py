from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.gazetteer import Site
from app.location_context import initial_bearing_deg, location_context
from app.main import app


@pytest.mark.parametrize("lon,lat,bearing", [(1, 0, 90), (-1, 0, 270), (0, 1, 0), (0, -1, 180)])
def test_bearing_is_from_site_to_point_clockwise_from_north(lon, lat, bearing):
    assert initial_bearing_deg(0, 0, lon, lat) == pytest.approx(bearing)


def test_dateline_and_undefined_bearings():
    assert initial_bearing_deg(179, 0, -179, 0) == pytest.approx(90)
    assert initial_bearing_deg(-179, 0, 179, 0) == pytest.approx(270)
    assert initial_bearing_deg(0, 0, 0, 0) is None
    assert initial_bearing_deg(0, 0, 180, 0) is None
    assert initial_bearing_deg(0, 90, 10, 80) is None


def test_nearest_catalog_site_distance_and_direction():
    reference = Site("Reference", 179, 0, ())
    far = Site("Far", 90, 0, ())
    with patch("app.location_context.SITES", (far, reference)):
        context = location_context(-179, 0)
        coincident = location_context(179, 0)
    assert context["name"] == "Reference"
    assert context["direction"] == "E"
    assert context["bearing_deg"] == 90
    assert context["distance_km"] == pytest.approx(118.5, abs=0.1)
    assert context["label"] == "118.5 km E (90°) from Reference"
    assert coincident["label"] == "Reference"
    assert coincident["bearing_deg"] is None


def test_context_endpoint_is_dem_independent_and_validates_coordinates():
    client = TestClient(app)
    with patch("app.dem.elevation_m", side_effect=AssertionError("Context must not depend on DEM")):
        result = client.get("/locations/context?lon=137.82&lat=-5.37")
    assert result.status_code == 200
    assert result.json()["name"] == "Gale Crater"
    assert result.json()["direction"] == "E"
    for coordinates in ["lon=nan&lat=0", "lon=181&lat=0", "lon=0&lat=91"]:
        assert client.get(f"/locations/context?{coordinates}").status_code == 400
