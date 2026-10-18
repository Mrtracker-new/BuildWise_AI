/**
 * siteBoundary.ts — single source of truth for the site boundary.
 * =======================================================================
 * Every capture path (trace, rectangle quick path, presets, GeoJSON/KML
 * import) funnels through buildPlotPolygonPayload — ONE model matching the
 * backend contract in app/schemas/site_plan.py exactly:
 *   shape_type in {rectangle, irregular, trapezoid, l_shape, pentagon, polygon}
 *   vertices: [x, y][] in local tangent-plane meters (CCW enforced here)
 *
 * Validation mirrors backend/app/services/floorplan/site_geometry.py:
 *   EC-01 edge < 1.0 m; EC-02 self-intersection / < 3 vertices; EC-03 area < 36 m2
 */
import { azimuthDeg, edgeLength } from './projection';
import type { Vertex } from './boundaryIO';

export type ShapeType = 'rectangle' | 'irregular' | 'trapezoid' | 'l_shape' | 'pentagon' | 'polygon';

export const MIN_EDGE_M = 1.0;
export const MIN_AREA_SQM = 36.0;
export const MIN_VERTICES = 3;

export interface BoundaryValidation {
  valid: boolean;
  reason?: string;
  code?: 'EC-01' | 'EC-02' | 'EC-03';
}

/** Signed shoelace area in m2 (sign = winding; magnitude = area). */
export function shoelaceArea(vertices: Vertex[]): number {
  let sum = 0;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

export function perimeterLength(vertices: Vertex[]): number {
  let sum = 0;
  const n = vertices.length;
  for (let i = 0; i < n; i++) sum += edgeLength(vertices[i], vertices[(i + 1) % n]);
  return sum;
}

/** Ensure CCW winding (positive shoelace); returns a copy, never mutates. */
export function ensureCCW(vertices: Vertex[]): Vertex[] {
  return shoelaceArea(vertices) < 0 ? [...vertices].reverse() : [...vertices];
}

function cross(o: Vertex, a: Vertex, b: Vertex): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** Proper segment-segment crossing test (exclusive endpoints). */
export function segmentsProperlyIntersect(p1: Vertex, p2: Vertex, p3: Vertex, p4: Vertex): boolean {
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Client-side validity gate mirroring backend EC-01..03. */
export function validateBoundary(vertices: Vertex[]): BoundaryValidation {
  if (vertices.length < MIN_VERTICES) {
    return { valid: false, reason: 'At least 3 vertices are required to close a boundary.', code: 'EC-02' };
  }
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % n];
    const len = edgeLength(a, b);
    if (len < MIN_EDGE_M) {
      return {
        valid: false,
        code: 'EC-01',
        reason: `Edge P${i + 1}-P${((i + 1) % n) + 1} is ${len.toFixed(2)} m (statutory minimum 1.00 m).`,
      };
    }
  }
  const area = Math.abs(shoelaceArea(vertices));
  if (area < MIN_AREA_SQM) {
    return { valid: false, code: 'EC-03', reason: `Area ${area.toFixed(1)} m² is below the 36 m² statutory minimum.` };
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // adjacent via the closure edge
      if (segmentsProperlyIntersect(vertices[i], vertices[(i + 1) % n], vertices[j], vertices[(j + 1) % n])) {
        return { valid: false, code: 'EC-02', reason: 'Boundary edges cross - a plot boundary cannot self-intersect.' };
      }
    }
  }
  return { valid: true };
}

/** Validation over the live, in-progress ring (cursor = closing edge candidate). */
export function validateLiveRing(vertices: Vertex[], cursor: Vertex | null): BoundaryValidation {
  const ring = cursor ? [...vertices, cursor] : vertices;
  return validateBoundary(ring);
}

/* ================= shape classification ================= */

