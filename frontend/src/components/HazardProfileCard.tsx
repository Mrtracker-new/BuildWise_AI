import React, { useState } from 'react';
import type { HazardProfile } from '../services/types';
import { Icon } from './Icon';

interface HazardProfileCardProps {
  hazard: HazardProfile;
}

export const HazardProfileCard: React.FC<HazardProfileCardProps> = ({ hazard }) => {
  const { seismic, flood, storm_cyclone: storm, overall_hazard_level } = hazard;

  const getSeismicSeverity = (): { level: 'low' | 'moderate' | 'high'; label: string } => {
    if (seismic.zone.includes('V') || seismic.zone.includes('IV')) {
      return { level: 'high', label: `${seismic.zone} High` };
    }
    if (seismic.zone.includes('III')) {
      return { level: 'moderate', label: `${seismic.zone} Moderate` };
    }
    return { level: 'low', label: `${seismic.zone} Low` };
  };

  const seismicSev = getSeismicSeverity();

  // Worst-severity hazard starts expanded (Hydrological by default)
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const scores: Record<string, number> = {
      seismic: seismicSev.level === 'high' ? 3 : seismicSev.level === 'moderate' ? 2 : 1,
      flood: flood.pressure_level === 'high' ? 3 : flood.pressure_level === 'moderate' ? 2 : 1,
      storm: storm.exposure_level === 'high' ? 3 : storm.exposure_level === 'moderate' ? 2 : 1,
    };
    let worst = 'flood';
    let maxVal = scores.flood;
    for (const [k, v] of Object.entries(scores)) {
      if (v > maxVal) {
        maxVal = v;
        worst = k;
      }
    }
    return {
      seismic: worst === 'seismic',
      flood: worst === 'flood',
      storm: worst === 'storm',
    };
  });

  const toggleExpand = (key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const getSeverityPill = (level: 'low' | 'moderate' | 'high' | 'critical', customLabel?: string) => {
    let bg = 'rgba(52, 199, 89, 0.12)';
    let text = 'var(--semantic-green)';
    let label = customLabel || `${level} risk`;

    if (level === 'high' || level === 'critical') {
      bg = 'rgba(255, 59, 48, 0.12)';
      text = 'var(--semantic-red)';
    } else if (level === 'moderate') {
      bg = 'rgba(255, 159, 10, 0.12)';
      text = 'var(--semantic-amber)';
    }

    return (
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[12px] font-semibold capitalize shrink-0"
        style={{ backgroundColor: bg, color: text }}
      >
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: text }} />
        <span>{label}</span>
      </span>
    );
  };

  const allWarnings = [
    seismic.confidence_warning,
    flood.confidence_warning,
    storm.confidence_warning,
    ...(hazard.warnings || []),
  ].filter((w): w is string => Boolean(w));

  return (
    <div className="space-y-3 w-full min-w-0">
      {/* Overall Hazard Status Pill Header */}
      <div className="flex items-center justify-between border-b border-[var(--hairline)] pb-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name="activity" size={15} className="text-[var(--text-2)] shrink-0" />
          <h3 className="text-[14px] font-semibold text-[var(--text-1)] tracking-tight">
            Climate & Hazard Vulnerability
          </h3>
        </div>
        {getSeverityPill(overall_hazard_level, `${overall_hazard_level} hazard`)}
      </div>

      {/* 1. Seismic Vulnerability Card */}
      <div className="rounded-[14px] border border-[var(--hairline)] bg-[var(--card-bg-subtle)] p-3.5 transition-all">
        <button
          type="button"
          onClick={() => toggleExpand('seismic')}
          className="w-full flex items-center justify-between gap-2 text-left cursor-pointer select-none"
          aria-expanded={expanded.seismic}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-6 h-6 rounded-[6px] flex items-center justify-center shrink-0"
              style={{
                backgroundColor:
                  seismicSev.level === 'high'
                    ? 'rgba(255, 59, 48, 0.12)'
                    : seismicSev.level === 'moderate'
                    ? 'rgba(255, 159, 10, 0.12)'
                    : 'rgba(52, 199, 89, 0.12)',
                color:
                  seismicSev.level === 'high'
                    ? 'var(--semantic-red)'
                    : seismicSev.level === 'moderate'
                    ? 'var(--semantic-amber)'
                    : 'var(--semantic-green)',
              }}
            >
              <Icon name="activity" size={16} />
            </div>
            <span className="text-[14px] font-semibold text-[var(--text-1)] tracking-tight">
              Seismic Vulnerability
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {getSeverityPill(seismicSev.level, seismicSev.label)}
            <Icon
              name="chevron-down"
              size={14}
              className={`text-[var(--text-3)] transition-transform duration-250 ${
                expanded.seismic ? 'rotate-180 text-[var(--text-1)]' : ''
              }`}
            />
          </div>
        </button>

        <div
          className={`grid transition-[grid-template-rows] duration-250 ease-out ${
            expanded.seismic ? 'grid-rows-[1fr] mt-3 pt-1 border-t border-[var(--hairline)]' : 'grid-rows-[0fr]'
          }`}
        >
          <div className="overflow-hidden">
            <div className="divide-y divide-[var(--hairline)]">
              <div className="h-10 flex items-center justify-between px-0.5">
                <span className="text-[13px] font-normal text-[var(--text-2)]">50-year quake events</span>
                <span className="text-[13px] font-semibold text-[var(--text-1)] tabular-nums whitespace-nowrap">
                  {seismic.event_count_display}
                </span>
              </div>
              <div className="h-10 flex items-center justify-between px-0.5">
                <span className="text-[13px] font-normal text-[var(--text-2)]">Peak recorded magnitude</span>
                <span className="text-[13px] font-semibold text-[var(--text-1)] tabular-nums whitespace-nowrap">
                  {seismic.max_magnitude ? `M ${seismic.max_magnitude.toFixed(1)}` : 'None'}
                </span>
              </div>
              <div className="h-10 flex items-center justify-between px-0.5">
                <span className="text-[13px] font-normal text-[var(--text-2)]">Years since last event</span>
                <span className="text-[13px] font-semibold text-[var(--text-1)] tabular-nums whitespace-nowrap">
                  {seismic.years_since_last_event !== null && seismic.years_since_last_event !== undefined
                    ? `${seismic.years_since_last_event}y ago`
                    : 'None'}
                </span>
              </div>
              <div className="h-10 flex items-center justify-between px-0.5">
                <span className="text-[13px] font-normal text-[var(--text-2)]">Design zone factor</span>
                <span className="text-[13px] font-semibold text-[var(--text-1)] tabular-nums whitespace-nowrap">
                  Z = {seismic.zone_factor.toFixed(2)}
                </span>
              </div>
            </div>
            <div className="text-[12px] text-[var(--text-3)] pt-2 border-t border-[var(--hairline)]">
              Source: {seismic.standard}{seismic.district ? ` • ${seismic.district}` : ''}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Hydrological Flood Stress Card */}
      <div className="rounded-[14px] border border-[var(--hairline)] bg-[var(--card-bg-subtle)] p-3.5 transition-all">
        <button
          type="button"
          onClick={() => toggleExpand('flood')}
          className="w-full flex items-center justify-between gap-2 text-left cursor-pointer select-none"
          aria-expanded={expanded.flood}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-6 h-6 rounded-[6px] flex items-center justify-center shrink-0"
              style={{
                backgroundColor:
                  flood.pressure_level === 'high'
                    ? 'rgba(255, 59, 48, 0.12)'
                    : flood.pressure_level === 'moderate'
                    ? 'rgba(255, 159, 10, 0.12)'
                    : 'rgba(52, 199, 89, 0.12)',
                color:
                  flood.pressure_level === 'high'
                    ? 'var(--semantic-red)'
                    : flood.pressure_level === 'moderate'
                    ? 'var(--semantic-amber)'
                    : 'var(--semantic-green)',
              }}
            >
              <Icon name="droplet" size={16} />
            </div>
            <span className="text-[14px] font-semibold text-[var(--text-1)] tracking-tight">
              Hydrological Flood Stress
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {getSeverityPill(flood.pressure_level, `${flood.pressure_level} pressure`)}
            <Icon
              name="chevron-down"
              size={14}
              className={`text-[var(--text-3)] transition-transform duration-250 ${
                expanded.flood ? 'rotate-180 text-[var(--text-1)]' : ''
              }`}
            />
          </div>
        </button>

        <div
          className={`grid transition-[grid-template-rows] duration-250 ease-out ${
            expanded.flood ? 'grid-rows-[1fr] mt-3 pt-1 border-t border-[var(--hairline)]' : 'grid-rows-[0fr]'
          }`}
        >
          <div className="overflow-hidden">
            <div className="divide-y divide-[var(--hairline)]">
              <div className="h-10 flex items-center justify-between px-0.5">
                <span className="text-[13px] font-normal text-[var(--text-2)]">Peak-to-mean discharge</span>
                <span className="text-[13px] font-semibold text-[var(--text-1)] tabular-nums whitespace-nowrap">
                  {flood.discharge_peak_to_mean_ratio !== null && flood.discharge_peak_to_mean_ratio !== undefined
                    ? `${flood.discharge_peak_to_mean_ratio.toFixed(2)}x`
                    : '—'}
                </span>
              </div>
              <div className="h-10 flex items-center justify-between px-0.5">
                <span className="text-[13px] font-normal text-[var(--text-2)]">Site elevation (AMSL)</span>
                <span className="text-[13px] font-semibold text-[var(--text-1)] tabular-nums whitespace-nowrap">
                  {flood.elevation_amsl_m !== null && flood.elevation_amsl_m !== undefined
                    ? `${flood.elevation_amsl_m.toFixed(0)}m`
                    : '—'}
                </span>
              </div>
              <div className="h-10 flex items-center justify-between px-0.5">
                <span className="text-[13px] font-normal text-[var(--text-2)]">NDMA flood zone</span>
                <span className="text-[13px] font-semibold text-[var(--text-1)] whitespace-nowrap">
                  {flood.ndma_flood_prone ? 'Prone zone' : 'Clear baseline'}
                </span>
              </div>
              <div className="h-10 flex items-center justify-between px-0.5">
                <span className="text-[13px] font-normal text-[var(--text-2)]">Hydrological pressure</span>
                <span className="text-[13px] font-semibold text-[var(--text-1)] whitespace-nowrap capitalize">
                  {flood.pressure_level}
                </span>
              </div>
            </div>
            <div className="text-[12px] text-[var(--text-3)] pt-2 border-t border-[var(--hairline)]">
              Source: Open-Meteo GloFAS & ECMWF ERA5 Hydrological Monitoring
            </div>
          </div>
        </div>
      </div>

      {/* 3. Storm & Wind Exposure Card */}
      <div className="rounded-[14px] border border-[var(--hairline)] bg-[var(--card-bg-subtle)] p-3.5 transition-all">
        <button
          type="button"
          onClick={() => toggleExpand('storm')}
          className="w-full flex items-center justify-between gap-2 text-left cursor-pointer select-none"
          aria-expanded={expanded.storm}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-6 h-6 rounded-[6px] flex items-center justify-center shrink-0"
              style={{
                backgroundColor:
                  storm.exposure_level === 'high'
                    ? 'rgba(255, 59, 48, 0.12)'
                    : storm.exposure_level === 'moderate'
                    ? 'rgba(255, 159, 10, 0.12)'
                    : 'rgba(52, 199, 89, 0.12)',
                color:
                  storm.exposure_level === 'high'
                    ? 'var(--semantic-red)'
                    : storm.exposure_level === 'moderate'
                    ? 'var(--semantic-amber)'
                    : 'var(--semantic-green)',
              }}
            >
              <Icon name="wind" size={16} />
            </div>
            <span className="text-[14px] font-semibold text-[var(--text-1)] tracking-tight">
              Storm & Wind Exposure
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {getSeverityPill(storm.exposure_level, `${storm.exposure_level} exposure`)}
            <Icon
              name="chevron-down"
              size={14}
              className={`text-[var(--text-3)] transition-transform duration-250 ${
                expanded.storm ? 'rotate-180 text-[var(--text-1)]' : ''
              }`}
            />
          </div>
        </button>

        <div
          className={`grid transition-[grid-template-rows] duration-250 ease-out ${
            expanded.storm ? 'grid-rows-[1fr] mt-3 pt-1 border-t border-[var(--hairline)]' : 'grid-rows-[0fr]'
          }`}
        >
          <div className="overflow-hidden">
            <div className="divide-y divide-[var(--hairline)]">
              <div className="h-10 flex items-center justify-between px-0.5">
                <span className="text-[13px] font-normal text-[var(--text-2)]">Maximum annual wind gust</span>
                <span className="text-[13px] font-semibold text-[var(--text-1)] tabular-nums whitespace-nowrap">
                  {storm.max_annual_gust_kmh !== null && storm.max_annual_gust_kmh !== undefined
                    ? `${storm.max_annual_gust_kmh.toFixed(0)} km/h`
                    : '—'}
                </span>
              </div>
              <div className="h-10 flex items-center justify-between px-0.5">
                <span className="text-[13px] font-normal text-[var(--text-2)]">Extreme rainfall days</span>
                <span className="text-[13px] font-semibold text-[var(--text-1)] tabular-nums whitespace-nowrap">
                  {storm.extreme_rainfall_days !== null && storm.extreme_rainfall_days !== undefined
                    ? `${storm.extreme_rainfall_days} days/year`
                    : '—'}
                </span>
              </div>
              <div className="h-10 flex items-center justify-between px-0.5">
                <span className="text-[13px] font-normal text-[var(--text-2)]">NDMA cyclone zone</span>
                <span className="text-[13px] font-semibold text-[var(--text-1)] whitespace-nowrap">
                  {storm.ndma_cyclone_prone ? 'Prone zone' : 'Clear baseline'}
                </span>
              </div>
              <div className="h-10 flex items-center justify-between px-0.5">
                <span className="text-[13px] font-normal text-[var(--text-2)]">Wind exposure level</span>
                <span className="text-[13px] font-semibold text-[var(--text-1)] whitespace-nowrap capitalize">
                  {storm.exposure_level}
                </span>
              </div>
            </div>
            <div className="text-[12px] text-[var(--text-3)] pt-2 border-t border-[var(--hairline)]">
              Source: IMD & ECMWF ERA5 Historical Wind Modeling
            </div>
          </div>
        </div>
      </div>

      {allWarnings.length > 0 && (
        <div className="p-3 bg-[var(--fill)] rounded-[12px] text-[12px] text-[var(--text-2)] space-y-1">
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
