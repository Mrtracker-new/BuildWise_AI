/**
 * VastuCard — Vastu Orientation: compass dial with a settling needle,
 * 94% compliant counter, and the four orientation checks.
 */
import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useCountUp, useInViewOnce } from '../../hooks';
import { EASE_APPLE } from '../../motion';
import { CardShell, CheckRow } from '../CardShell';

const CompassDial: React.FC<{ active: boolean }> = ({ active }) => {
  const reduced = useReducedMotion();
  return (
    <svg width="86" height="86" viewBox="0 0 86 86" aria-hidden className="shrink-0">
      <circle cx="43" cy="43" r="38" fill="rgba(255,255,255,0.9)" stroke="rgba(11,18,32,0.1)" strokeWidth="1.5" />
      <circle cx="43" cy="43" r="29" fill="none" stroke="rgba(11,18,32,0.07)" strokeWidth="1" strokeDasharray="2 3" />
      <text x="43" y="14" textAnchor="middle" fontSize="9" fontWeight="700" fill="#0b1220" fontFamily="Inter, sans-serif">N</text>
      <text x="76" y="46.5" textAnchor="middle" fontSize="8" fontWeight="600" fill="#8a93a3" fontFamily="Inter, sans-serif">E</text>
      <text x="43" y="78" textAnchor="middle" fontSize="8" fontWeight="600" fill="#8a93a3" fontFamily="Inter, sans-serif">S</text>
      <text x="10" y="46.5" textAnchor="middle" fontSize="8" fontWeight="600" fill="#8a93a3" fontFamily="Inter, sans-serif">W</text>
      <motion.g
        initial={{ rotate: -120 }}
        animate={active ? { rotate: 0 } : {}}
        transition={reduced ? { duration: 0.01 } : { duration: 1.6, delay: 0.3, ease: EASE_APPLE }}
        style={{ transformOrigin: '43px 43px' }}
      >
        <polygon points="43,17 47.5,43 38.5,43" fill="#e23d3d" />
        <polygon points="43,69 47.5,43 38.5,43" fill="#c3cad6" />
      </motion.g>
      <circle cx="43" cy="43" r="3" fill="#0b1220" />
      <circle cx="43" cy="43" r="1.2" fill="#ffffff" />
    </svg>
  );
};

export const VastuCard: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const [ref, inView] = useInViewOnce<HTMLDivElement>();
  const pct = useCountUp(94, inView, 1500);

  return (
    <div ref={ref} className="h-full">
      <CardShell title="Vastu Orientation" onClose={onClose} className="h-full">
        <div className="flex items-center gap-2">
          <CompassDial active={inView} />
          <p className="text-[17px] font-bold tracking-[-0.02em] text-[#1fa955]">
            <span className="tabular-nums">{pct}%</span>{' '}
            <span className="text-[13px] font-semibold">Compliant</span>
          </p>
        </div>
        <div className="mt-1.5 flex flex-col gap-[7px]">
          <CheckRow label="Main Entrance" />
          <CheckRow label="Kitchen Placement" />
          <CheckRow label="Bedroom Placement" />
          <CheckRow label="Overall Orientation" />
        </div>
      </CardShell>
    </div>
  );
};