function countParallelPairs(vs: Vertex[]): number {
  if (vs.length !== 4) return 0;
  const dirs = [0, 1, 2, 3].map((i) => azimuthDeg(vs[i], vs[(i + 1) % 4]));
  let pairs = 0;
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      const d = ((Math.abs(dirs[i] - dirs[j]) % 180) + 180) % 180;
      const par = Math.min(d, 180 - d);
      if (par < 0.5) pairs++;
    }
  }
  return pairs;
}

function convexityTurns(vs: Vertex[]): number[] {
  const n = vs.length;
  return vs.map((_, i) => cross(vs[i], vs[(i + 1) % n], vs[(i + 2) % n]));
}

/** Rectangle: 4 vertices, parallelogram with one right angle (=> all right). */
export function isRectangleShape(vs: Vertex[]): boolean {
  if (vs.length !== 4) return false;
  const sides = [0, 1, 2, 3].map((i) => edgeLength(vs[i], vs[(i + 1) % 4]));
  const oppositeParallel = Math.abs(
    Math.abs(azimuthDeg(vs[0], vs[1]) - azimuthDeg(vs[3], vs[2]) % 360)
  ) < 0.5 || Math.abs(Math.abs(azimuthDeg(vs[0], vs[1]) - azimuthDeg(vs[3], vs[2])) - 360) < 0.5;
  void oppositeParallel;
  const p1 = countParallelPairs(vs);
  const angle = perpendicularity(vs[0], vs[1], vs[1], vs[2]);
  return p1 === 2 && angle !== null && Math.abs(angle - 90) < 0.5 && Math.abs(sides[0] - sides[2]) < 1e-6;
}

/** Angle at corner b between segments a-b and b-c, in degrees (null if degenerate). */
function perpendicularity(a: Vertex, b: Vertex, _b2: Vertex, c: Vertex): number | null {
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const m1 = Math.hypot(v1.x, v1.y);
  const m2 = Math.hypot(v2.x, v2.y);
  if (m1 === 0 || m2 === 0) return null;
  const cosTheta = (v1.x * v2.x + v1.y * v2.y) / (m1 * m2);
  return (Math.acos(Math.max(-1, Math.min(1, cosTheta))) * 180) / Math.PI;
}

export function detectShapeType(vertices: Vertex[]): ShapeType {
  const n = vertices.length;
  if (n === 4) {
    if (isRectangleShape(vertices)) return 'rectangle';
    if (countParallelPairs(vertices) === 1) return 'trapezoid';
    return 'irregular';
  }
  if (n === 5) {
    const turns = convexityTurns(vertices);
    const allConvex = turns.every((t) => t > 0);
    return allConvex ? 'pentagon' : 'irregular';
  }
  if (n === 6) {
    // L-shape: convex hull of 6 pts with 6 reentrant/convex mix — exactly one reflex vertex
    const turns = convexityTurns(vertices);
    const reflex = turns.filter((t) => t < 0).length;
    if (reflex === 1) return 'l_shape';
  }
  return n >= 3 ? 'irregular' : 'polygon';
}

/* ================= metrics ================= */

export interface BoundaryMetrics {
  valid: boolean;
  reason?: string;
  code?: 'EC-01' | 'EC-02' | 'EC-03';
  areaSqm: number;
  perimeterM: number;
  vertexCount: number;
  shapeType: ShapeType;
  centroid: Vertex;
  bbox: [number, number, number, number];
}

