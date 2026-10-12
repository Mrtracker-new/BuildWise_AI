/**
 * PresetMenu.tsx — Presets dropdown for the trace toolbar.
 * ===================================================================
 * Replaces the wizard's cryptic single-letter chips (R / L / T / P) with a
 * glass dropdown anchored to the toolbar "Presets" button: four parametric
 * plot seeds, each with an inline SVG thumbnail (pure geometry preview, no
 * bitmap), its full name and a short footprint caption. Selecting a preset
 * seeds a parametric polygon centered on the pin at the wizard's current
 * dimensions (width and depth for rect/L, uniform size otherwise) and flips
 * the session into EDIT mode so the seed is immediately adjustable.
 *
 * Glass surface, token colors only; Escape and outside-click dismiss;
 * focus-visible rings on every item; role=menu/menuitem semantics.
 */
import React, { useCallback, useEffect, useRef } from 'react';
import { Icon } from '../Icon';

export type PresetMenuId = 'rect' | 'l_shape' | 'trapezoid' | 'pentagon';

interface PresetDef {
  id: PresetMenuId;
  name: string;
  caption: string;
}

const PRESETS: PresetDef[] = [
  { id: 'rect', name: 'Rectangle', caption: 'Frontage x depth plot' },
  { id: 'l_shape', name: 'L-Shape', caption: 'Wing + main block' },
  { id: 'trapezoid', name: 'Trapezoid', caption: 'Tapered corner site' },
  { id: 'pentagon', name: 'Pentagon', caption: 'Radial corner plot' },
];

/** Mini SVG thumbnail of the seeded geometry (viewBox 0 0 32 32). */
function Thumb({ id }: { id: PresetMenuId }) {
  // Stroke uses the accent token; fill uses a light accent tint.
  const stroke = 'var(--accent)';
  const fill = 'rgba(59, 130, 246, 0.14)';
  switch (id) {
    case 'rect':
      return (
        <svg width={32} height={32} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
          <rect x={4} y={8} width={24} height={16} rx={1} fill={fill} stroke={stroke} strokeWidth={1.6} />
        </svg>
      );
    case 'l_shape':
      return (
        <svg width={32} height={32} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
          <path d="M6 6 h12 v8 h8 v12 h-20 z" fill={fill} stroke={stroke} strokeWidth={1.6} strokeLinejoin="round" />
        </svg>
      );
    case 'trapezoid':
      return (
        <svg width={32} height={32} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
          <path d="M8 8 h16 l4 16 h-24 z" fill={fill} stroke={stroke} strokeWidth={1.6} strokeLinejoin="round" />
        </svg>
      );
    case 'pentagon':
      return (
        <svg width={32} height={32} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
          <path d="M16 4 l12 9 -4.5 14 h-15 l-4.5 -14 z" fill={fill} stroke={stroke} strokeWidth={1.6} strokeLinejoin="round" />
        </svg>
      );
  }
}

export interface PresetMenuProps {
  open: boolean;
  onClose: () => void;
  /** Width × depth (m) mirrors the wizard inputs (drives rect + L seed size). */
  widthM: number;
  depthM: number;
  rotationDeg: number;
  onPick: (id: PresetMenuId) => void;
}

export const PresetMenu: React.FC<PresetMenuProps> = ({ open, onClose, widthM, depthM, rotationDeg, onPick }) => {
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Outside-click + Escape dismissal (standard popover contract).
  const onDocMouseDown = useCallback(
    (e: MouseEvent): void => {
      if (!open) return;
      if (rootRef.current && e.target instanceof Node && rootRef.current.contains(e.target)) return;
      onClose();
    },
    [open, onClose]
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener('mousedown', onDocMouseDown);
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, onDocMouseDown, onClose]);

  if (!open) return null;

  return (
    <div
      ref={rootRef}
      role="menu"
      aria-label="Plot shape presets"
      data-testid="preset-menu"
      className="absolute right-0 top-[calc(100%+8px)] z-[1100] w-[248px] vibrancy-panel rounded-[14px] shadow-2xl border border-[var(--panel-border-color)] p-1.5 select-none"
      style={{ animation: 'bwMenuIn 140ms var(--bw-ease-apple) both' }}
    >
      <div className="flex items-center gap-1.5 px-2 pt-1 pb-1.5">
        <Icon name="layout-grid" size={12} className="text-[var(--accent-ink)] shrink-0" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)]">
          Plot presets
        </span>
      </div>
      {PRESETS.map((p) => (
        <button
          key={p.id}
          type="button"
          role="menuitem"
          data-testid={`preset-item-${p.id}`}
          onClick={() => {
            onPick(p.id);
            onClose();
          }}
          title={`${p.name} — ${widthM} x ${depthM} m${rotationDeg ? ` at ${rotationDeg} deg` : ''}`}
          className="w-full flex items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-left hover:bg-[var(--fill)] active:bg-[var(--fill-hover)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] cursor-pointer"
        >
          <Thumb id={p.id} />
          <span className="min-w-0">
            <span className="block text-[12px] font-semibold text-[var(--text-1)] leading-tight">{p.name}</span>
            <span className="block text-[10px] text-[var(--text-3)] leading-tight">{p.caption}</span>
          </span>
        </button>
      ))}
    </div>
  );
};
