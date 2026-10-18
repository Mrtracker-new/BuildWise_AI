/**
 * interaction/drag.ts — P5, the pure half of "take hold of the ring".
 *
 * A drag is the one interaction on the landing that a reader LEARNS from, so its
 * maths is separated from its plumbing: this module decides where a corner lands,
 * and `./hooks` only decides when events arrive. That split is what lets
 * `scripts/test_interaction_primitives.cjs` assert that a keyboard nudge and a
 * pointer drag produce the same geometry, and that a corner can never be pulled
 * out of its own survey frame — both of which would be untestable tangled up with
 * pointer events.
 *
 * NOTHING HERE ROUNDS BY DEFAULT. The captured ring is at survey precision and a
 * drag should not silently quantise it; `snapMetres` (geometry.ts) exists for the
 * callers that want the decimetre behaviour, and the prototype passes 0 — which is
 * exactly the behaviour it had before this module existed.
 */
import { clampTo } from './springs';
import type { Vertex } from '../../services/boundaryIO';
import { snapMetres, type Bounds } from './geometry';

/** Keyboard step: a quarter metre, or a whole metre with Shift held. */
export const KEY_STEP_M = 0.25;
export const KEY_STEP_SHIFT_M = 1;

/** Arrow key → plane direction. Up is plane NORTH. */
export const ARROW_DELTAS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
};

/** The step for a key event, given whether a fine modifier is held. */
export const stepFor = (shiftKey: boolean): number => (shiftKey ? KEY_STEP_SHIFT_M : KEY_STEP_M);

/** A corner's new plane position, clamped into the survey frame. */
export function clampVertex(
  point: { x: number; y: number },
  bounds: Bounds,
  precisionM = 0,
): { x: number; y: number } {
  return {
    x: snapMetres(clampTo(point.x, bounds.minX, bounds.maxX), precisionM),
    y: snapMetres(clampTo(point.y, bounds.minY, bounds.maxY), precisionM),
  };
}

/**
 * The ring with one corner moved to `point` (clamped). Returns a NEW array —
 * the caller owns the draft, and an in-place edit here would make a stale render
 * possible.
 */
export function moveVertex(
  ring: ReadonlyArray<Vertex>,
  index: number,
  point: { x: number; y: number },
  bounds: Bounds,
  precisionM = 0,
): Vertex[] {
  const next = clampVertex(point, bounds, precisionM);
  return ring.map((vertex, i) => (i === index ? next : { x: vertex.x, y: vertex.y }));
}

/**
 * Drag delta → plane point. `dxPx`/`dyPx` are screen pixels since the gesture
 * began; screen down is plane SOUTH, so the y term is negated exactly once (the
 * same flip `toSvgY` performs for the drawing).
 */
export function draggedPoint(
  origin: { x: number; y: number },
  dxPx: number,
  dyPx: number,
  metresPerPx: number,
): { x: number; y: number } {
  return { x: origin.x + dxPx * metresPerPx, y: origin.y - dyPx * metresPerPx };
}

/**
 * One keyboard step. Returns the new ring and the spoken description of what
 * happened — the two things a nudge produces, computed in one place so the
 * pointer path and the keyboard path cannot drift apart.
 */
export function nudgeVertex(
  ring: ReadonlyArray<Vertex>,
  index: number,
  key: string,
  stepM: number,
  bounds: Bounds,
  precisionM = 0,
): Vertex[] | null {
  const delta = ARROW_DELTAS[key];
  if (!delta) return null;
  const current = ring[index];
  if (!current) return null;
  return moveVertex(
    ring,
    index,
    { x: current.x + delta[0] * stepM, y: current.y + delta[1] * stepM },
    bounds,
    precisionM,
  );
}

/**
 * The spoken summary after a drag ends: the measurement, and the SHIPPED module's
 * verdict on it. The verdict is passed in rather than computed here, because
 * `services/siteBoundary.metricsFor` is the only thing allowed to have an opinion
 * about whether a boundary is valid — a second rule here would be a second source
 * of truth about a statutory gate.
 */
export interface Measurement {
  areaSqm: number;
  perimeterM: number;
  valid: boolean;
  code?: string;
  reason?: string;
}

/** What to announce when a drag ends: the measurement, and the SHIPPED verdict. */
export function dragMessage(metrics: Measurement): string {
  const verdict = metrics.valid ? 'boundary valid' : `${metrics.code ?? 'invalid'}: ${metrics.reason ?? ''}`;
  return `Corner moved. Plot area ${metrics.areaSqm.toFixed(1)} square metres, perimeter ${metrics.perimeterM.toFixed(
    2,
  )} metres, ${verdict}`;
}

/** What to announce after a keyboard nudge: the step, then the measurement. */
export function nudgeMessage(index: number, stepM: number, metrics: Measurement): string {
  return `Corner ${index + 1} moved ${stepM} metres. Plot area ${metrics.areaSqm.toFixed(1)} square metres.`;
}
