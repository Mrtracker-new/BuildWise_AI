/**
 * SuitabilityCard — Site Suitability: ring gauge animating 0 → 87 with
 * easeOut on scroll-in, plus the four green factor checks.
 */
import React from 'react';
import { useCountUp, useInViewOnce } from '../../hooks';
import { RingGauge } from '../../primitives';
import { CardShell, CheckRow } from '../CardShell';

export const SuitabilityCard: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const [ref, inView] = useInViewOnce<HTMLDivElement>();
  const score = useCountUp(87, inView, 1600);

  return (
    <div ref={ref} className="h-full">
      <CardShell title="Site Suitability" onClose={onClose} className="h-full">
        <div className="flex items-center gap-3">
          <div className="relative">
            <RingGauge score={87} size={84} stroke={7.5} start={inView}>
              <span className="text-[24px] font-bold tabular-nums tracking-[-0.03em] text-[#0b1220]">{score}</span>
            </RingGauge>
          </div>
          <span className="text-[12px] font-medium tabular-nums text-[#8a93a3]">100</span>
        </div>
        <div className="mt-2.5 flex flex-col gap-[7px]">
          <CheckRow label="Terrain & Slope" />
          <CheckRow label="Soil Characteristics" />
          <CheckRow label="Accessibility" />
          <CheckRow label="Environmental Impact" />
        </div>
      </CardShell>
    </div>
  );
};
