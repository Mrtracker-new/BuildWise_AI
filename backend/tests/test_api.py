import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health_endpoint():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "mock" in data["ai_adapters_available"]
    assert data["active_default_ai"] == "mock"

def test_analyze_endpoint():
    payload = {
        "latitude": 12.9716,
        "longitude": 77.5946,
        "built_up_area_sqft": 1500.0,
        "quality_grade": "standard",
        "building_typology": "residential_single",
        "floors": 1,
        "ai_provider": "mock"
    }
    response = client.post("/api/analyze", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "request_id" in data
    assert 0.0 <= data["overall_suitability_score"] <= 100.0
    assert len(data["factors"]) == 5
    assert "optimal_axis_degrees" in data["orientation"]
    assert data["cost_estimate"]["total_estimated_cost_inr"] > 0
    assert len(data["detailed_recommendations"]) > 0
    assert data["ai_metadata"]["provider_used"] == "mock"

def test_pdf_report_endpoint():
    # Run analysis first
    analyze_payload = {
        "latitude": 12.9716,
        "longitude": 77.5946,
        "built_up_area_sqft": 1500.0,
        "quality_grade": "standard",
        "building_typology": "residential_single",
        "floors": 1,
        "ai_provider": "mock"
    }
    analyze_resp = client.post("/api/analyze", json=analyze_payload)
    assert analyze_resp.status_code == 200
    analysis_data = analyze_resp.json()

    report_payload = {"analysis_data": analysis_data}
    report_resp = client.post("/api/report", json=report_payload)
    assert report_resp.status_code == 200
    assert report_resp.headers["content-type"] == "application/pdf"
    assert len(report_resp.content) > 1000
    assert report_resp.content.startswith(b"%PDF")
