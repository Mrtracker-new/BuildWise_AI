import uuid
import time
import json
import logging
from collections import defaultdict
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from typing import Optional
from pydantic import BaseModel, ValidationError

from app.config import settings

logger = logging.getLogger(__name__)
from app.schemas.request import AnalysisRequest, ReportRequest
from app.schemas.response import (
    AnalysisResponse,
    HealthResponse
)
from app.schemas.site_vision import (
    SiteVisionRequest,
    SiteVisionResponse
)
from app.schemas.floorplan import (
    FloorPlanRequest,
    FloorPlanResponse
)
from app.schemas.multi_floor_plan import ExtractedClientConstraints
from app.services import (
    fetch_reverse_geocode,
    fetch_elevation_and_slope,
    fetch_climate_data,
    evaluate_land_suitability,
    calculate_building_orientation,
    calculate_construction_cost,
    identify_site_risks,
    generate_pdf_report,
    evaluate_hazard_profile,
    calculate_land_value,
    evaluate_vastu_advisory,
    generate_recommendations,
    get_top_severity_recommendations,
    analyze_site_vision,
    generate_floor_plan
)

from app.ai import get_ai_adapter, generate_room_program
from app.services.geocode_service import geocode_search

app = FastAPI(
    title="BuildWise AI API",
    description="Geo-based intelligent construction feasibility, orientation, cost estimation, hazard, land value, and Vastu advisory engine.",
    version="1.1.0"
)

# CORS configuration with exact origin matching for Vite dev server (Crucial for Local Dev)
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
for origin in settings.CORS_ORIGINS:
    if origin and origin != "*" and origin not in ALLOWED_ORIGINS:
        ALLOWED_ORIGINS.append(origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Sliding window in-memory rate limiter: 30 requests per 60 seconds per IP
RATE_LIMIT_WINDOW_SEC = 60.0
RATE_LIMIT_MAX_REQUESTS = 30
_client_request_history = defaultdict(list)

def check_rate_limit(client_ip: str):
    now = time.time()
    timestamps = _client_request_history[client_ip]
    # Prune timestamps older than window
    _client_request_history[client_ip] = [t for t in timestamps if now - t < RATE_LIMIT_WINDOW_SEC]
    if len(_client_request_history[client_ip]) >= RATE_LIMIT_MAX_REQUESTS:
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded (maximum 30 requests per minute). Please wait before running another analysis."
        )
    _client_request_history[client_ip].append(now)

@app.get("/api/status")
async def api_status():
    """
    Lightweight status endpoint indicating configured LLM keys and engine availability.
    """
    has_groq = bool(
        settings.GROQ_API_KEY
        and settings.GROQ_API_KEY.strip()
        and not settings.GROQ_API_KEY.startswith("your_")
    )
    has_gemini = bool(
        settings.GEMINI_API_KEY
        and settings.GEMINI_API_KEY.strip()
        and not settings.GEMINI_API_KEY.startswith("your_")
    )
    return {
        "status": "online",
        "groq": has_groq,
        "gemini": has_gemini,
        "default_provider": settings.DEFAULT_AI_PROVIDER
    }

@app.get("/api/health", response_model=HealthResponse)
async def health_check():
    """
    Returns system status, active version, and AI provider availability.
    """
    return HealthResponse(
        status="healthy",
        version="1.1.0",
        ai_adapters_available=["mock", "groq", "gemini", "ollama"],
        active_default_ai=settings.DEFAULT_AI_PROVIDER
    )

@app.get("/api/geocode")
async def geocode_endpoint(q: str = Query(..., min_length=1, description="Free-text location search query")):
    """
    Forward-geocoding proxy: searches Nominatim (primary) with Photon fallback.

    Policy:
    - Server-side 1 req/s throttle for Nominatim (OSM usage policy).
    - User-Agent identifies BuildWise.
    - Results cached server-side (LRU, 24h TTL) to minimise upstream calls.
    - Client should additionally cache in localStorage (24h).
    - Attribution: Nominatim / OpenStreetMap contributors; Photon / Komoot.
    - No API key, no paid service.
    """
    result = await geocode_search(q.strip())
    return result

