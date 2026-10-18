/**
 * ScrollRail.tsx — the reading-position indicator at the page's top edge.
 *
 * WHY A RAIL. The landing is four sections and roughly four viewports of
 * scrolling with no statement of how much of it is left, and the nav pill only
 * says WHICH section you are in, never HOW FAR through. A 2px accent rule that
 * grows with the document answers the second question in the page's own
 * instrument language — a survey rule, not a widget.
 *
 * COST. One composited transform on a 2px-tall layer: `scaleX` on a
 * `transform-origin: left` element is pure compositor work, so the whole thing
 * costs one layer and no paint per frame. It is the cheapest honest feedback on
 * the page.
 *
 * The fade-in over the first 140px of scroll is not decoration: at rest the
 * rail's scale is 0 and it is already invisible, so the fade only exists to
 * stop a hard black-to-blue edge appearing the instant the wheel moves. It is
 * intentionally NOT gated on prefers-reduced-motion — it is scroll-linked
 * position feedback rather than an animation, and a progress indicator that
 * hides from the users who most need one would be a bad trade.
 */
import React from 'react';
import { motion, useTransform } from 'framer-motion';
import { usePageScroll } from './scrollLink';

export const ScrollRail: React.FC = () => {
  const { scrollY, progress } = usePageScroll();
  const opacity = useTransform(scrollY, [0, 140], [0, 1]);

  return (
    <div aria-hidden className="bw-rail pointer-events-none fixed inset-x-0 top-0 z-[60] h-[2px]">
      <motion.span
        className="bw-rail-fill block h-full origin-left bg-bw-accent"
        style={{ scaleX: progress, opacity }}
      />
    </div>
  );
};
