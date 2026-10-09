"""Report/PDF honesty-parity contract tests.

The report UI and the PDF dossier consume the SAME AnalysisResponse. These
tests pin the shared contract:
  - the PDF warning banner lists exactly the warnings array (UI == PDF)
  - per-factor provenance status words in the PDF match the UI census rules
  - a null seismic zone can never render as a zone letter
"""
import io
import sys

sys.path.insert(0, ".")
from pypdf import PdfReader

from app.services.report_service import generate_pdf_report


def _base_data() -> dict:
    return {
        "request_id": "BW-PARITY",
        "timestamp": "2026-10-08T00:00:00Z",
        "coordinates": {"latitude": 12.97, "longitude": 77.59},
        "formatted_address": "Parity Probe Site",
        "overall_suitability_score": 72.0,
        "suitability_verdict": "Conditionally Suitable",
        "degraded_mode": True,
        "warnings": [
            "Microclimate telemetry unavailable. Latitudinal climate averages applied.",
            "Road network telemetry unavailable. Approach-side alignment bonus omitted.",
        ],
        "factors": [
            {
                "factor_id": "road_access",
                "name": "Road Access",
                "weight": 0.25,
                "raw_value": None,
                "unit": "meters",
                "score": 50.0,
                "status": "unknown",
                "details": "Telemetry unavailable this session.",
            },
            {
                "factor_id": "facility_proximity",
                "name": "Facility Proximity",
                "weight": 0.10,
                "raw_value": 1.0,
                "unit": "index",
                "score": 70.0,
                "status": "acceptable",
                "details": "Modelled proxy (not a measured survey).",
            },
            {
                "factor_id": "slope",
                "name": "Slope",
                "weight": 0.20,
                "raw_value": 2.5,
                "unit": "%",
                "score": 100.0,
                "status": "optimal",
                "details": "Flat to gentle grade measured from elevation samples.",
            },
        ],
        "cost_estimate": {
            "base_rate_per_sqft": 100,
            "base_cost_inr": 200000,
            "breakdown": [],
        },
        "recommendation_items": [],
        "detailed_recommendations": [],
        "risks": [],
    }


def _pdf_text(data: dict) -> str:
    buf = generate_pdf_report(data)
    raw = "".join(page.extract_text() or "" for page in PdfReader(io.BytesIO(buf.getvalue())).pages)
    # pypdf inserts hard line-wraps inside a paragraph; normalize so verbatim
    # banner parity is asserted on the rendered words, not the wrap points.
    return " ".join(raw.split())


def test_warnings_banner_lists_every_warning_verbatim():
    text = _pdf_text(_base_data())
    assert "DATA DEGRADATION NOTICE" in text
    for w in _base_data()["warnings"]:
        assert w in text, f"warning missing from PDF banner: {w}"


def test_factor_provenance_words_match_ui_census_rules():
    text = _pdf_text(_base_data())
    # UNKNOWN: unmeasured factor
    assert "UNKNOWN" in text
    # ASSUMED: disclosed modelled-proxy details
    assert "ASSUMED" in text
    # VERIFIED: measured factor with clean details
    assert "VERIFIED" in text


def test_null_seismic_zone_never_renders_a_zone_letter():
    data = _base_data()
    data["hazard_profile"] = {
        "seismic": {
            "zone": None,
            "zone_factor": None,
            "standard": "BIS IS 1893:2016",
            "district": "Outside IS 1893 Jurisdiction",
            "event_count_display": "0",
            "confidence": "low",
        },
        "flood": {"pressure_level": "low", "confidence": "low"},
        "storm_cyclone": {"exposure_level": "low", "confidence": "low"},
        "overall_hazard_level": "low",
        "warnings": [],
    }
    text = _pdf_text(data)
    assert "NOT ASSESSED" in text, "null zone must surface the explicit not-assessed state"
    for zone in ("Zone II", "Zone III", "Zone IV", "Zone V"):
        assert zone not in text, f"fabricated {zone} leaked into the PDF"


def test_assessed_zone_renders_normally():
    data = _base_data()
    data["hazard_profile"] = {
        "seismic": {
            "zone": "Zone II",
            "zone_factor": 0.10,
            "standard": "BIS IS 1893:2016",
            "district": "Bengaluru Urban",
            "event_count_display": "2",
            "confidence": "high",
        },
        "flood": {"pressure_level": "low", "confidence": "high"},
        "storm_cyclone": {"exposure_level": "low", "confidence": "high"},
        "overall_hazard_level": "low",
        "warnings": [],
    }
    text = _pdf_text(data)
    assert "Zone II" in text
    assert "NOT ASSESSED" not in text
