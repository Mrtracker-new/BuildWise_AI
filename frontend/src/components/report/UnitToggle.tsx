import React from 'react';
import { useUnits } from './units';

/**
 * Segmented metric/imperial switch for the report. Toggling re-renders every
 * unit-aware tile in place (memoized consumers), so there is no layout shift.
 */
export const UnitToggle: React.FC = () => {
  const { length, toggle } = useUnits();
  const isImperial = length === 'ft';
  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={isImperial}
      aria-label="Toggle measurement units between metres and feet"
      title="Toggle units (m ↔ ft, m² ↔ sq ft)"
      className="print-hide h-7 px-2.5 rounded-[8px] bg-[var(--fill)] hover:bg-[var(--fill-hover)] text-[11px] font-semibold tabular-nums text-[var(--text-2)] hover:text-[var(--text-1)] inline-flex items-center gap-1 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
    >
      <span className={isImperial ? 'text-[var(--text-3)]' : 'text-[var(--accent)]'}>m</span>
      <span className="text-[var(--text-3)]">/</span>
      <span className={isImperial ? 'text-[var(--accent)]' : 'text-[var(--text-3)]'}>ft</span>
    </button>
  );
};
