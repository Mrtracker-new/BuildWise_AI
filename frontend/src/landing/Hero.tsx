/**
 * Hero.tsx — full-bleed scenic hero.
 * Load sequence: eyebrow → headline lines (masked slide-up, staggered)  * subcopy → CTAs (pop) → trust row (fade-slide sequence). The scenic layer
 * parallaxes at ~0.3x; a porcelain scrim guarantees AA contrast; filmic
 * grain sits on top at 2.5%.
 */
import React from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { HeroScene } from './HeroScene';
import { timed } from './motion';
import { APP_PATH, navigate } from './router';
import { scrollToId } from './scroll';
import { Icon } from '../components/Icon';
import { LANDING, FONT_HAND } from './theme';

const HeadlineLine: React.FC<{ children: React.ReactNode; delay: number }> = ({ children, delay }) => (
  <span className="block overflow-hidden pb-[0.08em] -mb-[0.08em]">
    <motion.span
      className="block will-change-transform"
      initial={{ y: '112%' }}
      animate={{ y: '0%' }}
      transition={timed(1.05, delay)}
    >
      {children}
    </motion.span>
  </span>
);

const TrustItem: React.FC<{
  icon: React.ReactNode;
  title: string;
  detail?: string;
  delay: number;
}> = ({ icon, title, detail, delay }) => (
  <motion.div
    initial={{ opacity: 0, y: 14 }}
    animate={{ opacity: 1, y: 0 }}
    transition={timed(0.7, delay)}
    className="flex items-center gap-3"
  >
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#0b1220]"
      style={{
        background: 'rgba(255,255,255,0.55)',
        backdropFilter: LANDING.glass.blur,
        WebkitBackdropFilter: LANDING.glass.blur,
        border: `1px solid ${LANDING.glass.hairline}`,
        boxShadow: LANDING.glass.topLight,
      }}
      aria-hidden
    >
      {icon}
    </span>
    <span className="leading-tight">
      <span className="block text-[13.5px] font-semibold text-[#0b1220]">{title}</span>
      {detail && <span className="block text-[12px] text-[#4b5768]">{detail}</span>}
    </span>
  </motion.div>
);

