/**
 * SectionHeading.tsx — the landing's below-fold section header.
 *
 * The page used to jump straight from a section's first card into its content:
 * the hero and the closing band had headlines, but the middle of the page had
 * no headings at all, so a reader scrolling past the fold had no statement of
 * what they were looking at. One shared header (eyebrow → title → one line of
 * copy) gives every band the same entry grammar, and it is the same grammar the
 * hero uses, one step down in scale.
 *
 * The eyebrow carries the accent here. The H1 owns the page's accent headline;
 * repeating an accent-gradient phrase in every section would spend the one
 * emphasis the palette has.
 *
 * THE ENTRANCE is the page's display-type grammar, not a fade:
 *   - a hairline DRAWS out of the eyebrow (ruleDraw) — how the page says "a new
 *     section starts" without spending a colour on it;
 *   - the H2 arrives under a mask (maskLift), the same device the hero's
 *     headline uses, so the biggest type on the page arrives the same way
 *     whether you meet it at load or at the third section;
 *   - the parts go in order (rule → title → copy) on explicit delays, because a
 *     heading that resolves in sequence reads as a heading being set. One that
 *     all lands at once reads as a div appearing.
 *
 * ONE OBSERVER FOR THE BLOCK, not one per part, and no variant tree either —
 * both of which were tried and were wrong for a reason worth writing down:
 *
 *  - THE MASK CANNOT OBSERVE ITSELF. IntersectionObserver intersects an
 *    element's rect with its ancestors' CLIPS, so a line that is fully inside an
 *    `overflow: hidden` box while it is at its start position has an empty
 *    intersection rect, reports `isIntersecting: false` forever, and never fires
 *    the reveal that would move it out. A masked line driven by its own
 *    `whileInView` is therefore hidden for the life of the page. (Measured: a
 *    raw observer on the clipped span never fires across a stepped scroll of
 *    the whole page, while the same observer on the block around it fires.)
 *  - THE VARIANT TREE WAS WORSE. Passing the reveal down as variants from the
 *    section group animated nothing in two of the three sections — the
 *    Capabilities and Standards headings sat at their initial state while the
 *    Blueprint heading, built the same way one DOM level deeper, worked. The
 *    trigger is a geometry question and is now answered once, on this block.
 *
 * The timing is supplied per part (`transition`) rather than living in the
 * variants: a target that carries its own `transition` replaces the prop's
 * (framer only merges when the target asks to `inherit`), so the values come
 * from motion.ts and the cascade comes from DELAY below.
 */
import React, { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import type { TargetAndTransition } from 'framer-motion';
import { fadeRise, maskLift, ruleDraw, REVEAL, SETTLE_MARGIN, timed } from './motion';
import { LANDING } from './theme';

export interface SectionHeadingProps {
  eyebrow: string;
  title: React.ReactNode;
  copy?: React.ReactNode;
  /** Centre the block (used by the closing band) instead of left-aligning it. */
  centered?: boolean;
}

/** The cascade, in seconds from the heading's own reveal. */
const DELAY = { eyebrow: 0, title: 0.07, copy: 0.2 };

/** Visual values only — see the timing note in this file's header. */
function withoutTiming(v: TargetAndTransition): TargetAndTransition {
  const out: TargetAndTransition = { ...v };
  delete out.transition;
  return out;
}
const EYEBROW = { hidden: withoutTiming(fadeRise.hidden), show: withoutTiming(fadeRise.show) };
const RULE = { hidden: withoutTiming(ruleDraw.hidden), show: withoutTiming(ruleDraw.show) };
const TITLE = { hidden: withoutTiming(maskLift.hidden), show: withoutTiming(maskLift.show) };

export const SectionHeading: React.FC<SectionHeadingProps> = ({ eyebrow, title, copy, centered = false }) => {
  const ref = useRef<HTMLDivElement>(null);
  const shown = useInView(ref, { once: true, margin: SETTLE_MARGIN });

  return (
    <div ref={ref} className={centered ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
      <motion.p
        initial={EYEBROW.hidden}
        animate={shown ? EYEBROW.show : EYEBROW.hidden}
        transition={timed(REVEAL, DELAY.eyebrow)}
        className="flex items-center gap-3 text-[11px] font-semibold uppercase text-bw-accent"
      >
        {/* The rule draws out of the label rather than fading in with it: at
            1.5px there is no visible scale change, so what reads is the line
            arriving rather than the line growing. */}
        <motion.span
          aria-hidden
          initial={RULE.hidden}
          animate={shown ? RULE.show : RULE.hidden}
          transition={timed(0.7, DELAY.eyebrow)}
          className="h-[1.5px] w-7 shrink-0 origin-left rounded-full bg-bw-accent"
        />
        <span style={{ letterSpacing: LANDING.type.trackingEyebrow }}>{eyebrow}</span>
      </motion.p>

      <h2
        className="mt-3 font-bold text-bw-ink"
        style={{ fontSize: LANDING.type.sectionTitle, letterSpacing: '-0.03em', lineHeight: 1.12 }}
      >
        {/* Mask box. The padding is descender room (a tight line-height clips the
            tails of g/p/y inside an overflow-hidden box) and the negative margin
            keeps the layout identical. Padding must stay SHORTER than the mask's
            travel divided by the line height — see maskLift in motion.ts — or the
            type would peek through the padded strip on the way up. */}
        <span className="block overflow-hidden pb-[0.12em] -mb-[0.12em]">
          <motion.span
            initial={TITLE.hidden}
            animate={shown ? TITLE.show : TITLE.hidden}
            transition={timed(0.7, DELAY.title)}
            className="block"
          >
            {title}
          </motion.span>
        </span>
      </h2>

      {copy && (
        <motion.p
          initial={EYEBROW.hidden}
          animate={shown ? EYEBROW.show : EYEBROW.hidden}
          transition={timed(REVEAL, DELAY.copy)}
          className="mt-4 text-[16px] leading-[1.6] text-bw-ink-2"
        >
          {copy}
        </motion.p>
      )}
    </div>
  );
};
