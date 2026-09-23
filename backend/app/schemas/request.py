from typing import Optional
from pydantic import BaseModel, Field

class AnalysisRequest(BaseModel):
    latitude: float = Field(..., ge=-90.0, le=90.0, description="Latitude in decimal degrees")
    longitude: float = Field(..., ge=-180.0, le=180.0, description="Longitude in decimal degrees")
    built_up_area_sqft: float = Field(..., ge=500.0, le=50000.0, description="Built-up area in square feet")
    quality_grade: str = Field("standard", pattern="^(basic|standard|premium)$", description="Construction quality specification")
    building_typology: str = Field("residential_single", description="Building typology identifier")
    floors: int = Field(1, ge=1, le=4, description="Number of above-ground floors")
    ai_provider: Optional[str] = Field("mock", description="AI provider: mock, groq, gemini, ollama")
    override_land_rate_per_sqft: Optional[float] = Field(None, ge=10.0, le=500000.0, description="Optional user-supplied land rate override in INR per sq ft")
    plot_area_sqft: Optional[float] = Field(None, ge=200.0, le=100000.0, description="Site plot area in sq ft; derived from ground coverage if omitted")
    ground_coverage_ratio: Optional[float] = Field(0.60, ge=0.40, le=0.75, description="Ground coverage ratio for plot area derivation (0.40 to 0.75, default 0.60)")

class ReportRequest(BaseModel):
    analysis_data: dict = Field(..., description="Complete AnalysisResponse payload for PDF compilation")
    site_vision: Optional[dict] = Field(None, description="Optional SiteVisionResponse object")
    floor_plan: Optional[dict] = Field(None, description="Optional FloorPlanResponse object")
