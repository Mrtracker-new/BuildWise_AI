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
  client_requirements?: string;
  extracted_constraints?: ExtractedClientConstraints;
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
  parameter_reflection?: string;
  feasibility_score?: number;
  structural_recommendations?: string[];
  cost_breakdown?: Record<string, any>;
  vastu_compliance?: Record<string, any>;
  ai_metadata: {
    provider_requested?: string;
    provider_used?: string;
    generation_time_ms?: string;
    fallback_reason?: string;
    parameter_reflection?: string;
    feasibility_score?: string;
  };
  degraded_mode: boolean;
  warnings: string[];
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

export interface EnvelopeRect {
  x: number;
  y: number;
  width: number;
  height: number;
  area_sqm: number;
}

export interface RoomRectangle {
  room_id: string;
  room_name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  area_sqm: number;
  zone: string;
  vastu_compliant: boolean;
}

export interface DoorGeometry {
  door_id: string;
  from_room: string;
  to_room: string;
  wall_edge: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  hinge_x: number;
  hinge_y: number;
  swing_direction: string;
  width_m: number;
}

export interface WindowGeometry {
  window_id: string;
  room_id: string;
  wall_edge: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width_m: number;
}

export interface FloorPlanQA {
  entry: string;
  circulation: string;
  leaf_rule?: boolean;
  peripheral_service?: boolean;
  catalog?: boolean;
  aspect?: boolean;
  critic?: string;
  violations: number;
  critic_notes?: string[];
}

export interface RectanglesModel {
  envelope: EnvelopeRect;
  rooms: RoomRectangle[];
  doors: DoorGeometry[];
  windows: WindowGeometry[];
  qa?: FloorPlanQA;
}

export interface RoomSpec {
  name: string;
  min_area_pct: number;
  max_area_pct: number;
  vastu_zone: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW' | 'CENTER';
  adjacency: string[];
  requires_plumbing: boolean;
  priority: number;
}

export interface SolverHints {
  target_utilization: number;
  allow_corridors: boolean;
}

export interface RoomProgram {
  rooms: RoomSpec[];
  design_intent: string;
  solver_hints: SolverHints;
}

export interface VerticalCoreSpec {
  core_id: string;
  core_type: 'staircase_dogleg' | 'staircase_fire' | 'lift_passenger' | 'lift_service' | 'mep_chase';
  x: number;
  y: number;
  width_m: number;
  depth_m: number;
  landing_depth_m?: number;
  tread_mm: number;
  riser_mm: number;
  continuous_across_floors: number[];
}

export interface DuctShaftSpec {
  shaft_id: string;
  shaft_type: 'plumbing_wet' | 'electrical_mep' | 'hvac_vent';
  x: number;
  y: number;
  width_m: number;
  depth_m: number;
  servicing_rooms: string[];
}

export interface MultiFloorRoomRectangle {
  room_id: string;
  room_name: string;
  floor_index: number;
  unit_id?: string;
  x: number;
  y: number;
  width_m: number;
  depth_m: number;
  area_sqm: number;
  zone: string;
  zone_category: 'public' | 'private' | 'service' | 'circulation' | 'industrial_bay';
  vastu_compliant: boolean;
  is_vertical_core?: boolean;
  requires_exterior_wall?: boolean;
  aspect_ratio: number;
}

export interface MultiFloorDoorGeometry {
  door_id: string;
  floor_index: number;
  from_room: string;
  to_room: string;
  wall_edge: 'north' | 'south' | 'east' | 'west' | 'vertical' | 'horizontal';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  hinge_x: number;
  hinge_y: number;
  swing_direction: 'inward_right' | 'inward_left' | 'outward_right' | 'outward_left';
  width_m: number;
  door_type?: 'standard' | 'fire_rated' | 'sliding' | 'dock_shutter';
}

export interface MultiFloorWindowGeometry {
  window_id: string;
  floor_index: number;
  room_id: string;
  wall_edge: 'north' | 'south' | 'east' | 'west';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width_m: number;
  sill_height_m?: number;
}

export interface StructuralGridSpec {
  bay_spacing_x_m: number;
  bay_spacing_y_m: number;
  columns_x: number[];
  columns_y: number[];
  column_size_m: number;
}

