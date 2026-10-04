/**
 * landing/motion.ts — shared motion vocabulary for the landing page.
 * Apple-style curves only: cubic-bezier(0.32, 0.72, 0, 1) for timed
 * transitions, stiff/soft damped springs for interactive motion.
 * Every variant respects prefers-reduced-motion via `fadeOnly`.
 */
import type { Variants, Transition } from 'framer-motion';

/** Apple-style deceleration used for all timed (non-spring) motion. */
export const EASE_APPLE: [number, number, number, number] = [0.32, 0.72, 0, 1];

/** Interactive spring (buttons, toggles, chips): stiffness 260–320 / damping 26–30. */
export const SPRING_INTERACTIVE: Transition = {
  type: 'spring',
  stiffness: 300,
  damping: 28,
  mass: 1,
};

/** Softer spring for large surfaces (mockup rise, sheet menus). */
export const SPRING_SOFT: Transition = {
  type: 'spring',
  stiffness: 260,
  damping: 30,
  mass: 1,
};

/** Bouncy spring for the map pin drop. */
export const SPRING_PIN: Transition = {
  type: 'spring',
  stiffness: 320,
  damping: 17,
  mass: 1,
};

/** Timed Apple-curve transition helper. */
export const timed = (duration: number, delay = 0): Transition => ({
  duration,
  delay,
  ease: EASE_APPLE,
});

/** Simple fade+rise used for most section content. */
export const fadeRise: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: timed(0.9) },
};

/** Flat fade for reduced-motion swaps (no transform). */
export const fadeOnly: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: timed(0.5) },
};

/** Parent that staggers children reveals. */
export const staggerParent = (stagger = 0.08, delayChildren = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger, delayChildren } },
});

/** Masked line reveal: each line lives in an overflow-hidden wrapper. */
export const lineMask: Variants = {
  hidden: { y: '110%' },
  show: { y: '0%', transition: timed(1.0) },
};

/** Pop-in for small elements (chips, dots, badges). */
export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.6 },
  show: { opacity: 1, scale: 1, transition: SPRING_INTERACTIVE },
};

/** whileInView viewport config: reveal once, at 20–25% visibility. */
export const IN_VIEW_ONCE = { once: true, amount: 0.2 } as const;

/** Reduced-motion variant swap helper: picks the flat fade when requested. */
export const reveal = (reducedMotion: boolean): Variants =>
  reducedMotion ? fadeOnly : fadeRise;
