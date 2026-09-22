import React from 'react';
import type { CostEstimate } from '../services/types';
import { Icon } from './Icon';

interface CostBreakdownTableProps {
  costEstimate: CostEstimate;
}

export const CostBreakdownTable: React.FC<CostBreakdownTableProps> = ({ costEstimate }) => {
  const formatINR = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5 shadow-sm space-y-4">
      {/* Card Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name="currency-rupee" size={16} className="text-slate-700 shrink-0" />
          <h3 className="text-[15px] font-semibold text-slate-900 tracking-tight whitespace-normal break-words">
            Preliminary Construction Cost Estimation
          </h3>
        </div>
        <span className="text-xs uppercase tracking-wider font-semibold text-slate-500 font-mono shrink-0">
          CPWD PAR
        </span>
      </div>

      {/* Restructured Summary Tiles */}
      <div className="space-y-2.5">
        {/* Row 1: Two Tiles (Plinth Area Base Rate & Topographic Modifier) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 min-w-0">
            <span className="text-xs uppercase tracking-wider font-semibold text-slate-500 block mb-1 whitespace-normal break-words">
              Plinth Area Base Rate
            </span>
            <span className="text-sm font-bold font-mono text-slate-900 tabular-nums">
              INR {costEstimate.base_rate_per_sqft.toLocaleString()} /sq ft
            </span>
          </div>

          <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 min-w-0">
            <span className="text-xs uppercase tracking-wider font-semibold text-slate-500 block mb-1 whitespace-normal break-words">
              Topographic Modifier
            </span>
            <span className="text-sm font-bold font-mono text-slate-900 tabular-nums">
              {costEstimate.terrain_multiplier.toFixed(2)}x
              {costEstimate.terrain_surcharge_inr > 0 && (
                <span className="text-xs font-normal text-amber-700 ml-1">
                  (+{formatINR(costEstimate.terrain_surcharge_inr)})
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Row 2: Full-Width Dark Tile (Total Estimated Budget) */}
        <div className="bg-slate-900 text-white p-4 rounded-lg shadow-sm min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 mb-1.5">
            <span className="text-xs uppercase tracking-wider font-semibold text-slate-300 whitespace-normal break-words">
              Total Estimated Budget
            </span>
            <span className="text-xs font-mono text-slate-400">
              Range: {formatINR(costEstimate.cost_range_min_inr)} – {formatINR(costEstimate.cost_range_max_inr)}
            </span>
          </div>
          <div className="text-2xl sm:text-[26px] font-bold font-mono text-white tabular-nums leading-tight">
            {formatINR(costEstimate.total_estimated_cost_inr)}
          </div>
        </div>
      </div>

      {/* Stacked Line-Item List (Designed for narrow rails, no horizontal scrollbar) */}
      <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg bg-white overflow-hidden">
        {costEstimate.breakdown.map((item, idx) => (
          <div key={idx} className="p-3.5 space-y-2">
            {/* Line 1: Category Name on left, Amount on right (14px mono semibold right-aligned) */}
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-slate-900">
                {item.category}
              </span>
              <span className="text-sm font-mono font-semibold text-slate-900 tabular-nums shrink-0 text-right">
                {formatINR(item.amount_inr)}
              </span>
            </div>

            {/* Line 2: Share micro-label + 4px horizontal progress bar */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-xs uppercase tracking-wider font-semibold text-slate-500 font-mono">
                  {item.percentage.toFixed(1)}% of Budget
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1 overflow-hidden">
                <div
                  className="bg-slate-700 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, item.percentage))}%` }}
                />
              </div>
            </div>

            {/* Line 3: Engineering description as full-width prose wrapping naturally */}
            <p className="text-xs sm:text-[13px] text-slate-600 leading-relaxed whitespace-normal break-words">
              {item.description}
            </p>
          </div>
        ))}
      </div>

      {/* Engineering Disclaimer */}
      <div className="bg-amber-50/60 border border-amber-200/70 p-3 rounded-lg text-xs text-amber-900 leading-normal flex items-start gap-2.5">
        <Icon name="info" size={15} className="text-amber-700 mt-0.5 shrink-0" />
        <p className="whitespace-normal break-words">{costEstimate.disclaimer}</p>
      </div>
    </div>
  );
};
