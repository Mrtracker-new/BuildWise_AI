import React from 'react';
import type { HazardProfile } from '../services/types';
import { Icon } from './Icon';

interface HazardProfileCardProps {
  hazard: HazardProfile;
}

export const HazardProfileCard: React.FC<HazardProfileCardProps> = ({ hazard }) => {
  const { seismic, flood, storm_cyclone: storm, overall_hazard_level } = hazard;

  const getOverallBadge = (level: string) => {
    switch (level) {
      case 'critical':
        return {
          bg: 'bg-rose-100 text-rose-900 border-rose-300',
          dot: 'bg-rose-600',
          label: 'Critical Hazard Exposure',
        };
      case 'high':
        return {
          bg: 'bg-rose-50 text-rose-800 border-rose-200',
          dot: 'bg-rose-500',
          label: 'High Hazard Exposure',
        };
      case 'moderate':
        return {
          bg: 'bg-amber-50 text-amber-800 border-amber-200',
          dot: 'bg-amber-500',
          label: 'Moderate Hazard Exposure',
        };
      default:
        return {
          bg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
          dot: 'bg-emerald-500',
          label: 'Low Hazard Exposure',
        };
    }
  };

  const getLevelBadge = (level: string) => {
    switch (level) {
      case 'high':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'moderate':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      default:
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
  };

  const overallBadge = getOverallBadge(overall_hazard_level);
  const allWarnings = [
    seismic.confidence_warning,
    flood.confidence_warning,
    storm.confidence_warning,
    ...(hazard.warnings || []),
  ].filter((w): w is string => Boolean(w));

  return (
    <div className="@container bg-white rounded-lg border border-slate-200 p-4 @sm:p-5 shadow-sm space-y-4 min-w-0 w-full">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-3 gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name="activity" size={16} className="text-slate-700 shrink-0" />
          <h2 className="text-[15px] font-semibold text-slate-900 tracking-tight whitespace-normal break-words">
            Hazard History & Climate Stress Profile
          </h2>
        </div>
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${overallBadge.bg} shrink-0`}>
          <span className={`w-1.5 h-1.5 rounded-full ${overallBadge.dot}`} />
          <span>{overallBadge.label}</span>
        </div>
      </div>

      {/* 3-Column Telemetry Grid */}
      <div className="grid grid-cols-1 @md:grid-cols-3 gap-3.5 min-w-0">
        {/* 1. Seismic Column */}
        <div className="rounded-md border border-slate-200 p-3.5 bg-slate-50/50 flex flex-col justify-between space-y-3 min-w-0">
          <div>
            <div className="flex items-center justify-between gap-1.5 mb-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Seismic Hazard</span>
              <span className="text-xs font-mono font-medium text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200">
                {seismic.zone} (Z={seismic.zone_factor.toFixed(2)})
              </span>
            </div>
            <p className="text-xs text-slate-600 mb-2">
              Standard: <span className="font-medium text-slate-800">{seismic.standard}</span>
              {seismic.district ? ` • ${seismic.district}` : ''}
            </p>

            <div className="space-y-1.5 text-xs text-slate-700 pt-2 border-t border-slate-200/60">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">50-Yr Quakes (M≥4.5):</span>
                <span className="font-semibold font-mono text-slate-900">{seismic.event_count_display}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Peak Magnitude:</span>
                <span className="font-semibold font-mono text-slate-900">
                  {seismic.max_magnitude ? `M ${seismic.max_magnitude.toFixed(1)}` : 'None'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Recency:</span>
                <span className="font-medium text-slate-800">
                  {seismic.years_since_last_event !== null && seismic.years_since_last_event !== undefined
                    ? `${seismic.years_since_last_event} yrs ago`
                    : 'No record'}
                </span>
              </div>
            </div>

            {seismic.recent_major_events && seismic.recent_major_events.length > 0 && (
              <div className="mt-2.5 pt-2 border-t border-slate-200/60">
                <span className="text-[11px] font-medium text-slate-500 block mb-1">Recent Major Events:</span>
                <div className="space-y-1">
                  {seismic.recent_major_events.slice(0, 3).map((ev, idx) => (
                    <div key={idx} className="text-[11px] flex justify-between items-center text-slate-600 gap-1.5 min-w-0">
                      <span className="whitespace-normal break-words leading-tight flex-1">{ev.place}</span>
                      <span className="font-mono font-medium text-slate-800 shrink-0">M {ev.magnitude.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="text-[10px] text-slate-400 pt-2 border-t border-slate-200/40">
            Source: USGS FDSN (250km radius) & BIS IS 1893:2016
          </div>
        </div>

        {/* 2. Hydrological Flood Column */}
        <div className="rounded-md border border-slate-200 p-3.5 bg-slate-50/50 flex flex-col justify-between space-y-3 min-w-0">
          <div>
            <div className="flex items-center justify-between gap-1.5 mb-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Hydrological Flood</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded border capitalize ${getLevelBadge(flood.pressure_level)}`}>
                {flood.pressure_level} Pressure
              </span>
            </div>
            <p className="text-xs text-slate-600 mb-2">
              Terrain Elevation: <span className="font-mono font-medium text-slate-800">
                {flood.elevation_amsl_m !== null && flood.elevation_amsl_m !== undefined ? `${flood.elevation_amsl_m.toFixed(0)}m AMSL` : 'Unknown'}
              </span>
            </p>

            <div className="space-y-1.5 text-xs text-slate-700 pt-2 border-t border-slate-200/60">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Discharge Peak/Mean:</span>
                <span className="font-semibold font-mono text-slate-900">
                  {flood.discharge_peak_to_mean_ratio !== null && flood.discharge_peak_to_mean_ratio !== undefined
                    ? `${flood.discharge_peak_to_mean_ratio.toFixed(1)}x`
                    : 'Dry / Ungauged (<0.1 m³/s)'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">NDMA Basin Prone:</span>
                <span className={`font-medium ${flood.ndma_flood_prone ? 'text-rose-700 font-semibold' : 'text-slate-800'}`}>
                  {flood.ndma_flood_prone ? 'Designated Prone' : 'Standard Basin'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Confidence:</span>
                <span className="capitalize text-slate-700 font-medium">{flood.confidence}</span>
              </div>
            </div>
          </div>
          <div className="text-[10px] text-slate-400 pt-2 border-t border-slate-200/40">
            Source: Open-Meteo GloFAS (365d) & NDMA Flood Atlas
          </div>
        </div>

        {/* 3. Climate & Storm Exposure Column */}
        <div className="rounded-md border border-slate-200 p-3.5 bg-slate-50/50 flex flex-col justify-between space-y-3 min-w-0">
          <div>
            <div className="flex items-center justify-between gap-1.5 mb-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Climate & Storm</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded border capitalize ${getLevelBadge(storm.exposure_level)}`}>
                {storm.exposure_level} Exposure
              </span>
            </div>
            <p className="text-xs text-slate-600 mb-2">
              Coastal Belt:{' '}
              <span className={`font-medium ${storm.ndma_cyclone_prone ? 'text-rose-700 font-semibold' : 'text-slate-800'}`}>
                {storm.ndma_cyclone_prone ? 'Cyclone Belt' : 'Inland / Sheltered'}
              </span>
            </p>

            <div className="space-y-1.5 text-xs text-slate-700 pt-2 border-t border-slate-200/60">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">10-Yr Mean Max Gust:</span>
                <span className="font-semibold font-mono text-slate-900">
                  {storm.max_annual_gust_kmh !== null && storm.max_annual_gust_kmh !== undefined
                    ? `${storm.max_annual_gust_kmh.toFixed(1)} km/h`
                    : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Heavy Rain Days (≥50mm):</span>
                <span className="font-semibold font-mono text-slate-900">
                  {storm.extreme_rainfall_days !== null && storm.extreme_rainfall_days !== undefined
                    ? `${storm.extreme_rainfall_days.toFixed(1)} days/yr`
                    : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Confidence:</span>
                <span className="capitalize text-slate-700 font-medium">{storm.confidence}</span>
              </div>
            </div>
          </div>
          <div className="text-[10px] text-slate-400 pt-2 border-t border-slate-200/40">
            Source: ECMWF ERA5 Reanalysis (10-yr window)
          </div>
        </div>
      </div>

      {/* Confidence Warnings if any */}
      {allWarnings.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-800 space-y-1">
          <div className="flex items-center gap-1.5 font-semibold text-amber-900">
            <Icon name="alert-triangle" size={14} className="text-amber-700 shrink-0" />
            <span>Telemetry Confidence & Boundary Notes:</span>
          </div>
          <ul className="list-disc pl-5 space-y-0.5 text-amber-800">
            {allWarnings.map((warn, i) => (
              <li key={i} className="break-words">{warn}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
