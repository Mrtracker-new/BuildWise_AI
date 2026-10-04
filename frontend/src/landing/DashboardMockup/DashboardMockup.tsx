/**
 * DashboardMockup.tsx — the hero artifact.
 * One large glass shell holding the three-region app UI (sidebar, map
 * canvas, analysis rail). Rises with perspective (rotateX 12° → 0) on a
 * scroll-linked curve while its shadow blooms; degrades to a stacked
 * layout (sidebar → horizontal chips, rail → single column) via
 * container queries.
 */
import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Sidebar } from './Sidebar';
import { MapCanvas } from './MapCanvas';
import { AnalysisRail } from './AnalysisRail';
import { timed } from '../motion';
import { LANDING } from '../theme';

const SHADOW_START =
  '0 4px 10px rgba(11,18,32,0.05), 0 10px 30px -12px rgba(11,18,32,0.10), 0 20px 60px -30px rgba(47,111,237,0.06)';
const SHADOW_END =
  '0 4px 10px rgba(11,18,32,0.07), 0 40px 80px -20px rgba(11,18,32,0.28), 0 90px 180px -40px rgba(47,111,237,0.22)';

export const DashboardMockup: React.FC = () => {
  const reduced = useReducedMotion();

  return (
    <section id="platform" aria-label="BuildWise AI platform preview" className="relative z-10 mx-auto -mt-44 w-full max-w-[1280px] px-4 sm:px-6 lg:px-10 2xl:max-w-[1420px]">
      <div style={{ perspective: 1500 }}>
        {/* One-shot in-view rise (was scroll-linked): box-shadow is paint, not
            composite — interpolating it per scroll frame repainted this whole
            ~1280px shell every frame through its entry range. */}
        <motion.div
          initial={reduced ? undefined : { rotateX: 12, scale: 0.96, y: 90, opacity: 0.35, boxShadow: SHADOW_START }}
          whileInView={reduced ? undefined : { rotateX: 0, scale: 1, y: 0, opacity: 1, boxShadow: SHADOW_END }}
          viewport={{ once: true, amount: 0.12 }}
          transition={reduced ? undefined : timed(1.25, 0.05)}
          style={{
            boxShadow: SHADOW_END,
            transformStyle: 'preserve-3d',
          }}
          className="relative rounded-[28px] p-3 will-change-transform sm:p-3.5"
        >
          {/* Shell material */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[28px]"
          style={{
            // Opaque-enough shell without backdrop-filter: behind it is only
            // the soft porcelain backdrop, so blur is invisible while a huge
            // blurred surface re-blurring per scroll frame is not free.
            background: 'rgba(255,255,255,0.82)',
            border: `1px solid rgba(255,255,255,0.65)`,
          }}
          />

          {/* Three-region app UI */}
          <div className="@container">
            <div className="relative flex flex-col gap-3 @4xl:grid @4xl:grid-cols-[188px_minmax(0,1fr)_minmax(0,1.15fr)]">
            {/* Sidebar */}
            <div
              style={{
                background: 'rgba(255,255,255,0.6)',
                border: '1px solid rgba(255,255,255,0.65)',
                boxShadow: LANDING.glass.topLight,
                borderRadius: 18,
              }}
            >
              <Sidebar />
            </div>

            {/* Map canvas */}
            <MapCanvas />

            {/* Analysis rail */}
            <div className="min-h-0">
              <AnalysisRail />
            </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
