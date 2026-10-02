/**
 * siteIntelligence.ts — site intelligence (pure logic).
 * =============================================================
 * Pure, dependency-free functions + response models for:
 *  - frontage suggestion from the /api/nearest-road road bearing
 *  - the /api/site/preview + /api/analyze payload builders (single-source funnel)
 *  - the annotation status taxonomy shared by HUD + sheet UIs
 *
 * Fetchers live in siteIntelligenceApi.ts so this module stays transpilable
 * by scripts/test_boundary_pipeline.cjs (import.meta is not allowed there).
 *
 * AMENDMENT 1 (honesty): the road suggestion is ASSUMED until the user
 * confirms an edge; an absent/unreachable road NEVER fabricates a bearing —
 * the frontage simply stays manual (ASSUMED), mirroring the backend.
 */
import {
  detectShapeType,
  ensureCCW,
  metricsFor,
  shoelaceArea,
  type ShapeType,
  type SharedBoundaryState,
} from './siteBoundary';
import { azimuthDeg, edgeLength } from './projection';
import type { Vertex } from './boundaryIO';

/* ------------------------------------------------------------------ */
/* Annotation taxonomy (mirrors app/schemas/site_intelligence.py)      */
/* ------------------------------------------------------------------ */

export type AnnotationStatus = 'CALCULATED' | 'ASSUMED' | 'RECOMMENDED' | 'VERIFIED';

export const ANNOTATION_STATUSES: readonly AnnotationStatus[] = [
  'CALCULATED',
  'ASSUMED',
  'RECOMMENDED',
  'VERIFIED',
];

/** HUD/sheet pill styling per status; ASSUMED must never read as CALCULATED. */
export const ANNOTATION_BADGE: Record<AnnotationStatus, { label: string; className: string }> = {
  CALCULATED: { label: 'CALCULATED', className: 'bg-[var(--fill)] text-[var(--text-2)]' },
  ASSUMED: { label: 'ASSUMED', className: 'bg-[var(--semantic-amber)]/15 text-[var(--semantic-amber)]' },
  RECOMMENDED: { label: 'RECOMMENDED', className: 'bg-[var(--accent-tint)] text-[var(--accent)]' },
  VERIFIED: { label: 'VERIFIED', className: 'bg-[var(--semantic-green)]/15 text-[var(--semantic-green)]' },
};

export interface SiteAnnotation {
  id: string;
  label: string;
  value: string | number | null;
  unit?: string | null;
  status: AnnotationStatus;
  basis: string;
}

/* ------------------------------------------------------------------ */
/* /api/nearest-road response model                                    */
/* ------------------------------------------------------------------ */

export interface RoadNearestPoint {
  lat: number;
  lon: number;
}

export interface RoadHit {
  bearing_degrees: number | null;
  approach_side: string;
  distance_meters: number | null;
  nearest_point: RoadNearestPoint | null;
  highway_class: string | null;
  road_name: string | null;
  is_fallback: boolean;
}

export interface RoadProvenance {
  source: string;
  annotation: AnnotationStatus;
  attribution: string;
  query_radius_m: number;
  cache: 'hit' | 'miss';
}

export interface NearestRoadResponse {
  request_id: string;
  timestamp: string;
  lat: number;
  lon: number;
  found: boolean;
  road: RoadHit | null;
  provenance: RoadProvenance;
  cached: boolean;
  degraded: boolean;
  warning: string | null;
}

/* ------------------------------------------------------------------ */
/* Frontage suggestion (pure math)                                     */
/* ------------------------------------------------------------------ */

export interface FrontageSuggestion {
  edgeIndex: number;
  /** Angular distance in degrees between the outward edge normal and the road bearing (0 = perfect). */
  alignmentDeg: number;
}

/**
 * Suggests the road-facing edge from an Overpass road bearing.
 * For a CCW ring the outward normal of edge i points at azimuth(edge) + 90°;
 * a CW ring flips it. The returned edgeIndex refers to the ring AS PASSED
 * (no canonicalization), so callers can index their own vertex array.
 * Ties break to the lower index. Returns null for degenerate rings.
 */
