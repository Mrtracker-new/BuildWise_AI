export interface AnalysisRequest {
  latitude: number;
  longitude: number;
  built_up_area_sqft: number;
  quality_grade: 'basic' | 'standard' | 'premium';
  building_typology: string;
  floors: number;
  ai_provider: string;
}

export interface FactorScore {
  factor_id: string;
  name: string;
  weight: number;
  raw_value: number;
  unit: string;
  score: number;
  status: 'optimal' | 'acceptable' | 'critical';
  details: string;
}

export interface OrientationData {
  optimal_axis_degrees: number;
  axis_label: string;
  prevailing_wind_direction_degrees: number;
  solar_exposure_summary: string;
  cross_ventilation_rating: string;
  passive_design_rationale: string;
}

export interface CostItem {
  category: string;
  amount_inr: number;
  percentage: number;
  description: string;
}

export interface CostEstimate {
  base_rate_per_sqft: number;
  terrain_multiplier: number;
  base_cost_inr: number;
  terrain_surcharge_inr: number;
  total_estimated_cost_inr: number;
  cost_range_min_inr: number;
  cost_range_max_inr: number;
  breakdown: CostItem[];
  currency: string;
  disclaimer: string;
}

export interface RiskItem {
  severity: 'low' | 'medium' | 'high';
  category: string;
  title: string;
  description: string;
  mitigation_strategy: string;
}

export interface AnalysisResponse {
  request_id: string;
  timestamp: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  formatted_address: string;
  overall_suitability_score: number;
  suitability_verdict: 'Suitable' | 'Conditionally Suitable' | 'Challenging';
  factors: FactorScore[];
  orientation: OrientationData;
  cost_estimate: CostEstimate;
  risks: RiskItem[];
  engineering_summary: string;
  detailed_recommendations: string[];
  ai_metadata: {
    provider_requested?: string;
    provider_used?: string;
    generation_time_ms?: string;
    fallback_reason?: string;
  };
  degraded_mode: boolean;
  warnings: string[];
}

export interface HealthResponse {
  status: string;
  version: string;
  ai_adapters_available: string[];
  active_default_ai: string;
}
