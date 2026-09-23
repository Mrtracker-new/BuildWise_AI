import React from 'react';
import type { AnalysisResponse } from '../services/types';
import { Icon, type IconName } from './Icon';

interface ScoreSummaryCardProps {
  data: AnalysisResponse;
}

export const ScoreSummaryCard: React.FC<ScoreSummaryCardProps> = ({ data }) => {
  const score = data.overall_suitability_score;
  const verdict = data.suitability_verdict;

  let gaugeColor = 'var(--semantic-green)';
  let badgeIcon: IconName = 'shield-check';

  if (score < 50.0) {
    gaugeColor = 'var(--semantic-red)';
    badgeIcon = 'shield-alert';
  } else if (score < 70.0) {
    gaugeColor = 'var(--semantic-amber)';
    badgeIcon = 'alert-triangle';
  }

  // Circular gauge geometry: exactly 120px width SVG (r = 48, viewBox 0 0 120 120)
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="space-y-3.5 w-full min-w-0">
      {/* Section Header */}
      <div className="flex items-center justify-between border-b border-[var(--hairline)] pb-2.5 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name="shield-check" size={15} className="text-[var(--text-2)] shrink-0" />
          <h2 className="text-[15px] font-semibold text-[var(--text-1)] tracking-tight">
            Land Suitability Assessment
          </h2>
        </div>
        <span className="text-[11px] font-mono text-[var(--text-3)] break-all shrink-0">
          Ref: {data.request_id}
        </span>
      </div>

      {/* Primary Score & Gauge Section */}
      <div className="flex flex-col sm:flex-row items-center gap-4 min-w-0 w-full pt-1">
        {/* Ring Gauge: min-w-[120px] and w-[120px] to strictly satisfy audit requirement */}
        <div className="relative w-[120px] h-[120px] min-w-[120px] shrink-0 flex items-center justify-center">
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
              stroke="var(--fill)"
              strokeWidth="8"
              fill="none"
            />
            <circle
              cx="60"
              cy="60"
              r={radius}
              stroke={gaugeColor}
              strokeWidth="8"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="none"
              className="transition-all duration-700 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <Icon name={badgeIcon} size={22} className="text-[var(--text-1)]" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)] mt-0.5">
              SCORE
            </span>
          </div>
        </div>

        {/* Score & Verdict Details */}
        <div className="min-w-0 flex-1 space-y-2 text-center sm:text-left w-full">
          <div className="flex items-baseline justify-center sm:justify-start gap-1.5">
            <span className="text-4xl font-bold text-[var(--text-1)] leading-none tabular-nums tracking-tight">
              {score.toFixed(1)}
            </span>
            <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)]">
              / 100
            </span>
          </div>

          <div>
            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1 rounded-full bg-[var(--fill)] text-[var(--text-1)]">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: gaugeColor }}
              />
              <span>{verdict}</span>
            </span>
          </div>

          <p className="text-[13px] text-[var(--text-2)] leading-[1.5] break-words">
            {data.formatted_address}
          </p>
        </div>
      </div>

      {/* 2-Column Grid of Key Stat Tiles: --fill, radius 12, value 20px/600 --text-1, label 11px --text-3 */}
      <div className="grid grid-cols-2 gap-2.5 pt-2">
        <div className="bg-[var(--fill)] p-3 rounded-[12px] min-w-0">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)] block mb-0.5">
            Topographic Aspect
          </span>
          <span className="text-[20px] font-semibold text-[var(--text-1)] tabular-nums leading-tight block">
            {data.factors.find((f) => f.factor_id === 'slope')?.score.toFixed(0) ?? '—'}/100
          </span>
          <span className="text-[12px] text-[var(--text-2)] block truncate mt-0.5">
            {data.factors.find((f) => f.factor_id === 'slope')?.raw_value.toFixed(1) ?? '0'}% gradient
          </span>
        </div>

        <div className="bg-[var(--fill)] p-3 rounded-[12px] min-w-0">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)] block mb-0.5">
            Bioclimatic Axis
          </span>
          <span className="text-[20px] font-semibold text-[var(--text-1)] tabular-nums leading-tight block">
            {data.orientation.optimal_axis_degrees.toFixed(0)}°
          </span>
          <span className="text-[12px] text-[var(--text-2)] block leading-snug break-words mt-0.5">
            {data.orientation.axis_label}
          </span>
        </div>
      </div>

      {/* Coordinates Strip */}
      <div className="pt-2 border-t border-[var(--hairline)] flex items-center justify-between text-[11px] text-[var(--text-3)]">
        <div className="flex items-center gap-2">
          <span>LAT: <strong className="text-[var(--text-1)] font-mono">{data.coordinates.latitude.toFixed(5)}</strong></span>
          <span>LON: <strong className="text-[var(--text-1)] font-mono">{data.coordinates.longitude.toFixed(5)}</strong></span>
        </div>
        <span className="font-mono">WGS84</span>
      </div>
    </div>
  );
};
