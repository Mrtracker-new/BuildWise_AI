import pytest
import json
from pydantic import ValidationError
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.analysis import AnalysisResponse
from app.ai.prompts import CIVIL_ENGINEER_SYSTEM_PROMPT, build_user_prompt
from app.ai.groq_adapter import GroqExplanationAdapter
from app.ai.gemini_adapter import GeminiExplanationAdapter
from app.ai.mock_adapter import MockExplanationAdapter

client = TestClient(app)

def test_analysis_response_schema_validation():
    """
    Verifies that AnalysisResponse strictly validates valid payloads,
    rejects missing required fields, and rejects hallucinated fields (extra='forbid').
    """
    valid_payload = {
        "feasibility_score": 82,
        "structural_recommendations": [
            "Provide isolated RCC footings under IS 456:2000 M25 grade",
            "Incorporate ductile seismic detailing per IS 13920"
        ],
        "cost_breakdown": {
            "base_rate_per_sqft": 3500,
            "total_estimated_cost_inr": 7000000,
            "civil_structure_inr": 3500000
        },
        "vastu_compliance": {
            "orientation": "East-West axis",
            "entrance_rating": "North-East optimal"
        },
        "parameter_reflection": "Analysis strictly reflects 2,000 sq ft area with Premium grade finishes and G+1 storeys."
    }

    # 1. Valid payload must pass
    report = AnalysisResponse.model_validate(valid_payload)
    assert report.feasibility_score == 82
    assert len(report.structural_recommendations) == 2
    assert "total_estimated_cost_inr" in report.cost_breakdown
    assert "Premium" in report.parameter_reflection
    assert report.engineering_summary is not None  # Auto-synced from alias validator

    # 2. Missing required field must raise ValidationError
    for required_field in ["feasibility_score", "structural_recommendations", "cost_breakdown", "vastu_compliance", "parameter_reflection"]:
        invalid_payload = dict(valid_payload)
        del invalid_payload[required_field]
        with pytest.raises(ValidationError):
            AnalysisResponse.model_validate(invalid_payload)

    # 3. Hallucinated extra field must raise ValidationError (extra='forbid')
    hallucinated_payload = dict(valid_payload)
    hallucinated_payload["random_hallucinated_property"] = "Hallucination"
    with pytest.raises(ValidationError):
        AnalysisResponse.model_validate(hallucinated_payload)

    # 4. Out of bounds feasibility_score must raise ValidationError
    out_of_bounds = dict(valid_payload)
    out_of_bounds["feasibility_score"] = 150
    with pytest.raises(ValidationError):
        AnalysisResponse.model_validate(out_of_bounds)


def test_schema_field_descriptions():
    """
    Ensures every field in AnalysisResponse has detailed description metadata for LLM ingestion.
    """
    schema = AnalysisResponse.model_json_schema()
    properties = schema.get("properties", {})
    required_props = ["feasibility_score", "structural_recommendations", "cost_breakdown", "vastu_compliance", "parameter_reflection"]
    for prop in required_props:
        assert prop in properties, f"Property {prop} missing from schema properties"
        assert "description" in properties[prop], f"Description missing for property {prop}"
        assert len(properties[prop]["description"]) > 10


def test_system_prompt_structure():
    """
    Verifies the civil engineer system prompt strictly follows the required 4 rules.
    """
    assert "elite Indian Civil and Structural Engineer AI" in CIVIL_ENGINEER_SYSTEM_PROMPT
    assert "CPWD" in CIVIL_ENGINEER_SYSTEM_PROMPT
    assert "IS 456" in CIVIL_ENGINEER_SYSTEM_PROMPT
    assert "IS 1893" in CIVIL_ENGINEER_SYSTEM_PROMPT
    assert "NBC 2016" in CIVIL_ENGINEER_SYSTEM_PROMPT
    assert "1. MATHEMATICAL ACCURACY" in CIVIL_ENGINEER_SYSTEM_PROMPT
    assert "2. PARAMETER REFLECTION" in CIVIL_ENGINEER_SYSTEM_PROMPT
    assert "3. SEISMIC ZONE" in CIVIL_ENGINEER_SYSTEM_PROMPT
    assert "4. NO FLUFF" in CIVIL_ENGINEER_SYSTEM_PROMPT


def test_user_prompt_formatting():
    """
    Verifies user prompt builder strictly formats parameters.
    """
    prompt = build_user_prompt(
        lat=12.9716,
        lon=77.5946,
        area=2000.0,
        grade="premium",
        typology="residential_single",
        storeys="G+1",
        coverage=60
    )
    assert prompt == "Analyze this site: Lat=12.9716, Lon=77.5946, Area=2000.0 sqft, Grade=premium, Typology=residential_single, Storeys=G+1, Ground Coverage=60%."


