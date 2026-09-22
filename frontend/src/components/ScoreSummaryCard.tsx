import React from 'react';
import type { AnalysisResponse } from '../services/types';
import { Icon, type IconName } from './Icon';

interface ScoreSummaryCardProps {
  data: AnalysisResponse;
}

export const ScoreSummaryCard: React.FC<ScoreSummaryCardProps> = ({ data }) => {
  const score = data.overall_suitability_score;
  const verdict = data.suitability_verdict;

  let badgeColor = 'bg-emerald-50 text-emerald-800 border-emerald-200';
  let gaugeColor = 'text-emerald-600 stroke-emerald-600';
  let badgeIcon: IconName = 'shield-check';

  if (score < 50.0) {
    badgeColor = 'bg-rose-50 text-rose-800 border-rose-200';
    gaugeColor = 'text-rose-600 stroke-rose-600';
    badgeIcon = 'shield-alert';
  } else if (score < 70.0) {
    badgeColor = 'bg-amber-50 text-amber-800 border-amber-200';
    gaugeColor = 'text-amber-600 stroke-amber-600';
    badgeIcon = 'alert-triangle';
  }

  // Circular gauge geometry for exactly 120px width SVG (r = 48, viewBox 0 0 120 120)
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="@container bg-white rounded-lg border border-slate-200 p-4 @sm:p-5 shadow-sm space-y-3.5 min-w-0 w-full">
      {/* Card Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-3 gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name="shield-check" size={16} className="text-slate-700 shrink-0" />
          <h2 className="text-[15px] font-semibold text-slate-900 tracking-tight whitespace-normal break-words">
            Land Suitability Assessment
          </h2>
        </div>
        <span className="text-xs font-mono text-slate-400 break-all shrink-0">
          Ref: {data.request_id}
        </span>
      </div>

      {/* Primary Score & Gauge Section - Intrinsic flex layout with min-w-0 */}
      <div className="flex flex-col @sm:flex-row items-start @sm:items-center gap-4 min-w-0 w-full">
        {/* Visual Ring Gauge: explicitly min-w-[120px] and w-[120px] so it never renders below 120px width */}
        <div className="relative w-[120px] h-[120px] min-w-[120px] shrink-0 flex items-center justify-center mx-auto @sm:mx-0">
          <svg
            data-testid="score-gauge-svg"
            className="w-[120px] h-[120px] min-w-[120px] -rotate-90 block"
            viewBox="0 0 120 120"
            width="120"
            height="120"
            aria-label={`Suitability score visual ring gauge: ${score.toFixed(1)} out of 100`}
          >
            <circle
              cx="60"
              cy="60"
              r={radius}
              className="stroke-slate-100"
              strokeWidth="8"
              fill="none"
            />
            <circle
              cx="60"
              cy="60"
              r={radius}
              className={`transition-all duration-1000 ease-out ${gaugeColor}`}
              strokeWidth="8"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="none"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <Icon name={badgeIcon} size={24} className={gaugeColor} />
            <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-slate-400 mt-0.5">
              SCORE
            </span>
          </div>
        </div>

        {/* Score text & formatted address */}
        <div className="min-w-0 flex-1 space-y-1.5 w-full">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-4xl @sm:text-[48px] font-bold font-mono text-slate-900 leading-none tabular-nums tracking-tight">
              {score.toFixed(1)}
            </span>
            <span className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-400">
              /100
            </span>
          </div>

          <div>
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full border ${badgeColor}`}>
              <Icon name={badgeIcon} size={13} className="shrink-0" />
              <span>{verdict}</span>
            </span>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed whitespace-normal break-words pt-0.5">
            {data.formatted_address}
          </p>
        </div>
      </div>

      {/* Coordinates Strip: full width inside card, never overflows container */}
      <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2.5 text-xs text-slate-600 bg-slate-50 p-2.5 rounded border border-slate-100 w-full min-w-0">
        <div className="flex items-center gap-1.5 font-mono text-xs min-w-0">
          <span className="font-semibold text-slate-900 shrink-0">LAT:</span>
          <span className="break-all tabular-nums">{data.coordinates.latitude.toFixed(5)}</span>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-xs min-w-0">
          <span className="font-semibold text-slate-900 shrink-0">LON:</span>
          <span className="break-all tabular-nums">{data.coordinates.longitude.toFixed(5)}</span>
        </div>
        <div className="flex items-center gap-1 text-[11px] text-slate-400 font-mono shrink-0">
          <span>WGS84</span>
        </div>
      </div>
    </div>
  );
};
