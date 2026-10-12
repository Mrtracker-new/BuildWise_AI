import React, { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../../design/primitives';

interface AnimatedNumberProps {
  value: number;
  /** Formatter applied to the animated intermediate value. */
  format?: (n: number) => string;
  durationMs?: number;
  className?: string;
  /** Stable hook for the count-up gate (browser test reads the intermediate value). */
  testId?: string;
}

/**
 * Counts a number up to its value on mount/update. When the user prefers
 * reduced motion the value is rendered immediately with no animation — the
 * global CSS rule cannot freeze a JS-driven rAF loop, so this is an explicit
 * branch rather than a stylesheet concern.
 */
export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
  value,
  format = (n) => n.toFixed(1),
  durationMs = 600,
  className,
  testId,
}) => {
  const reduced = useReducedMotion();
  const [animated, setAnimated] = useState(0);
  const frameRef = useRef(0);

  useEffect(() => {
    // Reduced motion: no animation loop at all. The rendered value is taken
    // straight from `value` below, so there is nothing to synchronise here.
    if (reduced) return;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setAnimated(value * eased);
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        setAnimated(value);
      }
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [value, reduced, durationMs]);

  return (
    <span className={className} data-testid={testId}>
      {format(reduced ? value : animated)}
    </span>
  );
};
