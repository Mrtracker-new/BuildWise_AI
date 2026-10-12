import React from 'react';
import type { AnalysisResponse } from '../../services/types';
import { computeDataHealth, type DataHealthCounts } from './dataHealth';
import { Icon } from '../Icon';

interface DataHealthStripProps {
  data: AnalysisResponse;
}

const CHIPS: {
  key: keyof DataHealthCounts;
  label: string;
  icon: 'badge-check' | 'info' | 'alert-triangle';
  className: string;
  title: string;
}[] = [
  {
    key: 'verified',
    label: 'Verified',
    icon: 'badge-check',
    className: 'text-[var(--semantic-green-ink)] border border-[var(--semantic-green)]/25 bg-[var(--semantic-green)]/10',
    title: 'Measured from live external telemetry (Overpass, ERA5, USGS, GloFAS).',
  },
  {
    key: 'calculated',
    label: 'Calculated',
    icon: 'info',
    className: 'text-[var(--accent-ink)] border border-[var(--accent)]/25 bg-[var(--accent-tint)]',
    title: 'Deterministic engine outputs computed server-side from the request payload.',
  },
  {
    key: 'assumed',
    label: 'Assumed',
    icon: 'alert-triangle',
    className: 'text-[var(--semantic-amber-ink)] border border-[var(--semantic-amber)]/25 bg-[var(--semantic-amber)]/10',
    title: 'Synthetic fallback or modelled baseline in effect — see the degradation notice for details.',
  },
  {
    key: 'unknown',
    label: 'Unknown',
    icon: 'info',
    className: 'text-[var(--text-2)] border border-dashed border-[var(--hairline)] bg-[var(--fill)]',
    title: 'Telemetry unreachable; a disclosed neutral placeholder is used (never a fabricated value).',
  },
];

export const DataHealthStrip: React.FC<DataHealthStripProps> = ({ data }) => {
  const counts = computeDataHealth(data);

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 pt-3 border-t border-[var(--hairline)]"
      role="group"
      aria-label="Data health summary"
    >
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)] mr-1">
        Data health
      </span>
      {CHIPS.map((chip) => {
        const count = counts[chip.key];
        if (count === 0) return null;
        return (
          <span
            key={chip.key}
            title={chip.title}
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${chip.className}`}
          >
            <Icon name={chip.icon} size={11} className="shrink-0" />
            <span className="tabular-nums">{count}</span>
            <span>{chip.label}</span>
          </span>
        );
      })}
    </div>
  );
};
