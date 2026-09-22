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

  // Circular gauge geometry
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5 shadow-sm space-y-3.5">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <Icon name="shield-check" size={16} className="text-slate-700" />
          <h2 className="text-[15px] font-semibold text-slate-900 tracking-tight">
            Land Suitability Assessment
          </h2>
        </div>
        <span className="text-xs font-mono text-slate-400">
          Ref: {data.request_id}
        </span>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        {/* Left: Prominent 56px Score Numeral & Visual Ring */}
        <div className="flex items-center gap-4">
          <div className="flex items-baseline gap-1 shrink-0">
            <span className="text-[56px] font-bold font-mono text-slate-900 leading-none tabular-nums tracking-tight">
              {score.toFixed(1)}
            </span>
            <span className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-400">
              /100
            </span>
          </div>

          <div className="relative w-14 h-14 shrink-0 flex items-center justify-center">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 64 64">
              <circle
                cx="32"
                cy="32"
                r={radius}
                className="stroke-slate-100"
                strokeWidth="6"
                fill="none"
              />
              <circle
                cx="32"
                cy="32"
                r={radius}
                className={`transition-all duration-1000 ease-out ${gaugeColor}`}
                strokeWidth="6"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                fill="none"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <Icon name={badgeIcon} size={18} className={gaugeColor} />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full border ${badgeColor}`}>
                <Icon name={badgeIcon} size={13} />
                <span>{verdict}</span>
              </span>
            </div>
            <p className="text-xs text-slate-500 line-clamp-1">
              {data.formatted_address}
            </p>
          </div>
        </div>

        {/* Right: Key Geo Coordinates in mono */}
        <div className="flex sm:flex-col items-start gap-1.5 text-xs text-slate-600 bg-slate-50 p-2.5 rounded border border-slate-100 w-full sm:w-auto shrink-0">
          <div className="flex items-center gap-1.5 font-mono text-xs">
            <span className="font-semibold text-slate-900">LAT:</span>
            <span>{data.coordinates.latitude.toFixed(5)}</span>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-xs">
            <span className="font-semibold text-slate-900">LON:</span>
            <span>{data.coordinates.longitude.toFixed(5)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