@app.post("/api/analyze", response_model=AnalysisResponse)
async def analyze_site(req: AnalysisRequest, request: Request):
    """
    Executes full multi-criteria site feasibility, orientation optimization,
    CPWD construction cost estimation, risk synthesis, hazard profiling,
    indicative circle rate land valuation, Vastu advisory, and traceable engineering recommendations.
    """
    client_ip = request.client.host if request.client else "127.0.0.1"
    check_rate_limit(client_ip)
    request_id = f"BW-{uuid.uuid4().hex[:8].upper()}"
    timestamp = datetime.now(timezone.utc).isoformat()
    warnings = []
    is_degraded = False

    # 1. Fetch geospatial, elevation, and climate data with fallback tracking
    address, address_fallback = await fetch_reverse_geocode(req.latitude, req.longitude)
    if address_fallback:
        warnings.append("Reverse geocoding service timed out. Coordinate identifier applied.")
        is_degraded = True

    elevation_m, slope_pct, elev_fallback = await fetch_elevation_and_slope(req.latitude, req.longitude)
    if elev_fallback:
        warnings.append("Topographic elevation service unreachable. Synthetic contour gradient applied.")
        is_degraded = True

    climate, climate_fallback = await fetch_climate_data(req.latitude, req.longitude)
    if climate_fallback:
        warnings.append("Microclimate telemetry unavailable. Latitudinal climate averages applied.")
        is_degraded = True

    # 2. Deterministic calculations (MCDA, orientation, CPWD costs, risks)
    overall_score, verdict, factors = evaluate_land_suitability(
        lat=req.latitude,
        lon=req.longitude,
        elevation_m=elevation_m,
        slope_pct=slope_pct,
        climate=climate
    )

    orientation = calculate_building_orientation(
        latitude=req.latitude,
        wind_dir_deg=climate.get("wind_direction_deg", 240.0)
    )

    cost_estimate = calculate_construction_cost(
        area_sqft=req.built_up_area_sqft,
        quality_grade=req.quality_grade,
        slope_pct=slope_pct,
        floors=req.floors
    )

    # Road and facility scores from factors
    road_factor = next((f for f in factors if f.factor_id == "road_access"), None)
    road_score = road_factor.score if road_factor else 75.0

    facility_factor = next((f for f in factors if f.factor_id == "facility_proximity"), None)
    facility_score = facility_factor.score if facility_factor else 75.0

    risks = identify_site_risks(
        slope_pct=slope_pct,
        elevation_m=elevation_m,
        climate=climate,
        road_score=road_score,
        floors=req.floors
    )

    # 3. Module 1: Hazard History & Climate Stress Profile
    hazard_profile, hazard_warnings = await evaluate_hazard_profile(
        lat=req.latitude,
        lon=req.longitude,
        elevation_m=elevation_m,
        address=address
    )
    for w in hazard_warnings:
        if w not in warnings:
            warnings.append(w)
    if any("unreachable" in w.lower() or "unavailable" in w.lower() for w in hazard_warnings):
        is_degraded = True

    # 4. Module 2: Indicative Land Value Engine
    land_value = calculate_land_value(
        lat=req.latitude,
        lon=req.longitude,
        address=address,
        road_score=road_score,
        facility_score=facility_score,
        built_up_area_sqft=req.built_up_area_sqft,
        floors=req.floors,
        total_construction_cost_inr=cost_estimate.total_estimated_cost_inr,
        override_rate_per_sqft=req.override_land_rate_per_sqft,
        plot_area_sqft=req.plot_area_sqft,
        ground_coverage_ratio=req.ground_coverage_ratio or 0.60
    )
    if land_value.confidence_warning and land_value.confidence_warning not in warnings:
        warnings.append(land_value.confidence_warning)

    # 5. Module 3: Vastu & Functional Planning Advisory
    vastu_advisory, vastu_warnings = await evaluate_vastu_advisory(
        lat=req.latitude,
        lon=req.longitude,
        elevation_m=elevation_m
    )
    for w in vastu_warnings:
        if w not in warnings:
            warnings.append(w)
    if vastu_advisory.road_approach.is_fallback:
        is_degraded = True

    # 6. Module 4: Ranked Traceable Recommendation Engine
    recommendation_items = generate_recommendations(
        factors=factors,
        hazard_profile=hazard_profile,
        land_value=land_value,
        vastu_advisory=vastu_advisory,
        orientation=orientation,
        cost_estimate=cost_estimate
    )
    detailed_recs = [item.recommendation_text for item in recommendation_items]

    # Cap recommendations passed to AI payload to top 8 severity-ranked (Amendment 10)
    top_8_recs = get_top_severity_recommendations(recommendation_items, limit=8)

    # 7. Assemble structured data for AI adapter
    intermediate_data = {
        "request_id": request_id,
        "coordinates": {"latitude": req.latitude, "longitude": req.longitude},
        "formatted_address": address,
        "overall_suitability_score": overall_score,
        "suitability_verdict": verdict,
        "factors": [f.model_dump() for f in factors],
        "orientation": orientation.model_dump(),
        "cost_estimate": cost_estimate.model_dump(),
        "risks": [r.model_dump() for r in risks],
        "hazard_profile": hazard_profile.model_dump(),
        "land_value": land_value.model_dump(),
        "vastu_advisory": vastu_advisory.model_dump(),
        "recommendations": [r.model_dump() for r in top_8_recs],
        "built_up_area_sqft": req.built_up_area_sqft,
        "quality_grade": req.quality_grade,
        "floors": req.floors,
        "client_requirements": req.client_requirements
    }

    # 8. Generate engineering commentary via requested AI adapter
    provider_name = req.ai_provider or settings.DEFAULT_AI_PROVIDER
    adapter = get_ai_adapter(provider_name)
    summary, ai_recs, ai_meta = await adapter.generate_explanation(intermediate_data)

    if ai_meta.get("fallback_reason"):
        warnings.append(f"AI Provider note: {ai_meta.get('fallback_reason')}")

    param_reflection = ai_meta.get("parameter_reflection") or (
        f"Site analysis reflects {req.built_up_area_sqft:,.0f} sq ft built-up area with {req.quality_grade.capitalize()} "
        f"specification grade and {f'G+{req.floors-1}' if req.floors > 1 else 'G'} storeys."
    )
    feasibility_score_val = int(ai_meta.get("feasibility_score", round(overall_score)))

    ai_cost_bd = None
    if ai_meta.get("cost_breakdown"):
        try:
            ai_cost_bd = json.loads(ai_meta["cost_breakdown"]) if isinstance(ai_meta["cost_breakdown"], str) else ai_meta["cost_breakdown"]
        except Exception:
            ai_cost_bd = None
    cost_breakdown_val = ai_cost_bd or cost_estimate.model_dump()

    ai_vastu_comp = None
    if ai_meta.get("vastu_compliance"):
        try:
            ai_vastu_comp = json.loads(ai_meta["vastu_compliance"]) if isinstance(ai_meta["vastu_compliance"], str) else ai_meta["vastu_compliance"]
        except Exception:
            ai_vastu_comp = None
    vastu_compliance_val = ai_vastu_comp or vastu_advisory.model_dump()

    try:
        return AnalysisResponse(
            request_id=request_id,
            timestamp=timestamp,
            coordinates={"latitude": req.latitude, "longitude": req.longitude},
            formatted_address=address,
            overall_suitability_score=overall_score,
            suitability_verdict=verdict,
            factors=factors,
            orientation=orientation,
            cost_estimate=cost_estimate,
            risks=risks,
            hazard_profile=hazard_profile,
            land_value=land_value,
            vastu_advisory=vastu_advisory,
            recommendation_items=recommendation_items,
            detailed_recommendations=detailed_recs,
            engineering_summary=summary,
            ai_metadata=ai_meta,
            degraded_mode=is_degraded,
            warnings=warnings,
            parameter_reflection=param_reflection,
            feasibility_score=feasibility_score_val,
            structural_recommendations=ai_recs,
            cost_breakdown=cost_breakdown_val,
            vastu_compliance=vastu_compliance_val
        )
    except ValidationError as val_err:
        logger.warning(f"Pydantic validation error constructing AnalysisResponse: {val_err}")
        # Discard LLM output, return deterministic mock data with provider_used='mock_fallback_validation_error'
        mock_adapter = get_ai_adapter("mock")
        mock_summary, mock_recs, mock_meta = await mock_adapter.generate_explanation(intermediate_data)
        mock_meta["provider_requested"] = provider_name
        mock_meta["provider_used"] = "mock_fallback_validation_error"
        mock_meta["fallback_reason"] = f"Pydantic ValidationError: {str(val_err)[:100]}"
        warnings.append("AI response validation error. Applied deterministic mock calculations.")
        return AnalysisResponse(
            request_id=request_id,
            timestamp=timestamp,
            coordinates={"latitude": req.latitude, "longitude": req.longitude},
            formatted_address=address,
            overall_suitability_score=overall_score,
            suitability_verdict=verdict,
            factors=factors,
            orientation=orientation,
            cost_estimate=cost_estimate,
            risks=risks,
            hazard_profile=hazard_profile,
            land_value=land_value,
            vastu_advisory=vastu_advisory,
            recommendation_items=recommendation_items,
            detailed_recommendations=detailed_recs,
            engineering_summary=mock_summary,
            ai_metadata=mock_meta,
            degraded_mode=True,
            warnings=warnings,
            parameter_reflection=mock_meta.get("parameter_reflection", param_reflection),
            feasibility_score=int(round(overall_score)),
            structural_recommendations=mock_recs,
            cost_breakdown=cost_estimate.model_dump(),
            vastu_compliance=vastu_advisory.model_dump()
        )

