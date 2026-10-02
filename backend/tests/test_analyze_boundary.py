"""
test_analyze_boundary.py - boundary contract for /api/analyze.
=====================================================================
The captured boundary is additive and optional:
  - request may carry it (frontend wizard) or omit it (legacy clients)
  - server RE-COMPUTES shoelace area/perimeter (authoritative) and echoes
    a read-only boundary_summary block with provenance
  - statutory violations (EC-03 area < 36 m2, EC-01 edge < 1 m) return 422
  - responses WITHOUT a boundary are byte-comparable to the boundary-less shape
"""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from unittest.mock import patch, MagicMock

client = TestClient(app)


def _base_payload():
    return {
        "latitude": 12.9716,
        "longitude": 77.5946,
        "built_up_area_sqft": 1500.0,
        "quality_grade": "standard",
        "building_typology": "residential_single",
        "floors": 1,
        "ai_provider": "mock",
    }


def _boundary_payload(area_multiplier=1.0):
    # 12 x 18 m rectangle -> 216 m2, perimeter 60 m, all edges >= 1 m.
    w, d = 12.0 * area_multiplier, 18.0 * area_multiplier
    return {
        "vertices": [
            {"x": -w / 2, "y": -d / 2},
            {"x": w / 2, "y": -d / 2},
            {"x": w / 2, "y": d / 2},
            {"x": -w / 2, "y": d / 2},
        ],
        "origin_lat": 12.9716,
        "origin_lon": 77.5946,
        "shape_type": "rectangle",
        "area_sqm": 216.0 * area_multiplier * area_multiplier,
        "perimeter_m": 2 * (w + d),
        "source": "trace",
        "frontage_edge_index": 0,
    }


@pytest.fixture
def mock_external_http():
    with patch("httpx.AsyncClient.get", side_effect=_mock), patch("httpx.AsyncClient.post", side_effect=_mock):
        yield


def _mock(url, **kwargs):
    resp = MagicMock()
    resp.status_code = 200
    resp.json.return_value = _fallback_json(url)
    return resp


def _fallback_json(url):
    if "nominatim" in url:
        return {"display_name": "Bengaluru Urban, Karnataka, India", "address": {"city": "Bengaluru", "state": "Karnataka"}}
    if "earthquake.usgs.gov" in url:
        return {"features": []}
    if "flood-api.open-meteo.com" in url:
        return {"daily": {"river_discharge": [0.02] * 10}}
    if "archive-api.open-meteo.com" in url:
        times = [f"{y}-06-15" for y in range(2015, 2025)]
        return {"daily": {"time": times, "wind_gusts_10m_max": [55.0] * 10, "precipitation_sum": [15.0] * 10}}
    if "api.open-elevation.com" in url:
        return {"results": [{"elevation": 920.0}]}
    return {}


def test_analyze_without_boundary_unchanged(mock_external_http):
    """Legacy behavior preserved: no boundary in request -> none in response."""
    resp = client.post("/api/analyze", json=_base_payload())
    assert resp.status_code == 200
    data = resp.json()
    assert "boundary_summary" in data  # additive field exists in schema
    assert data["boundary_summary"] is None


def test_analyze_with_boundary_echoes_validated_summary(mock_external_http):
    """Server recomputes the authoritative area/perimeter and echoes provenance."""
    payload = _base_payload()
    payload["boundary"] = _boundary_payload()
    resp = client.post("/api/analyze", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    bs = data["boundary_summary"]
    assert bs is not None
    assert bs["vertex_count"] == 4
    assert abs(bs["area_sqm"] - 216.0) < 0.5
    assert abs(bs["perimeter_m"] - 60.0) < 0.5
    assert bs["shape_type"] == "rectangle"
    assert bs["source"] == "trace"
    assert bs["frontage_edge_index"] == 0
    assert bs["winding"] in ("cw", "ccw")
    assert bs["provenance"]["boundary_source"] == "trace"
    assert bs["provenance"]["projection"].startswith("local tangent plane")
    assert bs["provenance"]["origin"]["lat"] == 12.9716


def test_analyze_boundary_below_statutory_area_rejected(mock_external_http):
    """EC-03: area < 36 m2 must 422 with the statutory reason."""
    payload = _base_payload()
    payload["boundary"] = _boundary_payload(area_multiplier=0.3)  # ~19.4 m2
    resp = client.post("/api/analyze", json=payload)
    assert resp.status_code == 422
    assert "36" in resp.json()["detail"]


def test_analyze_boundary_edge_below_minimum_rejected(mock_external_http):
    """EC-01: an edge < 1 m must 422 with the statutory reason."""
    payload = _base_payload()
    # 40 x 30 m rectangle with a 0.8 m notch edge on the East side:
    # area stays > 36 m2, but the notch edge violates EC-01.
    b = {
        "vertices": [
            {"x": 0.0, "y": 0.0},
            {"x": 40.0, "y": 0.0},
            {"x": 40.0, "y": 14.0},
            {"x": 40.8, "y": 14.0},
            {"x": 40.8, "y": 30.0},
            {"x": 0.0, "y": 30.0},
        ],
        "origin_lat": 12.9716,
        "origin_lon": 77.5946,
        "shape_type": "irregular",
        "area_sqm": 1210.0,
        "perimeter_m": 141.6,
        "source": "trace",
        "frontage_edge_index": 0,
    }
    payload["boundary"] = b
    resp = client.post("/api/analyze", json=payload)
    assert resp.status_code == 422
    assert "1.00" in resp.json()["detail"]
