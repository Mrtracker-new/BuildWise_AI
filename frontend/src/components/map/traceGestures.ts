/**
 * traceGestures.ts — pure math for EDIT-mode gestures (drag/insert/delete).
 * ====================================================================
 * Screen-space hit tests are executed by the caller: the tolerance in METERS
 * here is pre-converted from a pixel band at the current zoom (same approach
 * as CaptureSheet's HOVER_TOLERANCE). Pure and testable — no map dependency.
 */
import type { Vertex } from '../../services/boundaryIO';

/** Vertex handle hit: the nearest vertex ONLY when the pointer is inside the band. */
export function hitVertex(
  vertices: Vertex[],
  p: Vertex,
  toleranceM: number
): number | null {
  let best: number | null = null;
  let bestD = Infinity;
  for (let i = 0; i < vertices.length; i++) {
    const d = Math.hypot(vertices[i].x - p.x, vertices[i].y - p.y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return bestD <= toleranceM ? best : null;
}

/**
 * Mid-edge insertion handle: the pointer must sit over the MIDDLE third of an
 * edge (keeps the two ends for the drag/delete gestures), and the guard
 * `minEdgeM` rejects degenerate edges (vertex already snapped to a corner).
 */
export function hitEdgeMidpoint(
  vertices: Vertex[],
  p: Vertex,
  toleranceM: number,
  minEdgeM: number
): number | null {
  let best: number | null = null;
  let bestD = Infinity;
  const n = vertices.length;
  if (n < 3) return null;
  for (let i = 0; i < n; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < minEdgeM) continue;
    // Middle-third band: reuse the edge projection but gate t.
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const tRaw = len2 === 0 ? 0.5 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    if (tRaw < 1 / 3 || tRaw > 2 / 3) continue;
    const t = Math.max(0, Math.min(1, tRaw));
    const d = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return bestD <= toleranceM ? best : null;
}

export function edgeMidpoint(vertices: Vertex[], i: number): Vertex {
  const a = vertices[i];
  const b = vertices[(i + 1) % vertices.length];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Drag delta badges: (Δx, Δy) in meters from drag origin to current point. */
export function dragDelta(
  origin: Vertex | null,
  current: Vertex | null
): { dx: number; dy: number } | null {
  if (!origin || !current) return null;
  return { dx: current.x - origin.x, dy: current.y - origin.y };
}
