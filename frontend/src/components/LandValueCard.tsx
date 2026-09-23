import React, { useState, useEffect } from 'react';
import type { LandValueEstimate } from '../services/types';
import { Icon } from './Icon';

interface LandValueCardProps {
  landValue: LandValueEstimate;
  civilTotalCostInr: number;
  onOverrideChange?: (rate: number | null, plotArea: number | null) => void;
}

export const LandValueCard: React.FC<LandValueCardProps> = ({
  landValue,
  civilTotalCostInr,
  onOverrideChange,
}) => {
  const [overrideRate, setOverrideRate] = useState<string>(
    landValue.is_user_override && landValue.indicative_rate_per_sqft
      ? String(landValue.indicative_rate_per_sqft)
      : ''
  );
  const [overrideArea, setOverrideArea] = useState<string>('');

  useEffect(() => {
    const handler = setTimeout(() => {
      const parsedRate = overrideRate.trim() ? parseFloat(overrideRate) : null;
      const parsedArea = overrideArea.trim() ? parseFloat(overrideArea) : null;
      if (onOverrideChange) {
        onOverrideChange(
          parsedRate && !isNaN(parsedRate) && parsedRate > 0 ? parsedRate : null,
          parsedArea && !isNaN(parsedArea) && parsedArea > 0 ? parsedArea : null
        );
      }
    }, 300);

    return () => clearTimeout(handler);
  }, [overrideRate, overrideArea, onOverrideChange]);

  const numOverrideRate = overrideRate.trim() ? parseFloat(overrideRate) : null;
  const numOverrideArea = overrideArea.trim() ? parseFloat(overrideArea) : null;

  const isUserSupplied = Boolean(
    (numOverrideRate && !isNaN(numOverrideRate)) || (numOverrideArea && !isNaN(numOverrideArea))
  );

  const effectiveRate = numOverrideRate && !isNaN(numOverrideRate)
    ? numOverrideRate
    : (landValue.indicative_rate_per_sqft ?? 0);

  const plotArea = numOverrideArea && !isNaN(numOverrideArea)
    ? numOverrideArea
    : (landValue.plot_area_sqft ?? 0);

  const landCost = effectiveRate > 0 && plotArea > 0 ? Math.round(effectiveRate * plotArea) : null;
  const combinedTotal = landCost !== null ? civilTotalCostInr + landCost : null;

  const formatInr = (val: number) => {
    if (val >= 10000000) {
      return `₹${(val / 10000000).toFixed(2)} Cr`;
    } else if (val >= 100000) {
      return `₹${(val / 100000).toFixed(2)} Lakh`;
    }
    return `₹${val.toLocaleString('en-IN')}`;
  };

  const sourceLabel = landValue.source_publication || landValue.jurisdiction_zone || 'SRO Valuation Baseline';

  return (
    <div className="space-y-4 w-full min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--hairline)] pb-2.5 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name="currency-rupee" size={15} className="text-[var(--text-2)] shrink-0" />
          <h2 className="text-[15px] font-semibold text-[var(--text-1)] tracking-tight">
            Indicative Land Valuation & Budget
          </h2>
        </div>
        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[var(--fill)] text-[var(--text-1)] shrink-0">
          {isUserSupplied ? 'Custom Override' : 'SRO Baseline'}
        </span>
      </div>

      {/* 2-Column Grid of Stat Tiles */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="bg-[var(--fill)] p-3.5 rounded-[12px] min-w-0">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)] block mb-1">
            Indicative Land Rate
          </span>
          <span className="text-[20px] font-semibold text-[var(--text-1)] tabular-nums block leading-tight">
            ₹{effectiveRate.toLocaleString('en-IN')}
          </span>
          <span className="text-[12px] text-[var(--text-3)] block mt-0.5">per sq ft</span>
        </div>

        <div className="bg-[var(--fill)] p-3.5 rounded-[12px] min-w-0">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)] block mb-1">
            Combined Total
          </span>
          <span className="text-[20px] font-semibold text-[var(--text-1)] tabular-nums block leading-tight truncate">
            {combinedTotal !== null ? formatInr(combinedTotal) : '—'}
          </span>
          <span className="text-[12px] text-[var(--text-3)] block mt-0.5">Civil + Land</span>
        </div>
      </div>

      {/* Interactive Override Inputs */}
      <div className="p-3 bg-[var(--fill)] rounded-[12px] space-y-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)] block">
          Custom Parameter Overrides
        </span>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-[var(--text-3)] block mb-0.5">Custom Rate (₹/sq ft)</label>
            <input
              type="number"
              placeholder={String(effectiveRate)}
              value={overrideRate}
              onChange={(e) => setOverrideRate(e.target.value)}
              className="w-full h-8 bg-[var(--fill)] hover:bg-[var(--fill-hover)] border-0 rounded-[8px] px-2.5 text-[12px] font-mono text-[var(--text-1)] outline-none focus:ring-[2px] focus:ring-[var(--accent)]/30"
            />
          </div>
          <div>
            <label className="text-[10px] text-[var(--text-3)] block mb-0.5">Plot Area (sq ft)</label>
            <input
              type="number"
              placeholder={String(plotArea)}
              value={overrideArea}
              onChange={(e) => setOverrideArea(e.target.value)}
              className="w-full h-8 bg-[var(--fill)] hover:bg-[var(--fill-hover)] border-0 rounded-[8px] px-2.5 text-[12px] font-mono text-[var(--text-1)] outline-none focus:ring-[2px] focus:ring-[var(--accent)]/30"
            />
          </div>
        </div>
      </div>

      {/* Breakdown Details */}
      <div className="divide-y divide-[var(--hairline)] border-y border-[var(--hairline)] text-[12px]">
        <div className="py-2 flex justify-between items-start gap-2 text-[var(--text-2)]">
          <span className="shrink-0">Source Publication</span>
          <span className="font-medium text-[var(--text-1)] text-right leading-snug break-words">{sourceLabel}</span>
        </div>
        <div className="py-2 flex justify-between items-center text-[var(--text-2)]">
          <span>Locality Multiplier</span>
          <span className="font-medium text-[var(--text-1)] font-mono">{(landValue.locality_multiplier ?? 1.0).toFixed(2)}x</span>
        </div>
        <div className="py-2 flex justify-between items-center text-[var(--text-2)]">
          <span>Estimated Land Cost</span>
          <span className="font-semibold text-[var(--text-1)] font-mono">{landCost !== null ? formatInr(landCost) : '—'}</span>
        </div>
      </div>
    </div>
  );
};
