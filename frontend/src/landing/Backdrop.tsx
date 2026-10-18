/**
 * Backdrop.tsx — the landing's ambient page layer.
 * A fixed, pointer-transparent backdrop that turns the empty gutters at
 * wide viewports into part of the composition: a faint architectural
 * blueprint grid, accent glows echoing the palette, a giant outline
 * compass rose, and surveyor-style coordinate annotations. Sections
 * render transparent above it; the hero's photo sits opaque on top.
 *
 * WHY IT MOVES, AND BY SO LITTLE. A fixed layer is the cheapest depth cue a
 * page has: it is already painted and already outside the document flow, so
 * translating it is one composite per frame instead of a repaint. What the eye
 * reads as distance is not the motion itself but the DIFFERENCE between layers
 * — so each one takes a different fraction of the scroll (`useDrift`), from the
 * blueprint grid, which is the paper the page is printed on and barely moves,
 * to the coordinate annotations, which sit nearest the reader's plane.
 *
 * The fractions are small on purpose (3–18% of the scroll), and NEGATIVE: the
 * page's content travels up at 100% of the scroll, so a layer that travels up
 * at 5% is the one that looks distant. At the 40–60% a full parallax would use,
 * these elements cross most of the viewport over one screen of scrolling and
 * the page reads as a diorama sliding behind glass; at these values the gutters
 * acquire depth and nothing asks to be looked at.
 *
 * The compass rose also turns, slowly. That is the one element here whose motion
 * is not a depth cue — it is there so the composition is not four parallel
 * translations, which is the thing that reads as a template.
 *
 * Reduced motion: this is not gated. Motion that follows the reader's own
 * scrolling is position, not animation — it cannot play unbidden, it stops the
 * instant they do, and it is the same feedback the progress rail gives. The
 * ambient LOOPS on this page (the mist veil, the needle) are still killed by the
 * CSS media query in index.css, and they are the part that genuinely loops.
 */
import { motion, useTransform } from 'framer-motion';
import { usePageScroll, useDrift } from './scrollLink';

