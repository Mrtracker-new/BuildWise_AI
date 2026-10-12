import React from 'react';
import { useUnits } from './units';

interface UnitToggleProps {
  /**
   * Disable on surfaces where the unit preference does not apply (e.g. the
   * Cost & Plan tab, where CPWD rates are quoted per square foot). A disabled
   * toggle carries an explanatory tooltip rather than silently doing nothing.
   */
  disabled?: boolean;
  disabledReason?: string;
}

/**
 * Segmented metric/imperial switch for the report. Toggling re-renders every
 * unit-aware tile in place (memoized consumers), so there is no layout shift.
 */
export const UnitToggle: React.FC<UnitToggleProps> = ({ disabled = false, disabledReason }) => {
  const { length, toggle } = useUnits();
  const isImperial = length === 'ft';
  return (
    <button
      type="button"
      onClick={disabled ? undefined : toggle}
      disabled={disabled}
      role="switch"
      aria-checked={isImperial}
      aria-disabled={disabled}
      aria-label="Toggle measurement units between metres and feet"
      title={disabled ? (disabledReason ?? 'Unit toggle unavailable on this tab') : 'Toggle units (m / ft, sq m / sq ft)'}
      className={`print-hide h-7 px-2.5 rounded-[8px] bg-[var(--fill)] text-[11px] font-semibold tabular-nums text-[var(--text-2)] inline-flex items-center gap-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 ${
        disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-[var(--fill-hover)] hover:text-[var(--text-1)] cursor-pointer'
      }`}
    >
      <span className={isImperial ? 'text-[var(--text-3)]' : 'text-[var(--accent-ink)]'}>m</span>
      <span className="text-[var(--text-3)]">/</span>
      <span className={isImperial ? 'text-[var(--accent-ink)]' : 'text-[var(--text-3)]'}>ft</span>
    </button>
  );
};
