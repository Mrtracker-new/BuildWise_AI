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
    <div className="space-y-4 w-full min-w-0">
      {/* Section Header */}
      <div className="flex items-center justify-between border-b border-[var(--hairline)] pb-2.5 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name="currency-rupee" size={15} className="text-[var(--text-2)] shrink-0" />
          <h3 className="text-[15px] font-semibold text-[var(--text-1)] tracking-tight">
            Preliminary Construction Cost Estimation
          </h3>
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)] shrink-0">
          CPWD PAR
        </span>
      </div>

      {/* 2-Column Grid of Stat Tiles: --fill, radius 12, value 20px/600 --text-1, label 11px --text-3 */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="bg-[var(--fill)] p-3.5 rounded-[12px] min-w-0">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)] block mb-1">
            Plinth Area Base Rate
          </span>
          <span className="text-[20px] font-semibold text-[var(--text-1)] tabular-nums block leading-tight">
            ₹{costEstimate.base_rate_per_sqft.toLocaleString()}
          </span>
          <span className="text-[12px] text-[var(--text-3)] block mt-0.5">per sq ft</span>
        </div>

        <div className="bg-[var(--fill)] p-3.5 rounded-[12px] min-w-0">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)] block mb-1">
            Topographic Modifier
          </span>
          <span className="text-[20px] font-semibold text-[var(--text-1)] tabular-nums block leading-tight">
            {costEstimate.terrain_multiplier.toFixed(2)}x
          </span>
          <span className="text-[12px] text-[var(--text-3)] block mt-0.5 truncate">
            {costEstimate.terrain_surcharge_inr > 0 ? `+${formatINR(costEstimate.terrain_surcharge_inr)}` : 'Flat baseline'}
          </span>
        </div>
      </div>

      {/* Total Estimated Budget Tile */}
      <div className="bg-[var(--fill)] p-4 rounded-[12px] space-y-1">
        <div className="flex items-center justify-between text-[11px] text-[var(--text-3)]">
          <span className="font-semibold uppercase tracking-[0.08em]">
            Total Estimated Civil Budget
          </span>
          <span>Range: {formatINR(costEstimate.cost_range_min_inr)} – {formatINR(costEstimate.cost_range_max_inr)}</span>
        </div>
        <div className="text-[24px] font-bold text-[var(--text-1)] tabular-nums tracking-tight">
          {formatINR(costEstimate.total_estimated_cost_inr)}
        </div>
      </div>

      {/* Itemized Table with Hairline Rows */}
      <div className="divide-y divide-[var(--hairline)] border-y border-[var(--hairline)]">
        {costEstimate.breakdown.map((item, idx) => (
          <div key={idx} className="py-2.5 space-y-1.5 min-w-0">
            <div className="flex items-center justify-between gap-2 min-w-0">
              <span className="text-[13px] font-semibold text-[var(--text-1)] truncate">
                {item.category}
              </span>
              <span className="text-[13px] font-medium text-[var(--text-1)] tabular-nums shrink-0">
                {formatINR(item.amount_inr)}
              </span>
            </div>

            {/* 4px Progress Bar */}
            <div className="space-y-1">
              <div className="w-full bg-[var(--fill)] rounded-full h-1 overflow-hidden">
                <div
                  className="bg-[var(--accent)] h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, item.percentage))}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-[11px] text-[var(--text-3)]">
                <span>{item.description}</span>
                <span className="tabular-nums font-medium">{item.percentage.toFixed(1)}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Disclaimer */}
      <div className="pt-1 flex items-start gap-2 text-[12px] text-[var(--text-3)] leading-relaxed">
        <Icon name="info" size={14} className="shrink-0 mt-0.5" />
        <p>{costEstimate.disclaimer}</p>
      </div>
    </div>
  );
};
