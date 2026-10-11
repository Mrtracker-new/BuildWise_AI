/**
 * CtaBand.tsx — closing CTA + footer in the same material language.
 * Left: headline + CTAs. Right: a miniature "Feasibility Dossier" glass
 * card (the print-ready output the platform produces). Footer carries
 * open-data credits — plain text, no dead links.
 */
import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { fadeRise, staggerParent } from './motion';
import { APP_PATH, navigate } from './router';
import { scrollToId } from './scroll';
import { Icon } from '../components/Icon';
import { LANDING, FONT_HAND } from './theme';
import logoUrl from '../assets/BuildWise_logo_square.png';

const DOSSIER_ROWS: ReadonlyArray<{ label: string; meta: string }> = [
  { label: 'Executive Scorecard', meta: 'MCDA' },
  { label: 'Risk Matrix', meta: 'IS 1893' },
  { label: 'Cost Benchmark', meta: 'CPWD DSR' },
  { label: 'Vector Blueprint', meta: '174 mm' },
];

const DossierCheck: React.FC<{ row: { label: string; meta: string }; delay: number }> = ({ row, delay }) => (
  <motion.li
    initial={{ opacity: 0, x: -10 }}
    whileInView={{ opacity: 1, x: 0 }}
    viewport={{ once: true, amount: 0.6 }}
    transition={{ duration: 0.55, delay, ease: [0.32, 0.72, 0, 1] }}
    className="flex items-center justify-between gap-3 rounded-[10px] bg-[rgba(255,255,255,0.72)] px-3 py-2"
    style={{ border: '1px solid rgba(11,18,32,0.06)' }}
  >
    <span className="flex items-center gap-2">
      <span className="flex h-[16px] w-[16px] items-center justify-center rounded-full bg-[#e3f6e9] text-[#1fa955]" aria-hidden>
        <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
          <path d="M1.8 5.2 4 7.4 8.2 2.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="text-[12px] font-semibold text-[#0b1220]">{row.label}</span>
    </span>
    <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#8a93a3]">{row.meta}</span>
  </motion.li>
);

export const CtaBand: React.FC = () => {
  const reduced = useReducedMotion();

  return (
    <section id="blueprint" aria-label="Get started with BuildWise AI" className="bw-section-defer relative overflow-hidden pb-24 pt-6 sm:pb-28">
      {/* Ambient accent mesh */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(560px 340px at 18% 30%, rgba(47,111,237,0.10), transparent 70%), radial-gradient(640px 380px at 85% 75%, rgba(106,166,255,0.12), transparent 70%)',
        }}
      />

      <motion.div
        variants={reduced ? undefined : staggerParent(0.1)}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.25 }}
        className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14 lg:px-10"
      >
        {/* Copy */}
        <div>
          <motion.p
            variants={fadeRise}
            className="text-[12px] font-semibold uppercase text-[#3f4c5f]"
            style={{ letterSpacing: LANDING.type.trackingEyebrow }}
          >
            Print-Ready Output
          </motion.p>
          <motion.h2
            variants={fadeRise}
            className="mt-3 font-bold text-[#0b1220]"
            style={{ fontSize: LANDING.type.sectionTitle, letterSpacing: '-0.03em', lineHeight: 1.12 }}
          >
            Every analysis becomes a{' '}
            <span className="bw-gradient-text">buildable dossier</span>.
          </motion.h2>
          <motion.p variants={fadeRise} className="mt-4 max-w-lg text-[16px] leading-[1.6] text-[#4b5768]">
            One click compiles the full report — executive scorecard, risk matrices,
            CPWD cost benchmark, Vastu notes, and the 174&nbsp;mm vector blueprint.
          </motion.p>
          <motion.div variants={fadeRise} className="mt-7 flex flex-wrap items-center gap-3.5">
            <button
              type="button"
              onClick={() => navigate(APP_PATH)}
              className="group inline-flex h-12 items-center gap-2.5 rounded-full bg-[#0b1220] px-6 text-[15px] font-semibold text-white transition-[transform,background] duration-200 hover:bg-[#17233a] active:scale-[0.97]"
              style={{ boxShadow: LANDING.shadow.dark }}
            >
              Try BuildWise
              <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-1"><Icon name="arrow-up-right" size={14} className="inline-block -rotate-45" /></span>
            </button>
            <button
              type="button"
              onClick={() => scrollToId('footer')}
              className="inline-flex h-12 items-center gap-2 rounded-full px-6 text-[15px] font-semibold text-[#0b1220] transition-[transform,background] duration-200 hover:bg-[rgba(255,255,255,0.85)] active:scale-[0.97]"
              style={{
                background: 'rgba(255,255,255,0.8)',
                border: `1px solid ${LANDING.glass.hairline}`,
                boxShadow: `${LANDING.glass.topLight}, ${LANDING.shadow.card}`,
              }}
            >
              Read the Docs
            </button>
          </motion.div>
        </div>

        {/* Mini dossier card */}
        <motion.div
          id="reports"
          variants={reduced ? undefined : { hidden: { opacity: 0, y: 40, rotate: 1.5 }, show: { opacity: 1, y: 0, rotate: 0, transition: { duration: 1, ease: [0.32, 0.72, 0, 1] } } }}
          className="relative scroll-mt-28 rounded-[24px] p-4"
          style={{
            // No backdrop-filter: the card scrolls over the fixed porcelain
            // backdrop, where blur is imperceptible but re-blurs per frame.
            background: 'rgba(255,255,255,0.82)',
            border: `1px solid rgba(255,255,255,0.7)`,
            boxShadow: `${LANDING.glass.topLight}, ${LANDING.shadow.float}`,
          }}
          aria-label="Preview of the printable feasibility dossier"
        >
          <div className="flex items-center justify-between px-1 pb-3">
            <p className="text-[13px] font-bold text-[#0b1220]">Feasibility Dossier</p>
            <span className="rounded-full bg-[rgba(47,111,237,0.10)] px-2 py-0.5 text-[10.5px] font-bold tabular-nums text-[#2f6fed]">
              Score 87
            </span>
          </div>
          <ul className="flex flex-col gap-1.5">
            {DOSSIER_ROWS.map((row, i) => (
              <DossierCheck key={row.label} row={row} delay={0.15 + i * 0.1} />
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between rounded-[12px] bg-[rgba(11,18,32,0.04)] px-3 py-2">
            <span className="text-[11px] font-semibold text-[#4b5768]">PDF · Vector drawings · Room schedule</span>
            <span aria-hidden style={{ fontFamily: FONT_HAND }} className="text-[15px] font-semibold text-[#2f6fed]">
              ready to print
            </span>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
};

/* ------------------------------------------------------------------ */

export const Footer: React.FC = () => (
  <footer id="footer" className="bw-section-defer border-t border-[rgba(11,18,32,0.08)] bg-white/70">
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-10">
      <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <img src={logoUrl} alt="BuildWise AI logo" width={34} height={34} className="rounded-[9px]" decoding="async" />
          <div>
            <p className="text-[14px] font-bold text-[#0b1220]">BuildWise AI</p>
            <p className="text-[12px] text-[#6b7787]">From a map pin to a buildable plan.</p>
          </div>
        </div>
        <p className="max-w-md text-[12px] leading-[1.6] text-[#6b7787]">
          Built on open infrastructure — OpenStreetMap contributors · USGS ·
          Open-Meteo · Esri World Imagery. Press <kbd className="rounded-[5px] border border-[rgba(11,18,32,0.12)] bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[#4b5768]">?</kbd>{' '}
          inside the app for keyboard shortcuts.
        </p>
      </div>
      <div className="mt-8 flex flex-col gap-2 border-t border-[rgba(11,18,32,0.06)] pt-5 text-[12px] text-[#8a93a3] sm:flex-row sm:items-center sm:justify-between">
        <p>© 2026 BuildWise AI · MIT License</p>
        <p>IS 1893 · NBC 2016 · CPWD DSR — deterministic civil core</p>
      </div>
    </div>
  </footer>
);
