/**
 * BlueprintCard — Generated Blueprint: "Ground Floor" select, the
 * generative floor-plan drawing (crafted SVG, 174 mm print-ready),
 * and the program summary.
 */
import React from 'react';
import { CardShell } from '../CardShell';

/** Crafted ground-floor drawing: walls with door gaps, arcs, fixtures. */
const FloorPlan: React.FC = () => (
  <svg viewBox="0 0 200 148" className="bw-mockup-svg h-auto w-full rounded-[10px]" aria-hidden>
    <rect width="200" height="148" rx="8" fill="#ffffff" />
    <rect x="0.75" y="0.75" width="198.5" height="146.5" rx="8" fill="none" stroke="rgba(11,18,32,0.08)" />

    <g stroke="#1f2a3a" fill="none" strokeLinecap="square">
      {/* Outer walls — main entrance gap at bottom center (84→108) */}
      <path d="M28 22 H172 M28 22 V126 M172 22 V126" strokeWidth="4" />
      <path d="M28 126 H84 M108 126 H172" strokeWidth="4" />
      {/* Interior vertical wall (x=112) with bedroom door gap 52→66 */}
      <path d="M112 22 V52 M112 66 V126" strokeWidth="3" />
      {/* Interior horizontal wall (y=78) with bath door gap 44→58 (opens into the bath) */}
      <path d="M28 78 H44 M58 78 H112" strokeWidth="3" />
      {/* Bath partition */}
      <path d="M60 78 V126" strokeWidth="2.4" />

      {/* Doors: hinge dot + leaf + quarter-circle swing into the room */}
      <g strokeWidth="1.4" strokeLinecap="round">
        {/* Main entry — hinge (108,126), leaf up; swing sweeps into the living room */}
        <path d="M108 126 V114" />
        <path d="M96 126 A 12 12 0 0 1 108 114" strokeWidth="1" strokeDasharray="2.5 2" opacity="0.85" />
        {/* Bedroom — hinge (112,52), leaf into the bedroom */}
        <path d="M112 52 H98" />
        <path d="M112 66 A 14 14 0 0 1 98 52" strokeWidth="1" strokeDasharray="2.5 2" opacity="0.85" />
        {/* Bath — hinge (44,78), leaf down into the bath */}
        <path d="M44 78 V92" />
        <path d="M58 78 A 14 14 0 0 1 44 92" strokeWidth="1" strokeDasharray="2.5 2" opacity="0.85" />
      </g>
      <g fill="#1f2a3a" stroke="none">
        <circle cx="108" cy="126" r="1.6" />
        <circle cx="112" cy="52" r="1.6" />
        <circle cx="44" cy="78" r="1.6" />
      </g>
    </g>

    {/* Furniture + fixtures */}
    <g stroke="#42506b" strokeWidth="1.1" fill="none">
      {/* Bedroom (top-left): bed */}
      <rect x="36" y="30" width="30" height="20" rx="2" />
      <line x1="42" y1="30" x2="42" y2="50" />
      {/* Living (bottom-mid): sofa + table */}
      <rect x="70" y="94" width="22" height="10" rx="2" />
      <rect x="84" y="108" width="14" height="9" rx="1.5" />
      {/* Kitchen (top-right): counter + hob */}
      <rect x="116" y="26" width="52" height="9" rx="1.5" />
      <circle cx="128" cy="30.5" r="2.2" />
      <circle cx="136" cy="30.5" r="2.2" />
      {/* Bath: WC + basin */}
      <rect x="34" y="98" width="10" height="13" rx="2" />
      <circle cx="50" cy="112" r="4" />
      {/* Master bed (right room) */}
      <rect x="126" y="46" width="34" height="22" rx="2" />
      <line x1="133" y1="46" x2="133" y2="68" />
    </g>

    {/* North-ish entrance arrow */}
    <g aria-hidden>
      <path d="M96 140 V132" stroke="#2f6fed" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M93 135 L96 130.5 L99 135" fill="none" stroke="#2f6fed" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  </svg>
);

export const BlueprintCard: React.FC<{ onClose?: () => void }> = ({ onClose }) => (
  <CardShell title="Generated Blueprint" onClose={onClose} trailingArrow className="h-full">
    {/* Floor selector chip */}
    <button
      type="button"
      className="mb-2 flex h-7 w-full items-center justify-between rounded-[9px] px-2.5 text-[11.5px] font-semibold text-[#0b1220] transition-colors duration-150 hover:bg-[rgba(47,111,237,0.08)]"
      style={{ background: 'rgba(47,111,237,0.10)', border: '1px solid rgba(47,111,237,0.22)' }}
      aria-label="Blueprint floor: Ground Floor"
    >
      Ground Floor
      <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="#2f6fed" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M2 3.5 5 6.5 8 3.5" />
      </svg>
    </button>

    <FloorPlan />

    <p className="mt-2 text-[12px] font-bold text-[#0b1220]">3 BHK + Living + Kitchen</p>
    <p className="text-[11px] font-medium tabular-nums text-[#8a93a3]">174 mm (Print-Ready)</p>
  </CardShell>
);
