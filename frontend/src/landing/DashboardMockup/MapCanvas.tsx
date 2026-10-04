/**
 * MapCanvas.tsx — the mockup's satellite map.
 * The aerial scene is a crafted SVG (fields, hedgerows, roads, a lagoon,
 * farm buildings — no hotlinked tiles). On scroll-in the plot polygon
 * draws itself (stroke-dashoffset), vertex dots pop in sequence, the pin
 * drops with a spring bounce, and the area chip lands last. The compass
 * needle wobbles once.
 */
import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useInViewOnce } from '../hooks';
import { EASE_APPLE, SPRING_PIN, timed } from '../motion';
import { LANDING } from '../theme';

/**
 * Plot geometry — kept inside the guaranteed-safe zone of the 880×560
 * viewBox. With `slice` cropping, the worst realistic container aspect
 * (~0.42 on tall phones) still shows x ∈ [321, 559]; every vertex below
 * stays within x ∈ [330, 520] so the boundary can never clip.
 */
const PLOT: ReadonlyArray<[number, number]> = [
  [355, 195],
  [520, 235],
  [490, 390],
  [370, 415],
  [330, 330],
];
const PIN: [number, number] = [413, 303];
const pointsToPath = (pts: ReadonlyArray<[number, number]>): string =>
  `M ${pts.map(([x, y]) => `${x} ${y}`).join(' L ')} Z`;

/* ---------------------------------------------------------------- */

/**
 * Map furniture drawn OVER the aerial photograph: roads, a lagoon,
 * buildings and tree clusters — lightened so the photo texture reads
 * through while the elements stay unmistakably "map".
 */
const MapFurniture: React.FC = () => (
  <svg
    viewBox="0 0 880 560"
    preserveAspectRatio="xMidYMid slice"
    className="absolute inset-0 h-full w-full"
    aria-hidden
  >
    <defs>
      <radialGradient id="bwMapVignette" cx="0.5" cy="0.45" r="0.85">
        <stop offset="62%" stopColor="rgba(20,30,20,0)" />
        <stop offset="100%" stopColor="rgba(20,30,20,0.14)" />
      </radialGradient>
    </defs>

    {/* Water — lagoon bottom-left */}
    <path
      d="M0 560 L0 395 C 60 380, 130 398, 168 440 C 205 482, 208 530, 190 560 Z"
      fill="rgba(96, 138, 163, 0.55)"
    />
    <path d="M8 420 C 60 412, 118 428, 150 462" stroke="rgba(255,255,255,0.3)" strokeWidth="2.4" fill="none" strokeLinecap="round" />

    {/* Roads */}
    <g fill="none" strokeLinecap="round">
      <path d="M255 560 C 285 470, 320 395, 395 345 C 470 296, 590 268, 880 248" stroke="rgba(93,107,87,0.35)" strokeWidth="13" />
      <path d="M255 560 C 285 470, 320 395, 395 345 C 470 296, 590 268, 880 248" stroke="rgba(240,238,228,0.75)" strokeWidth="8" />
      <path d="M880 60 C 700 90, 560 150, 470 240 C 420 292, 400 350, 396 420 L 390 560" stroke="rgba(93,107,87,0.32)" strokeWidth="11" />
      <path d="M880 60 C 700 90, 560 150, 470 240 C 420 292, 400 350, 396 420 L 390 560" stroke="rgba(240,238,228,0.7)" strokeWidth="6" />
    </g>

    {/* Buildings — soft white footprints, satellite-style */}
    <g>
      {(
        [
          [300, 470, 26, 15],
          [318, 492, 18, 12],
          [740, 300, 24, 14],
          [762, 322, 16, 11],
          [706, 330, 13, 9],
          [150, 250, 20, 12],
          [168, 268, 12, 9],
          [520, 120, 22, 13],
          [540, 138, 14, 10],
        ] as ReadonlyArray<[number, number, number, number]>
      ).map(([x, y, w, h], i) => (
        <g key={`bld-${i}`}>
          <rect x={x + 2} y={y + 2.5} width={w} height={h} rx="2" fill="rgba(30,40,28,0.22)" />
          <rect x={x} y={y} width={w} height={h} rx="2" fill="rgba(245,243,236,0.88)" />
          <rect x={x} y={y} width={w} height={h * 0.42} rx="2" fill="rgba(196,192,178,0.85)" />
        </g>
      ))}
    </g>

    {/* Tree clusters — deeper green canopies */}
    <g>
      {(
        [
          [350, 90, 13], [378, 108, 10], [332, 118, 9],
          [700, 160, 12], [726, 176, 9], [688, 188, 8],
          [120, 330, 11], [146, 346, 9], [98, 352, 8],
          [620, 470, 12], [648, 488, 9], [600, 494, 8],
          [430, 60, 9], [452, 74, 7],
        ] as ReadonlyArray<[number, number, number]>
      ).map(([x, y, r], i) => (
        <g key={`tree-${i}`} opacity="0.9">
          <circle cx={x + 2} cy={y + 2.5} r={r} fill="rgba(25,35,20,0.28)" />
          <circle cx={x} cy={y} r={r} fill="rgba(56, 84, 50, 0.85)" />
          <circle cx={x - r * 0.25} cy={y - r * 0.25} r={r * 0.55} fill="rgba(84, 112, 74, 0.9)" />
        </g>
      ))}
    </g>

    {/* Calm wash + vignette */}
    <rect width="880" height="560" fill="rgba(238,242,247,0.06)" />
    <rect width="880" height="560" fill="url(#bwMapVignette)" />
  </svg>
);