export const Backdrop: React.FC = () => {
  const { scrollY } = usePageScroll();

  /* How much of the scroll each layer takes. Grid 3% (the paper the page is
     printed on), glows 10–16% (light: further than paper, nearer than
     furniture), rose 12%, annotations 15–18% (the surveyor's own hand, nearest
     the glass). */
  const grid = useDrift(scrollY, -0.03);
  const glowLeft = useDrift(scrollY, -0.16);
  const glowRight = useDrift(scrollY, -0.1);
  const glowLow = useDrift(scrollY, -0.13);
  const rose = useDrift(scrollY, -0.12);
  const coordsLeft = useDrift(scrollY, -0.18);
  const coordsRight = useDrift(scrollY, -0.15);

  /* 20° across three viewports of scrolling: a turn you notice only if you stop
     and look at it, which is the correct amount for a watermark. */
  const roseTurn = useTransform(scrollY, [0, 3200], [0, 20]);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      {/* Blueprint grid — masked toward the center so the mockup stays clean */}
      {/* OVERSIZED IN VIEWPORT UNITS, NOT PERCENTAGES. The layer drifts up as the
          page scrolls, so its edges have to stay outside the viewport for the
          whole document — a grid that ran out of grid leaves a bare strip under
          the nav. This was `inset-[-30%]`, and that was the landing's only
          measurable layout shift: the page paints one screen tall (the boot
          shell) and grows to ~3 300px when React fills it in, so the classic
          scrollbar arrives AFTER first paint and takes 15px off the layout width.
          A percentage inset is resolved against the containing block, so the
          whole layer resized with it — Lighthouse's desktop run caught this one
          node moving for CLS 0.011. `vw`/`vh` are fixed for a given window and do
          not move when the scrollbar appears, so the geometry is now independent
          of that change. (On overlay-scrollbar systems — macOS by default — the
          shift never happened, which is why five puppeteer viewports and the
          mobile Lighthouse run all read 0.000.) */}
      <motion.div
        className="absolute -left-[30vw] -top-[30vh] h-[160vh] w-[160vw]"
        style={{
          y: grid,
          backgroundImage:
            'linear-gradient(rgba(47,111,237,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(47,111,237,0.055) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage: 'radial-gradient(1200px 800px at 50% 42%, transparent 38%, black 78%)',
          WebkitMaskImage: 'radial-gradient(1200px 800px at 50% 42%, transparent 38%, black 78%)',
        }}
      />

      {/* Accent glows */}
      <motion.div
        className="absolute -left-40 top-[16%] h-[560px] w-[560px] rounded-full"
        style={{ y: glowLeft, background: 'radial-gradient(closest-side, rgba(47,111,237,0.10), transparent)' }}
      />
      <motion.div
        className="absolute -right-48 top-[46%] h-[640px] w-[640px] rounded-full"
        style={{ y: glowRight, background: 'radial-gradient(closest-side, rgba(106,166,255,0.12), transparent)' }}
      />
      <motion.div
        className="absolute left-[14%] bottom-[-180px] h-[520px] w-[520px] rounded-full"
        style={{ y: glowLow, background: 'radial-gradient(closest-side, rgba(31,169,85,0.07), transparent)' }}
      />

      {/* Giant outline compass rose — right gutter */}
      <motion.svg
        viewBox="0 0 400 400"
        className="absolute right-[-150px] top-[34%] hidden h-[420px] w-[420px] 2xl:block"
        style={{ y: rose, rotate: roseTurn, opacity: 0.1 }}
      >
        <g fill="none" stroke="#2f6fed" strokeWidth="1.4">
          <circle cx="200" cy="200" r="188" />
          <circle cx="200" cy="200" r="146" strokeDasharray="3 6" />
          {Array.from({ length: 72 }, (_, i) => {
            const a = (i * Math.PI) / 36;
            const inner = i % 6 === 0 ? 158 : 176;
            return (
              <line
                key={i}
                x1={200 + inner * Math.sin(a)}
                y1={200 - inner * Math.cos(a)}
                x2={200 + 188 * Math.sin(a)}
                y2={200 - 188 * Math.cos(a)}
                strokeWidth={i % 18 === 0 ? 2 : 1}
              />
            );
          })}
          <polygon points="200,38 216,200 200,362 184,200" fill="rgba(47,111,237,0.08)" />
          <polygon points="38,200 200,184 362,200 200,216" fill="rgba(47,111,237,0.05)" />
        </g>
        <text x="200" y="26" textAnchor="middle" fontSize="19" fontWeight="700" fill="#2f6fed" fontFamily="Inter, sans-serif">N</text>
      </motion.svg>

      {/* Surveyor coordinate annotations — left gutter */}
      <motion.div
        className="absolute left-8 top-[38%] hidden flex-col gap-5 font-mono text-[10.5px] font-medium text-[#2f6fed] 2xl:flex"
        style={{ y: coordsLeft, opacity: 0.32 }}
      >
        <div>
          <p>LAT 12.9716° N</p>
          <p className="text-[#8a93a3]">LON 77.5946° E</p>
        </div>
        <div>
          <p>PLOT 2,450 m²</p>
          <p className="text-[#8a93a3]">ZONE III · IS 1893</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-px w-10 bg-[#2f6fed]" style={{ opacity: 0.5 }} />
          <span>0.61 AC</span>
        </div>
      </motion.div>
      <motion.div
        className="absolute bottom-[12%] right-10 hidden flex-col items-end gap-3 font-mono text-[10.5px] font-medium text-[#2f6fed] 2xl:flex"
        style={{ y: coordsRight, opacity: 0.3 }}
      >
        <span>SCALE 1 : 500</span>
        <span className="text-[#8a93a3]">DATUM WGS 84</span>
      </motion.div>
    </div>
  );
};