@app.post("/api/report")
async def create_pdf_report(req: ReportRequest):
    """
    Compiles and streams a high-resolution, vector PDF engineering feasibility report.
    """
    if not req.analysis_data:
        raise HTTPException(status_code=400, detail="Invalid request: Missing analysis data payload.")

    try:
        fp_payload = req.floor_plan
        if not fp_payload and isinstance(req.analysis_data, dict):
            fp_payload = req.analysis_data.get("floor_plan") or req.analysis_data.get("floorplan")

        pdf_stream = generate_pdf_report(
            req.analysis_data,
            site_vision=req.site_vision,
            floor_plan=fp_payload
        )
        coords = req.analysis_data.get("coordinates") or {}
        lat_val = coords.get('latitude') if isinstance(coords.get('latitude'), (int, float)) else 0.0
        lon_val = coords.get('longitude') if isinstance(coords.get('longitude'), (int, float)) else 0.0
        lat_str = f"{lat_val:.2f}"
        lon_str = f"{lon_val:.2f}"
        filename = f"BuildWise_Report_{lat_str}_{lon_str}.pdf"

        return StreamingResponse(
            pdf_stream,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"PDF generation error: {str(e)}")

@app.post("/api/site-vision", response_model=SiteVisionResponse)
async def site_vision_analysis(req: SiteVisionRequest):
    """
    Executes ecological satellite vision analysis over Copernicus Sentinel-2 L2A imagery.
    Computes Green Cover Index, water detection, built-up ratio, and Tree Preservation Plan.
    """
    try:
        response = await analyze_site_vision(
            latitude=req.latitude,
            longitude=req.longitude,
            plot_area_sqft=req.plot_area_sqft,
            mode_override=req.mode_override,
            orientation_deg=req.orientation_deg
        )
        return response
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Site vision analysis error: {str(e)}")

