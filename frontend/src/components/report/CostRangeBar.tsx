import React from 'react';
import type { CostEstimate } from '../../services/types';
import { TABULAR_NUMS_CLASS } from '../../design/tokens';

interface CostRangeBarProps {
  cost: CostEstimate;
}

/**
 * Horizontal range strip: min marker — total marker — max marker, plus the
 * per-category breakdown bars scaled to the total. Purely derived from the
 * shared CostEstimate object (same numbers the PDF prints).
 */
export const CostRangeBar: React.FC<CostRangeBarProps> = ({ cost }) => {
  const { cost_range_min_inr: min, cost_range_max_inr: max, total_estimated_cost_inr: total, breakdown } = cost;
  if (!(max > min) || total <= 0) return null;

  const pos = (v: number) => Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
  const totalPos = pos(total);
  const fmt = (v: number) =>
    v >= 10_000_000 ? `₹${(v / 10_000_000).toFixed(2)} Cr` : `₹${(v / 100_000).toFixed(1)} L`;
  const hueFor = (i: number) =>
    ['var(--semantic-green)', 'var(--accent)', 'var(--semantic-amber)', 'var(--semantic-red)', 'var(--text-3)'][i % 5];

  return (
    <div className="space-y-3" data-testid="cost-range-bar">
      <div className="pt-1.5">
        {/* Track */}
        <div className="relative h-1.5 rounded-full bg-[var(--fill)]">
          <div
            className="absolute h-1.5 rounded-full bg-[var(--accent)]/25"
            style={{ left: 0, width: `${totalPos}%` }}
          />
          {/* min marker */}
          <div className="absolute -top-1 h-3.5 w-0.5 rounded bg-[var(--text-3)]" style={{ left: '0%' }} aria-hidden="true" />
          {/* total marker */}
          <div
            className="absolute -top-[3px] h-[15px] w-0.5 rounded bg-[var(--accent)]"
            style={{ left: `${totalPos}%` }}
            aria-hidden="true"
          />
          {/* max marker */}
          <div className="absolute -top-1 h-3.5 w-0.5 rounded bg-[var(--text-3)]" style={{ left: '100%' }} aria-hidden="true" />
        </div>
        <div className="flex justify-between mt-1.5 text-[11px] text-[var(--text-3)]">
          <span className={TABULAR_NUMS_CLASS}>{fmt(min)}</span>
          <span className={`${TABULAR_NUMS_CLASS} font-semibold text-[var(--accent-ink)]`} style={{ marginLeft: 'calc(' + totalPos + '% - 3ch)' }}>
            {fmt(total)}
          </span>
          <span className={TABULAR_NUMS_CLASS}>{fmt(max)}</span>
        </div>
      </div>

      <div className="space-y-1.5">
        {breakdown.slice(0, 5).map((item, i) => (
          <div key={item.category} className="flex items-center gap-2">
            <span className="text-[11px] text-[var(--text-2)] w-28 truncate" title={item.category}>
              {item.category}
            </span>
            <div className="flex-1 h-1 rounded-full bg-[var(--fill)] overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.min(100, item.percentage)}%`, backgroundColor: hueFor(i) }}
              />
            </div>
            <span className={`text-[11px] text-[var(--text-3)] w-10 text-right ${TABULAR_NUMS_CLASS}`}>
              {item.percentage.toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
