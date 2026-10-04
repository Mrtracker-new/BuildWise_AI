/**
 * SeismicCard — Seismic Analysis: Zone III badge, moderate risk,
 * IS 1893 (Part 1): 2016 reference line.
 */
import React from 'react';
import { CardShell } from '../CardShell';

export const SeismicCard: React.FC<{ onClose?: () => void }> = ({ onClose }) => (
  <CardShell title="Seismic Analysis" onClose={onClose} trailingArrow className="h-full">
    <div className="flex items-center gap-3">
      <span
        aria-hidden
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white"
        style={{ background: 'linear-gradient(135deg, #2f6fed, #6aa6ff)', boxShadow: '0 6px 14px -4px rgba(47,111,237,0.55)' }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="2 12 6 12 9 4 14 20 17 12 22 12" />
        </svg>
      </span>
      <div className="leading-tight">
        <p className="text-[19px] font-bold tracking-[-0.02em] text-[#0b1220]">Zone III</p>
        <p className="text-[12px] font-semibold text-[#e8960c]">Moderate Risk</p>
      </div>
    </div>
    <p className="mt-2.5 border-t border-[rgba(11,18,32,0.07)] pt-2 text-[10.5px] font-medium text-[#8a93a3]">
      As per IS 1893 (Part 1): 2016
    </p>
  </CardShell>
);