export function suggestFrontageEdge(
  vertices: Vertex[],
  roadBearingDeg: number | null,
): FrontageSuggestion | null {
  if (roadBearingDeg === null || !Number.isFinite(roadBearingDeg)) return null;
  const n = vertices.length;
  if (n < 3) return null;

  const signed = shoelaceArea(vertices) < 0 ? -1 : 1;
  const target = ((roadBearingDeg % 360) + 360) % 360;

  let best: FrontageSuggestion | null = null;
  for (let i = 0; i < n; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % n];
    if (edgeLength(a, b) < 1e-9) continue;
    const az = azimuthDeg(a, b);
    const outward = ((az + 90 * signed) % 360 + 360) % 360;
    const diff = Math.abs(outward - target);
    const alignment = Math.min(diff, 360 - diff);
    if (best === null || alignment < best.alignmentDeg - 1e-9) {
      best = { edgeIndex: i, alignmentDeg: Math.round(alignment * 10) / 10 };
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* /api/site/preview request + response models                         */
/* ------------------------------------------------------------------ */

/** Wire shape of the analyze/preview boundary block ({x,y} objects). */
export interface BoundarySummaryPayload {
  vertices: { x: number; y: number }[];
  origin_lat: number;
  origin_lon: number;
  shape_type: ShapeType;
  area_sqm: number;
  perimeter_m: number;
  source: SharedBoundaryState['source'];
  frontage_edge_index: number | null;
}

export interface SitePreviewPayload {
  boundary: BoundarySummaryPayload;
  ground_coverage_ratio?: number;
}

export interface SitePreviewPlot {
  vertices: [number, number][];
  area_sqm: number;
  perimeter_m: number;
  shape_type: string;
  winding: string;
  origin: { lat: number; lon: number };
  projection_note?: string;
}

export interface SitePreviewResponse {
  request_id: string;
  timestamp: string;
  input_hash: string;
  cached: boolean;
  compute_ms: number;
  ok: boolean;
  plot: SitePreviewPlot;
  setbacks: Record<string, number | boolean>;
  buildable: { vertices: [number, number][]; area_sqm: number; setback_band_area_sqm?: number };
  footprint: {
    vertices: [number, number][];
    area_sqm: number;
    topology_type: string;
    wings: { wing_id: string; label: string; x: number; y: number; width_m: number; depth_m: number; area_sqm: number }[];
    waste_pct?: number;
    rotation_alternatives?: { angle_deg: number; inscribed_area_sqm: number; waste_pct: number }[];
  };
  parking: {
    required_ecs?: number;
    provided_ecs?: number;
    deficit_ecs?: number;
    bays?: { bay_id: string; x: number; y: number; width_m: number; length_m: number; polygon_coords: [number, number][] }[];
    drive_aisle_polygon?: [number, number][];
    drive_aisle_width_m?: number;
    deficit_warning?: string | null;
    coexistence_status?: string;
  };
  wedges: {
    wedge_id: string;
    name: string;
    classification: string;
    area_sqm: number;
    centroid: [number, number];
    polygon_coords: [number, number][];
  }[];
  certificate: {
    footprint_contained_in_buildable?: boolean;
    setback_distance_satisfied?: boolean;
    min_setback_achieved_m?: number;
    required_setback_m?: number;
    ground_coverage_actual_pct?: number;
    ground_coverage_limit_pct?: number;
    far_actual?: number;
    is_valid?: boolean;
    diagnostics?: string[];
  };
  frontage: {
    edge_index: number;
    edge_bearing_deg: number | null;
    edge_bearing_dms: string | null;
    edge_length_m: number | null;
    status: AnnotationStatus;
  } | null;
  annotations: SiteAnnotation[];
  provenance: Record<string, unknown>;
  warnings: string[];
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Builds the {x,y}-object boundary block consumed by /api/analyze and
 * /api/site/preview. Same single-source model as the capture funnel: CCW
 * canonical + server-classified metrics; the server recomputes everything
 * authoritatively.
 */
export function boundaryToSummaryPayload(boundary: SharedBoundaryState): BoundarySummaryPayload {
  const canonical = ensureCCW(boundary.vertices);
  const m = metricsFor(canonical);
  return {
    vertices: canonical.map((v) => ({ x: round3(v.x), y: round3(v.y) })),
    origin_lat: boundary.origin.lat,
    origin_lon: boundary.origin.lon,
    shape_type: m.shapeType ?? detectShapeType(canonical),
    area_sqm: round2(m.areaSqm),
    perimeter_m: round2(m.perimeterM),
    source: boundary.source,
    frontage_edge_index: boundary.frontageEdgeIndex,
  };
}

/** /api/site/preview request body for a confirmed boundary. */
export function buildPreviewPayload(
  boundary: SharedBoundaryState,
  coverageRatio?: number,
): SitePreviewPayload {
  const payload: SitePreviewPayload = { boundary: boundaryToSummaryPayload(boundary) };
  if (coverageRatio !== undefined && Number.isFinite(coverageRatio)) {
    payload.ground_coverage_ratio = coverageRatio;
  }
  return payload;
}
