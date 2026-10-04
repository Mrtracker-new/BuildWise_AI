/**
 * FloodCard — Flood Risk: Low rating with inundation probability < 5%.
 */
import React from 'react';
import { CardShell } from '../CardShell';

export const FloodCard: React.FC<{ onClose?: () => void }> = ({ onClose }) => (
  <CardShell title="Flood Risk" onClose={onClose} trailingArrow className="h-full">
    <div className="flex items-center gap-3">
      <span
        aria-hidden
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white"
        style={{ background: 'linear-gradient(135deg, #2f6fed, #6aa6ff)', boxShadow: '0 6px 14px -4px rgba(47,111,237,0.55)' }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 9c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
          <path d="M2 14c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
          <path d="M2 19c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
        </svg>
      </span>
      <div className="leading-tight">
        <p className="text-[19px] font-bold tracking-[-0.02em] text-[#0b1220]">Low</p>
        <p className="text-[11.5px] font-medium text-[#8a93a3]">Flood Inundation Probability</p>
      </div>
    </div>
    <p className="mt-2 border-t border-[rgba(11,18,32,0.07)] pt-2 text-[13px] font-bold tabular-nums text-[#0b1220]">
      &lt; 5%
    </p>
  </CardShell>
);