export function centroidOf(vs: Vertex[]): Vertex {
  const a = shoelaceArea(vs);
  if (Math.abs(a) < 1e-12) {
    const s = vs.reduce((acc, p) => ({ x: acc.x + p.x / vs.length, y: acc.y + p.y / vs.length }), { x: 0, y: 0 });
    return s;
  }
  let cx = 0;
  let cy = 0;
  const n = vs.length;
  for (let i = 0; i < n; i++) {
    const p = vs[i];
    const q = vs[(i + 1) % n];
    const w = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * w;
    cy += (p.y + q.y) * w;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

export function metricsFor(vertices: Vertex[]): BoundaryMetrics {
  const canonical = ensureCCW(vertices);
  const v = validateBoundary(canonical);
  return {
    valid: v.valid,
    reason: v.reason,
    code: v.code,
    areaSqm: Math.abs(shoelaceArea(canonical)),
    perimeterM: perimeterLength(canonical),
    vertexCount: canonical.length,
    shapeType: detectShapeType(canonical),
    centroid: centroidOf(canonical),
    bbox: bboxOf(canonical),
  };
}

export function bboxOf(vs: Vertex[]): [number, number, number, number] {
  let minx = Infinity;
  let miny = Infinity;
  let maxx = -Infinity;
  let maxy = -Infinity;
  for (const p of vs) {
    minx = Math.min(minx, p.x);
    miny = Math.min(miny, p.y);
    maxx = Math.max(maxx, p.x);
    maxy = Math.max(maxy, p.y);
  }
  return [minx, miny, maxx, maxy];
}

/* ================= quick paths: rectangle + presets ================= */

export interface RectSpec {
  /** Frontage width, m (along +X at rotation 0). */
  widthM: number;
  /** Plot depth, m (along +Y at rotation 0). */
  depthM: number;
  /** Clockwise rotation of the frontage from East, degrees. */
  rotationDeg: number;
}

/** Rectangle quick path: 4-vertex model at the pin, identical model as trace. */
export function rectangleVertices(spec: RectSpec, center: Vertex): Vertex[] {
  const hw = spec.widthM / 2;
  const hd = spec.depthM / 2;
  const rad = (spec.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const local = [
    { x: -hw, y: -hd },
    { x: hw, y: -hd },
    { x: hw, y: hd },
    { x: -hw, y: hd },
  ];
  return local.map((p) => ({
    x: round3(center.x + p.x * cos - p.y * sin),
    y: round3(center.y + p.x * sin + p.y * cos),
  }));
}

export type PresetId = 'rect' | 'l_shape' | 'trapezoid' | 'pentagon';

/** Parametric preset seeds at the pin — all editable after insertion. */
export function presetVertices(id: PresetId, sizeM: number, center: Vertex): Vertex[] {
  const s = sizeM / 2; // half-extent
  switch (id) {
    case 'rect':
      return rectangleVertices({ widthM: sizeM, depthM: sizeM * 0.75, rotationDeg: 0 }, center);
    case 'trapezoid':
      return normalizeClosed([
        { x: center.x - s, y: center.y - s * 0.8 },
        { x: center.x + s, y: center.y - s * 0.8 },
        { x: center.x + s * 0.65, y: center.y + s * 0.8 },
        { x: center.x - s * 0.65, y: center.y + s * 0.8 },
      ]);
    case 'l_shape': {
      const a = sizeM;
      const b = sizeM * 0.45;
      return normalizeClosed([
        { x: center.x - a / 2, y: center.y - a / 2 },
        { x: center.x - a / 2 + b, y: center.y - a / 2 },
        { x: center.x - a / 2 + b, y: center.y - a / 2 + b },
        { x: center.x + a / 2, y: center.y - a / 2 + b },
        { x: center.x + a / 2, y: center.y + a / 2 },
        { x: center.x - a / 2, y: center.y + a / 2 },
      ]);
    }
    case 'pentagon': {
      const pts: Vertex[] = [];
      for (let i = 0; i < 5; i++) {
        const ang = (i * 2 * Math.PI) / 5 - Math.PI / 2; // apex up
        pts.push({ x: round3(center.x + s * Math.cos(ang)), y: round3(center.y + s * Math.sin(ang)) });
      }
      return normalizeClosed(pts);
    }
  }
}

/** Drop duplicate closure point and ensure CCW. */
export function normalizeClosed(vs: Vertex[]): Vertex[] {
  const out = dedupeRing(vs);
  return ensureCCW(out);
}

function dedupeRing(vs: Vertex[]): Vertex[] {
  const out: Vertex[] = [];
  for (const p of vs) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last.x - p.x) > 1e-4 || Math.abs(last.y - p.y) > 1e-4) out.push(p);
  }
  if (out.length > 1) {
    const f = out[0];
    const l = out[out.length - 1];
    if (Math.abs(f.x - l.x) <= 1e-4 && Math.abs(f.y - l.y) <= 1e-4) out.pop();
  }
  return out;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/* ================= payload builder: THE single funnel ================= */

export interface PlotPolygonPayload {
  vertices: [number, number][];
  origin_lat: number;
  origin_lon: number;
  shape_type: ShapeType;
  area_sqm: number;
  perimeter_m: number;
  is_regular_rectangle: boolean;
  /** (minx, miny, maxx, maxy) in meters — matches the legacy TS PlotPolygon field. */
  bounding_box: [number, number, number, number];
}

export interface BuildPayloadArgs {
  vertices: Vertex[];
  origin: { lat: number; lon: number };
  source: BoundarySource;
  frontageEdgeIndex?: number | null;
}

export type BoundarySource = 'trace' | 'rectangle' | 'preset' | 'import' | 'legacy';

/** Runtime shape of the shared boundary owned by the App (map capture). */
export interface SharedBoundaryState {
  vertices: Vertex[];
  origin: { lat: number; lon: number };
  source: BoundarySource;
  frontageEdgeIndex: number | null;
}


/**
 * THE funnel: every capture path passes here. Canonicalizes (CCW), classifies,
 * validates, and emits the backend PlotPolygonModel contract + provenance.
 * Throws on invalid boundaries so invalid states cannot reach the backend.
 */
export interface PlotPolygonPayloadFull extends PlotPolygonPayload {
  source: BoundarySource;
  source_label: string;
  frontage_edge_index: number | null;
}

export function buildPlotPolygonPayload(args: BuildPayloadArgs): PlotPolygonPayloadFull {
  const canonical = normalizeClosed(args.vertices);
  const m = metricsFor(canonical);
  if (!m.valid) {
    throw new BoundaryError(m.reason ?? 'Invalid boundary.', m.code);
  }
  return {
    vertices: canonical.map((v) => [round3(v.x), round3(v.y)] as [number, number]),
    origin_lat: round7(args.origin.lat),
    origin_lon: round7(args.origin.lon),
    shape_type: m.shapeType,
    area_sqm: round2(m.areaSqm),
    perimeter_m: round2(m.perimeterM),
    is_regular_rectangle: m.shapeType === 'rectangle',
    bounding_box: m.bbox,
    source: args.source,
    source_label: SOURCE_LABELS[args.source],
    frontage_edge_index: args.frontageEdgeIndex ?? null,
  };
}

export class BoundaryError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'BoundaryError';
    this.code = code;
  }
}

