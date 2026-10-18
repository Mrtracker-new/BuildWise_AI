/**
 * Hero.tsx — the marketing page's first screen.
 *
 * WHAT THIS FILE IS. The landing's first screen, as a copy-led statement: eyebrow,
 * headline, subcopy, the two calls to action and the spec bar. There is no stage
 * under it, and there is nothing here to reserve a box for. The scenic photograph,
 * its two scrims, the filmic grain layer and the 90-second mist loop were removed
 * first, and their combined cost went with them: Phase A measured that preloaded
 * 565 KB JPEG as the LCP element at 7.7 s on the mobile trace, and measured the
 * mist loop as roughly doubling the per-frame interval during scroll.
 *
 * TWO 3D HEROES WERE BUILT OUT OF THIS FILE AND BOTH WERE REMOVED, FOR DIFFERENT
 * REASONS. The first was a live WebGL massing model — orbit, drag, hotspots — which
 * implied a 3D architectural viewer the product does not ship, and printed the
 * sample's certificate WARN state under the heading of a product statistic. The
 * second was a scroll-driven CSS-3D corridor of real engine sheets: it claimed no
 * feature the product lacks, but it read cheap and spent 300vh of the reader's
 * attention on itself. Both were parked under `frontend/quarantine/landing-3d/` — and
 * that folder has since been deleted, so neither survives anywhere but this note — and
 * this file is the baseline they were measured against.
 *
 * THE THIRD CENTREPIECE IS BELOW THE SPEC BAR, AND IT ANSWERS BOTH FAILURES. It is
 * `HeroModel.tsx`: a transform-only massing of one captured generation, standing ON
 * the plot rather than floating in a viewer (no orbit, no canvas, no GPU library),
 * one screen tall with no pinning (no runway), and it claims nothing the engine did
 * not return — the storeys are its envelopes, the openings on the facades are its
 * window schedule, and the caption prints the generation id and the certificate it
 * actually returned, WARN layers included. The copy above still paints with the
 * document and is still the whole first screen; the model is the second beat, and a
 * reader who never scrolls past it has lost nothing.
 *
 * COPY. The subcopy leads with the artefact and names who it is for. The previous
 * line ("AI-powered site feasibility, risk analysis, cost estimation, and
 * generative architectural planning — one pin on a map, one report you can build
 * from") was a 26-word clause stack that named the category but left the reader's
 * own situation and the thing they receive until the very last clause. The
 * strings themselves live in `heroCopy.ts`, because the build renders this same
 * first screen into index.html as a static shell — see the note above.
 *
 * CTA. `Trace your site` is a real `<a href="/app?start=capture">` — it works with
 * JavaScript off, it can be middle-clicked into a tab, and `/app` opens the
 * capture wizard from that parameter. A plain left click is upgraded to the SPA's
 * own pushState navigation so the reader is not made to wait for a document load
 * the router can do itself.
 *
 * WHY THE HEADLINE HAS NO ENTRANCE ANIMATION. It had one: the eyebrow, the h1
 * (each line translated 112% inside an `overflow-hidden` clip) and the subcopy
 * each started at `opacity: 0` and animated in. Every one of those is the LCP
 * candidate at some viewport, and an element that is transparent or clipped out
 * of its box is NOT PAINTED — so the browser could not record the largest
 * contentful paint until a JavaScript animation ran. Measured consequence at the
 * mobile preset: LCP 6.3 s against an FCP of 1.7 s, on a page whose first screen
 * is text that had been in the HTML all along. On a phone that is not an
 * animation, it is three seconds of an empty first screen. The copy now paints
 * with the document and only the things BELOW it (CTA row, spec bar, stage,
 * ledger) animate — none of them can hold the LCP hostage.
 */
import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { timed } from './motion';
import { APP_PATH, currentPath, navigate } from './router';
import { scrollToId } from './scroll';
import { Icon } from '../components/Icon';
import { LANDING } from './theme';
import { HERO_COPY } from './heroCopy';
import { oneLine } from './standards';
import { HeroModel } from './HeroModel';

/** The primary CTA's destination: the app, with the capture wizard asked for. */
export const CAPTURE_HREF = `${APP_PATH}?start=capture`;

/** One fact in the hero's spec bar. */
interface Spec {
  label: string;
  value: string;
}

/* The first two facts are the same list the #standards sheet renders and the
   footer indexes, joined from landing/standards.ts rather than retyped here. */
const SPECS: ReadonlyArray<Spec> = [
  { label: 'Standards', value: oneLine('standards') },
  { label: 'Site data', value: oneLine('siteData') },
  { label: 'Cost to run', value: 'No paid API keys' },
];

