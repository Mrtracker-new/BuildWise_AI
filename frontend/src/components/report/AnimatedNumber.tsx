import React, { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../../design/primitives';
import { shouldPlay } from './playOnce';

interface AnimatedNumberProps {
  value: number;
  /** Formatter applied to the animated intermediate value. */
  format?: (n: number) => string;
  durationMs?: number;
  className?: string;
  /** Stable hook for the count-up gate (browser test reads the intermediate value). */
  testId?: string;
  /**
   * Identity for the once-per-session gate. Give every long-lived tile a key
   * (the test id is used as a fallback) so its count-up plays on the session's
   * first visit instead of replaying on every tab switch. Without a key the
   * legacy behaviour is kept: animate on mount.
   */
  playKey?: string;
}

/**
 * Counts a number up to its value.
 *
 * Three gates, in order:
 *  1. reduced motion — the value renders immediately, no rAF loop at all (the
 *     global CSS rule cannot freeze a JS loop, so this is an explicit branch);
 *  2. once per session per key — a remount (tab switch) renders the final value
 *     instead of replaying a 600 ms loop that re-renders its tile every frame;
 *  3. viewport — the loop only starts when the tile is actually on screen, so
 *     animating a pane's off-screen tiles costs nothing.
 *
 * A value that changes *after* the animation (a user override, a regeneration)
 * is rendered directly: that is a recalculation, not an entrance.
 */
export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
  value,
  format = (n) => n.toFixed(1),
  durationMs = 600,
  className,
  testId,
  playKey,
}) => {
  const reduced = useReducedMotion();
  const key = playKey ?? testId;
  // Decided once per mount: the answer cannot change under this instance.
  const [play] = useState(() => !reduced && (key ? shouldPlay(key) : true));
  const [phase, setPhase] = useState<'idle' | 'running' | 'done'>(play ? 'idle' : 'done');
  const [animated, setAnimated] = useState(0);
  const hostRef = useRef<HTMLSpanElement>(null);

  // Gate 3: start the loop only once the tile is in view (the document root is
  // the right observer root — the sheet's own scroller clips it for us).
  useEffect(() => {
    if (phase !== 'idle') return;
    const host = hostRef.current;
    if (!host || typeof IntersectionObserver === 'undefined') {
      setPhase('running');
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setPhase('running');
          observer.disconnect();
        }
      },
      { threshold: 0.01 }
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, [phase]);

  // The count-up itself, for the one run that is allowed to happen.
  useEffect(() => {
    if (phase !== 'running') return;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setAnimated(value * eased);
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        setAnimated(value);
        setPhase('done');
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase, value, durationMs]);

  // Settled state: always show the true value (cheap, no loop).
  const shown = reduced || phase !== 'running' ? value : animated;

  return (
    <span ref={hostRef} className={className} data-testid={testId}>
      {format(shown)}
    </span>
  );
};