/* ---------------------------------------------------------------- */

export const MapCanvas: React.FC = () => {
  const reduced = useReducedMotion();
  const [ref, inView] = useInViewOnce<HTMLDivElement>();
  const path = pointsToPath(PLOT);

  return (
    <div
      ref={ref}
      className="@container relative h-[420px] overflow-hidden rounded-[18px] @4xl:h-full"
      style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.35), 0 1px 3px rgba(11,18,32,0.12)' }}
      role="img"
      aria-label="Satellite map with a selected 2,450 square metre plot near Bengaluru — Lat 12.9716° N, Lon 77.5946° E"
    >
      {/* Aerial photograph (lazy — below the fold) + furniture overlay */}
      <img
        src="/map-aerial.jpg"
        alt=""
        loading="lazy"
        decoding="async"
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover"
        style={{ filter: 'saturate(0.62) brightness(1.1) contrast(0.94)' }}
      />
      <MapFurniture />

      {/* Plot overlay */}
      <svg
        viewBox="0 0 880 560"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        {/* Polygon fill + draw-on stroke */}
        <motion.path
          d={path}
          fill="rgba(255,255,255,0.16)"
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={timed(0.9, reduced ? 0 : 1.25)}
        />
        <motion.path
          d={path}
          fill="none"
          stroke="#ffffff"
          strokeWidth="2.6"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          style={{ filter: 'drop-shadow(0 1px 3px rgba(11,18,32,0.45))' }}
          initial={{ pathLength: 0 }}
          animate={inView ? { pathLength: 1 } : {}}
          transition={reduced ? { duration: 0.01 } : { duration: 1.5, delay: 0.35, ease: EASE_APPLE }}
        />

        {/* Vertex dots pop in sequence */}
        {PLOT.map(([x, y], i) => (
          <motion.circle
            key={`v-${i}`}
            cx={x}
            cy={y}
            r="5"
            fill="#ffffff"
            stroke="rgba(11,18,32,0.4)"
            strokeWidth="1.4"
            initial={{ scale: 0, opacity: 0 }}
            animate={inView ? { scale: 1, opacity: 1 } : {}}
            transition={reduced ? { duration: 0.01, delay: i * 0.04 } : { type: 'spring', stiffness: 380, damping: 20, delay: 1.15 + i * 0.08 }}
            style={{ transformOrigin: `${x}px ${y}px` }}
          />
        ))}

        {/* Center pin drop with bounce */}
        <motion.g
          initial={{ y: -46, opacity: 0, scale: 0.7 }}
          animate={inView ? { y: 0, opacity: 1, scale: 1 } : {}}
          transition={reduced ? { duration: 0.01 } : { ...SPRING_PIN, delay: 1.75 }}
          style={{ transformOrigin: `${PIN[0]}px ${PIN[1]}px` }}
        >
          <ellipse cx={PIN[0]} cy={PIN[1] + 3} rx="10" ry="3.4" fill="rgba(11,18,32,0.35)" />
          <path
            d={`M ${PIN[0]} ${PIN[1]} c -11 -12 -16 -19 -16 -27 a 16 16 0 1 1 32 0 c 0 8 -5 15 -16 27 z`}
            fill="#2f6fed"
            stroke="#ffffff"
            strokeWidth="2.2"
            style={{ filter: 'drop-shadow(0 3px 5px rgba(11,18,32,0.4))' }}
          />
          <circle cx={PIN[0]} cy={PIN[1] - 26} r="5.4" fill="#ffffff" />
        </motion.g>

        {/* Area chip */}
        <motion.g
          initial={{ opacity: 0, y: 8, scale: 0.85 }}
          animate={inView ? { opacity: 1, y: 0, scale: 1 } : {}}
          transition={reduced ? { duration: 0.01 } : { ...timed(0.5, 2.2), type: 'spring', stiffness: 300, damping: 24 }}
          style={{ transformOrigin: `${PIN[0]}px ${PIN[1] + 42}px` }}
        >
          <rect x={PIN[0] - 44} y={PIN[1] + 30} width="88" height="24" rx="12" fill="rgba(11,18,32,0.78)" />
          <text
            x={PIN[0]}
            y={PIN[1] + 46}
            textAnchor="middle"
            fill="#ffffff"
            fontSize="12"
            fontWeight="600"
            fontFamily="Inter, sans-serif"
          >
            2,450 m²
          </text>
        </motion.g>
      </svg>

      {/* Top overlay: search + chips */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3">
        <label className="flex h-9 w-[min(320px,58%)] items-center gap-2 rounded-[12px] px-3 focus-within:ring-2 focus-within:ring-[#2f6fed]" style={{ background: 'rgba(255,255,255,0.92)', boxShadow: LANDING.shadow.card }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8a93a3" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search location or enter coordinates…"
            aria-label="Search location or enter coordinates"
            className="w-full bg-transparent text-[12.5px] font-medium text-[#0b1220] placeholder:text-[#98a1b0] focus:outline-none"
          />
        </label>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-semibold text-[#0b1220] transition-transform duration-150 active:scale-[0.96]"
            style={{ background: 'rgba(255,255,255,0.92)', boxShadow: LANDING.shadow.card }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <path d="M3.5 9h17M3.5 15h17M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
            </svg>
            Hybrid
            <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M2 3.5 5 6.5 8 3.5" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Locate my position"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[#2f6fed] transition-transform duration-150 active:scale-[0.94]"
            style={{ background: 'rgba(255,255,255,0.92)', boxShadow: LANDING.shadow.card }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <circle cx="12" cy="12" r="7" />
              <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
            </svg>
          </button>
        </div>
      </div>

      {/* Bottom-left: Selected Location card */}
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={timed(0.7, reduced ? 0.1 : 2.35)}
        className="absolute bottom-3 left-3 flex max-w-[calc(100%-70px)] items-center gap-3 rounded-[14px] p-2.5 pr-8"
        style={{
          background: 'rgba(255,255,255,0.88)',
          backdropFilter: LANDING.glass.blur,
          WebkitBackdropFilter: LANDING.glass.blur,
          border: '1px solid rgba(255,255,255,0.7)',
          boxShadow: `${LANDING.glass.topLight}, ${LANDING.shadow.card}`,
        }}
      >
        {/* Thumbnail */}
        <span aria-hidden className="relative block h-[52px] w-[52px] shrink-0 overflow-hidden rounded-[10px]" style={{ background: 'linear-gradient(135deg, #94a878, #7f956a)' }}>
          <svg viewBox="0 0 52 52" className="absolute inset-0 h-full w-full">
            <path d="M0 44 C 14 42, 24 46, 30 52 L 0 52 Z" fill="#6d8fa5" />
            <path d="M40 0 L 52 0 L 52 16" stroke="#e8e4d8" strokeWidth="3" fill="none" />
            <polygon points="20,14 38,20 33,38 15,32" fill="rgba(255,255,255,0.3)" stroke="#ffffff" strokeWidth="1.6" />
            <circle cx="26" cy="26" r="3.4" fill="#2f6fed" stroke="#fff" strokeWidth="1.2" />
          </svg>
        </span>
        <span className="leading-tight">
          <span className="flex items-center gap-2 text-[12.5px] font-bold text-[#0b1220]">
            Selected Location
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2f6fed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
            </svg>
          </span>
          <span className="mt-1 block text-[11.5px] tabular-nums text-[#4b5768]">Lat:&nbsp;&nbsp;12.9716° N</span>
          <span className="block text-[11.5px] tabular-nums text-[#4b5768]">Lon:&nbsp;&nbsp;77.5946° E</span>
          <span className="block text-[11.5px] tabular-nums text-[#4b5768]">Area: 2,450 m² (0.61 acres)</span>
        </span>
      </motion.div>

      {/* Bottom-right: scale bar + compass */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={inView ? { opacity: 1 } : {}}
        transition={timed(0.7, reduced ? 0.1 : 2.5)}
        className="absolute bottom-3 right-3 flex items-end gap-3"
      >
        <div className="hidden flex-col items-center @sm:flex" aria-hidden>
          <span className="mb-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[#0b1220]" style={{ background: 'rgba(255,255,255,0.85)' }}>
            50 m
          </span>
          <span className="relative block h-[5px] w-[76px]">
            <span className="absolute inset-x-0 top-[2px] h-[1.6px] bg-[rgba(11,18,32,0.65)]" />
            <span className="absolute left-0 top-0 h-[5px] w-[1.6px] bg-[rgba(11,18,32,0.65)]" />
            <span className="absolute right-0 top-0 h-[5px] w-[1.6px] bg-[rgba(11,18,32,0.65)]" />
          </span>
        </div>

        <div
          className="relative flex h-[46px] w-[46px] items-center justify-center rounded-full"
          style={{
            background: 'rgba(255,255,255,0.88)',
            backdropFilter: LANDING.glass.blur,
            WebkitBackdropFilter: LANDING.glass.blur,
            border: '1px solid rgba(255,255,255,0.7)',
            boxShadow: LANDING.shadow.card,
          }}
          aria-hidden
        >
          <span className="absolute -top-0.5 text-[7.5px] font-bold text-[#0b1220]">N</span>
          <span className="absolute -right-0.5 text-[7.5px] font-semibold text-[#8a93a3]">E</span>
          <span className="absolute -bottom-0.5 text-[7.5px] font-semibold text-[#8a93a3]">S</span>
          <span className="absolute -left-0.5 text-[7.5px] font-semibold text-[#8a93a3]">W</span>
          <svg width="22" height="22" viewBox="0 0 22 22" className={inView ? 'bw-needle-wobble' : ''}>
            <polygon points="11,2.5 13.4,11 8.6,11" fill="#e23d3d" />
            <polygon points="11,19.5 13.4,11 8.6,11" fill="#b6bdc9" />
            <circle cx="11" cy="11" r="1.5" fill="#0b1220" />
          </svg>
        </div>
      </motion.div>
    </div>
  );
};
