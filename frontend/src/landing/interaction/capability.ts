/**
 * interaction/capability.ts — P7, the capability gate (pure half).
 *
 * The single place the landing asks "am I allowed to be expensive?", so no
 * section invents its own rule. The React binding (`useCapability`) is in
 * `./hooks`; everything decidable from plain values lives here so
 * `scripts/test_interaction_primitives.cjs` can assert all sixteen combinations
 * of the four flags.
 *
 * THE POINT OF THE SPLIT, AND WHY EACH FLAG DISABLES A DIFFERENT THING:
 *
 *   reduced  — prefers-reduced-motion. The reader asked for no animation, so the
 *              page shows the COMPOSED REST FRAME. Motion that the reader drives
 *              themselves (a drag, a scroll position) is not animation and is
 *              kept: that is why `drag` survives here and `pose` does not.
 *   saveData — navigator.connection.saveData. The reader pays for bytes, so
 *              nothing extra is fetched (no blueprint sheets, no poster images).
 *   lowMemory— deviceMemory < 4 GiB, the programme's stated floor. Extra work is
 *              refused: no pointer tracking, no multi-plane composition.
 *   coarse   — no hover, no precise pointer. Parallax has no input, so it is off
 *              and the device's own orientation is used instead; `tilt` (a hover
 *              affordance) is off as well.
 *
 * A gate that treated all four the same way would either do far too much on a
 * cheap phone or far too little for someone who merely prefers a still page.
 */

/** `navigator.deviceMemory` below this is treated as a low-memory device. */
export const MEMORY_FLOOR_GIB = 4;

/**
 * Device pixel ratio is clamped for the work the landing does (no canvas, no
 * WebGL): above 2 the extra device pixels buy nothing that survives the
 * compositor, and every layer the browser keeps is costlier. Consumers read
 * `dpr` instead of `window.devicePixelRatio` so the clamp cannot be bypassed.
 */
export const DPR_CAP = 2;

/** Everything the gate reads, as plain values (so it is testable without a browser). */
export interface CapabilityInput {
  readonly reducedMotion: boolean;
  readonly saveData: boolean;
  /** `navigator.deviceMemory`, or `undefined` where the browser withholds it. */
  readonly deviceMemory?: number;
  readonly coarsePointer: boolean;
  readonly devicePixelRatio: number;
}

/** What a section may do. Every field is a permission, not a description. */
export interface Capability {
  /** prefers-reduced-motion — no pose change, no scrub motion, no tilt. */
  readonly reduced: boolean;
  /** The reader is metered — fetch nothing extra. */
  readonly saveData: boolean;
  /** Under MEMORY_FLOOR_GIB — refuse extra work. */
  readonly lowMemory: boolean;
  /** No hover, no precise pointer. */
  readonly coarse: boolean;
  /** Any of the three "do less" flags: compose the rest frame and stop. */
  readonly staticOnly: boolean;
  /** Device pixel ratio, clamped to DPR_CAP. */
  readonly dpr: number;
  /** May the assembly take a pointer-driven pose? */
  readonly pose: boolean;
  /** May the pointer move depth planes? */
  readonly parallax: boolean;
  /** May a card tilt and carry a specular light? */
  readonly tilt: boolean;
  /** May sheets and posters be fetched on demand? */
  readonly fetchArtifacts: boolean;
  /** May a scrub follow the scroll with damping? (Always yes; see `motion`.) */
  readonly scrub: boolean;
  /** May anything be animated at all — false under reduced motion. */
  readonly motion: boolean;
  /** May the reader drag geometry? True in EVERY rung: position is not animation. */
  readonly drag: boolean;
}

export function resolveCapability(input: CapabilityInput): Capability {
  const reduced = Boolean(input.reducedMotion);
  const saveData = Boolean(input.saveData);
  const lowMemory = typeof input.deviceMemory === 'number' && input.deviceMemory < MEMORY_FLOOR_GIB;
  const coarse = Boolean(input.coarsePointer);
  const staticOnly = reduced || saveData || lowMemory;

  return {
    reduced,
    saveData,
    lowMemory,
    coarse,
    staticOnly,
    dpr: Math.min(Math.max(1, input.devicePixelRatio || 1), DPR_CAP),
    /* A pose needs a precise pointer AND a reader who wants motion AND a machine
       that can afford the tracking. */
    pose: !staticOnly && !coarse,
    parallax: !staticOnly && !coarse,
    /* Tilt is a hover affordance: a coarse pointer can never trigger it. */
    tilt: !staticOnly && !coarse,
    fetchArtifacts: !saveData,
    /* A scrub is the reader's own scroll position, damped — so it survives
       reduced motion only in its SETTLED form (see `progressFromBand`). The flag
       says the hook may run; `reduced` decides what it reports. */
    scrub: true,
    motion: !reduced,
    drag: true,
  };
}

/**
 * The list of what this rung costs the reader, in words — used by the prototype's
 * reviewer note and by the unit test, which asserts that each flag flips ITS OWN
 * entries and no others.
 */
export function degradations(capability: Capability): string[] {
  const off: string[] = [];
  if (capability.reduced) off.push('motion: rest frame only (pose, scrub, tilt)');
  if (capability.saveData) off.push('bytes: artifacts are not fetched');
  if (capability.lowMemory) off.push('work: pointer tracking and multi-plane composition');
  if (capability.coarse) off.push('pointer: parallax and hover tilt (device tilt used instead)');
  if (capability.dpr < DPR_CAP) off.push(`detail: dpr clamped to ${capability.dpr}`);
  return off;
}

/** The single value a component can render to say which rung it is in. */
export const rungOf = (capability: Capability): 'full' | 'static' => (capability.staticOnly ? 'static' : 'full');
