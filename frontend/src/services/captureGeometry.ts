/**
 * captureGeometry.ts — pure snap/guide math for point-by-point capture.
 * ====================================================================
 * Snap modes:
 *   FREE       — cursor as-is
 *   ORTHOGONAL — snap to N/S/E/W (0/90/180/270) continuation of the last edge
 *   PARALLEL   — snap to the bearing of the last drawn edge (or its perpendicular)
 * Returns the snapped point plus magnetic guide segments for rendering.
 */
import { azimuthDeg, quadrantBearing } from './projection';
import type { Vertex } from './boundaryIO';

export type SnapMode = 'FREE' | 'ORTHOGONAL' | 'PARALLEL';

export interface GuideLine {
  a: Vertex;
  b: Vertex;
}

export interface SnapResult {
  point: Vertex;
  guides: GuideLine[];
  /** True when the snap changed the cursor position (magnetic feedback). */
  snapped: boolean;
  /** Bearing of the live edge cursor→snapped (for the badge). */
  azimuth: number;
  /** Length of the live edge (m). */
  lengthM: number;
}

const ORTHO_BEARINGS = [0, 90, 180, 270];

/**
 * Project cursor onto the ray from `anchor` with bearing `bearingDeg`.
 */
function projectOnBearing(anchor: Vertex, cursor: Vertex, bearingDeg: number): Vertex {
  const rad = (bearingDeg * Math.PI) / 180;
  const dx = cursor.x - anchor.x;
  const dy = cursor.y - anchor.y;
  // Ray direction: bearing measured from North, clockwise.
  const ux = Math.sin(rad);
  const uy = Math.cos(rad);
  const t = dx * ux + dy * uy; // scalar projection (can be negative -> clamp to 0)
  const tt = Math.max(0, t);
  return { x: anchor.x + ux * tt, y: anchor.y + uy * tt };
}

export function snapPoint(
  cursor: Vertex,
  anchor: Vertex | null,
  lastBearing: number | null,
  mode: SnapMode
): SnapResult {
  if (!anchor) {
    return { point: cursor, guides: [], snapped: false, azimuth: 0, lengthM: 0 };
  }

  let guides: GuideLine[] = [];
  let point = cursor;
  let snapped = false;

  if (mode === 'ORTHOGONAL') {
    // Choose the ortho bearing closest to the raw cursor bearing.
    const raw = azimuthDeg(anchor, cursor);
    const nearest = ORTHO_BEARINGS.reduce((best, b) => {
      const dBest = Math.min(Math.abs(raw - best), 360 - Math.abs(raw - best));
      const dB = Math.min(Math.abs(raw - b), 360 - Math.abs(raw - b));
      return dB < dBest ? b : best;
    }, ORTHO_BEARINGS[0]);
    point = projectOnBearing(anchor, cursor, nearest);
    guides = [{ a: anchor, b: { x: anchor.x + Math.sin((nearest * Math.PI) / 180) * 1e4, y: anchor.y + Math.cos((nearest * Math.PI) / 180) * 1e4 } }];
    snapped = true;
  } else if (mode === 'PARALLEL' && lastBearing !== null) {
    // Snap to the last bearing OR its perpendicular, whichever is closer.
    const raw = azimuthDeg(anchor, cursor);
    const candidates = [lastBearing, (lastBearing + 90) % 360];
    const best = candidates.reduce((b1, b2) => {
      const d1 = Math.min(Math.abs(raw - b1), 360 - Math.abs(raw - b1));
      const d2 = Math.min(Math.abs(raw - b2), 360 - Math.abs(raw - b2));
      return d2 < d1 ? b2 : b1;
    });
    point = projectOnBearing(anchor, cursor, best);
    guides = [{ a: anchor, b: { x: anchor.x + Math.sin((best * Math.PI) / 180) * 1e4, y: anchor.y + Math.cos((best * Math.PI) / 180) * 1e4 } }];
    snapped = true;
  }

  const azimuth = azimuthDeg(anchor, point);
  const lengthM = Math.hypot(point.x - anchor.x, point.y - anchor.y);
  return { point, guides, snapped, azimuth, lengthM };
}

/** Distance from vertex to close the ring (click-to-close affordance). */
export function distanceToFirstVertex(cursor: Vertex, first: Vertex): number {
  return Math.hypot(cursor.x - first.x, cursor.y - first.y);
}

/**
 * Perpendicular distance (m) from `p` to edge `i` of the ring.
 */
export function distanceToEdge(vertices: Vertex[], i: number, p: Vertex): number {
  const n = vertices.length;
  if (n === 0) return Infinity;
  const a = vertices[i % n];
  const b = vertices[(i + 1) % n];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}


/**
 * Hover pick: the nearest edge ONLY when the pointer is within `maxDistanceM`
 * of it, otherwise null. Frontage picking is a precision gesture — snapping the
 * highlight to an edge the pointer is nowhere near is what made it a guess.
 */
export function nearestEdgeWithin(
  vertices: Vertex[],
  p: Vertex,
  maxDistanceM: number
): number | null {
  if (vertices.length < 3) return null;
  let best: number | null = null;
  let bestD = Infinity;
  for (let i = 0; i < vertices.length; i++) {
    const d = distanceToEdge(vertices, i, p);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return bestD <= maxDistanceM ? best : null;
}

/** One per-edge callout: label text anchored at the edge midpoint. */
export interface EdgeCallout {
  index: number;
  a: Vertex;
  b: Vertex;
  midpoint: Vertex;
  lengthM: number;
  bearingDeg: number;
  /** "P1-P2 · 12.00 m · N 90°00′ E" — edge id, length and quadrant bearing. */
  label: string;
}

/**
 * Build the length/bearing callout for every edge of the ring (the frontage
 * picker shows one per edge so a choice is made on measurements, not vibes).
 */
export function edgeCallouts(vertices: Vertex[]): EdgeCallout[] {
  const n = vertices.length;
  if (n < 2) return [];
  const out: EdgeCallout[] = [];
  for (let i = 0; i < n; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % n];
    const lengthM = Math.hypot(b.x - a.x, b.y - a.y);
    const bearingDeg = azimuthDeg(a, b);
    out.push({
      index: i,
      a,
      b,
      midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      lengthM,
      bearingDeg,
      label: `P${i + 1}-P${((i + 1) % n) + 1} · ${lengthM.toFixed(2)} m · ${quadrantBearing(bearingDeg)}`,
    });
  }
  return out;
}
