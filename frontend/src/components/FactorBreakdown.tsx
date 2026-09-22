import React from 'react';
import type { FactorScore } from '../services/types';
import { Icon, type IconName } from './Icon';

interface FactorBreakdownProps {
  factors: FactorScore[];
}

export const FactorBreakdown: React.FC<FactorBreakdownProps> = ({ factors }) => {
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
    if (score >= 75) return 'bg-emerald-600';
    if (score >= 50) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  return (
    <div className="@container bg-white rounded-lg border border-slate-200 p-4 @sm:p-5 shadow-sm space-y-3.5 min-w-0 w-full">
      <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-3 gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name="layers" size={16} className="text-slate-700 shrink-0" />
          <h3 className="text-[15px] font-semibold text-slate-900 tracking-tight whitespace-normal break-words">
            Multi-Criteria Factor Breakdown
          </h3>
        </div>
        <span className="text-xs uppercase tracking-wider font-semibold text-slate-500 font-mono shrink-0">
          MCDA Weighted Model
        </span>
      </div>

      <div className="space-y-3 min-w-0">
        {factors.map((factor) => {
          const barColor = getBarColor(factor.score);
          const icon = getFactorIcon(factor.factor_id);

          return (
            <div key={factor.factor_id} className="space-y-1.5 min-w-0">
              <div className="flex flex-wrap @sm:flex-nowrap items-baseline @sm:items-center justify-between gap-1.5 text-sm min-w-0">
                <div className="flex items-center gap-2 font-medium text-slate-800 min-w-0">
                  <Icon name={icon} size={15} className="text-slate-500 shrink-0" />
                  <span className="whitespace-normal break-words">{factor.name}</span>
                  <span className="text-xs font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                    {(factor.weight * 100).toFixed(0)}% wt
                  </span>
                </div>
                <div className="flex items-center gap-2 font-mono shrink-0 ml-auto @sm:ml-0">
                  <span className="text-xs text-slate-500 tabular-nums">
                    {factor.raw_value} {factor.unit}
                  </span>
                  <span className="font-semibold text-slate-900 min-w-[3.5rem] text-right tabular-nums text-sm">
                    {factor.score.toFixed(0)}/100
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ease-out ${barColor}`}
                  style={{ width: `${Math.min(100, Math.max(0, factor.score))}%` }}
                />
              </div>

              {/* Engineering Detail Note */}
              <p className="text-xs text-slate-500 leading-normal pt-0.5 whitespace-normal break-words">
                {factor.details}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};
