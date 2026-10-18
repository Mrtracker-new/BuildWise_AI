/**
 * interaction/pointer.ts — P2 (pointer parallax) and P3 (tilt + specular), the
 * pure half. The React bindings are in `./hooks`.
 *
 * WHY THE CLAMP IS NOT OPTIONAL, AND WHY IT COMES BEFORE ANY CURVE. On a wide
 * monitor the raw normalized position is ±1 by definition at the edges, so an
 * easing curve applied on top of it would spend most of the screen pinned at the
 * end of its travel. Here the AMPLITUDE is the cap and the normalized value is
 * the signal — one multiplication, no curve — so the pose *cannot* exceed what
 * the design allows, at any window size, on any input, including a synthetic one.
 */

import { clampTo, clampUnit } from './springs';

/** A viewport, in CSS pixels. */
export interface Frame {
  width: number;
  height: number;
}

/** Degrees of device tilt that map to full parallax amplitude. */
export const ORIENTATION_RANGE_DEG = 40;

/**
 * The device's natural reading angle. `beta` is 0 when the phone is flat on a
 * table and 90 when it is upright, so 45° is "held in a hand"; the offset from it
 * is the signal, which is why a phone opened at an angle does not begin with a
 * fully deflected pose.
 */
export const REST_BETA_DEG = 45;

/** Pointer position in `[-1, 1]` on both axes, clamped. `(0,0)` is the centre. */
export function normalizePointer(clientX: number, clientY: number, frame: Frame): { nx: number; ny: number } {
  const w = Math.max(1, frame.width);
  const h = Math.max(1, frame.height);
  return {
    nx: clampUnit((clientX / w) * 2 - 1),
    ny: clampUnit((clientY / h) * 2 - 1),
  };
}

/** The pose a pointer position asks for, in degrees — already inside ±amplitude. */
export function parallaxTarget(
  normalized: { nx: number; ny: number },
  amplitude: { x: number; y: number },
): { x: number; y: number } {
  return { x: clampUnit(normalized.nx) * amplitude.x, y: clampUnit(normalized.ny) * amplitude.y };
}

/**
 * The device's tilt as the same kind of target. `absolute` orientation is
 * preferred when the browser provides it (the pose is then relative to the
 * ground rather than to however the phone happened to be held when the page
 * opened); the relative fallback is clamped hard because relative values start
 * wherever the device started.
 */
export function tiltFromOrientation(
  gamma: number | null,
  beta: number | null,
  amplitude: { x: number; y: number },
): { x: number; y: number } {
  const g = gamma ?? 0;
  const b = beta ?? REST_BETA_DEG;
  return {
    x: clampUnit(g / ORIENTATION_RANGE_DEG) * amplitude.x,
    y: clampUnit((b - REST_BETA_DEG) / ORIENTATION_RANGE_DEG) * amplitude.y,
  };
}

/**
 * The specular light's offset, in CSS pixels, for a cursor-tracked highlight on
 * a box of `boxWidth`.
 *
 * A FIXED-SIZE radial gradient that is TRANSLATED, not a `background-position`
 * that moves: moving a gradient's position repaints the layer every frame, and
 * translating an already-painted layer composites. The factors (0.34 / 0.20) keep
 * the highlight inside the box, so the light reads as a material rather than as
 * a bright blob parked in the middle of a rest frame.
 */
export function specularOffset(normalized: { nx: number; ny: number }, boxWidth: number): { x: number; y: number } {
  /* The pose's own amplitude CANCELS here: the highlight is a fraction of the box,
     because it describes where the pointer is over a surface — not how far the
     surface has turned. (Dividing by amplitude, as the first cut did, made the
     highlight's size depend on the pose, and produced Infinity when the pose was
     disabled for a zero amplitude.) */
  return {
    x: clampUnit(normalized.nx) * boxWidth * 0.34,
    y: clampUnit(normalized.ny) * boxWidth * 0.20,
  };
}

/** The highlight's radius for a box of `boxWidth` — a fixed size, never scaled. */
export const specularRadius = (boxWidth: number): number => Math.round(boxWidth * 0.62);

/**
 * A card's tilt for a pointer position: `rotateX`/`rotateY` in degrees, capped by
 * `maxDeg` on BOTH axes.
 *
 * Note the sign convention, because it is the one thing that makes a tilt read as
 * a physical object: the card leans AWAY from the pointer (a pointer at the top
 * of the card pushes the top edge back), so `rotateX` takes the negated y.
 */
export function tiltCard(
  normalized: { nx: number; ny: number },
  maxDeg: number,
): { rotateX: number; rotateY: number } {
  const cap = Math.abs(maxDeg);
  const lean = clampUnit(normalized.nx) * cap;
  const pitch = clampUnit(normalized.ny) * cap;
  return { rotateX: -pitch, rotateY: lean };
}

/** Metres per CSS pixel for a box of `boxWidth` showing `planeWidthM`. */
export const metresPerPixel = (planeWidthM: number, boxWidth: number): number =>
  planeWidthM / Math.max(1, boxWidth);

/** Screen pixels → plane metres: screen down is plane SOUTH (one negation). */
export const screenDeltaToPlane = (
  dxPx: number,
  dyPx: number,
  mdPerPx: number,
): { dxM: number; dyM: number } => ({ dxM: dxPx * mdPerPx, dyM: -dyPx * mdPerPx });

/** Keep a value inside a range; re-exported so call sites import one name. */
export const within = clampTo;
