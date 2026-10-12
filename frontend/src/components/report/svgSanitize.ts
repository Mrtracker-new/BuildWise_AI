/**
 * svgSanitize.ts — blueprint SVG sanitizer + ghost-overlay invariant gate.
 * ========================================================================
 * Extracted from BlueprintViewer so the ghost overlay contract is a pure,
 * testable rule rather than an inline expression:
 *
 *   GHOST OVERLAY CONTRACT — the F0 anchor core is already drawn on every
 *   sheet, so the ghost (upper-floor core collapse) overlay is meaningless on
 *   the ground floor. It is injected ONLY when `safeFloorIndex > 0` AND the
 *   user toggled it on. Both directions hold: ON at F0 renders false, OFF at
 *   F1+ renders false.
 */

/** The gate. True only when the toggle is on AND an upper floor is active. */
export function isGhostOverlayVisible(showGhostOverlay: boolean, safeFloorIndex: number): boolean {
  return Boolean(showGhostOverlay) && safeFloorIndex > 0;
}

/** The `!important` override pair. Hidden is the default and the safe state. */
const GHOST_CSS_VISIBLE = '.ghost-core-overlay { display: block !important; opacity: 1 !important; }';
const GHOST_CSS_HIDDEN =
  '.ghost-core-overlay { display: none !important; opacity: 0 !important; visibility: hidden !important; }';

/**
 * Strips scripts and inline handlers from a server-authored blueprint sheet,
 * then injects the fit + ghost-overlay styling and the `data-ghost-overlay`
 * provenance flag that mirrors `ghostVisible`.
 */
export function sanitizeBlueprintSvg(
  activeSvg: string | null | undefined,
  ghostVisible: boolean
): string {
  if (!activeSvg) return '';
  const cleaned = activeSvg
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');

  // Sheets are authored at a fixed pixel size (a portrait site plan runs ~2500px
  // tall); the preview box and the modal are both shorter than that, so the lower
  // half of a tall sheet used to be cut off even at the smallest zoom. Constrain
  // the sheet to its container instead: it scales down to fit and the ratio holds.
  const styleInjection = `
      <style>
        ${ghostVisible ? GHOST_CSS_VISIBLE : GHOST_CSS_HIDDEN}
        .bw-sheet-fit { max-width: 100%; max-height: 100%; width: auto; height: auto; }
      </style>
    `;

  if (cleaned.includes('<svg')) {
    return cleaned.replace(
      /<svg\b([^>]*)>/i,
      `<svg $1 class="bw-sheet-fit" data-ghost-overlay="${ghostVisible ? 'true' : 'false'}">${styleInjection}`
    );
  }
  return cleaned;
}
