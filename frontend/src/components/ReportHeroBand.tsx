import React from 'react';
import type { AnalysisResponse } from '../services/types';
import { Icon, type IconName } from './Icon';

interface ReportHeroBandProps {
  data: AnalysisResponse;
}

export const ReportHeroBand: React.FC<ReportHeroBandProps> = ({ data }) => {
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

  // 112px SVG Circular Ring Gauge Geometry
  const gaugeSize = 112;
  const centerCoord = 56;
  const radius = 48;
  const strokeWidth = 8;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  const slopeFactor = data.factors.find((f) => f.factor_id === 'slope');
  const slopeScore = slopeFactor?.score ?? 0;
  const slopeGrad = slopeFactor?.raw_value ?? 0;

  const verdictBg =
    gaugeColor === 'var(--semantic-green)'
      ? 'rgba(52, 199, 89, 0.12)'
      : gaugeColor === 'var(--semantic-amber)'
      ? 'rgba(255, 159, 10, 0.12)'
      : 'rgba(255, 59, 48, 0.12)';

  return (
    <div className="rounded-[14px] border border-[var(--hairline)] bg-[var(--card-bg-subtle)] p-[18px] w-full min-w-0">
      {/* 
        Responsive layout:
        - >=1280px: Single horizontal row, target height ~150px, zero wrapping
        - 1024px - 1279px: Wraps internally to two rows (gauge+score row, tiles+coords row)
        - <1024px: Stacks vertically, left-aligned
      */}
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 xl:gap-5">
        {/* ROW 1 / LEFT HERO: [gauge 112px] [score 56px/700 + verdict pill + address 2-line clamp] */}
        <div className="flex items-center gap-4 min-w-0 shrink-0 xl:max-w-[420px]">
          {/* Ring Gauge: 112px SVG */}
          <div className="relative shrink-0 flex items-center justify-center w-[112px] h-[112px] min-w-[112px]">
            <svg
              data-testid="score-gauge-svg"
              className="-rotate-90 block"
              style={{ width: `${gaugeSize}px`, height: `${gaugeSize}px` }}
              viewBox={`0 0 ${gaugeSize} ${gaugeSize}`}
              width={gaugeSize}
              height={gaugeSize}
              aria-label={`Suitability score ring gauge: ${score.toFixed(1)} out of 100`}
            >
              <circle
                cx={centerCoord}
                cy={centerCoord}
                r={radius}
                stroke="var(--fill)"
                strokeWidth={strokeWidth}
                fill="none"
              />
              <circle
                cx={centerCoord}
                cy={centerCoord}
                r={radius}
                stroke={gaugeColor}
                strokeWidth={strokeWidth}
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                fill="none"
                className="transition-all duration-700 ease-out"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <Icon name={badgeIcon} size={28} className="text-[var(--text-1)]" />
            </div>
          </div>

          {/* Score, verdict pill, 2-line clamped address */}
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-baseline gap-1.5 leading-none">
              <span className="text-[44px] xs:text-[56px] font-bold text-[var(--text-1)] leading-none tabular-nums tracking-tight">
                {score.toFixed(1)}
              </span>
              <span className="text-[16px] font-normal text-[var(--text-3)]">
                /100
              </span>
            </div>

            <div>
              <span
                className="inline-flex items-center gap-1.5 font-semibold text-[13px] px-3 py-0.5 rounded-full"
                style={{
                  backgroundColor: verdictBg,
                  color: gaugeColor,
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: gaugeColor }}
                />
                <span>{verdict}</span>
              </span>
            </div>

            <p
              className="text-[13px] text-[var(--text-2)] leading-snug line-clamp-2 break-words"
              title={data.formatted_address}
            >
              {data.formatted_address}
            </p>
          </div>
        </div>

        {/* Vertical Hairline 1 (Visible at >=1440px) */}
        <div className="hidden xl:block w-[1px] bg-[var(--hairline)] self-stretch my-0.5 shrink-0" />

        {/* Horizontal Divider for the stacked/wrapped range */}
        <div className="block xl:hidden h-[1px] bg-[var(--hairline)] w-full" />

        {/* ROW 2 / TILES & COORDS: [Topographic tile] [Bioclimatic tile] [vertical hairline] [coords + WGS84] */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 flex-1 min-w-0 justify-between">
          {/* Topographic & Bioclimatic tile pair: wraps instead of overflowing
              below ~430px (two 180px tiles + gap exceed a 390px viewport) */}
          <div className="flex flex-wrap sm:flex-nowrap items-stretch gap-3 min-w-0 flex-1">
            {/* Topographic Aspect Tile (min-width 180px, full-width when wrapped) */}
            <div className="bg-[var(--fill)] p-3.5 rounded-[12px] min-w-[180px] w-full sm:w-auto flex-1 min-w-0">
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

            {/* Bioclimatic Axis Tile (min-width 180px, full-width when wrapped) */}
            <div className="bg-[var(--fill)] p-3.5 rounded-[12px] min-w-[180px] w-full sm:w-auto flex-1 min-w-0">
              <span className="text-[12px] font-normal text-[var(--text-3)] block mb-1">
                Bioclimatic axis
              </span>
              <span className="text-[20px] font-semibold text-[var(--text-1)] tabular-nums leading-tight block">
                {data.orientation.optimal_axis_degrees.toFixed(0)}°
              </span>
              <span
                className="text-[12px] text-[var(--text-2)] block truncate mt-0.5"
                title={data.orientation.axis_label}
              >
                {data.orientation.axis_label}
              </span>
            </div>
          </div>

          {/* Vertical Hairline 2 (Visible at >=1440px) */}
          <div className="hidden xl:block w-[1px] bg-[var(--hairline)] self-stretch my-0.5 shrink-0" />

          {/* Stacked Coordinates + WGS84 Chip */}
          <div className="flex flex-col justify-center shrink-0 min-w-[140px] pt-2 sm:pt-0 sm:pl-1 border-t sm:border-t-0 border-[var(--hairline)]">
            <span className="text-[11px] font-normal text-[var(--text-3)] block mb-0.5">
              Coordinates
            </span>
            <span className="font-mono text-[12px] text-[var(--text-2)] tabular-nums leading-tight">
              {data.coordinates.latitude.toFixed(5)}, {data.coordinates.longitude.toFixed(5)}
            </span>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-[4px] bg-[var(--fill)] text-[var(--text-3)] font-medium inline-block w-fit mt-1.5">
              WGS84
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
