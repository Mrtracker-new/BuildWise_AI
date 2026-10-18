/**
 * interaction/springs.ts — the landing's spring vocabulary (P1) and the damped
 * follow used by the scroll-scrub engine (P4).
 *
 * PURE BY CONSTRUCTION. This module imports nothing — no React, no framer-motion,
 * no DOM — so `scripts/test_interaction_primitives.cjs` can import it in plain
 * node and *measure* the presets rather than trusting a comment about them. The
 * React bindings (`useStateSpring`, `useDampedScrub`) live in `./hooks`.
 *
 * WHY PRESETS AND NOT NUMBERS AT CALL SITES. A page that picks a stiffness where
 * it feels like it gets five different feels: this landing's audit found exactly
 * that pattern in its timed reveals — one card ran a hand-written transition on
 * framer's default spring while every other surface used the page's own curve.
 * Four named presets, each with a measured settle time, make "which spring is
 * this?" a question with an answer.
 *
 * ALL OF THEM ARE TRANSFORM-ONLY IN USE. A spring here produces a NUMBER; the
 * consumers turn it into a transform (`transformOnly`, below) or into an SVG
 * attribute — never into `width`/`top`/`height`. That keeps every frame
 * compositor work: `test_interaction_primitives.cjs` [1] asserts that the helper
 * every consumer uses cannot express a layout property.
 */

/** A framer-motion-compatible spring definition. */
export interface SpringPreset {
  readonly stiffness: number;
  readonly damping: number;
  readonly mass: number;
}

/**
 * The four presets. `settleMs` and `overshoot` are MEASURED at module load by
 * `simulateSpring` below (see the loop at the end of this file), not estimated:
 * they are what the response to a 0 → 1 step actually does. The comment on each
 * carries its damping ratio ζ = c / (2·√k), which decides whether it overshoots
 * at all — and a POSE spring should not, because a hero that bounces while the
 * reader moves the mouse across it reads as unserious.
 */
export interface NamedSpring extends SpringPreset {
  /** Measured settle time to ±1 %, in milliseconds. */
  settleMs: number;
  /** Measured peak overshoot past the target, as a fraction of the travel. */
  overshoot: number;
  /** What this preset is FOR — the only reason it exists. */
  readonly use: string;
}

/** 170/26 · ζ 0.997 — a pose following the pointer. Essentially no overshoot. */
export const SPRING_POSE: NamedSpring = {
  stiffness: 170,
  damping: 26,
  mass: 1,
  settleMs: 0,
  overshoot: 0,
  use: 'a pose that follows the pointer (the hero assembly tilt)',
};

/** 320/30 · ζ 0.838 — answering a gesture the reader just made. */
export const SPRING_SNAPPY: NamedSpring = {
  stiffness: 320,
  damping: 30,
  mass: 1,
  settleMs: 0,
  overshoot: 0,
  use: 'a value answering a gesture the reader just made (drag start, a corner returning)',
};

/** 300/28 · ζ 0.808 — the existing landing preset for chips, buttons, toggles. */
export const SPRING_INTERACTIVE: NamedSpring = {
  stiffness: 300,
  damping: 28,
  mass: 1,
  settleMs: 0,
  overshoot: 0,
  use: 'small controls (chips, toggles) — mirrors landing/motion.ts SPRING_INTERACTIVE',
};

/** 260/30 · ζ 0.930 — a large surface arriving (a panel or window). */
export const SPRING_SOFT: NamedSpring = {
  stiffness: 260,
  damping: 30,
  mass: 1,
  settleMs: 0,
  overshoot: 0,
  use: 'a large surface arriving (a panel, a window) — mirrors landing/motion.ts SPRING_SOFT',
};

export interface SpringSample {
  /** Frame times in ms, from the step. */
  t: number[];
  /** The response, for a step from 0 to 1. */
  x: number[];
  /** First frame after which the response stays inside ±1 % forever. */
  settleMs: number;
  /** Peak overshoot past the target, as a fraction of the travel. */
  overshoot: number;
}

/**
 * The step response of a spring, integrated at a fixed sub-step inside each
 * display frame and sampled once per frame — which is the shape framer actually
 * runs, not an idealised continuous system.
 *
 * WHY THIS LIVES IN PRODUCTION CODE. Two reasons, both real:
 *
 *  1. The settle times and overshoots published on the presets above are
 *     produced by it. Without it they would be `4 / (ζ·ω₀)` estimates, which is a
 *     rule of thumb: for ζ near 1 it is wrong in the second digit.
 *  2. `scripts/test_interaction_primitives.cjs` uses it to hold the presets to
 *     their documented behaviour, so raising a stiffness later has to keep the
 *     settle time the preset claims.
 *
 * Semantics: a step from 0 to 1 with zero initial velocity — exactly what a pose
 * does when the pointer enters the window at its left edge. `dt` is the frame
 * interval (16.67 ms at 60 Hz); each frame is integrated in `subSteps` equal
 * sub-steps so a stiff spring cannot be made to overshoot by the integrator.
 */
