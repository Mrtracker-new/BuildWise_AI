import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { formatIN } from '../../services/numberFormat';

/**
 * Global measurement-unit preference for the report (metres vs feet,
 * square metres vs square feet). Persisted in localStorage so the choice
 * survives reloads, and applied report-wide through the useUnits hook.
 */
export type LengthUnit = 'm' | 'ft';
export type AreaUnit = 'm2' | 'sqft';

const STORAGE_KEY = 'buildwise.units';

interface UnitsContextValue {
  length: LengthUnit;
  area: AreaUnit;
  toggle: () => void;
  /** Format a length in metres into the active unit. */
  formatLength: (meters: number, opts?: { decimals?: number; withUnit?: boolean }) => string;
  /** Format an area in square metres into the active unit. */
  formatArea: (sqMeters: number, opts?: { decimals?: number; withUnit?: boolean }) => string;
}

const M_TO_FT = 3.280839895;
const M2_TO_SQFT = 10.76391042;

const UnitsContext = createContext<UnitsContextValue | null>(null);

function readStored(): { length: LengthUnit; area: AreaUnit } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'imperial') return { length: 'ft', area: 'sqft' };
  } catch {
    /* storage unavailable - keep metric default */
  }
  return { length: 'm', area: 'm2' };
}

export const UnitsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [units, setUnits] = useState<{ length: LengthUnit; area: AreaUnit }>(readStored);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, units.length === 'ft' ? 'imperial' : 'metric');
    } catch {
      /* storage unavailable */
    }
  }, [units]);

  const toggle = useCallback(() => {
    setUnits((prev) =>
      prev.length === 'm' ? { length: 'ft', area: 'sqft' } : { length: 'm', area: 'm2' }
    );
  }, []);

  const value = useMemo<UnitsContextValue>(() => {
    const formatLength: UnitsContextValue['formatLength'] = (meters, opts) => {
      const { decimals = 1, withUnit = true } = opts ?? {};
      if (units.length === 'ft') {
        const ft = meters * M_TO_FT;
        return `${ft.toFixed(decimals)}${withUnit ? ' ft' : ''}`;
      }
      return `${meters.toFixed(decimals)}${withUnit ? ' m' : ''}`;
    };
    const formatArea: UnitsContextValue['formatArea'] = (sqMeters, opts) => {
      const { decimals = 1, withUnit = true } = opts ?? {};
      if (units.area === 'sqft') {
        const sqft = sqMeters * M2_TO_SQFT;
        return `${formatIN(Math.round(sqft))}${withUnit ? ' sq ft' : ''}`;
      }
      return `${sqMeters.toFixed(decimals)}${withUnit ? ' m²' : ''}`;
    };
    return { length: units.length, area: units.area, toggle, formatLength, formatArea };
  }, [units, toggle]);

  return <UnitsContext.Provider value={value}>{children}</UnitsContext.Provider>;
};

export function useUnits(): UnitsContextValue {
  const ctx = useContext(UnitsContext);
  if (!ctx) {
    // Safe default outside a provider (metric) — keeps components testable.
    return {
      length: 'm',
      area: 'm2',
      toggle: () => {},
      formatLength: (m, o) => `${m.toFixed(o?.decimals ?? 1)}${o?.withUnit === false ? '' : ' m'}`,
      formatArea: (a, o) => `${a.toFixed(o?.decimals ?? 1)}${o?.withUnit === false ? '' : ' m²'}`,
    };
  }
  return ctx;
}
