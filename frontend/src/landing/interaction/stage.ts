/**
 * interaction/stage.ts — P6, the sticky-stage controller's pure half.
 *
 * WHAT A STAGE IS. One element that stays on screen while the reader scrolls
 * through a runway, with a sequence of beats scrubbed by that one progress value.
 * The runway is REAL height (a declared element), never a fabricated
 * `intrinsic-size` seed: this landing has already been burned by
 * `content-visibility: auto` with a 720 px seed, which made the document measure
 * 3 044 px on load and 2 514 px after a full scroll, so anchor jumps landed in the
 * wrong place. That failure is why the anchor-landing invariant is measured in
 * the browser harness (`scripts/interaction_probe.cjs` [6]) against the sections
 * that exist today, and why `runwayHeight` below is a plain sum rather than a
 * clever measurement.
 *
 * NO SCROLL-JACKING, NO JS PINNING. `position: sticky` does the pinning, the page
 * scrolls natively, and the beats are sub-bands of ONE progress value — so the
 * order of the beats holds at every scroll speed instead of being enforced by
 * independent timers a fast reader can outrun.
 *
 * PURE: no React, no DOM.
 */

/** How much scroll one beat is worth, as a fraction of the viewport height. */
export const SCROLL_PER_BEAT = 0.8;

/**
 * Runway height for a stage: the stage itself, plus one scroll-length per
 * additional beat. One beat needs no runway (it is just a scrubbed layer); two
 * beats need one beat's worth of travel, and so on.
 */
export const runwayHeight = (stageHeightPx: number, beats: number, viewportHeightPx: number): number =>
  Math.max(0, stageHeightPx) +
  Math.max(0, beats - 1) * SCROLL_PER_BEAT * Math.max(1, viewportHeightPx);

export interface BeatPosition {
  /** 0-based index of the beat that owns this progress value. */
  index: number;
  /** Progress WITHIN that beat, 0 → 1. */
  local: number;
}

/**
 * Which beat a stage progress value is in, and how far through it.
 *
 * The partition is exact and gapless: beat `i` owns `[i/n, (i+1)/n)`, the first
 * beat includes 0, and the last beat includes 1 — so no progress value is
 * unowned, no value is owned twice, and the sequence cannot run backwards while
 * the reader scrolls forwards. `beats < 1` collapses to a single beat.
 */
export function beatFor(progress: number, beats: number): BeatPosition {
  const count = Math.max(1, Math.floor(beats));
  const p = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  if (count === 1) return { index: 0, local: p };
  const scaled = p * count;
  const index = Math.min(count - 1, Math.floor(scaled));
  return { index, local: Math.min(1, Math.max(0, scaled - index)) };
}

/** The sub-band of one beat, for `useBand`-style remapping. */
export const beatBand = (index: number, beats: number): { from: number; to: number } => {
  const count = Math.max(1, Math.floor(beats));
  return { from: index / count, to: (index + 1) / count };
};

/**
 * The sticky offset for a stage: how far down the viewport the stage sits while
 * it is pinned. A stage that owns the reader's attention sits at the top of the
 * content area, below the floating nav — which is the same clearance the sections
 * use (`scroll-mt-24`), passed in rather than assumed.
 */
export const stickyTop = (navClearancePx: number): number => Math.max(0, navClearancePx);
