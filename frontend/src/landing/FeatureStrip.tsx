/**
 * FeatureStrip.tsx — six platform capabilities as a hairline-divided
 * strip. Icon tiles carry a macOS-Dock-style neighbor magnification:
 * tiles nearest the pointer scale up with springs (fine pointers only,
 * disabled under reduced motion).
 */
import React, { useRef } from 'react';
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from 'framer-motion';
import { fadeRise, staggerParent } from './motion';
import { useFinePointer } from './hooks';

interface Feature {
  title: string;
  copy: string;
  icon: React.ReactNode;
}

const FEATURES: ReadonlyArray<Feature> = [
  {
    title: 'Land Suitability',
    copy: 'Multi-criteria analysis using topography, land use, and environmental data.',
    icon: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M8 3l4 8 5-5 5 15H2L8 3z" />
      </svg>
    ),
  },
  {
    title: 'Seismic & Flood Analysis',
    copy: 'Risk assessment using IS 1893, flood models, and real-world geospatial data.',
    icon: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <polyline points="2 14 6 14 9 6 14 22 17 14 22 14" />
        <path d="M3 9c2-1.6 3.4-1.6 5.4 0M15.6 9c2-1.6 3.4-1.6 5.4 0" opacity="0.7" />
      </svg>
    ),
  },
  {
    title: 'Cost Estimation',
    copy: 'Accurate construction cost benchmarks from CPWD DSR.',
    icon: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3M9 13c6.667 0 6.667-10 0-10" />
      </svg>
    ),
  },
  {
    title: 'Vastu Guidance',
    copy: 'Orientation and spatial planning for harmonious design.',
    icon: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <polygon points="15.5 8.5 13.6 13.6 8.5 15.5 10.4 10.4 15.5 8.5" />
      </svg>
    ),
  },
  {
    title: 'Generative Blueprints',
    copy: 'AI-assisted architectural floor plans with practical placement rules.',
    icon: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M9 21V9M15 9v12" />
      </svg>
    ),
  },
  {
    title: 'Print-Ready Reports',
    copy: 'Complete PDF dossiers with analysis, drawings, and recommendations.',
    icon: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <polyline points="6 9 6 2 18 2 18 9" />
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <rect x="6" y="14" width="12" height="8" rx="1" />
      </svg>
    ),
  },
];

const DockTile: React.FC<{
  feature: Feature;
  mx: MotionValue<number>;
  enabled: boolean;
}> = ({ feature, mx, enabled }) => {
  const ref = useRef<HTMLDivElement>(null);

  const distance = useTransform(mx, (v: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || v === Infinity) return Infinity;
    return Math.abs(v - (rect.left + rect.width / 2));
  });
  const range = enabled ? [0, 180, 380] : [0, 380, Infinity];
  const scaleSrc = useTransform(distance, range, enabled ? [1.1, 1.035, 1] : [1, 1, 1]);
  const ySrc = useTransform(distance, range, enabled ? [-6, -2, 0] : [0, 0, 0]);
  const scale = useSpring(scaleSrc, { stiffness: 300, damping: 28, mass: 1 });
  const y = useSpring(ySrc, { stiffness: 300, damping: 28, mass: 1 });

  return (
    <motion.article
      variants={fadeRise}
      className="group relative flex flex-col items-start gap-3 px-5 py-6 text-left lg:px-6"
      style={enabled ? { scale, y } : undefined}
    >
      <span
        aria-hidden
        className="flex h-11 w-11 items-center justify-center rounded-[13px] text-white transition-shadow duration-300"
        style={{
          background: 'linear-gradient(135deg, #46608c 0%, #6e88b8 100%)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), 0 8px 18px -6px rgba(70,96,140,0.55)',
        }}
      >
        <span className="transition-transform duration-300 group-hover:scale-[1.06]">{feature.icon}</span>
      </span>
      <h3 className="text-[15px] font-bold tracking-[-0.015em] text-[#0b1220]">{feature.title}</h3>
      <p className="text-[13px] leading-[1.55] text-[#5b6779]">{feature.copy}</p>
      {/* Hover glow */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[18px] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ boxShadow: '0 18px 40px -18px rgba(47,111,237,0.35), inset 0 0 0 1px rgba(47,111,237,0.14)' }}
      />
    </motion.article>
  );
};

export const FeatureStrip: React.FC = () => {
  const reduced = useReducedMotion();
  const fine = useFinePointer();
  const dockEnabled = fine && !reduced;
  const mx = useMotionValue(Infinity);

  return (
    <section id="analysis" aria-label="Platform capabilities" className="bw-section-defer relative py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
        <motion.div
          variants={reduced ? undefined : staggerParent(0.06)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          onPointerMove={dockEnabled ? (e) => mx.set(e.clientX) : undefined}
          onPointerLeave={dockEnabled ? () => mx.set(Infinity) : undefined}
          className="grid grid-cols-1 divide-y divide-[rgba(11,18,32,0.08)] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 xl:divide-x xl:divide-y-0"
        >
          {FEATURES.map((f) => (
            <DockTile key={f.title} feature={f} mx={mx} enabled={dockEnabled} />
          ))}
        </motion.div>
      </div>
    </section>
  );
};
