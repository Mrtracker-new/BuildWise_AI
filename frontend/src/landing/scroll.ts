/**
 * landing/scroll.ts — Lenis smooth scrolling for the landing route.
 * A single instance is created when the landing mounts (and destroyed on
 * unmount). Disabled entirely under prefers-reduced-motion.
 */
import Lenis from 'lenis';

let lenis: Lenis | null = null;
let rafId = 0;

const prefersReduced = (): boolean =>
  typeof window !== 'undefined' &&
  Boolean(window.matchMedia) &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Initialize the Lenis loop. Returns a cleanup fn. No-op when reduced. */
export function initLenis(): () => void {
  if (lenis || prefersReduced() || typeof window === 'undefined') return () => {};

  lenis = new Lenis({
    duration: 1.1,
    easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
  });

  const raf = (time: number) => {
    lenis?.raf(time);
    rafId = requestAnimationFrame(raf);
  };
  rafId = requestAnimationFrame(raf);

  return () => {
    cancelAnimationFrame(rafId);
    lenis?.destroy();
    lenis = null;
  };
}

/** Smoothly scroll to a section id (works with and without Lenis). */
export function scrollToId(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  if (lenis) {
    lenis.scrollTo(el, { offset: -96, duration: 1.25 });
  } else {
    el.scrollIntoView({
      behavior: prefersReduced() ? 'auto' : 'smooth',
      block: 'start',
    });
  }
}
