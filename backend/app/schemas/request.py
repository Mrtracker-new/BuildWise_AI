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

class ReportRequest(BaseModel):
    analysis_data: dict = Field(..., description="Complete AnalysisResponse payload for PDF compilation")
