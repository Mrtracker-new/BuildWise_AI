import uuid
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from app.config import settings
from app.schemas.request import AnalysisRequest, ReportRequest
from app.schemas.response import (
    AnalysisResponse,
    HealthResponse
)
from app.services import (
    fetch_reverse_geocode,
    fetch_elevation_and_slope,
    fetch_climate_data,
    evaluate_land_suitability,
    calculate_building_orientation,
    calculate_construction_cost,
    identify_site_risks,
    generate_pdf_report
)
from app.ai import get_ai_adapter

app = FastAPI(
    title="BuildWise AI API",
    description="Geo-based intelligent construction feasibility, orientation, and cost estimation engine.",
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS if settings.CORS_ORIGINS else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health", response_model=HealthResponse)
async def health_check():
    """
    Returns system status, active version, and AI provider availability.
    """
    return HealthResponse(
        status="healthy",
        version="1.0.0",
        ai_adapters_available=["mock", "groq", "gemini", "ollama"],
        active_default_ai=settings.DEFAULT_AI_PROVIDER
    )

@app.post("/api/analyze", response_model=AnalysisResponse)
async def analyze_site(req: AnalysisRequest):
    """
    Executes full multi-criteria site feasibility, orientation optimization,
    CPWD construction cost estimation, risk synthesis, and technical explanation.
    """
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

    # 2. Deterministic calculations
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

    # Road score from factors
    road_factor = next((f for f in factors if f.factor_id == "road_access"), None)
    road_score = road_factor.score if road_factor else 75.0

    risks = identify_site_risks(
        slope_pct=slope_pct,
        elevation_m=elevation_m,
        climate=climate,
        road_score=road_score,
        floors=req.floors
    )

    # 3. Assemble structured data for AI adapter
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
        "built_up_area_sqft": req.built_up_area_sqft,
        "quality_grade": req.quality_grade,
        "floors": req.floors
    }

    # 4. Generate engineering commentary via requested AI adapter
    provider_name = req.ai_provider or settings.DEFAULT_AI_PROVIDER
    adapter = get_ai_adapter(provider_name)
    summary, recommendations, ai_meta = await adapter.generate_explanation(intermediate_data)

    if ai_meta.get("fallback_reason"):
        warnings.append(f"AI Provider note: {ai_meta.get('fallback_reason')}")

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
        engineering_summary=summary,
        detailed_recommendations=recommendations,
        ai_metadata=ai_meta,
        degraded_mode=is_degraded,
        warnings=warnings
    )

@app.post("/api/report")
async def create_pdf_report(req: ReportRequest):
    """
    Compiles and streams a high-resolution, vector PDF engineering feasibility report.
    """
    if not req.analysis_data:
        raise HTTPException(status_code=400, detail="Invalid request: Missing analysis data payload.")

    try:
        pdf_stream = generate_pdf_report(req.analysis_data)
        coords = req.analysis_data.get("coordinates", {})
        lat_str = f"{coords.get('latitude', 0.0):.2f}"
        lon_str = f"{coords.get('longitude', 0.0):.2f}"
        filename = f"BuildWise_Report_{lat_str}_{lon_str}.pdf"

        return StreamingResponse(
            pdf_stream,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF generation error: {str(e)}")
