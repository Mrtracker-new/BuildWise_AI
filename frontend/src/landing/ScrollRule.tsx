/**
 * ScrollRule.tsx — the section hairline, drawn by the scroll.
 *
 * WHY THIS EXISTS. Every section on the page starts with the same header, and
 * the header's own rule (the 28px accent tick beside the eyebrow) is drawn ONCE
 * on arrival. A section boundary in a drawing set is a full-width rule, and on a
 * page read by scrolling that rule is the one piece of the boundary that can
 * report the reader's position: it draws left → right as the section travels
 * through the entry band, so the page's structure arrives WITH the wheel instead
 * of at a single trigger frame.
 *
 * It is the same entry band every other scrubbed element uses (see scrollLink),
 * so the rule finishes as the heading reaches the reading position — no line is
 * still growing under a heading somebody is reading.
 *
 * COST. One 1px layer, `scaleX` on `transform-origin: left`. Compositor work
 * only, no paint, no layout, and the element is aria-hidden decoration.
 *
 * REDUCED MOTION. `useEntryProgress` reports the settled end (1) for readers
 * who ask for less motion, so the rule is simply present at full width — there
 * is nothing left to animate.
 */
import React, { useRef } from 'react';
import { motion, useTransform } from 'framer-motion';
import { useEntryProgress } from './scrollLink';

export const ScrollRule: React.FC<{ className?: string }> = ({ className }) => {
  const ref = useRef<HTMLDivElement>(null);
  const progress = useEntryProgress(ref);
  const scaleX = useTransform(progress, [0, 1], [0, 1]);

  return (
    <div ref={ref} aria-hidden className={className}>
      <motion.span className="block h-px w-full origin-left bg-bw-line" style={{ scaleX }} />
    </div>
  );
};
