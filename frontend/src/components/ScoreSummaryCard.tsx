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

  // Circular gauge geometry: 84px width SVG (r = 37, stroke = 6, viewBox 0 0 84 84)
  const radius = 37;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  const slopeFactor = data.factors.find((f) => f.factor_id === 'slope');
  const slopeScore = slopeFactor?.score ?? 0;
  const slopeGrad = slopeFactor?.raw_value ?? 0;

  return (
    <div className="rounded-[14px] border border-[var(--hairline)] bg-[var(--card-bg-subtle)] p-4 space-y-3.5 w-full min-w-0">
      {/* 5. SCORE HERO (Horizontal layout: 84px gauge left, right column) */}
      <div className="flex items-center gap-4 min-w-0 w-full">
        {/* Ring Gauge: 84px gauge left (6px ring, semantic color, shield icon center) */}
        <div className="relative w-[84px] h-[84px] min-w-[84px] shrink-0 flex items-center justify-center">
          <svg
            data-testid="score-gauge-svg"
            className="w-[84px] h-[84px] min-w-[84px] -rotate-90 block"
            viewBox="0 0 84 84"
            width="84"
            height="84"
            aria-label={`Suitability score visual ring gauge: ${score.toFixed(1)} out of 100`}
          >
            <circle
              cx="42"
              cy="42"
              r={radius}
              stroke="var(--fill)"
              strokeWidth="6"
              fill="none"
            />
            <circle
              cx="42"
              cy="42"
              r={radius}
              stroke={gaugeColor}
              strokeWidth="6"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="none"
              className="transition-all duration-700 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Icon name={badgeIcon} size={22} className="text-[var(--text-1)]" />
          </div>
        </div>

        {/* Right column: value 40px/700 tabular-nums --text-1 with "/100" 14px --text-3 inline, tinted verdict pill below, address 12px --text-2 clamped to 2 lines */}
        <div className="min-w-0 flex-1 space-y-1.5 w-full">
          <div className="flex items-baseline gap-1.5 leading-none">
            <span className="text-[40px] font-bold text-[var(--text-1)] leading-none tabular-nums tracking-tight">
              {score.toFixed(1)}
            </span>
            <span className="text-[14px] font-normal text-[var(--text-3)]">
              /100
            </span>
          </div>

          <div>
            <span
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-0.5 rounded-full"
              style={{
                backgroundColor: `${gaugeColor === 'var(--semantic-green)' ? 'rgba(52, 199, 89, 0.12)' : gaugeColor === 'var(--semantic-amber)' ? 'rgba(255, 159, 10, 0.12)' : 'rgba(255, 59, 48, 0.12)'}`,
                color: gaugeColor,
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: gaugeColor }}
              />
              <span>{verdict}</span>
            </span>
          </div>

          <p className="text-[12px] text-[var(--text-2)] leading-snug line-clamp-2 break-words" title={data.formatted_address}>
            {data.formatted_address}
          </p>
        </div>
      </div>

      {/* Below hero: single hairline row — "12.97160, 77.59460" mono 12px left, "WGS84" chip right */}
      <div className="pt-2.5 border-t border-[var(--hairline)] flex items-center justify-between text-[12px]">
        <span className="font-mono text-[var(--text-2)]">
          {data.coordinates.latitude.toFixed(5)}, {data.coordinates.longitude.toFixed(5)}
        </span>
        <span className="text-[11px] font-mono px-2 py-0.5 rounded-[4px] bg-[var(--fill)] text-[var(--text-3)] font-medium">
          WGS84
        </span>
      </div>

      {/* Keep at most ONE 2-column tile pair in the whole panel (Topographic / Bioclimatic on Overview): padding 14px, radius 12, label 12px sentence case --text-3, value 20px/600 --text-1, sub 12px --text-2 */}
      <div className="grid grid-cols-2 gap-2.5 pt-0.5">
        <div className="bg-[var(--fill)] p-[14px] rounded-[12px] min-w-0">
          <span className="text-[12px] font-normal text-[var(--text-3)] block mb-1">
            Topographic aspect
          </span>
          <span className="text-[20px] font-semibold text-[var(--text-1)] tabular-nums leading-tight block">
            {slopeScore.toFixed(0)}/100
          </span>
          <span className="text-[12px] text-[var(--text-2)] block truncate mt-0.5">
            {slopeGrad.toFixed(1)}% gradient
          </span>
        </div>

        <div className="bg-[var(--fill)] p-[14px] rounded-[12px] min-w-0">
          <span className="text-[12px] font-normal text-[var(--text-3)] block mb-1">
            Bioclimatic axis
          </span>
          <span className="text-[20px] font-semibold text-[var(--text-1)] tabular-nums leading-tight block">
            {data.orientation.optimal_axis_degrees.toFixed(0)}°
          </span>
          <span className="text-[12px] text-[var(--text-2)] block truncate mt-0.5" title={data.orientation.axis_label}>
            {data.orientation.axis_label}
          </span>
        </div>
      </div>
    </div>
  );
};