export function simulateSpring(
  preset: SpringPreset,
  options: { durationMs?: number; hz?: number; subSteps?: number } = {},
): SpringSample {
  const durationMs = options.durationMs ?? 2500;
  const hz = options.hz ?? 60;
  const subSteps = options.subSteps ?? 16;
  const frameMs = 1000 / hz;
  const dt = frameMs / subSteps / 1000; // seconds per sub-step

  const t: number[] = [];
  const x: number[] = [];
  let position = 0;
  let velocity = 0;
  let peak = 0;
  let candidate: number | null = null;
  let settleMs = Number.POSITIVE_INFINITY;

  const frames = Math.round(durationMs / frameMs);
  for (let frame = 0; frame <= frames; frame++) {
    for (let s = 0; s < subSteps; s++) {
      const accel = -preset.stiffness * (position - 1) - preset.damping * velocity;
      velocity += (accel / preset.mass) * dt;
      position += velocity * dt;
    }
    const ms = frame * frameMs;
    t.push(ms);
    x.push(position);
    peak = Math.max(peak, position);

    if (Math.abs(position - 1) <= 0.01) {
      /* Start the candidate clock on the first frame inside the band… */
      if (candidate === null) candidate = ms;
    } else {
      /* …and abandon it the moment it leaves, because "settled" means it never
         comes back out. */
      candidate = null;
    }
    settleMs = candidate === null ? Number.POSITIVE_INFINITY : candidate;
  }

  return { t, x, settleMs, overshoot: Math.max(0, peak - 1), };
}

/* Measure once, at load: the constants stay literals above (greppable, and no
   circular reference), while the numbers they publish are the real response. */
for (const preset of [SPRING_POSE, SPRING_SNAPPY, SPRING_INTERACTIVE, SPRING_SOFT]) {
  const measured = simulateSpring(preset);
  preset.settleMs = Math.round(measured.settleMs);
  preset.overshoot = Number(measured.overshoot.toFixed(4));
}

/** Clamp to [-1, 1]. The parallax cap: amplitude IS the ceiling (P2). */
export const clampUnit = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return value < -1 ? -1 : value > 1 ? 1 : value;
};

/** Clamp to a range, order-tolerant. A non-finite input collapses to `lo`. */
export const clampTo = (value: number, lo: number, hi: number): number => {
  if (!Number.isFinite(value)) return lo;
  const a = Math.min(lo, hi);
  const b = Math.max(lo, hi);
  return value < a ? a : value > b ? b : value;
};

/**
 * The transform allowlist. A spring produces a number; this is the only shape a
 * consumer may turn it into. `translate*`/`rotate*`/`scale` are compositor work;
 * `width`/`top`/`margin` would invalidate layout every frame — the one way this
 * page could spend a frame *and* a CLS point at the same time.
 */
export const TRANSFORM_KEYS = [
  'x',
  'y',
  'z',
  'rotate',
  'rotateX',
  'rotateY',
  'scale',
  'scaleX',
  'scaleY',
  'translateX',
  'translateY',
  'translateZ',
] as const;

export type TransformKey = (typeof TRANSFORM_KEYS)[number];
export type SpringTransform = Partial<Record<TransformKey, number>>;

/**
 * Pass a transform through, DROPPING anything that is not a transform and saying
 * so. A dropped key is a programming error rather than a runtime condition, so it
 * is loud in development and harmless in production.
 */
export function transformOnly(input: SpringTransform & Record<string, unknown>): SpringTransform {
  const out: SpringTransform = {};
  for (const [key, value] of Object.entries(input)) {
    if ((TRANSFORM_KEYS as readonly string[]).includes(key) && typeof value === 'number' && Number.isFinite(value)) {
      (out as Record<string, number>)[key] = value;
    } else if (value !== undefined) {
      console.warn(`[landing/interaction] dropped non-transform spring key "${key}"`);
    }
  }
  return out;
}

/**
 * The damped follow behind the scroll-scrub engine (P4).
 *
 * An exponential approach rather than a spring, deliberately: a scrub value is
 * *driven* — its target may change every frame — and a spring carrying velocity
 * into a new target overshoots, which on a scroll-linked layer reads as the page
 * lagging and then catching up. Exponential smoothing has no momentum, never
 * overshoots, and its per-frame factor is derived from elapsed time, so the same
 * `tau` behaves identically at 60 Hz and at 120 Hz.
 *
 * `tau` is the time constant in seconds: after `tau` the remaining distance is
 * ~37 %, after 3·tau ~5 %. The default (0.09 s) is tuned to be felt as weight
 * rather than as lag — the reason the brief forbids a raw 1:1 binding.
 */
export function dampedFollow(current: number, target: number, dtSeconds: number, tau = 0.09): number {
  if (!Number.isFinite(current)) return Number.isFinite(target) ? target : 0;
  if (!Number.isFinite(target)) return current;
  const dt = dtSeconds > 0 && dtSeconds < 1 ? dtSeconds : 1 / 60;
  const factor = 1 - Math.exp(-dt / Math.max(0.001, tau));
  return current + (target - current) * clampTo(factor, 0, 1);
}

/**
 * A monotone copy: it follows a progress value forward and holds what it has
 * seen on the way back up.
 *
 * WHY THE ENGINE NEEDS IT. A scrubbed set piece that un-builds when the reader
 * scrolls back reads as a bug rather than as a rewind — the recorded failure on
 * this page was a plan that reported itself *finished* at the top of the document
 * because one bad measurement frame latched progress to 1. Latching is therefore
 * paired with `progressFromBand`'s no-layout guard in the hook.
 */
export const latch = (previous: number, next: number): number =>
  Number.isFinite(next) && next > previous ? next : previous;
