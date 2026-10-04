/**
 * CostCard — Estimated Cost: ₹48.6 L counter for 2,000 sq.ft (G+1) with
 * the CPWD-style foundation/superstructure/finishing/services breakdown.
 */
import React from 'react';
import { useCountUp, useInViewOnce } from '../../hooks';
import { CardShell } from '../CardShell';

const BREAKDOWN: ReadonlyArray<[string, string]> = [
  ['Foundation', '12.4 L'],
  ['Superstructure', '22.1 L'],
  ['Finishing', '9.8 L'],
  ['Services', '4.3 L'],
];

export const CostCard: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const [ref, inView] = useInViewOnce<HTMLDivElement>();
  const total = useCountUp(48.6, inView, 1500, 1);

  return (
    <div ref={ref} className="h-full">
      <CardShell title="Estimated Cost" onClose={onClose} className="h-full">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white"
            style={{ background: 'linear-gradient(135deg, #1fa955, #31c465)', boxShadow: '0 6px 14px -4px rgba(31,169,85,0.55)' }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 3h12" />
              <path d="M6 8h12" />
              <path d="M6 13l8.5 8" />
              <path d="M6 13h3" />
              <path d="M9 13c6.667 0 6.667-10 0-10" />
            </svg>
          </span>
          <div className="leading-tight">
            <p className="text-[20px] font-bold tracking-[-0.02em] tabular-nums text-[#0b1220]">₹{total} L</p>
            <p className="text-[11px] font-medium text-[#8a93a3]">For 2,000 sq.ft (G+1)</p>
          </div>
        </div>

        <dl className="mt-2.5 border-t border-[rgba(11,18,32,0.07)] pt-1.5">
          {BREAKDOWN.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between py-[3.5px]">
              <dt className="text-[11.5px] font-medium text-[#4b5768]">{label}</dt>
              <dd className="text-[11.5px] font-semibold tabular-nums text-[#0b1220]">{value}</dd>
            </div>
          ))}
        </dl>
      </CardShell>
    </div>
  );
};