export const Hero: React.FC = () => {
  const reduced = useReducedMotion();

  /**
   * Real anchor, SPA speed. Only an unmodified primary click is intercepted:
   * middle-click, ⌘/Ctrl-click and "open in new tab" keep the browser's own
   * behaviour, because the href is real and always was.
   */
  const onPrimaryClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (currentPath().startsWith(APP_PATH)) return;
    event.preventDefault();
    navigate(CAPTURE_HREF);
  };

  return (
    <section
      id="top"
      className="relative overflow-hidden"
      aria-label="BuildWise AI — intelligent construction planning"
    >
      <div className="relative mx-auto max-w-7xl px-6 pb-20 pt-32 sm:pt-36 lg:px-10 lg:pt-40">
        <p className="inline-flex h-8 items-center gap-2 rounded-full border border-bw-line bg-white/75 pl-2.5 pr-3.5 text-bw-ink-2">
          <span aria-hidden className="h-[6px] w-[6px] shrink-0 rounded-full bg-bw-accent" />
          <span
            className="text-[11px] font-semibold uppercase"
            style={{ letterSpacing: LANDING.type.trackingEyebrow }}
          >
            {HERO_COPY.eyebrow}
          </span>
        </p>

        <h1
          className="mt-6 font-bold text-bw-ink"
          style={{ fontSize: LANDING.type.hero, letterSpacing: LANDING.type.trackingHero, lineHeight: 1.04 }}
        >
          <span className="block">{HERO_COPY.headlineFirst}</span>
          <span className="block">
            {HERO_COPY.headlineSecondLead}
            <span className="bw-gradient-text">{HERO_COPY.headlineSecondAccent}</span>
            {HERO_COPY.headlineSecondTrail}
          </span>
        </h1>

        <p className="mt-6 max-w-[38rem] text-[17px] leading-[1.6] text-bw-ink-2">
          {HERO_COPY.subcopy}
        </p>

        {/* CTA row. Full-width below `sm`: two buttons of different widths stacked
            on a phone leave the primary action narrower than the eye expects. */}
        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <motion.a
            href={CAPTURE_HREF}
            onClick={onPrimaryClick}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduced ? timed(0.3, 0.5) : { type: 'spring', stiffness: 320, damping: 26, delay: 0.54 }}
            className="group inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-bw-ink px-6 text-[15px] font-semibold text-white transition-[background-color,transform] duration-200 hover:bg-bw-ink-hover active:scale-[0.98] sm:w-auto"
            style={{ boxShadow: LANDING.shadow.dark }}
          >
            Trace your site
            <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transform-none">
              <Icon name="chevron-right" size={15} />
            </span>
          </motion.a>

          <motion.button
            type="button"
            onClick={() => scrollToId('capabilities')}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduced ? timed(0.3, 0.6) : { type: 'spring', stiffness: 320, damping: 26, delay: 0.62 }}
            className="group inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-bw-line bg-white/80 px-5 text-[15px] font-semibold text-bw-ink transition-[background-color,border-color,transform] duration-200 hover:bg-white active:scale-[0.98] sm:w-auto"
          >
            <span aria-hidden className="transition-transform duration-200 group-hover:translate-y-0.5 motion-reduce:transform-none">
              <Icon name="chevron-down" size={15} />
            </span>
            See the platform
          </motion.button>
        </div>

        {/* Spec bar — the three facts that decide a technical evaluation. */}
        <motion.dl
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={timed(0.6, 0.7)}
          className="mt-12 grid max-w-4xl gap-x-10 gap-y-6 border-t border-bw-line pt-7 sm:grid-cols-3"
        >
          {SPECS.map((spec) => (
            <div key={spec.label}>
              {/* `text-bw-ink-2`, not ink-3: at 10.5px uppercase this label is small
                  text under WCAG, and `--bw-ink-3` (#6b7787) resolves to 4.05:1 on the
                  porcelain ground — a real axe failure on the page's first screen.
                  `--bw-ink-2` (#46536a) is 6.9:1 on the same ground and is already the
                  colour of the values beside these labels, so the pair still reads as
                  one unit rather than as two. */}
              <dt className="text-[10.5px] font-semibold uppercase text-bw-ink-2" style={{ letterSpacing: '0.14em' }}>
                {spec.label}
              </dt>
              <dd className="mt-1.5 text-[13.5px] font-medium leading-[1.5] text-bw-ink-2">{spec.value}</dd>
            </div>
          ))}
        </motion.dl>

        {/* ---------------- the second beat: the plot, extruded ---------------- */}
        <div className="mt-16 flex flex-col gap-4 border-t border-bw-line pt-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p
              className="flex items-center gap-3 text-[11px] font-semibold uppercase text-bw-ink-2"
              style={{ letterSpacing: '0.16em' }}
            >
              <span aria-hidden className="h-[1.5px] w-7 rounded-full bg-bw-accent" />
              From the capture
            </p>
            {/* An h2, not a decorative line: this is the page's second subject, and
                the landing audit checks the heading order rather than the styling. */}
            <h2 className="mt-2.5 text-[clamp(1.35rem,2.2vw,1.8rem)] font-bold tracking-[-0.03em] text-bw-ink">
              The plot, extruded
            </h2>
          </div>
          <p className="max-w-sm text-[13px] leading-[1.6] text-bw-ink-2">
            The first floor rises as you scroll and the roof lands on it. Every opening on it is one the engine
            placed; the figures under the drawing are the capture's own.
          </p>
        </div>
        <div className="mt-6">
          <HeroModel />
        </div>

      </div>
    </section>
  );
};
