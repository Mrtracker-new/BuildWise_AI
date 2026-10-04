/**
 * Sidebar.tsx — the mockup's left rail.
 * Brand row, app nav with an active pill, and the LAYERS group of six
 * working iOS toggles (Satellite, Terrain, Flood Risk, Seismic Zones,
 * Land Use, Boundaries). Below the mockup's @5xl container width it
 * reflows into horizontally-scrollable chips.
 */
import React, { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { IOSToggle } from '../primitives';
import { SPRING_SOFT } from '../motion';
import { LANDING } from '../theme';
import logoUrl from '../../assets/BuildWise_logo_square.png';

type NavId = 'new-analysis' | 'saved' | 'reports' | 'blueprints' | 'compare';

const NAV_ITEMS: ReadonlyArray<{ id: NavId; label: string; icon: React.ReactNode }> = [
  {
    id: 'new-analysis',
    label: 'New Analysis',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="3" width="18" height="18" rx="4" />
        <path d="M12 8v8M8 12h8" />
      </svg>
    ),
  },
  {
    id: 'saved',
    label: 'Saved Sites',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
      </svg>
    ),
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    ),
  },
  {
    id: 'blueprints',
    label: 'Blueprints',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M9 21V9" />
      </svg>
    ),
  },
  {
    id: 'compare',
    label: 'Compare Sites',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="2" y="8" width="7" height="12" rx="1.5" />
        <rect x="15" y="4" width="7" height="16" rx="1.5" />
        <path d="M9 14h6" strokeDasharray="2 2" />
      </svg>
    ),
  },
];

interface LayerState {
  id: string;
  label: string;
  icon: React.ReactNode;
  on: boolean;
}

const LAYERS: ReadonlyArray<LayerState> = [
  {
    id: 'satellite',
    label: 'Satellite',
    on: true,
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="M3.5 9h17M3.5 15h17M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
      </svg>
    ),
  },
  {
    id: 'terrain',
    label: 'Terrain',
    on: false,
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M8 3l4 8 5-5 5 15H2L8 3z" />
      </svg>
    ),
  },
  {
    id: 'flood',
    label: 'Flood Risk',
    on: true,
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M2 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0M2 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
      </svg>
    ),
  },
  {
    id: 'seismic',
    label: 'Seismic Zones',
    on: true,
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <polyline points="2 12 6 12 9 4 14 20 17 12 22 12" />
      </svg>
    ),
  },
  {
    id: 'landuse',
    label: 'Land Use',
    on: false,
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="3" width="8" height="8" rx="1" />
        <rect x="13" y="3" width="8" height="5" rx="1" />
        <rect x="3" y="13" width="8" height="8" rx="1" />
        <rect x="13" y="10" width="8" height="11" rx="1" />
      </svg>
    ),
  },
  {
    id: 'boundaries',
    label: 'Boundaries',
    on: false,
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="4" y="4" width="16" height="16" rx="1" strokeDasharray="3 2.4" />
      </svg>
    ),
  },
];

export const Sidebar: React.FC = () => {
  const [active, setActive] = useState<NavId>('new-analysis');
  const [layers, setLayers] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(LAYERS.map((l) => [l.id, l.on]))
  );
  const reduced = useReducedMotion();

  const toggleLayer = (id: string) => setLayers((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Brand row */}
      <div className="flex items-center gap-2 px-3 pb-2.5 pt-1">
        <img src={logoUrl} alt="" width={22} height={22} className="rounded-[6px]" decoding="async" />
        <span className="text-[13px] font-bold tracking-[-0.01em] text-[#0b1220]">BuildWise AI</span>
      </div>
      <div aria-hidden className="mx-3 h-px bg-[rgba(11,18,32,0.07)]" />

      {/* Nav list (vertical ≥@5xl) */}
      <nav aria-label="Mockup app navigation" className="hidden min-h-0 flex-col gap-0.5 overflow-y-auto p-2 @4xl:flex">
        {NAV_ITEMS.map((item) => {
          const selected = item.id === active;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActive(item.id)}
              aria-current={selected ? 'page' : undefined}
              className="relative flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-[7px] text-left text-[12.5px] font-medium transition-colors duration-200"
              style={{ color: selected ? '#2f6fed' : '#4b5768' }}
            >
              {selected && (
                <motion.span
                  layoutId="bw-side-active"
                  transition={reduced ? { duration: 0.15 } : SPRING_SOFT}
                  className="absolute inset-0 rounded-[10px]"
                  style={{ background: 'rgba(47, 111, 237, 0.11)' }}
                />
              )}
              <span className="relative">{item.icon}</span>
              <span className="relative">{item.label}</span>
            </button>
          );
        })}

        <div aria-hidden className="my-2 h-px bg-[rgba(11,18,32,0.07)]" />

        <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase text-[#8a93a3]" style={{ letterSpacing: '0.14em' }}>
          Layers
        </p>
        <ul className="flex flex-col gap-0.5">
          {LAYERS.map((layer) => (
            <li key={layer.id} className="flex items-center gap-2.5 rounded-[10px] px-2.5 py-[6px] text-[12px] font-medium text-[#4b5768]">
              <span className="text-[#7d8797]" aria-hidden>{layer.icon}</span>
              <span className="flex-1">{layer.label}</span>
              <IOSToggle label={`Toggle ${layer.label} layer`} checked={layers[layer.id]} onChange={() => toggleLayer(layer.id)} />
            </li>
          ))}
        </ul>
      </nav>

      {/* Chips (horizontal <@5xl) */}
      <div
        className="flex items-center gap-2 overflow-x-auto p-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden @4xl:hidden"
        data-lenis-prevent
      >
        {NAV_ITEMS.map((item) => {
          const selected = item.id === active;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActive(item.id)}
              className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors duration-200"
              style={{
                background: selected ? '#2f6fed' : 'rgba(255,255,255,0.75)',
                color: selected ? '#ffffff' : '#4b5768',
                border: `1px solid ${selected ? '#2f6fed' : 'rgba(11,18,32,0.08)'}`,
                boxShadow: selected ? '0 4px 10px -3px rgba(47,111,237,0.5)' : LANDING.glass.topLight,
              }}
            >
              {item.icon}
              {item.label}
            </button>
          );
        })}
        <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-[rgba(11,18,32,0.1)]" />
        {LAYERS.map((layer) => (
          <span
            key={layer.id}
            className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium text-[#4b5768]"
            style={{
              background: 'rgba(255,255,255,0.75)',
              border: '1px solid rgba(11,18,32,0.08)',
            }}
          >
            {layer.icon}
            {layer.label}
            <IOSToggle label={`Toggle ${layer.label} layer`} checked={layers[layer.id]} onChange={() => toggleLayer(layer.id)} />
          </span>
        ))}
      </div>
    </div>
  );
};
