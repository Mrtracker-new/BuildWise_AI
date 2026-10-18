/**
 * landing/format.ts — how the landing writes a number.
 *
 * TWO RULES, both learned from looking at the page rather than from taste:
 *
 *  1. **Tabular numerals.** A figure that changes while the reader watches — an
 *     area under a dragged corner, a count-up in the proof strip — shifts its
 *     own width with proportional digits, so every update nudges the layout
 *     around it. `FIG` is the class that fixes the digit advance (the app has the
 *     same rule for its readouts).
 *  2. **The unit is part of the figure.** `m2(195.04)` and `mM(56.0007)` format
 *     the way the product's own panels do (one decimal for areas under review,
 *     two for lengths, because a perimeter that reads "56 m" hides the change a
 *     drag just made). Formatting here rather than inline keeps a section from
 *     inventing a third precision for the same quantity.
 */

/** Class for any figure that updates in place. */
export const FIG = 'ui-font-tabular';

/** Square metres, one decimal. */
export const m2 = (value: number): string => `${value.toFixed(1)} m²`;

/** Metres, two decimals — a perimeter or a wall length. */
export const mM = (value: number): string => `${value.toFixed(2)} m`;

/** A count of items, with no unit ambiguity (used by count-ups). */
export const count = (value: number): string => Math.round(value).toLocaleString('en-IN');

/** A percentage, no decimals: "90 %" reads as a grade, "90.0 %" reads as a bug. */
export const pct = (value: number): string => `${Math.round(value)} %`;