export interface SingleFloorPlanModel {
  floor_index: number;
  floor_name: string;
  envelope: {
    x: number;
    y: number;
    width: number;
    depth: number;
    area_sqm: number;
  };
  rooms: MultiFloorRoomRectangle[];
  doors: MultiFloorDoorGeometry[];
  windows: MultiFloorWindowGeometry[];
  circulation_status: 'connected' | 'disconnected';
  vastu_score_pct: number;
  plumbing_stack_alignment_pct: number;
  built_up_area_sqm: number;
  carpet_area_sqm: number;
  svg_blueprint_cad: string;
  svg_blueprint_paper: string;
}

export interface MultiStoreyBuildingModel {
  building_typology: 'T1_SINGLE_FAMILY' | 'T2_FAMILY_APARTMENT' | 'T3_LARGE_COMPLEX' | 'T4_WAREHOUSE' | string;
  total_storeys: number;
  plot_width_m: number;
  plot_depth_m: number;
  ground_coverage_ratio: number;
  total_built_up_area_sqm: number;
  vertical_cores: VerticalCoreSpec[];
  duct_shafts: DuctShaftSpec[];
  structural_grid?: StructuralGridSpec;
  floors: SingleFloorPlanModel[];
  global_metrics: Record<string, any>;
  qa_report: Record<string, any>;
  warnings: string[];
  unmet_requirements: string[];
  seed: number;
  solver_timing_ms: number;
}

export interface SpatialAdjacencyConstraint {
  room_a: string;
  room_b: string;
  relationship: 'connected' | 'adjacent' | 'separated';
}

export interface OrientationPreferenceConstraint {
  space: string;
  preferred_facing: 'North' | 'East' | 'South' | 'West' | 'North-East' | 'South-East' | 'South-West' | 'North-West';
}

export interface ExtractedClientConstraints {
  target_bedroom_count: number;
  target_bathroom_count: number;
  specialized_spaces: string[];
  spatial_adjacencies: SpatialAdjacencyConstraint[];
  orientation_preferences: OrientationPreferenceConstraint[];
  explicit_exclusions: string[];
  raw_notes?: string;
  extraction_source?: 'groq_llm' | 'gemini_llm' | 'regex_fallback';
}

export interface FloorPlanRequest {
  plot_width_m: number;
  plot_depth_m: number;
  required_rooms?: string[];
  vastu_strictness: 'high' | 'medium' | 'low';
  building_typology?: string;
  quality_grade?: string;
  floors?: number;
  built_up_area_sqft?: number;
  ground_coverage_ratio?: number;
  client_notes?: string;
  ai_provider?: string;
  room_program?: RoomProgram;
  solar_axis_degrees?: number;
  prevailing_wind_direction_degrees?: number;
  top_vastu_entrances?: string[];
  program_source?: string;
  bypass_cache?: boolean;
  extracted_constraints?: ExtractedClientConstraints;
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
  plot_coverage_pct?: number;
  total_built_up_sqm: number;
  circulation_efficiency_pct: number;
  circulation_status?: string;
}

export interface FloorPlanResponse {
  status: 'optimal' | 'compromise' | 'failed';
  grid_matrix: string[][];
  placements: RoomPlacement[];
  rectangles?: RectanglesModel;
  svg_blueprint: string;
  svg_blueprint_paper?: string;
  metrics: FloorPlanMetrics;
  qa?: FloorPlanQA;
  warnings: string[];
  timing_ms: number;
  iterations: number;
  design_intent?: string;
  program_source?: 'llm' | 'cache' | 'fallback' | string;
  placement_source?: 'llm+kb' | 'kb-default' | string;
  placement_logic?: Record<string, string> | string[];
  ai_metadata?: Record<string, any>;
  room_program?: RoomProgram;
  multi_storey?: MultiStoreyBuildingModel;
  client_constraints?: ExtractedClientConstraints;
  generated_at?: number;
  generation_id?: string;
}

export interface ReportRequestPayload {
  analysis_data: AnalysisResponse;
  site_vision?: SiteVisionResponse | null;
  floor_plan?: FloorPlanResponse | null;
}

