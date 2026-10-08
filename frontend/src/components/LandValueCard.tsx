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
    : (landValue.indicative_rate_per_sqft ?? null);

  // A guidance-table miss returns a null rate - "Not valued",
  // never a fabricated ₹0/sq ft that reads as a real valuation.
  const isRateKnown = effectiveRate !== null && effectiveRate > 0;

  const plotArea = numOverrideArea && !isNaN(numOverrideArea)
    ? numOverrideArea
    : (landValue.plot_area_sqft ?? 0);

  const landCost = isRateKnown && plotArea > 0 ? Math.round((effectiveRate as number) * plotArea) : null;
  const combinedTotal = landCost !== null ? civilTotalCostInr + landCost : null;

  const formatInr = (val: number) => {
    if (val >= 10000000) {
      return `₹${(val / 10000000).toFixed(2)} Cr`;
    } else if (val >= 100000) {
      return `₹${(val / 100000).toFixed(2)} Lakh`;
    }
    return `₹${val.toLocaleString('en-IN')}`;
  };

  const sourceLabel =
    landValue.source_publication ||
    landValue.jurisdiction_zone ||
    (isRateKnown ? 'SRO valuation baseline' : 'No guidance table match');

  return (
    <div className="rounded-[14px] border border-[var(--hairline)] bg-[var(--card-bg-subtle)] p-4 space-y-3.5 w-full min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--hairline)] pb-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name="currency-rupee" size={15} className="text-[var(--text-2)] shrink-0" />
          <h3 className="text-[14px] font-semibold text-[var(--text-1)] tracking-tight">
            Indicative Land Valuation & Budget
          </h3>
        </div>
        <span
          className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium shrink-0 ${
            isRateKnown || isUserSupplied
              ? 'bg-[var(--fill)] text-[var(--text-1)]'
              : 'bg-[var(--fill)] text-[var(--text-3)] border border-dashed border-[var(--hairline)]'
          }`}
        >
          {isUserSupplied ? 'Custom override' : isRateKnown ? 'SRO baseline' : 'Not valued'}
        </span>
      </div>

      {/* Combined Project Total Banner */}
      <div className="bg-[var(--fill)] p-3.5 rounded-[12px] space-y-1">
        <div className="flex items-center justify-between text-[12px] text-[var(--text-3)]">
          <span className="font-normal">Combined project total</span>
          <span className="text-[11px]">Civil + Land budget</span>
        </div>
        <div className="text-[24px] font-bold text-[var(--text-1)] tabular-nums tracking-tight">
          {combinedTotal !== null ? formatInr(combinedTotal) : '—'}
        </div>
      </div>

      {/* Key-Value Rows (No 2-column tile pair) */}
      <div className="divide-y divide-[var(--hairline)] border-y border-[var(--hairline)]">
        <div className="h-10 flex items-center justify-between px-0.5">
          <span className="text-[13px] font-normal text-[var(--text-2)]">Indicative land rate</span>
          {isRateKnown ? (
            <span className="text-[13px] font-semibold text-[var(--text-1)] tabular-nums whitespace-nowrap">
              ₹{(effectiveRate as number).toLocaleString('en-IN')}/sq ft
            </span>
          ) : (
            <span
              className="text-[13px] font-semibold text-[var(--text-3)] italic whitespace-nowrap"
              title="No state guidance circle rate matched for this jurisdiction — enter a manual override"
            >
              Not valued
            </span>
          )}
        </div>
        <div className="h-10 flex items-center justify-between px-0.5">
          <span className="text-[13px] font-normal text-[var(--text-2)]">Estimated land cost</span>
          <span className="text-[13px] font-semibold text-[var(--text-1)] tabular-nums whitespace-nowrap">
            {landCost !== null ? formatInr(landCost) : '—'}
          </span>
        </div>
        <div className="h-10 flex items-center justify-between px-0.5">
          <span className="text-[13px] font-normal text-[var(--text-2)]">Locality multiplier</span>
          <span className="text-[13px] font-semibold text-[var(--text-1)] tabular-nums whitespace-nowrap">
            {(landValue.locality_multiplier ?? 1.0).toFixed(2)}x
          </span>
        </div>
      </div>

      {/* Interactive Override Inputs */}
      <div className="p-3 bg-[var(--fill)] rounded-[12px] space-y-2">
        <span className="text-[12px] font-normal text-[var(--text-3)] block">
          Custom parameter overrides
        </span>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] text-[var(--text-3)] block mb-1">Custom rate (₹/sq ft)</label>
            <input
              type="number"
              placeholder={isRateKnown ? String(effectiveRate) : ''}
              value={overrideRate}
              onChange={(e) => setOverrideRate(e.target.value)}
              className="w-full h-8 bg-[var(--fill)] hover:bg-[var(--fill-hover)] border-0 rounded-[8px] px-2.5 text-[12px] font-mono text-[var(--text-1)] outline-none focus:ring-[2px] focus:ring-[var(--accent)]/30"
            />
          </div>
          <div>
            <label className="text-[11px] text-[var(--text-3)] block mb-1">Plot area (sq ft)</label>
            <input
              type="number"
              placeholder={plotArea > 0 ? String(plotArea) : ''}
              value={overrideArea}
              onChange={(e) => setOverrideArea(e.target.value)}
              className="w-full h-8 bg-[var(--fill)] hover:bg-[var(--fill-hover)] border-0 rounded-[8px] px-2.5 text-[12px] font-mono text-[var(--text-1)] outline-none focus:ring-[2px] focus:ring-[var(--accent)]/30"
            />
          </div>
        </div>
      </div>

      {/* Confidence Disclosure (staleness / table miss) - never silently dropped */}
      {landValue.confidence_warning && (
        <div className="p-3 bg-[var(--fill)] rounded-[12px] text-[12px] text-[var(--text-2)] space-y-1">
          <div className="flex items-center gap-1.5 text-[var(--semantic-amber)] font-medium">
            <Icon name="alert-triangle" size={13} />
            <span>Valuation confidence note</span>
          </div>
          <p className="leading-normal">{landValue.confidence_warning}</p>
        </div>
      )}

      {/* Valuation Source */}
      <div className="pt-2 border-t border-[var(--hairline)] flex items-center justify-between text-[11px] text-[var(--text-3)]">
        <span>Valuation baseline</span>
        <span className="text-[var(--text-2)] truncate max-w-[200px]" title={sourceLabel}>{sourceLabel}</span>
      </div>
    </div>
  );
};
