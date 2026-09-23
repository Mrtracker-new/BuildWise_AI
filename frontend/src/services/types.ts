export interface AnalysisRequest {
  latitude: number;
  longitude: number;
  built_up_area_sqft: number;
  quality_grade: 'basic' | 'standard' | 'premium';
  building_typology: string;
  floors: number;
  ai_provider: string;
  override_land_rate_per_sqft?: number;
  plot_area_sqft?: number;
  ground_coverage_ratio?: number;
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

// ----------------------------------------------------
// New Modules Interfaces
// ----------------------------------------------------

export interface SeismicEvent {
  magnitude: number;
  date_iso: string;
  distance_km: number;
  place: string;
}

export interface SeismicProfile {
  zone: string;
  zone_factor: number;
  standard: string;
  district?: string | null;
  state?: string | null;
  event_count: number;
  is_capped: boolean;
  event_count_display: string;
  max_magnitude?: number | null;
  years_since_last_event?: number | null;
  recent_major_events: SeismicEvent[];
  confidence: 'high' | 'moderate' | 'low';
  confidence_warning?: string | null;
}

export interface FloodProfile {
  discharge_peak_to_mean_ratio?: number | null;
  pressure_level: 'low' | 'moderate' | 'high';
  ndma_flood_prone: boolean;
  elevation_amsl_m?: number | null;
  confidence: 'high' | 'moderate' | 'low';
  confidence_warning?: string | null;
}

export interface StormCycloneProfile {
  max_annual_gust_kmh?: number | null;
  extreme_rainfall_days?: number | null;
  exposure_level: 'low' | 'moderate' | 'high';
  ndma_cyclone_prone: boolean;
  confidence: 'high' | 'moderate' | 'low';
  confidence_warning?: string | null;
}

export interface HazardProfile {
  seismic: SeismicProfile;
  flood: FloodProfile;
  storm_cyclone: StormCycloneProfile;
  overall_hazard_level: 'low' | 'moderate' | 'high' | 'critical';
  warnings: string[];
}

export interface MultiplierBreakdown {
  road_accessibility_score: number;
  road_contribution: number;
  facility_proximity_score: number;
  facility_contribution: number;
  net_multiplier: number;
  is_clamped: boolean;
}

export interface LandValueEstimate {
  indicative_rate_per_sqft?: number | null;
  base_table_rate_per_sqft?: number | null;
  is_user_override: boolean;
  locality_multiplier: number;
  multiplier_breakdown: MultiplierBreakdown;
  plot_area_sqft: number;
  ground_coverage_ratio_applied: number;
  land_cost_inr?: number | null;
  construction_cost_inr: number;
  combined_project_total_inr?: number | null;
  as_of_year?: number | null;
  jurisdiction_zone?: string | null;
  source_publication?: string | null;
  disclaimer: string;
  confidence_warning?: string | null;
}

export interface RankedEntrance {
  direction: string;
  score: number;
  vastu_rationale: string;
  practical_rationale: string;
  is_approach_side: boolean;
}

export interface RoomGridZone {
  zone: string;
  zone_name: string;
  primary_room: string;
  alternative_room: string;
  prohibited: string[];
  vastu_rationale: string;
  civil_engineering_rationale: string;
}

export interface SlopeReading {
  drainage_direction: string;
  azimuth_degrees: number;
  auspiciousness: 'favourable' | 'neutral' | 'requires_remedy';
  rationale: string;
  remedy_notes?: string | null;
}

export interface ReconciliationItem {
  topic: string;
  status: 'concordant' | 'divergent';
  vastu_position: string;
  scientific_passive_position: string;
  recommended_synthesis: string;
}

export interface RoadApproach {
  bearing_degrees?: number | null;
  approach_side: string;
  distance_meters?: number | null;
  is_fallback: boolean;
}

export interface VastuAdvisory {
  ranked_entrances: RankedEntrance[];
  room_grid: RoomGridZone[];
  slope_reading: SlopeReading;
  reconciliation_notes: ReconciliationItem[];
  road_approach: RoadApproach;
}

export interface RecommendationItem {
  rule_id: string;
  category: string;
  category_label: string;
  severity: 'critical' | 'advisory' | 'optimal';
  trigger_condition: string;
  source_data_ref: string;
  recommendation_text: string;
  id?: string;
  title?: string;
  description?: string;
  source_standard?: string;
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
  hazard_profile?: HazardProfile;
  land_value?: LandValueEstimate;
  vastu_advisory?: VastuAdvisory;
  recommendation_items?: RecommendationItem[];
  site_vision?: SiteVisionResponse;
  floorplan?: FloorPlanResponse;
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

// ----------------------------------------------------
// Satellite Vision & Tree Preservation Module
// ----------------------------------------------------

export type SiteVisionMode = 'segformer' | 'index-only' | 'unavailable';
export type PreservationRank = 'preserve' | 'compensate' | 'removable' | 'context';

export interface SiteVisionRequest {
  latitude: number;
  longitude: number;
  plot_area_sqft?: number;
  mode_override?: 'segformer' | 'index-only';
  orientation_deg?: number;
}

export interface SceneMetadata {
  id: string;
  datetime: string;
  cloud_cover_pct: number;
  source: string;
}

export interface PreservationItem {
  cluster_id: string;
  area_sqm: number;
  centroid: [number, number];
  mean_ndvi: number;
  overlap_footprint: boolean;
  rank: PreservationRank;
  action: string;
}

export interface GeoJsonFeature {
  type: 'Feature';
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
  properties: {
    cluster_id: string;
    area_sqm: number;
    mean_ndvi?: number;
    rank?: PreservationRank;
    [key: string]: any;
  };
}

export interface GeoJsonFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
}

export interface SiteVisionResponse {
  mode: SiteVisionMode;
  scene_metadata?: SceneMetadata | null;
  green_cover_pct: number;
  water_cover_pct: number;
  built_up_pct: number;
  tree_clusters: GeoJsonFeatureCollection;
  water_bodies: GeoJsonFeatureCollection;
  preservation_plan: PreservationItem[];
  warnings: string[];
  timing_ms: Record<string, number>;
}

// ----------------------------------------------------
// Generative Floor Plan Engine Interfaces (CSP & Vastu)
// ----------------------------------------------------

export interface FloorPlanRequest {
  plot_width_m: number;
  plot_depth_m: number;
  required_rooms: string[];
  vastu_strictness: 'high' | 'medium' | 'low';
}

export interface RoomPlacement {
  room_id: string;
  room_name: string;
  row: number;
  col: number;
  width: number;
  height: number;
  area_sqm: number;
  width_m: number;
  depth_m: number;
  zone: string;
  vastu_compliant: boolean;
}

export interface FloorPlanMetrics {
  vastu_compliance_pct: number;
  plumbing_adjacency_score: number;
  space_utilization_pct: number;
  total_built_up_sqm: number;
  circulation_efficiency_pct: number;
}

export interface FloorPlanResponse {
  status: 'optimal' | 'compromise' | 'failed';
  grid_matrix: string[][];
  placements: RoomPlacement[];
  svg_blueprint: string;
  metrics: FloorPlanMetrics;
  warnings: string[];
  timing_ms: number;
  iterations: number;
}

export interface ReportRequestPayload {
  analysis_data: AnalysisResponse;
  site_vision?: SiteVisionResponse | null;
  floor_plan?: FloorPlanResponse | null;
}