@app.post("/api/generate-floorplan")
async def create_generative_floorplan(
    req: FloorPlanRequest,
    format: Optional[str] = Query(default=None, description="Output format: 'json' or 'pdf'")
):
    """
    Executes the universal ontology-driven sole geometry engine (SoleGeometryEngine) for
    all typologies (T1–T4), enforcing Vastu Shastra zoning, NBC 2016 statutory minima,
    plumbing wet-wall adjacency, BFS egress reachability, and vertical core stacking invariants.
    Returns 2D matrix, placements, metrics, and production-grade SVG blueprint (JSON),
    or streams a multi-page PDF architectural dossier when format='pdf'.
    """
    try:
        if format == "pdf" and req.multi_storey is not None:
            # Direct export of pre-generated multi-storey model (skips solver re-run)
            ms_dict = req.multi_storey.model_dump()
            typology = req.building_typology or req.multi_storey.building_typology or "residential_single"
            typ_label = typology.replace("_", " ").title()
            total_floors = req.multi_storey.total_storeys
            built_up_sqft = req.built_up_area_sqft or (req.multi_storey.total_built_up_area_sqm * 10.764)
            first_floor = ms_dict["floors"][0] if ms_dict.get("floors") else {}
            fp_payload = {
                "multi_storey": ms_dict,
                "plot_width_m": req.plot_width_m or (req.multi_storey.plot_width_m if req.multi_storey else None),
                "plot_depth_m": req.plot_depth_m or (req.multi_storey.plot_depth_m if req.multi_storey else None),
                "seed": str(req.multi_storey.seed if req.multi_storey else "GEN-F01"),
                "metrics": {
                    "vastu_compliance_pct": ms_dict.get("vastu_compliance_pct", 85.0),
                    "plumbing_adjacency_score": ms_dict.get("plumbing_stack_alignment_pct", 90.0),
                    "space_utilization_pct": 85.0,
                    "plot_coverage_pct": (req.ground_coverage_ratio or 0.6) * 100,
                    "total_built_up_sqm": req.multi_storey.total_built_up_area_sqm,
                    "circulation_efficiency_pct": 88.0,
                },
                "rectangles": {
                    "envelope": first_floor.get("envelope", {}),
                    "rooms": first_floor.get("rooms", []),
                    "doors": first_floor.get("doors", []),
                    "windows": first_floor.get("windows", []),
                },
                "placements": [
                    {
                        "room_id": r.get("room_id", ""),
                        "room_name": r.get("room_name", ""),
                        "row": 0,
                        "col": 0,
                        "width": int(r.get("width_m", 1)),
                        "height": int(r.get("depth_m", 1)),
                        "area_sqm": r.get("area_sqm", 0),
                        "width_m": r.get("width_m", 0),
                        "depth_m": r.get("depth_m", 0),
                        "zone": r.get("zone", ""),
                        "vastu_compliant": r.get("vastu_compliant", True),
                    }
                    for r in first_floor.get("rooms", [])
                ]
            }
            mock_analysis = {
                "request_id": f"BW-FP-{int(time.time())}",
                "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
                "coordinates": {"latitude": 12.9716, "longitude": 77.5946},
                "formatted_address": f"{typ_label} Multi-Storey Architectural Dossier",
                "overall_suitability_score": 90.0,
                "suitability_verdict": "Architectural Design Complete",
                "built_up_area_sqft": built_up_sqft,
                "quality_grade": req.quality_grade or "standard",
                "floors": total_floors,
                "building_typology": typology,
                "plot_width_m": req.plot_width_m or (req.multi_storey.plot_width_m if req.multi_storey else None),
                "plot_depth_m": req.plot_depth_m or (req.multi_storey.plot_depth_m if req.multi_storey else None),
                "seed": str(req.multi_storey.seed if req.multi_storey else "GEN-F01"),
                "engineering_summary": req.client_notes or f"Autonomous architectural spatial allocation generated by BuildWise CF-HSA Multi-Storey Solver for {typ_label}.",
            }
            pdf_stream = generate_pdf_report(
                mock_analysis,
                floor_plan=fp_payload,
                dossier_only=True,
                include_construction_schedules=True
            )
            return StreamingResponse(
                pdf_stream,
                media_type="application/pdf",
                headers={"Content-Disposition": 'attachment; filename="BuildWise_Architectural_Floorplan_Dossier.pdf"'}
            )

        # Pre-compute or resolve RoomProgram via LLM before solver execution if not provided
        if req.room_program is None:
            typology = req.building_typology or "residential_single"
            grade = req.quality_grade or "standard"
            storeys = req.floors or 1
            coverage = req.ground_coverage_ratio or 0.60
            built_up_area = req.built_up_area_sqft or (req.plot_width_m * req.plot_depth_m * 10.764 * coverage)
            notes = req.client_notes
            params = {
                "typology": typology,
                "building_typology": typology,
                "grade": grade,
                "quality_grade": grade,
                "storeys": storeys,
                "floors": storeys,
                "coverage": coverage,
                "ground_coverage": coverage,
                "built_up_area": built_up_area,
                "built_up_area_sqft": built_up_area,
                "client_notes": notes,
                "solar_axis_degrees": req.solar_axis_degrees,
                "prevailing_wind_direction_degrees": req.prevailing_wind_direction_degrees,
                "top_vastu_entrances": req.top_vastu_entrances,
                "required_rooms": req.required_rooms,
                "plot_width_m": req.plot_width_m,
                "plot_depth_m": req.plot_depth_m,
                "vastu_strictness": req.vastu_strictness,
                "bypass_cache": req.bypass_cache or False,
            }
            prog, prog_source = await generate_room_program(params, req.ai_provider)
            req = req.model_copy(update={"room_program": prog, "program_source": prog_source})

        response = generate_floor_plan(req)

        if format == "pdf":
            # Stream architectural multi-page PDF dossier directly
            typ_label = (req.building_typology or "Architectural").replace("_", " ").title()
            mock_analysis = {
                "request_id": f"BW-FP-{int(time.time())}",
                "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
                "coordinates": {"latitude": 12.9716, "longitude": 77.5946},
                "formatted_address": f"{typ_label} Floor Plan Dossier",
                "overall_suitability_score": 90.0,
                "suitability_verdict": "Architectural Design Complete",
                "built_up_area_sqft": req.built_up_area_sqft or (req.plot_width_m * req.plot_depth_m * 10.764 * (req.ground_coverage_ratio or 0.6)),
                "quality_grade": req.quality_grade or "standard",
                "floors": req.floors or 1,
                "building_typology": req.building_typology or "residential_single",
                "plot_width_m": req.plot_width_m,
                "plot_depth_m": req.plot_depth_m,
                "seed": str(getattr(response, "seed", None) or (response.multi_storey.seed if response.multi_storey else "GEN-F01")),
                "engineering_summary": req.client_notes or f"Autonomous architectural spatial allocation generated by BuildWise CF-HSA Multi-Storey Solver for {typ_label}.",
            }
            pdf_stream = generate_pdf_report(
                mock_analysis,
                floor_plan=response.model_dump(),
                dossier_only=True,
                include_construction_schedules=True
            )
            return StreamingResponse(
                pdf_stream,
                media_type="application/pdf",
                headers={"Content-Disposition": 'attachment; filename="BuildWise_Architectural_Floorplan_Dossier.pdf"'}
            )

        return response
    except ValueError as e:
        # Client-fixable design-constraint violations (RULE-FP-*, Hard Constraint
        # Violation, vertical stacking) are bad requests (422), not server faults.
        msg = str(e)
        if "Hard Constraint Violation" in msg or "RULE-FP-" in msg:
            raise HTTPException(status_code=422, detail=f"Floor plan constraint violation: {msg}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Floor plan generation error: {msg}")
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Floor plan generation error: {str(e)}")


class ParseRequirementsRequest(BaseModel):
    requirements_text: str
    ai_provider: Optional[str] = "groq"


@app.post("/api/parse-requirements", response_model=ExtractedClientConstraints)
async def parse_requirements_endpoint(req: ParseRequirementsRequest):
    """
    Extracts structured architectural design constraints from free-text client notes.
    """
    try:
        from app.ai.requirements_parser import parse_client_requirements
        return await parse_client_requirements(req.requirements_text, req.ai_provider)
    except Exception as e:
        logger.warning(f"Error parsing requirements: {e}")
        from app.ai.requirements_parser import parse_client_requirements_fallback
        return parse_client_requirements_fallback(req.requirements_text)