export const Hero: React.FC = () => {
  const reduced = useReducedMotion();
  const { scrollY } = useScroll();
  const sceneY = useTransform(scrollY, [0, 1000], [0, reduced ? 0 : 300]);
  const sceneOpacity = useTransform(scrollY, [0, 900], [1, reduced ? 1 : 0.35]);
  // The photograph breathes: gently zooms out as the hero scrolls away.
  // Quantized to 2% steps — continuous scale changes force the photo layer
  // to re-rasterize; ~6 discrete steps look identical and raster ~6 times.
  const sceneScaleRaw = useTransform(scrollY, [0, 1000], reduced ? [1, 1] : [1.1, 1]);
  const sceneScale = useTransform(sceneScaleRaw, (s) => Math.round(s * 50) / 50);

  return (
    <section id="top" className="relative overflow-hidden" aria-label="BuildWise AI — intelligent construction planning">
      {/* Scenic layer (parallax ~0.3x + scroll zoom-out) */}
      <motion.div style={{ y: sceneY, opacity: sceneOpacity, scale: sceneScale }} className="absolute inset-x-0 -top-[12%] h-[124%] will-change-transform">
        <HeroScene />
      </motion.div>

      {/* Porcelain scrim: left-to-right on desktop; on small screens a
          vertical grade keeps the nav readable and melts the photo's
          base into the page so the headline owns the frame */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(238,242,247,0.55) 0%, rgba(238,242,247,0.10) 30%, rgba(238,242,247,0.30) 60%, rgba(238,242,247,0.94) 100%), linear-gradient(98deg, rgba(238,242,247,0.97) 0%, rgba(238,242,247,0.88) 30%, rgba(238,242,247,0.45) 58%, rgba(238,242,247,0.08) 82%, rgba(238,242,247,0) 100%)',
        }}
      />
      {/* Bottom fade into the porcelain page */}
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-b from-transparent to-[#eef2f7]" />
      {/* Filmic grain */}
      <div aria-hidden className="bw-grain" />

      {/* Content */}
      <div className="relative mx-auto max-w-7xl px-6 pb-52 pt-36 sm:pt-40 lg:px-10 lg:pt-48">
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={timed(0.7, 0.05)}
          className="text-[12px] font-semibold uppercase text-[#3f4c5f]"
          style={{ letterSpacing: LANDING.type.trackingEyebrow }}
        >
          Intelligent Construction Planning
        </motion.p>

        <h1
          className="mt-4 font-bold text-[#0b1220]"
          style={{ fontSize: LANDING.type.hero, letterSpacing: LANDING.type.trackingHero, lineHeight: 1.04 }}
        >
          <HeadlineLine delay={0.18}>From a map pin</HeadlineLine>
          <HeadlineLine delay={0.34}>
            to a <span className="bw-gradient-text">buildable plan</span>.
          </HeadlineLine>
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={timed(0.8, 0.55)}
          className="mt-6 max-w-xl text-[17px] leading-[1.6] text-[#3f4c5f]"
        >
          AI-powered site feasibility, risk analysis, cost estimation, and generative
          architectural planning.
        </motion.p>

        {/* CTA row */}
        <div className="mt-8 flex flex-wrap items-center gap-3.5">
          <motion.button
            type="button"
            onClick={() => navigate(APP_PATH)}
            initial={{ opacity: 0, scale: 0.9, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={reduced ? timed(0.4, 0.7) : { type: 'spring', stiffness: 300, damping: 26, delay: 0.7 }}
            className="group inline-flex h-[52px] items-center gap-2.5 rounded-full bg-[#0b1220] px-7 text-[15.5px] font-semibold text-white transition-[transform,background] duration-200 hover:bg-[#17233a] active:scale-[0.97]"
            style={{ boxShadow: LANDING.shadow.dark }}
          >
            Analyze a site
            <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-1"><Icon name="arrow-up-right" size={14} className="inline-block -rotate-45" /></span>
          </motion.button>

          <motion.button
            type="button"
            onClick={() => scrollToId('platform')}
            initial={{ opacity: 0, scale: 0.9, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={reduced ? timed(0.4, 0.8) : { type: 'spring', stiffness: 300, damping: 26, delay: 0.82 }}
            className="group inline-flex h-[52px] items-center gap-2.5 rounded-full px-6 text-[15.5px] font-semibold text-[#0b1220] transition-[transform,background] duration-200 hover:bg-[rgba(255,255,255,0.75)] active:scale-[0.97]"
            style={{
              background: 'rgba(255,255,255,0.5)',
              backdropFilter: LANDING.glass.blur,
              WebkitBackdropFilter: LANDING.glass.blur,
              border: `1px solid ${LANDING.glass.hairline}`,
              boxShadow: `${LANDING.glass.topLight}, ${LANDING.shadow.card}`,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor" aria-hidden>
              <path d="M4.2 2.7a1 1 0 0 1 1.53-.85l7 4.8a1 1 0 0 1 0 1.7l-7 4.8a1 1 0 0 1-1.53-.85V2.7Z" />
            </svg>
            Explore the platform
          </motion.button>
        </div>

        {/* Trust row */}
        <div className="mt-10 flex flex-wrap items-center gap-x-10 gap-y-4">
          <TrustItem
            delay={1.0}
            title="No paid APIs"
            icon={
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />
              </svg>
            }
          />
          <TrustItem
            delay={1.12}
            title="Standards based"
            detail="IS 1893, NBC 2016, CPWD"
            icon={
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <polyline points="9 12 11 14 15 10" />
              </svg>
            }
          />
          <TrustItem
            delay={1.24}
            title="Real-world data"
            detail="OpenStreetMap, USGS, Open-Meteo"
            icon={
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <ellipse cx="12" cy="5" rx="9" ry="3" />
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
              </svg>
            }
          />
        </div>
      </div>

      {/* Handwritten note, right edge */}
      <motion.div
        initial={{ opacity: 0, rotate: -8, y: 16 }}
        animate={{ opacity: 1, rotate: -5, y: 0 }}
        transition={timed(1.2, 1.3)}
        className="absolute right-8 top-[30%] hidden lg:block xl:right-16"
        aria-hidden
      >
        <div className="bw-note-breathe text-center" style={{ fontFamily: FONT_HAND }}>
          <p className="text-[26px] font-semibold leading-[1.15] text-[#223047] drop-shadow-sm">
            Smarter
            <br />
            Sites
            <br />
            Stronger
            <br />
            Futures.
          </p>
          <svg width="64" height="14" viewBox="0 0 64 14" fill="none" className="mx-auto mt-2" aria-hidden>
            <path d="M2 10 C 18 4, 42 3, 62 7" stroke="#223047" strokeWidth="1.6" strokeLinecap="round" opacity="0.75" />
          </svg>
        </div>
      </motion.div>
    </section>
  );
};
