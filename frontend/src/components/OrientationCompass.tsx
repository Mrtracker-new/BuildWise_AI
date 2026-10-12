import React from 'react';
import type { OrientationData } from '../services/types';
import { Icon } from './Icon';
import { BIOCLIMATIC_AXIS_DISCLOSURE } from './report/termDisclosures';

interface OrientationCompassProps {
  orientation: OrientationData;
}

export const OrientationCompass: React.FC<OrientationCompassProps> = ({ orientation }) => {
  const {
    optimal_axis_degrees,
    axis_label,
    prevailing_wind_direction_degrees,
    cross_ventilation_rating,
    passive_design_rationale,
    solar_exposure_summary,
  } = orientation;

  // Geometry for SVG compass (viewBox 0 0 200 200, center at 100, 100, radius 68)
  const cx = 100;
  const cy = 100;
  const radius = 68;

  const axisRad = (optimal_axis_degrees * Math.PI) / 180.0;
  const x1 = cx + radius * Math.sin(axisRad);
  const y1 = cy - radius * Math.cos(axisRad);
  const x2 = cx - radius * Math.sin(axisRad);
  const y2 = cy + radius * Math.cos(axisRad);

  const windRad = (prevailing_wind_direction_degrees * Math.PI) / 180.0;
  const windTailX = cx + (radius + 14) * Math.sin(windRad);
  const windTailY = cy - (radius + 14) * Math.cos(windRad);
  const windHeadX = cx + (radius - 20) * Math.sin(windRad);
  const windHeadY = cy - (radius - 20) * Math.cos(windRad);

  return (
    <div className="rounded-[14px] border border-[var(--hairline)] bg-[var(--card-bg-subtle)] p-4 space-y-3.5 w-full min-w-0">
      {/* Section Header */}
      <div className="flex items-center justify-between border-b border-[var(--hairline)] pb-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name="compass" size={15} className="text-[var(--text-2)] shrink-0" />
          <h3 className="text-[14px] font-semibold text-[var(--text-1)] tracking-tight">
            Passive Solar & Wind Orientation
          </h3>
        </div>
        <span className="inline-flex items-center gap-1 text-[12px] font-normal text-[var(--text-3)] shrink-0">
          Bioclimatic layout
          {BIOCLIMATIC_AXIS_DISCLOSURE}
        </span>
      </div>

      <div className="space-y-3 min-w-0">
        {/* SVG Engineering Compass */}
        <div className="flex flex-col items-center justify-center p-3 bg-[var(--fill)] rounded-[12px] min-w-0">
          <svg viewBox="0 0 200 200" className="w-[170px] max-w-full h-auto select-none block" width="200" height="200">
            {/* Compass Outer Rings */}
            <circle cx={cx} cy={cy} r={radius} fill="none" stroke="var(--hairline)" strokeWidth="1.5" />
            <circle cx={cx} cy={cy} r={radius - 8} fill="none" stroke="var(--hairline)" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={cx} cy={cy} r="2.5" fill="var(--text-1)" />

            {/* Cardinal Marks */}
            <line x1={cx} y1={cy - radius} x2={cx} y2={cy - radius + 8} stroke="var(--text-1)" strokeWidth="1.5" />
            <line x1={cx} y1={cy + radius} x2={cx} y2={cy + radius - 8} stroke="var(--text-3)" strokeWidth="1" />
            <line x1={cx - radius} y1={cy} x2={cx - radius + 8} y2={cy} stroke="var(--text-3)" strokeWidth="1" />
            <line x1={cx + radius} y1={cy} x2={cx + radius - 8} y2={cy} stroke="var(--text-3)" strokeWidth="1" />

            {/* Labels */}
            <text x={cx} y={cy - radius - 5} textAnchor="middle" className="text-[11px] font-bold fill-[var(--text-1)]">
              N
            </text>
            <text x={cx} y={cy + radius + 14} textAnchor="middle" className="text-[10px] font-medium fill-[var(--text-3)]">
              S
            </text>
            <text x={cx + radius + 12} y={cy + 4} textAnchor="middle" className="text-[10px] font-medium fill-[var(--text-3)]">
              E
            </text>
            <text x={cx - radius - 12} y={cy + 4} textAnchor="middle" className="text-[10px] font-medium fill-[var(--text-3)]">
              W
            </text>

            {/* Recommended Building Longitudinal Axis */}
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="var(--accent)"
              strokeWidth="5"
              strokeLinecap="round"
            />
            {/* Building Axis Centerline */}
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="var(--text-1)"
              strokeWidth="1.5"
              strokeDasharray="2 2"
            />

            {/* Prevailing Wind Vector */}
            <line
              x1={windTailX}
              y1={windTailY}
              x2={windHeadX}
              y2={windHeadY}
              stroke="var(--semantic-green)"
              strokeWidth="2"
              strokeDasharray="4 2"
            />
            <circle cx={windHeadX} cy={windHeadY} r="3" fill="var(--semantic-green)" />
          </svg>

          {/* Legend */}
          <div className="flex items-center gap-3 text-[11px] text-[var(--text-2)] mt-2">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-1 bg-[var(--accent)] rounded-full"></span>
              <span>Long Axis ({optimal_axis_degrees.toFixed(0)}°)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--semantic-green)]"></span>
              <span>Wind ({prevailing_wind_direction_degrees.toFixed(0)}°)</span>
            </div>
          </div>
        </div>

        {/* Grouped Key-Value Rows (No background micro-tiles) */}
        <div className="divide-y divide-[var(--hairline)] border-y border-[var(--hairline)]">
          <div className="h-10 flex items-center justify-between px-0.5">
            <span className="text-[13px] font-normal text-[var(--text-2)]">Principal building axis</span>
            <span className="text-[13px] font-semibold text-[var(--text-1)] tabular-nums whitespace-nowrap">
              {axis_label} ({optimal_axis_degrees.toFixed(1)}°)
            </span>
          </div>
          <div className="h-10 flex items-center justify-between px-0.5">
            <span className="text-[13px] font-normal text-[var(--text-2)]">Cross-ventilation potential</span>
            <span className="text-[13px] font-semibold text-[var(--semantic-green-ink)] whitespace-nowrap">
              {cross_ventilation_rating} ({prevailing_wind_direction_degrees.toFixed(0)}°)
            </span>
          </div>
        </div>

        {solar_exposure_summary && (
          <div className="pt-1 space-y-0.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)] block">
              Solar exposure &amp; daylight
            </span>
            <p className="text-[12px] text-[var(--text-2)] leading-normal">{solar_exposure_summary}</p>
          </div>
        )}

        <p className="text-[12px] text-[var(--text-2)] leading-normal pt-1">
          {passive_design_rationale}
        </p>
      </div>
    </div>
  );
};
