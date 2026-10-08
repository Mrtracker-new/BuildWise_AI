/**
 * breakpoints.ts — spec breakpoint constants + live viewport hooks.
 * ===================================================================
 * Single source for the responsive spec (matches tailwind.config.js):
 *   xs <480 | sm 480-767 | md 768-1023 | lg 1024-1439 | xl >=1440
 * Capability tiers (authoring precision policy):
 *   FULL >=1024 | ADAPTIVE 768-1023 | COMPACT <768
 *
 * Detection contract: matchMedia + live resize listeners ONLY.
 * No user-agent sniffing anywhere in this module.
 */
import { useEffect, useState } from 'react';

/** Pixel edges aligned with tailwind.config.js screens. */
export const BP = {
  xs: 480,
  sm: 480,
  md: 768,
  lg: 1024,
  xl: 1440,
} as const;

export type ViewportClass = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/** Ordered narrow→wide; index = class index. */
export const VIEWPORT_CLASS_ORDER: readonly ViewportClass[] = ['xs', 'sm', 'md', 'lg', 'xl'];

/** Width → viewport class (pure; also unit-testable). */
export function viewportClassFor(width: number): ViewportClass {
  if (width < BP.sm) return 'xs';
  if (width < BP.md) return 'sm';
  if (width < BP.lg) return 'md';
  if (width < BP.xl) return 'lg';
  return 'xl';
}

/** Authoring capability tier for a viewport class (pure). */
export type CapabilityTier = 'COMPACT' | 'ADAPTIVE' | 'FULL';

export function tierFor(width: number): CapabilityTier {
  if (width >= BP.lg) return 'FULL';
  if (width >= BP.md) return 'ADAPTIVE';
  return 'COMPACT';
}

/* ------------------------------------------------------------------ */
/* Hooks — live, listener-driven, SSR-safe                             */
/* ------------------------------------------------------------------ */

/** Raw matchMedia hook with a live `change` listener. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent): void => setMatches(e.matches);
    setMatches(mq.matches); // re-sync after mount (hydration/first paint)
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/**
 * Live viewport class. Uses one matchMedia per edge (fires on crossing,
 * no scroll-linked work) composed with width class derivation on change.
 */
export function useViewportClass(): ViewportClass {
  const [cls, setCls] = useState<ViewportClass>(() =>
    typeof window === 'undefined' ? 'xl' : viewportClassFor(window.innerWidth)
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let raf = 0;
    const measure = (): void => {
      raf = 0;
      setCls((prev) => {
        const next = viewportClassFor(window.innerWidth);
        return prev === next ? prev : next;
      });
    };
    const onResize = (): void => {
      if (!raf) raf = requestAnimationFrame(measure); // 1 measure per frame
    };
    // Orientation changes resize the viewport; resize covers both.
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    measure();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  return cls;
}

/** Capability tier for the current viewport (live). */
export function useTier(): CapabilityTier {
  const cls = useViewportClass();
  // Derive from the class to avoid a second resize subscription.
  if (cls === 'xl' || cls === 'lg') return 'FULL';
  if (cls === 'md') return 'ADAPTIVE';
  return 'COMPACT';
}

/** True when the primary pointer is coarse (touch-first device). */
export function usePointerCoarse(): boolean {
  return useMediaQuery('(pointer: coarse)');
}

/**
 * COMPACT authoring signal: narrow viewport OR coarse pointer.
 * Drives the ASSISTED-mode default and precision notice.
 */
export function useCompactAuthoring(): boolean {
  const tier = useTier();
  const coarse = usePointerCoarse();
  return tier === 'COMPACT' || coarse;
}

/** Live viewport size (for visualViewport-aware surfaces like the viewer modal). */
export function useViewportSize(): { width: number; height: number } {
  const [size, setSize] = useState(() => ({
    width: typeof window === 'undefined' ? 0 : window.innerWidth,
    height: typeof window === 'undefined' ? 0 : window.innerHeight,
  }));
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let raf = 0;
    const measure = (): void => {
      raf = 0;
      setSize({ width: window.innerWidth, height: window.innerHeight });
    };
    const onResize = (): void => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);
  return size;
}