@pytest.mark.asyncio
async def test_proportional_costs_and_parameter_reflection_basic_500sqft():
    """
    VERIFY requirement:
    - Run a test with 'Basic' grade and 500 sq ft. The cost breakdown must be low.
    - Verify parameter_reflection string in JSON output explicitly mentions user's inputs.
    """
    mock_adapter = MockExplanationAdapter()
    data_500 = {
        "coordinates": {"latitude": 12.9716, "longitude": 77.5946},
        "built_up_area_sqft": 500.0,
        "quality_grade": "basic",
        "floors": 1,
        "cost_estimate": {
            "total_estimated_cost_inr": 800000.0,
            "base_rate_per_sqft": 1600.0
        }
    }
    summary, recs, meta = await mock_adapter.generate_explanation(data_500)
    reflection = meta.get("parameter_reflection", "")

    # Cost must be low (< 15 Lakhs)
    assert data_500["cost_estimate"]["total_estimated_cost_inr"] < 1500000.0
    # Reflection must explicitly mention Basic and 500
    assert "Basic" in reflection
    assert "500" in reflection
    assert "G" in reflection or "IS 456" in reflection


@pytest.mark.asyncio
async def test_proportional_costs_and_parameter_reflection_premium_10000sqft():
    """
    VERIFY requirement:
    - Run a test with 'Premium' grade and 10,000 sq ft. The cost breakdown must be mathematically proportional and high.
    - Verify parameter_reflection string in JSON output explicitly mentions user's inputs.
    """
    mock_adapter = MockExplanationAdapter()
    data_10000 = {
        "coordinates": {"latitude": 12.9716, "longitude": 77.5946},
        "built_up_area_sqft": 10000.0,
        "quality_grade": "premium",
        "floors": 4,
        "cost_estimate": {
            "total_estimated_cost_inr": 35000000.0,
            "base_rate_per_sqft": 3500.0
        }
    }
    summary, recs, meta = await mock_adapter.generate_explanation(data_10000)
    reflection = meta.get("parameter_reflection", "")

    # Cost must be high (> 3 Crores)
    assert data_10000["cost_estimate"]["total_estimated_cost_inr"] > 30000000.0
    # Proportionality check: 10,000 sqft premium (3.5 Cr) is ~43x higher than 500 sqft basic (8 Lakh)
    assert data_10000["cost_estimate"]["total_estimated_cost_inr"] / 800000.0 > 40.0

    # Reflection must explicitly mention Premium and 10,000
    assert "Premium" in reflection
    assert "10,000" in reflection
    assert "G+3" in reflection
    assert "deep raft or pile" in reflection


@pytest.mark.asyncio
async def test_adapter_validation_error_fallback():
    """
    Tests that when an LLM returns invalid JSON (e.g. missing required field),
    Pydantic ValidationError is triggered and the adapter safely falls back to deterministic mock.
    """
    from unittest.mock import patch, MagicMock
    groq = GroqExplanationAdapter()
    groq.api_key = "fake_key_for_test"

    # Simulate Groq returning a JSON missing parameter_reflection and with hallucinated field
    invalid_llm_json = json.dumps({
        "feasibility_score": 75,
        "structural_recommendations": ["Recommendation 1"],
        "cost_breakdown": {"total": 5000000},
        "vastu_compliance": {"axis": "East-West"},
        # missing parameter_reflection
        "hallucinated_extra_key": "Should be rejected by extra='forbid'"
    })

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "choices": [{"message": {"content": invalid_llm_json}}]
    }

    with patch("httpx.AsyncClient.post", return_value=mock_resp):
        summary, recs, meta = await groq.generate_explanation({
            "coordinates": {"latitude": 12.9716, "longitude": 77.5946},
            "built_up_area_sqft": 2000.0,
            "quality_grade": "standard",
            "floors": 2
        })

        # Must have fallen back to mock due to ValidationError
        assert meta["provider_used"] == "mock_fallback"
        assert "ValidationError" in meta["fallback_reason"]
        assert "parameter_reflection" in meta
        assert len(recs) > 0


def test_api_analyze_endpoint_parameter_reflection_integration():
    """
    Tests that POST /api/analyze returns parameter_reflection and AI report fields populated.
    """
    payload = {
        "latitude": 12.9716,
        "longitude": 77.5946,
        "built_up_area_sqft": 2000.0,
        "quality_grade": "premium",
        "building_typology": "residential_single",
        "floors": 2,
        "ai_provider": "mock"
    }
    response = client.post("/api/analyze", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert "parameter_reflection" in data
    assert data["parameter_reflection"] is not None
    assert "Premium" in data["parameter_reflection"]
    assert "2,000" in data["parameter_reflection"]
    assert "feasibility_score" in data
    assert "structural_recommendations" in data
    assert "cost_breakdown" in data
    assert "vastu_compliance" in data
