/**
 * interaction/scrub.ts — P4, the pure half of the scroll-scrub engine.
 *
 * THE CONTRACT, IN ORDER OF IMPORTANCE (the brief's "no raw 1:1, no jitter"):
 *
 *  1. A transform is never bound to `scrollY` directly. A scroll value is
 *     remapped through a BAND — `progressFromBand` — and then damped
 *     (`springs.dampedFollow`), so the layer answers the scroll rather than
 *     echoing it.
 *  2. A band is expressed as two viewport fractions, against the element's TOP
 *     edge only, so it does not care how tall the element is: the same numbers
 *     work for a 700 px window and a 90 px legend.
 *  3. The motion FINISHES before the content is being read. The default band runs
 *     from 92 % of the viewport (a sliver showing at the bottom) to 55 % (the
 *     reading line), so nothing settles under the reader's eye.
 *  4. A frame in which the element has NO LAYOUT returns `null` — no opinion.
 *     This is the recorded failure the whole guard exists for: `useScroll({target})`
 *     reports a top edge of 0 for an element with no height, and on a band that
 *     begins at the bottom of the viewport top 0 means progress 1, which latched a
 *     scrubbed set piece to "finished" before a reader had seen any of it.
 *  5. Under `prefers-reduced-motion` a consumer reports the SETTLED END rather
 *     than 0, so it renders its finished state and there is nothing left to
 *     animate. That is the difference between a fallback and a broken page.
 *
 * PURE: no React, no framer-motion, no DOM. The hooks live in `./hooks`, and
 * `landing/scrollLink.ts` derives its framer offset strings from the band
 * constants here so the numbers exist once.
 */

/** The entry band every ordinary scrubbed layer obeys: 92 % → 55 % of the viewport. */
export const ENTRY_BAND = { from: 0.92, to: 0.55 } as const;

/**
 * The set-piece band: 100 % → 40 % of the viewport. A set piece has a sequence in
 * it (boundary, vertices, pin, chips) and the entry band is only 37 % of a
 * viewport — about 0.6 s at a normal scroll — which is over before the pin has
 * landed. It ENDS at 40 % rather than 55 % because a set piece is usually the
 * lower half of a window, so a reader who has settled it on screen has its top
 * edge around 35–45 %.
 */
export const SETPIECE_BAND = { from: 1, to: 0.4 } as const;

export interface Band {
  /** Viewport fraction at which progress is 0 (the element's top edge). */
  readonly from: number;
  /** Viewport fraction at which progress is 1. Must be less than `from`. */
  readonly to: number;
}

/**
 * framer-motion's `offset` pair for a band, so a band has exactly one spelling.
 *
 * Typed as a template-literal pair rather than `[string, string]` on purpose:
 * framer's own `ScrollOffset` is a union of template-literal types, so a consumer
 * that passes a band's offsets to `useScroll` would otherwise have to cast. The
 * type is what makes `scrollLink.ts` able to take its bands from here.
 */
export const bandOffset = (band: Band): [`start ${number}`, `start ${number}`] => [
  `start ${band.from}`,
  `start ${band.to}`,
];

/**
 * Progress (0 → 1) for an element's journey across a band, measured from its own
 * geometry. Returns `null` when the element has no layout.
 */
export function progressFromBand(
  topPx: number,
  heightPx: number,
  viewportHeightPx: number,
  band: Band = ENTRY_BAND,
): number | null {
  if (!(heightPx > 0)) return null;
  const viewport = viewportHeightPx > 0 ? viewportHeightPx : 1;
  const travel = band.from - band.to;
  if (!(travel > 0)) return 0;
  const raw = (viewport * band.from - topPx) / (viewport * travel);
  return raw < 0 ? 0 : raw > 1 ? 1 : raw;
}

/** Progress for an element as the DOM reports it, or `null` for no layout. */
export function progressFromRect(rect: { top: number; height: number }, viewportHeightPx: number, band?: Band): number | null {
  return progressFromBand(rect.top, rect.height, viewportHeightPx, band);
}

/**
 * How much a noisy input's jitter is attenuated, as a ratio. Used by the unit
 * harness: feed a scroll signal with ±3 px of noise through `dampedFollow` and
 * assert the output's second difference is a fraction of the input's, which is
 * what "no jitter" means numerically.
 */
export function jitter(series: readonly number[]): number {
  let worst = 0;
  for (let i = 2; i < series.length; i++) {
    worst = Math.max(worst, Math.abs(series[i] - 2 * series[i - 1] + series[i - 2]));
  }
  return worst;
}

/** True when a series never decreases (a latched progress must satisfy this). */
export function isMonotone(series: readonly number[]): boolean {
  for (let i = 1; i < series.length; i++) if (series[i] < series[i - 1] - 1e-9) return false;
  return true;
}

/**
 * Whole-pixel rounding, applied where a value lands on a 1 px hairline or on small
 * type: a fractional offset resamples each rule across its own pixel and the lines
 * visibly shimmer, which reads as a broken texture rather than as paper.
 */
export const toWholePixels = (value: number): number => (Number.isFinite(value) ? Math.round(value) : 0);

/** A drift offset: a fixed layer moves up at `factor` × the scroll (negative = distant). */
export const driftOffset = (scrollY: number, factor: number): number => toWholePixels(scrollY * factor);
