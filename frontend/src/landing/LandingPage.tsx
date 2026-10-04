/**
 * LandingPage.tsx — the BuildWise AI marketing page.
 * Composition: Navbar → Hero → DashboardMockup → FeatureStrip → CtaBand
 * → Footer. Owns the landing route's chrome: unlocks body scroll (the
 * app shell needs overflow-hidden), boots Lenis smooth scrolling, and
 * manages the document title.
 */
import React, { useEffect } from 'react';
import { Navbar } from './Navbar';
import { Hero } from './Hero';
import { Backdrop } from './Backdrop';
import { DashboardMockup } from './DashboardMockup/DashboardMockup';
import { FeatureStrip } from './FeatureStrip';
import { CtaBand, Footer } from './CtaBand';
import { initLenis } from './scroll';

const LANDING_TITLE = 'BuildWise AI — From a map pin to a buildable plan';
const APP_TITLE = 'BuildWise AI - Geo-Based Intelligent Construction Planning';

export const LandingPage: React.FC = () => {
  useEffect(() => {
    document.title = LANDING_TITLE;
    document.body.classList.add('bw-landing-open');
    document.documentElement.classList.add('bw-landing-open');
    const destroyLenis = initLenis();

    return () => {
      destroyLenis();
      document.body.classList.remove('bw-landing-open');
      document.documentElement.classList.remove('bw-landing-open');
      document.title = APP_TITLE;
      window.scrollTo(0, 0);
    };
  }, []);

  return (
    <div className="bw-landing relative min-h-screen font-sans text-[#0b1220] antialiased">
      <Backdrop />
      <Navbar />
      <main className="relative z-10">
        <Hero />
        <DashboardMockup />
        <FeatureStrip />
        <CtaBand />
      </main>
      <div className="relative z-10">
        <Footer />
      </div>
    </div>
  );
};
