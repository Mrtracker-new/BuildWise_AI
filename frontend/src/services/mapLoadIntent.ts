/**
 * mapLoadIntent.ts — WHEN the map engine may be fetched.
 * ======================================================
 * The map engine (MapCanvas + MapLibre: ~289 KB gz and **3 524 ms of bootup on
 * a simulated mid-range phone CPU**) used to start
 * loading on mount for every device. That is the right trade on a desktop: the
 * map IS the workspace, the chunk arrives while the shell paints, and the first
 * pan feels instant. It is the wrong trade on a phone, where the same bootup
 * sits on the critical path of the first paint and of every interaction after
 * it (mobile Lighthouse TBT 1 265 ms, LCP 8.1 s — both traced to this chunk).
 *
 * So on a narrow viewport (below `lg`) or a touch-first device below `xl`, the
 * dynamic import is deferred until the reader shows INTENT:
 *
 *   • a trusted `pointerdown` or `keydown` inside the map region, or
 *   • the map region entering the viewport (IntersectionObserver entry).
 *
 * Until then the region shows a stable placeholder (MapPlaceholder.tsx), so
 * nothing about the first view — or the first interaction — depends on the
 * engine. Desktop keeps the eager path exactly as it was.
 *
 * THE DECISION IS MADE ONCE, at mount, from the viewport the session starts in,
 * and is never re-evaluated on resize: a map that is already up must not be
 * unmounted by an orientation change or a window drag, and browsers fire resize
 * during start-up. The intent listeners, by contrast, are live — they are the
 * only thing standing between the placeholder and the engine.
 */
import { useEffect, useState, type RefObject } from 'react';

/**
 * Narrow-viewport edge: below `lg` the engine always waits for intent.
 *
 * These two edges are WRITTEN OUT rather than imported from design/breakpoints
 * so this module stays loadable by the type-stripping test runner
 * (scripts/test_map_intent.cjs resolves files, not extensionless specifiers).
 * They are the same edges the tier policy uses — BP.lg and BP.xl — and the unit
 * test pins both numbers against the breakpoints source, so a drift fails loudly.
 */
export const MAP_DEFER_WIDTH_MAX = 1024; // = BP.lg
export const MAP_DEFER_COARSE_WIDTH_MAX = 1440; // = BP.xl

/**
 * Pure decision, so it can be tested without a browser.
 *
 * `coarsePointer` is the PRIMARY pointer (the app's own `(pointer: coarse)`
 * contract — see design/breakpoints.ts). A mouse-first machine reports fine even
 * when it has a touch screen, and keeps the eager path.
 */
export function shouldDeferMapLoad(width: number, coarsePointer: boolean): boolean {
  if (!Number.isFinite(width)) return true; // unknown viewport → assume the small one
  if (width < MAP_DEFER_WIDTH_MAX) return true;
  return coarsePointer && width < MAP_DEFER_COARSE_WIDTH_MAX;
}

/** The primary pointer's kind, through the same matchMedia contract as the rest. */
export function primaryPointerIsCoarse(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(pointer: coarse)').matches;
}

/**
 * The boot decision. Called once, from the first render: what the viewport was
 * when the session started is what decides, not what a later resize makes of it.
 */
export function mapLoadDeferredAtBoot(): boolean {
  if (typeof window === 'undefined') return true;
  return shouldDeferMapLoad(window.innerWidth, primaryPointerIsCoarse());
}

export interface MapLoadIntent {
  /** True when this session starts on a device the engine must not load eagerly for. */
  deferred: boolean;
  /** True once the reader has shown intent — and always true when not deferred. */
  engaged: boolean;
}

/**
 * Arm the intent listeners over the map region.
 *
 * `regionRef` is the element the intent has to happen INSIDE. The listeners are
 * capture-phase on the document so the reader's gesture is seen before any map
 * overlay or wizard scrim stops propagation — a tap on the capture wizard that
 * covers the region still counts, because that is where the reader tapped.
 */
export function useMapLoadIntent(regionRef: RefObject<HTMLElement | null>): MapLoadIntent {
  const [deferred] = useState<boolean>(mapLoadDeferredAtBoot);
  const [engaged, setEngaged] = useState<boolean>(false);

  useEffect(() => {
    if (!deferred || engaged) return;
    const region = regionRef.current;
    if (!region) return;

    const engage = (): void => setEngaged(true);
    const isInside = (target: EventTarget | null): boolean =>
      target instanceof Node && region.contains(target);

    const onPointerDown = (event: PointerEvent): void => {
      if (isInside(event.target)) engage();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isInside(event.target)) engage();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);

    /**
     * INTERSECTION, NOT "IS VISIBLE NOW".
     *
     * The map region is `fixed inset-0` on every tier, so the observer's FIRST
     * callback — the state at observe() time — is always `isIntersecting: true`.
     * Honouring that snapshot would load the engine during start-up and make
     * this whole module decorative: an eager-init escape in everything but name.
     * Only a real TRANSITION into view counts. That is the case this trigger
     * exists for (a layout where the map starts below the fold, e.g. a stacked
     * phone layout), and it cannot fire during start-up on the current one.
     */
    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver === 'function') {
      let first = true;
      observer = new IntersectionObserver((entries) => {
        if (first) {
          first = false;
          return;
        }
        for (const entry of entries) {
          if (entry.isIntersecting) {
            engage();
            return;
          }
        }
      });
      observer.observe(region);
    }

    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      observer?.disconnect();
    };
  }, [deferred, engaged, regionRef]);

  return { deferred, engaged };
}
