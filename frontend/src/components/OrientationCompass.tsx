import React from 'react';
import type { OrientationData } from '../services/types';
import { Icon } from './Icon';

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
    <div className="bg-white rounded-lg border border-slate-200 p-5 shadow-sm space-y-3.5">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <Icon name="compass" size={16} className="text-slate-700" />
          <h3 className="text-[15px] font-semibold text-slate-900 tracking-tight">
            Passive Solar & Wind Orientation
          </h3>
        </div>
        <span className="text-xs uppercase tracking-wider font-semibold text-slate-500 font-mono">
          Bioclimatic Layout
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
        {/* SVG Engineering Compass */}
        <div className="flex flex-col items-center justify-center p-2 bg-slate-50 rounded-lg border border-slate-100">
          <svg width="200" height="200" viewBox="0 0 200 200" className="select-none">
            {/* Compass Outer Rings */}
            <circle cx={cx} cy={cy} r={radius} fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="1.5" />
            <circle cx={cx} cy={cy} r={radius - 8} fill="none" stroke="#F1F5F9" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={cx} cy={cy} r="2" fill="#0F172A" />

            {/* Cardinal Marks */}
            <line x1={cx} y1={cy - radius} x2={cx} y2={cy - radius + 8} stroke="#0F172A" strokeWidth="1.5" />
            <line x1={cx} y1={cy + radius} x2={cx} y2={cy + radius - 8} stroke="#94A3B8" strokeWidth="1" />
            <line x1={cx - radius} y1={cy} x2={cx - radius + 8} y2={cy} stroke="#94A3B8" strokeWidth="1" />
            <line x1={cx + radius} y1={cy} x2={cx + radius - 8} y2={cy} stroke="#94A3B8" strokeWidth="1" />

            {/* Labels */}
            <text x={cx} y={cy - radius - 5} textAnchor="middle" className="text-xs font-mono font-bold fill-slate-900">
              N
            </text>
            <text x={cx} y={cy + radius + 14} textAnchor="middle" className="text-[11px] font-mono fill-slate-400">
              S
            </text>
            <text x={cx + radius + 12} y={cy + 4} textAnchor="middle" className="text-[11px] font-mono fill-slate-400">
              E
            </text>
            <text x={cx - radius - 12} y={cy + 4} textAnchor="middle" className="text-[11px] font-mono fill-slate-400">
              W
            </text>

            {/* Recommended Building Longitudinal Axis */}
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="#0284C7"
              strokeWidth="6"
              strokeLinecap="round"
            />
            {/* Building Axis Centerline */}
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="#0F172A"
              strokeWidth="1.5"
              strokeDasharray="2 2"
            />

            {/* Prevailing Wind Vector */}
            <line
              x1={windTailX}
              y1={windTailY}
              x2={windHeadX}
              y2={windHeadY}
              stroke="#10B981"
              strokeWidth="2"
              strokeDasharray="4 2"
            />
            <circle cx={windHeadX} cy={windHeadY} r="3" fill="#10B981" />
          </svg>

          {/* Legend */}
          <div className="flex items-center gap-3 text-xs font-mono text-slate-500 mt-2">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-1 bg-sky-600 rounded"></span>
              <span>Building Axis ({optimal_axis_degrees.toFixed(0)}°)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>Wind ({prevailing_wind_direction_degrees.toFixed(0)}°)</span>
            </div>
          </div>
        </div>

        {/* Textual Rationale & Specifications */}
        <div className="space-y-3">
          <div className="bg-slate-50 p-3 rounded border border-slate-100">
            <span className="text-xs uppercase tracking-wider font-semibold text-slate-500 block mb-0.5">
              Principal Longitudinal Axis
            </span>
            <span className="text-sm font-semibold text-slate-900">
              {axis_label} (<span className="font-mono">{optimal_axis_degrees.toFixed(1)}°</span>)
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-slate-50 p-2.5 rounded border border-slate-100">
              <span className="text-xs uppercase tracking-wider font-semibold text-slate-500 block mb-0.5">
                Prevailing Wind
              </span>
              <span className="text-xs font-semibold text-slate-800">
                <span className="font-mono">{prevailing_wind_direction_degrees.toFixed(0)}°</span> Azimuth
              </span>
            </div>
            <div className="bg-slate-50 p-2.5 rounded border border-slate-100">
              <span className="text-xs uppercase tracking-wider font-semibold text-slate-500 block mb-0.5">
                Ventilation Rating
              </span>
              <span className="text-xs font-semibold text-emerald-700">
                {cross_ventilation_rating}
              </span>
            </div>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            {passive_design_rationale}
          </p>
        </div>
      </div>
    </div>
  );
};
