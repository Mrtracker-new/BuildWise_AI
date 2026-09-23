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

  // Debounced notification to parent
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

  // Client-side instant recalculation
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

  const coveragePct = Math.round((landValue.ground_coverage_ratio_applied ?? 0.60) * 100);

  const sourceLabel = landValue.source_publication || landValue.jurisdiction_zone || 'SRO Valuation Baseline';

  return (
    <div className="@container bg-white rounded-lg border border-slate-200 p-4 @sm:p-5 shadow-sm space-y-4 min-w-0 w-full">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-3 gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name="currency-rupee" size={16} className="text-slate-700 shrink-0" />
          <h2 className="text-[15px] font-semibold text-slate-900 tracking-tight whitespace-normal break-words">
            Indicative Land Valuation & Combined Project Total
          </h2>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isUserSupplied ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              <Icon name="check-circle" size={12} className="text-blue-600" />
              User-Supplied Override
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
              Published SRO Baseline
            </span>
          )}
        </div>
      </div>

      {/* Main Grid: Rates & Derivation */}
      <div className="grid grid-cols-1 @md:grid-cols-2 gap-4 min-w-0">
        {/* Left Column: Rate Breakdown */}
        <div className="space-y-3 rounded-md border border-slate-200/80 p-3.5 bg-slate-50/40 min-w-0">
          <div className="flex flex-col @sm:flex-row @sm:items-center justify-between text-xs text-slate-600 border-b border-slate-200/60 pb-2 gap-1 min-w-0">
            <span className="shrink-0 text-slate-500">Rate Source:</span>
            <span className="font-medium text-slate-800 text-left @sm:text-right whitespace-normal break-words min-w-0" title={sourceLabel}>
              {sourceLabel}
            </span>
          </div>

          <div className="space-y-1.5 text-xs text-slate-700">
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Base Circle Rate:</span>
              <span className="font-mono font-medium text-slate-900">
                {landValue.base_table_rate_per_sqft
                  ? `₹${landValue.base_table_rate_per_sqft.toLocaleString('en-IN')}/sq.ft`
                  : landValue.indicative_rate_per_sqft
                  ? `₹${landValue.indicative_rate_per_sqft.toLocaleString('en-IN')}/sq.ft`
                  : 'Unlisted / Verification Required'}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-500">Locality Multiplier:</span>
              <span className="font-mono font-medium text-slate-900">
                {(landValue.locality_multiplier ?? 1.0).toFixed(2)}x
                <span className="text-[10px] text-slate-500 ml-1">(clamped 0.85–1.25)</span>
              </span>
            </div>

            {landValue.multiplier_breakdown && (
              <div className="text-[11px] text-slate-500 bg-white p-2 rounded border border-slate-200/60 space-y-0.5">
                <div className="flex justify-between">
                  <span>• Road Accessibility Contribution:</span>
                  <span className="font-mono font-medium text-slate-700">
                    {(landValue.multiplier_breakdown.road_contribution ?? 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>• Facility Proximity Contribution:</span>
                  <span className="font-mono font-medium text-slate-700">
                    {(landValue.multiplier_breakdown.facility_contribution ?? 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>• Net Calculated Multiplier:</span>
                  <span className="font-mono font-medium text-slate-700">
                    {(landValue.multiplier_breakdown.net_multiplier ?? 1.0).toFixed(2)}x
                  </span>
                </div>
              </div>
            )}

            <div className="flex justify-between items-center pt-1 border-t border-slate-200/60">
              <span className="font-medium text-slate-800">Effective Rate Applied:</span>
              <span className="font-mono font-bold text-slate-900 text-sm">
                {effectiveRate > 0 ? `₹${effectiveRate.toLocaleString('en-IN')}/sq.ft` : 'N/A'}
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Plot Area & Client Override */}
        <div className="space-y-3 rounded-md border border-slate-200/80 p-3.5 bg-slate-50/40 min-w-0">
          <div className="space-y-1.5 text-xs text-slate-700">
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Derived Plot Area:</span>
              <span className="font-mono font-medium text-slate-900">
                {plotArea.toLocaleString('en-IN')} sq.ft
              </span>
            </div>
            <div className="flex justify-between items-center text-[11px] text-slate-500">
              <span>Assumed Ground Coverage:</span>
              <span className="font-medium text-slate-700 bg-slate-200/60 px-1.5 py-0.5 rounded">
                {coveragePct}% Ratio (Assumed)
              </span>
            </div>
          </div>

          {/* Interactive User Override Inputs */}
          <div className="pt-2.5 border-t border-slate-200/60 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
              <Icon name="settings" size={13} className="text-slate-500 shrink-0" />
              <span>Interactive Rate / Area Override</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-slate-500 block mb-0.5">Rate (₹/sq.ft):</label>
                <input
                  type="number"
                  placeholder={landValue.indicative_rate_per_sqft ? String(landValue.indicative_rate_per_sqft) : 'Enter rate'}
                  value={overrideRate}
                  onChange={(e) => setOverrideRate(e.target.value)}
                  className="w-full text-xs font-mono px-2 py-1 rounded border border-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 block mb-0.5">Plot Area (sq.ft):</label>
                <input
                  type="number"
                  placeholder={String(landValue.plot_area_sqft ?? 2000)}
                  value={overrideArea}
                  onChange={(e) => setOverrideArea(e.target.value)}
                  className="w-full text-xs font-mono px-2 py-1 rounded border border-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>
            <p className="text-[10px] text-slate-400 italic">
              Changes recompute project totals immediately in browser without resubmitting.
            </p>
          </div>
        </div>
      </div>

      {/* Combined Cost Summary Bar */}
      <div className="rounded-md border border-slate-200 bg-slate-900 text-white p-3.5 space-y-2">
        <div className="flex flex-wrap justify-between items-center gap-2">
          <div>
            <span className="text-xs text-slate-400 block">Estimated Land Acquisition</span>
            <span className="text-base font-bold font-mono text-emerald-400">
              {landCost !== null ? formatInr(landCost) : 'Pending Rate Input'}
            </span>
          </div>
          <div className="text-slate-500 text-lg font-light hidden @sm:block">+</div>
          <div>
            <span className="text-xs text-slate-400 block">Civil Construction Cost</span>
            <span className="text-base font-bold font-mono text-slate-200">
              {formatInr(civilTotalCostInr)}
            </span>
          </div>
          <div className="text-slate-500 text-lg font-light hidden @sm:block">=</div>
          <div className="border-t @sm:border-t-0 @sm:border-l border-slate-700 pt-2 @sm:pt-0 @sm:pl-4">
            <span className="text-xs text-slate-400 block font-semibold uppercase tracking-wider text-indigo-300">
              Combined Project Total
            </span>
            <span className="text-lg font-extrabold font-mono text-white">
              {combinedTotal !== null ? formatInr(combinedTotal) : formatInr(civilTotalCostInr)}
            </span>
          </div>
        </div>
      </div>

      {/* Confidence Warning if unlisted */}
      {landValue.confidence_warning && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 flex items-start gap-1.5">
          <Icon name="alert-triangle" size={13} className="text-amber-600 shrink-0 mt-0.5" />
          <span>{landValue.confidence_warning}</span>
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-[11px] text-slate-500 italic border-t border-slate-100 pt-2">
        {landValue.disclaimer}
      </p>
    </div>
  );
};
