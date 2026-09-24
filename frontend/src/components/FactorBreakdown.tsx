import React from 'react';
import type { FactorScore } from '../services/types';
import { Icon, type IconName } from './Icon';

interface FactorBreakdownProps {
  factors: FactorScore[];
  limit?: number;
}

export const FactorBreakdown: React.FC<FactorBreakdownProps> = ({ factors, limit }) => {
  const displayFactors = limit ? factors.slice(0, limit) : factors;

  const getFactorIcon = (id: string): IconName => {
    switch (id) {
      case 'slope':
        return 'mountain';
      case 'flood_risk':
        return 'droplet';
      case 'road_access':
        return 'truck';
      case 'environmental_comfort':
        return 'sun';
      case 'facility_proximity':
        return 'layers';
      default:
        return 'info';
    }
  };

  const getBarColor = (score: number) => {
    if (score >= 75) return 'var(--semantic-green)';
    if (score >= 50) return 'var(--semantic-amber)';
    return 'var(--semantic-red)';
  };

  return (
    <div className="rounded-[14px] border border-[var(--hairline)] bg-[var(--card-bg-subtle)] p-4 space-y-3.5 w-full min-w-0">
      {/* Section Header */}
      <div className="flex items-center justify-between border-b border-[var(--hairline)] pb-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name="layers" size={15} className="text-[var(--text-2)] shrink-0" />
          <h3 className="text-[14px] font-semibold text-[var(--text-1)] tracking-tight">
            Multi-Criteria Factor Breakdown
          </h3>
        </div>
        <span className="text-[12px] font-normal text-[var(--text-3)] shrink-0">
          MCDA model {limit ? `(Top ${limit})` : ''}
        </span>
      </div>

      {/* Grouped list of factors with hairline rows */}
      <div className="divide-y divide-[var(--hairline)]">
        {displayFactors.map((factor) => {
          const barColor = getBarColor(factor.score);
          const icon = getFactorIcon(factor.factor_id);

          return (
            <div key={factor.factor_id} className="py-2.5 space-y-1.5 min-w-0 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-2 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <Icon name={icon} size={14} className="text-[var(--text-2)] shrink-0" />
                  <span className="text-[13px] font-semibold text-[var(--text-1)] truncate">
                    {factor.name}
                  </span>
                  <span className="text-[11px] text-[var(--text-3)] font-normal">
                    {(factor.weight * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="flex items-center gap-2 text-right shrink-0">
                  <span className="text-[12px] text-[var(--text-3)] tabular-nums">
                    {factor.raw_value} {factor.unit}
                  </span>
                  <span className="text-[13px] font-semibold text-[var(--text-1)] tabular-nums min-w-[2rem]">
                    {factor.score.toFixed(0)}
                  </span>
                </div>
              </div>

              {/* 4px flat progress bar */}
              <div className="w-full bg-[var(--fill)] rounded-full h-1 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${Math.min(100, Math.max(0, factor.score))}%`,
                    backgroundColor: barColor,
                  }}
                />
              </div>

              <p className="text-[12px] text-[var(--text-2)] leading-normal">
                {factor.details}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};
