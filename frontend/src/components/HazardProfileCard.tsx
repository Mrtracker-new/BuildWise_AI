import React from 'react';
import type { HazardProfile } from '../services/types';
import { Icon } from './Icon';

interface HazardProfileCardProps {
  hazard: HazardProfile;
}

export const HazardProfileCard: React.FC<HazardProfileCardProps> = ({ hazard }) => {
  const { seismic, flood, storm_cyclone: storm, overall_hazard_level } = hazard;

  const getOverallColor = (level: string) => {
    switch (level) {
      case 'critical':
      case 'high':
        return 'var(--semantic-red)';
      case 'moderate':
        return 'var(--semantic-amber)';
      default:
        return 'var(--semantic-green)';
    }
  };

  const overallColor = getOverallColor(overall_hazard_level);
  const allWarnings = [
    seismic.confidence_warning,
    flood.confidence_warning,
    storm.confidence_warning,
    ...(hazard.warnings || []),
  ].filter((w): w is string => Boolean(w));

  return (
    <div className="space-y-4 w-full min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--hairline)] pb-2.5 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name="activity" size={15} className="text-[var(--text-2)] shrink-0" />
          <h2 className="text-[15px] font-semibold text-[var(--text-1)] tracking-tight">
            Hazard History & Climate Stress Profile
          </h2>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--fill)] text-[12px] font-medium text-[var(--text-1)] shrink-0">
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: overallColor }}
          />
          <span className="capitalize">{overall_hazard_level} Hazard</span>
        </div>
      </div>

      {/* Grouped iOS Sections separated by hairlines */}
      <div className="divide-y divide-[var(--hairline)] border-y border-[var(--hairline)]">
        {/* 1. Seismic Row */}
        <div className="py-3 space-y-2 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-semibold text-[var(--text-1)]">
              Seismic Vulnerability
            </span>
            <span className="text-[11px] font-medium text-[var(--text-2)] bg-[var(--fill)] px-2 py-0.5 rounded-[6px]">
              {seismic.zone} (Z={seismic.zone_factor.toFixed(2)})
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-[12px]">
            <div className="bg-[var(--fill)] p-2 rounded-[8px]">
              <span className="text-[10px] text-[var(--text-3)] block uppercase tracking-wider">50-Yr Quakes</span>
              <span className="text-[13px] font-semibold text-[var(--text-1)] tabular-nums">{seismic.event_count_display}</span>
            </div>
            <div className="bg-[var(--fill)] p-2 rounded-[8px]">
              <span className="text-[10px] text-[var(--text-3)] block uppercase tracking-wider">Peak Mag</span>
              <span className="text-[13px] font-semibold text-[var(--text-1)] tabular-nums">
                {seismic.max_magnitude ? `M ${seismic.max_magnitude.toFixed(1)}` : 'None'}
              </span>
            </div>
            <div className="bg-[var(--fill)] p-2 rounded-[8px]">
              <span className="text-[10px] text-[var(--text-3)] block uppercase tracking-wider">Recency</span>
              <span className="text-[13px] font-semibold text-[var(--text-1)] truncate">
                {seismic.years_since_last_event !== null && seismic.years_since_last_event !== undefined
                  ? `${seismic.years_since_last_event}y ago`
                  : 'None'}
              </span>
            </div>
          </div>
          <div className="text-[11px] text-[var(--text-3)]">
            Standard: {seismic.standard}{seismic.district ? ` • ${seismic.district}` : ''}
          </div>
        </div>

        {/* 2. Hydrological Flood Row */}
        <div className="py-3 space-y-2 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-semibold text-[var(--text-1)]">
              Hydrological Flood Stress
            </span>
            <span className="text-[11px] font-medium text-[var(--text-2)] bg-[var(--fill)] px-2 py-0.5 rounded-[6px] capitalize">
              {flood.pressure_level} Pressure
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-[12px]">
            <div className="bg-[var(--fill)] p-2 rounded-[8px]">
              <span className="text-[10px] text-[var(--text-3)] block uppercase tracking-wider">Discharge Peak</span>
              <span className="text-[13px] font-semibold text-[var(--text-1)] tabular-nums">
                {flood.discharge_peak_to_mean_ratio !== null && flood.discharge_peak_to_mean_ratio !== undefined
                  ? `${flood.discharge_peak_to_mean_ratio.toFixed(2)}x`
                  : '—'}
              </span>
            </div>
            <div className="bg-[var(--fill)] p-2 rounded-[8px]">
              <span className="text-[10px] text-[var(--text-3)] block uppercase tracking-wider">Elevation ASL</span>
              <span className="text-[13px] font-semibold text-[var(--text-1)] tabular-nums">
                {flood.elevation_amsl_m !== null && flood.elevation_amsl_m !== undefined
                  ? `${flood.elevation_amsl_m.toFixed(0)}m`
                  : '—'}
              </span>
            </div>
            <div className="bg-[var(--fill)] p-2 rounded-[8px]">
              <span className="text-[10px] text-[var(--text-3)] block uppercase tracking-wider">NDMA Prone</span>
              <span className="text-[13px] font-semibold text-[var(--text-1)]">
                {flood.ndma_flood_prone ? 'Yes' : 'No'}
              </span>
            </div>
          </div>
          <div className="text-[11px] text-[var(--text-3)]">
            Open-Meteo GloFAS & ECMWF ERA5 Hydrological Monitoring
          </div>
        </div>

        {/* 3. Storm Exposure Row */}
        <div className="py-3 space-y-2 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-semibold text-[var(--text-1)]">
              Storm & Wind Exposure
            </span>
            <span className="text-[11px] font-medium text-[var(--text-2)] bg-[var(--fill)] px-2 py-0.5 rounded-[6px] capitalize">
              {storm.exposure_level} Exposure
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-[12px]">
            <div className="bg-[var(--fill)] p-2 rounded-[8px]">
              <span className="text-[10px] text-[var(--text-3)] block uppercase tracking-wider">Annual Gust</span>
              <span className="text-[13px] font-semibold text-[var(--text-1)] tabular-nums">
                {storm.max_annual_gust_kmh !== null && storm.max_annual_gust_kmh !== undefined
                  ? `${storm.max_annual_gust_kmh.toFixed(0)} km/h`
                  : '—'}
              </span>
            </div>
            <div className="bg-[var(--fill)] p-2 rounded-[8px]">
              <span className="text-[10px] text-[var(--text-3)] block uppercase tracking-wider">Extreme Rain Days</span>
              <span className="text-[13px] font-semibold text-[var(--text-1)] tabular-nums">
                {storm.extreme_rainfall_days !== null && storm.extreme_rainfall_days !== undefined
                  ? `${storm.extreme_rainfall_days} d/yr`
                  : '—'}
              </span>
            </div>
            <div className="bg-[var(--fill)] p-2 rounded-[8px]">
              <span className="text-[10px] text-[var(--text-3)] block uppercase tracking-wider">NDMA Cyclone</span>
              <span className="text-[13px] font-semibold text-[var(--text-1)]">
                {storm.ndma_cyclone_prone ? 'Yes' : 'No'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {allWarnings.length > 0 && (
        <div className="p-3 bg-[var(--fill)] rounded-[10px] text-[12px] text-[var(--text-2)] space-y-1">
          <div className="flex items-center gap-1.5 text-[var(--semantic-amber)] font-medium">
            <Icon name="alert-triangle" size={13} />
            <span>Hazard Telemetry Notes</span>
          </div>
          {allWarnings.map((w, idx) => (
            <p key={idx} className="leading-normal">{w}</p>
          ))}
        </div>
      )}
    </div>
  );
};
