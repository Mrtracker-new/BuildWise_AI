/**
 * landing/hooks.ts — non-component hooks for the landing page.
 * Kept out of primitives.tsx so react-fast-refresh stays happy.
 */
import { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion } from 'framer-motion';

/** Fires once when the element scrolls into view (threshold ~0.35). */
export function useInViewOnce<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const inView = useInView(ref, { once: true, amount: 0.35 });
  return [ref, inView];
}

/** True on devices with a precise pointer (enables hover-only motion). */
export function useFinePointer(): boolean {
  const [fine, setFine] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(pointer: fine)');
    setFine(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setFine(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return fine;
}

/**
 * Count-up animation driven by rAF with an easeOutCubic curve.
 * Starts when `start` flips true; honors reduced motion by snapping.
 */
export function useCountUp(target: number, start: boolean, duration = 1400, decimals = 0): string {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!start) return;
    if (reduced) {
      setValue(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [start, target, duration, reduced]);

  return value.toFixed(decimals);
}

/** Indian-format integer grouping (2,450). */
export function formatIN(value: number): string {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(value);
}
