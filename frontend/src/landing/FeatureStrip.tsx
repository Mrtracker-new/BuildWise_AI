/**
 * FeatureStrip.tsx — the platform's six capabilities.
 *
 * Rewritten from a hairline-divided single-row strip into a card grid, for two
 * reasons:
 *
 *  1. PERFORMANCE. The old strip ran a macOS-Dock magnification: every tile
 *     read `getBoundingClientRect()` inside a `useTransform` fed by the
 *     pointer's x position, so a single pointer move across the strip forced up
 *     to six synchronous layouts — the classic layout-thrash pattern, and it
 *     fired on every mouse move over the section. Hover feedback is now a CSS
 *     transform on the hovered card only (see `.bw-surface`), which is
 *     compositor work, not layout work.
 *  2. LEGIBILITY. Six equal columns put ~180px of text under each 11px tile
 *     and broke every title onto two lines. Three columns let each capability
 *     state its title once and keep its sentence on two lines, and every card
 *     carries the standard or method it rests on, which is what a technical
 *     reader is scanning for.
 */
import React from 'react';
import { motion } from 'framer-motion';
import { fadeRise, staggerParent, SETTLE_VIEWPORT } from './motion';
import { SectionHeading } from './SectionHeading';

interface Feature {
  title: string;
  copy: string;
  /** The standard, method or artefact behind the capability. */
  meta: string;
  icon: React.ReactNode;
}

const FEATURES: ReadonlyArray<Feature> = [
  {
    title: 'Land suitability',
    meta: 'MCDA',
    copy: 'Multi-criteria scoring over topography, land use, and environmental data, with the weightings disclosed.',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M8 3l4 8 5-5 5 15H2L8 3z" />
      </svg>
    ),
  },
  {
    title: 'Seismic and flood risk',
    meta: 'IS 1893',
    copy: 'Zone and inundation stress from the code plus historical event and river-discharge telemetry.',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <polyline points="2 14 6 14 9 6 14 22 17 14 22 14" />
        <path d="M3 9c2-1.6 3.4-1.6 5.4 0M15.6 9c2-1.6 3.4-1.6 5.4 0" opacity="0.7" />
      </svg>
    ),
  },
  {
    title: 'Cost estimation',
    meta: 'CPWD DSR',
    copy: 'Benchmarked construction cost by elemental head, with terrain and quality surcharges shown separately.',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3M9 13c6.667 0 6.667-10 0-10" />
      </svg>
    ),
  },
  {
    title: 'Vastu orientation',
    meta: '9-zone mandala',
    copy: 'Orientation and placement guidance scored per zone, alongside the solar and wind bearings that drive it.',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <polygon points="15.5 8.5 13.6 13.6 8.5 15.5 10.4 10.4 15.5 8.5" />
      </svg>
    ),
  },
  {
    title: 'Generative blueprints',
    meta: 'Spatial CSP',
    copy: 'Floor plans solved against a placement knowledge base and non-negotiable topological invariants.',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M9 21V9M15 9v12" />
      </svg>
    ),
  },
  {
    title: 'Print-ready dossier',
    meta: 'Vector PDF',
    copy: 'One click compiles the scorecard, risk matrices, benchmarks, and a 174mm vector blueprint.',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <polyline points="6 9 6 2 18 2 18 9" />
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <rect x="6" y="14" width="12" height="8" rx="1" />
      </svg>
    ),
  },
];

/* The card inherits the page's one reveal (fadeRise) instead of describing its
   own — the old version carried a hand-written `{opacity, y}` pair with no
   transition at all, so its timing was framer's default spring while every
   other surface on the page moved on the Apple curve. */
const CapabilityCard: React.FC<{ feature: Feature }> = ({ feature }) => (
  <motion.article variants={fadeRise} className="bw-surface p-5">
    <div className="flex items-start justify-between gap-3">
      <span
        aria-hidden
        className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-bw-line-soft bg-bw-accent-tint text-bw-accent"
      >
        {feature.icon}
      </span>
      <span className="mt-1 text-[10.5px] font-semibold uppercase text-bw-ink-3" style={{ letterSpacing: '0.1em' }}>
        {feature.meta}
      </span>
    </div>
    <h3 className="mt-4 text-[15px] font-bold tracking-[-0.015em] text-bw-ink">{feature.title}</h3>
    <p className="mt-1.5 text-[13.5px] leading-[1.55] text-bw-ink-2">{feature.copy}</p>
  </motion.article>
);

export const FeatureStrip: React.FC = () => (
  <section id="capabilities" aria-label="Platform capabilities" className="relative scroll-mt-24 py-24 sm:py-28">
    <div className="mx-auto max-w-7xl px-6 lg:px-10">
      <motion.div variants={staggerParent(0.06)} initial="hidden" whileInView="show" viewport={SETTLE_VIEWPORT}>
        <SectionHeading
          eyebrow="Capabilities"
          title="Six analyses behind every pin"
          copy="The same run produces suitability, hazard, cost, orientation, and a buildable plan — grounded in Indian code and open data."
        />
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <CapabilityCard key={f.title} feature={f} />
          ))}
        </div>
      </motion.div>
    </div>
  </section>
);
