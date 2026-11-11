from unittest.mock import patch

import numpy as np
from fastapi.testclient import TestClient

from app.dem import DemUnavailable
from app.main import app

client = TestClient(app)


def test_root_terrain_endpoints_are_registered_and_binary():
    tile = np.arange(128 * 128, dtype=np.float32).reshape(128, 128)
    with patch("app.map_api.heightmap", return_value=tile):
        for west, east in [(-180, 0), (0, 180)]:
            response = client.get("/dem/tile", params={
                "west": west, "east": east, "south": -90, "north": 90,
                "width": 128, "height": 128,
            })
            assert response.status_code == 200
            assert response.headers["content-type"] == "application/octet-stream"
            assert len(response.content) == 128 * 128 * 4
            np.testing.assert_array_equal(np.frombuffer(response.content, dtype="<f4"), tile.ravel())


def test_missing_dem_is_service_unavailable_not_missing_route():
    with patch("app.map_api.heightmap", side_effect=DemUnavailable("missing DEM")):
        response = client.get("/dem/tile?west=0&east=180&south=-90&north=90")
    assert response.status_code == 503
    assert "missing DEM" in response.json()["detail"]


def test_sites_and_slope_routes_are_registered():
    sites = client.get("/sites")
    assert sites.status_code == 200
    assert any(site["name"] == "Gale Crater" for site in sites.json())
    with patch("app.map_api.heightmap", return_value=np.zeros((257, 257), dtype=np.float32)):
        slope = client.get("/dem/slopetile/0/0/0")
    assert slope.status_code == 200
    assert slope.content.startswith(b"\x89PNG")


def test_invalid_terrain_bounds_are_rejected():
    assert client.get("/dem/tile?west=0&east=0&south=-90&north=90").status_code == 400
    assert client.get("/dem/slopetile/0/99/0").status_code == 400