export const SOURCE_LABELS: Record<BoundarySource, string> = {
  trace: 'Traced',
  rectangle: 'Rectangle quick path',
  preset: 'Preset',
  import: 'Imported (GeoJSON/KML)',
  legacy: 'Legacy vertex table',
};

/** Bearing/length pair for a ring edge (badges + vertex table). */
export function edgeBearingLength(ring: Vertex[], i: number): { azimuth: number; lengthM: number; bearing: string } {
  const a = ring[i];
  const b = ring[(i + 1) % ring.length];
  const az = azimuthDeg(a, b);
  const lengthM = edgeLength(a, b);
  return { azimuth: az, lengthM, bearing: quadrantBearingOf(az) };
}

function quadrantBearingOf(az: number): string {
  const a = ((az % 360) + 360) % 360;
  const dirs = ['N', 'E', 'S', 'W'];
  const idx = Math.floor(((a + 45) % 360) / 90);
  const rel = a - idx * 90;
  const from = dirs[idx];
  const to = dirs[(idx + 1) % 4];
  const deg = Math.floor(rel);
  const min = Math.round((rel - deg) * 60);
  if (min === 60) return `${from} 00°00′ ${to}`;
  return `${from} ${pad2(deg)}°${pad2(min)}′ ${to}`;
}

function pad2(v: number): string {
  return v.toString().padStart(2, '0');
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function round7(v: number): number {
  return Math.round(v * 1e7) / 1e7;
}
