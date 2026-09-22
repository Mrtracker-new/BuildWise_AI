from typing import List, Dict, Optional
from pydantic import BaseModel

class FactorScore(BaseModel):
    factor_id: str
    name: str
    weight: float
    raw_value: float
    unit: str
    score: float  # 0 to 100
    status: str   # optimal, acceptable, critical
    details: str

class OrientationData(BaseModel):
    optimal_axis_degrees: float
    axis_label: str
    prevailing_wind_direction_degrees: float
    solar_exposure_summary: str
    cross_ventilation_rating: str
    passive_design_rationale: str

class CostItem(BaseModel):
    category: str
    amount_inr: float
    percentage: float
    description: str

class CostEstimate(BaseModel):
    base_rate_per_sqft: float
    terrain_multiplier: float
    base_cost_inr: float
    terrain_surcharge_inr: float
    total_estimated_cost_inr: float
    cost_range_min_inr: float
    cost_range_max_inr: float
    breakdown: List[CostItem]
    currency: str = "INR"
    disclaimer: str

class RiskItem(BaseModel):
    severity: str  # low, medium, high
    category: str  # slope, flood, access, climate
    title: str
    description: str
    mitigation_strategy: str

class AnalysisResponse(BaseModel):
    request_id: str
    timestamp: str
    coordinates: Dict[str, float]
    formatted_address: str
    overall_suitability_score: float
    suitability_verdict: str  # Suitable, Conditionally Suitable, Challenging
    factors: List[FactorScore]
    orientation: OrientationData
    cost_estimate: CostEstimate
    risks: List[RiskItem]
    engineering_summary: str
    detailed_recommendations: List[str]
    ai_metadata: Dict[str, str]
    degraded_mode: bool
    warnings: List[str]

class HealthResponse(BaseModel):
    status: str
    version: str
    ai_adapters_available: List[str]
    active_default_ai: str
