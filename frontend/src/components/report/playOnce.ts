/**
 * playOnce.ts — "play this one-shot animation once per session" gate.
 * ==================================================================
 * The report animates on entrance: number count-ups (600–750 ms rAF loops that
 * re-render their tile every frame) and CSS staggers across whole card stacks.
 * A tab switch unmounts and remounts the pane, so both used to replay on every
 * visit — on Cost & Plan that was ~50 React commits spread over 600 ms per
 * switch, all of it re-rendering cards the reader had already seen.
 *
 * The rule now is the obvious one: an entrance animation plays when the reader
 * first sees the thing, and does not play again for that session. Position is
 * remembered in sessionStorage (so a reload keeps the promise) with an in-memory
 * set as the always-correct fallback when storage is unavailable.
 */

const PREFIX = 'bw.played.';
const decidedAt = new Map<string, number>();

/**
 * True the first time this key is asked for in the session, false after.
 *
 * `reentrancyMs` deliberately makes a repeat decision inside the same tick count
 * as "not played yet": React StrictMode mounts every component twice in
 * development, and without this the first mount would consume the flag and the
 * animation would never be visible while developing.
 */
export function shouldPlay(key: string, reentrancyMs = 300): boolean {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const last = decidedAt.get(key);
  if (last !== undefined && now - last < reentrancyMs) return true;
  decidedAt.set(key, now);
  try {
    if (sessionStorage.getItem(PREFIX + key) === '1') return false;
    sessionStorage.setItem(PREFIX + key, '1');
  } catch {
    /* storage unavailable — the in-memory decision above still holds */
  }
  return true;
}

/**
 * Class helper for the `bw-stagger` entrance: returns the animation class only
 * on the session's first visit to that stack, and an empty string afterwards.
 * The exit animation is CSS-only, so dropping the class costs nothing.
 */
export function staggerClassFor(key: string): string {
  return shouldPlay(key) ? 'bw-stagger' : '';
}
