/**
 * landing/primitives.tsx — landing building blocks (components only;
 * hooks live in hooks.ts for fast-refresh cleanliness).
 * GlassCard (cursor-tracked specular sheen), IOSToggle (ARIA switch with
 * a spring knob), RingGauge (0→N animated gauge).
 */
import React, { useCallback, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { SPRING_INTERACTIVE, timed } from './motion';
import { LANDING } from './theme';

/* ------------------------------------------------------------------ */
/* GlassCard — frosted panel with a cursor-tracked specular sheen      */
/* ------------------------------------------------------------------ */

export interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Stronger fill for cards that sit on imagery */
  strong?: boolean;
  /** Radius override (px) */
  radius?: number;
}

export const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(function GlassCard(
  { strong = false, radius = LANDING.radius.card, className = '', style, children, ...rest },
  ref
) {
  const innerRef = useRef<HTMLDivElement | null>(null);
  const setRefs = (node: HTMLDivElement | null) => {
    innerRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
  };

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = innerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - rect.left}px`);
    el.style.setProperty('--my', `${e.clientY - rect.top}px`);
  }, []);

  return (
    <div
      ref={setRefs}
      onPointerMove={onPointerMove}
      className={`group/card relative overflow-hidden ${className}`}
      style={{
        borderRadius: radius,
        background: strong ? LANDING.glass.fillStrong : LANDING.glass.fill,
        backdropFilter: LANDING.glass.blur,
        WebkitBackdropFilter: LANDING.glass.blur,
        border: `1px solid ${LANDING.glass.hairline}`,
        boxShadow: `${LANDING.glass.topLight}, ${LANDING.shadow.card}`,
        ...style,
      }}
      {...rest}
    >
      {/* Specular sheen follows the pointer (paint-only) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover/card:opacity-100"
        style={{
          borderRadius: radius,
          background:
            'radial-gradient(420px circle at var(--mx, 50%) var(--my, 50%), rgba(255,255,255,0.30), transparent 55%)',
        }}
      />
      {children}
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* IOSToggle — working ARIA switch with a spring knob                  */
/* ------------------------------------------------------------------ */

export interface IOSToggleProps {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}

export const IOSToggle: React.FC<IOSToggleProps> = ({ label, checked, onChange }) => {
  const reduced = useReducedMotion();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-[22px] w-[38px] shrink-0 cursor-pointer items-center rounded-full focus-visible:outline-none"
      style={{
        backgroundColor: checked ? '#1fa955' : 'rgba(120, 120, 128, 0.28)',
        transition: 'background-color 300ms var(--bw-ease-apple)',
      }}
    >
      <motion.span
        aria-hidden
        className="bw-switch-knob absolute left-[2px] top-[2px] h-[18px] w-[18px] rounded-full bg-white"
        animate={{ x: checked ? 16 : 0 }}
        transition={reduced ? { duration: 0.15 } : SPRING_INTERACTIVE}
      />
    </button>
  );
};

/* ------------------------------------------------------------------ */
/* RingGauge — animated 0→score ring with easeOut                      */
/* ------------------------------------------------------------------ */

export interface RingGaugeProps {
  /** 0–100 */
  score: number;
  size?: number;
  stroke?: number;
  start: boolean;
  children?: React.ReactNode;
}

export const RingGauge: React.FC<RingGaugeProps> = ({
  score,
  size = 92,
  stroke = 8,
  start,
  children,
}) => {
  const reduced = useReducedMotion();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const target = c * (1 - Math.min(100, Math.max(0, score)) / 100);
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(11, 18, 32, 0.08)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#bwRingGrad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: start || reduced ? target : c }}
          transition={reduced ? { duration: 0.01 } : timed(1.6, 0.25)}
        />
        <defs>
          <linearGradient id="bwRingGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#31c465" />
            <stop offset="100%" stopColor="#1fa955" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
};
