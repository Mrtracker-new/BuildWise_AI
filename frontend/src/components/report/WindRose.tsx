import React from 'react';
import type { OrientationData } from '../../services/types';
import { TABULAR_NUMS_CLASS } from '../../design/tokens';

interface WindRoseProps {
  orientation: OrientationData;
}

/**
 * Compact bioclimatic card: an 8-spoke wind rose showing the prevailing wind
 * bearing, the optimal solar axis as a highlight spoke, and the passive
 * design ratings. Derived purely from the shared OrientationData.
 */
export const WindRose: React.FC<WindRoseProps> = ({ orientation }) => {
  const { prevailing_wind_direction_degrees: windDeg, optimal_axis_degrees: axisDeg } = orientation;

  const spokes = [0, 45, 90, 135, 180, 225, 270, 315];
  const windIdx = spokes.reduce((best, s, i) =>
    Math.abs(angleDiff(windDeg, s)) < Math.abs(angleDiff(windDeg, spokes[best])) ? i : best, 0);
  const axisIdx = spokes.reduce((best, s, i) =>
    Math.abs(angleDiff(axisDeg, s)) < Math.abs(angleDiff(axisDeg, spokes[best])) ? i : best, 0);

  return (
    <div className="flex items-center gap-4" data-testid="wind-rose">
      <svg width="96" height="96" viewBox="-48 -48 96 96" role="img"
        aria-label={`Wind rose: prevailing wind ${orientation.axis_label}, optimal solar axis ${Math.round(axisDeg)} degrees`}>
        {/* ring */}
        <circle r="40" fill="none" stroke="var(--hairline)" strokeWidth="1" />
        {/* cardinal letters */}
        {[['N', 0], ['E', 90], ['S', 180], ['W', 270]].map(([label, deg]) => {
          const rad = ((deg as number) * Math.PI) / 180;
          return (
            <text
              key={label as string}
              x={34 * Math.sin(rad)}
              y={-34 * Math.cos(rad) + 3}
              textAnchor="middle"
              fontSize="8"
              fill="var(--text-3)"
            >
              {label}
            </text>
          );
        })}
        {/* spokes */}
        {spokes.map((s, i) => {
          const rad = (s * Math.PI) / 180;
          const isWind = i === windIdx;
          const isAxis = i === axisIdx;
          return (
            <line
              key={s}
              x1={16 * Math.sin(rad)}
              y1={-16 * Math.cos(rad)}
              x2={30 * Math.sin(rad)}
              y2={-30 * Math.cos(rad)}
              stroke={isWind ? 'var(--accent)' : isAxis ? 'var(--semantic-green)' : 'var(--hairline)'}
              strokeWidth={isWind || isAxis ? 3 : 1.5}
              strokeLinecap="round"
            />
          );
        })}
        {/* wind direction needle */}
        <line
          x1="0" y1="0"
          x2={26 * Math.sin((windDeg * Math.PI) / 180)}
          y2={-26 * Math.cos((windDeg * Math.PI) / 180)}
          stroke="var(--accent)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle r="2.5" fill="var(--text-1)" />
      </svg>

      <div className="space-y-1.5 min-w-0">
        <Row label="Prevailing wind" value={`${Math.round(windDeg)}°`} tone="accent" />
        <Row label="Optimal solar axis" value={`${Math.round(axisDeg)}°`} tone="green" />
        <Row label="Cross ventilation" value={orientation.cross_ventilation_rating} />
        <p className="text-[11px] text-[var(--text-3)] leading-snug line-clamp-2" title={orientation.passive_design_rationale}>
          {orientation.passive_design_rationale}
        </p>
      </div>
    </div>
  );
};

function angleDiff(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360 + 360) % 360);
  return d > 180 ? 360 - d : d;
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'accent' | 'green' }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[11px] text-[var(--text-3)]">{label}</span>
      <span
        className={`${TABULAR_NUMS_CLASS} text-[12px] font-semibold ${
          tone === 'accent' ? 'text-[var(--accent-ink)]' : tone === 'green' ? 'text-[var(--semantic-green-ink)]' : 'text-[var(--text-1)]'
        }`}
      >
        {value}
      </span>
    </div>
  );
}
