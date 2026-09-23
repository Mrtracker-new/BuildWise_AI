import React from 'react';
import type { SiteVisionResponse, PreservationRank } from '../services/types';
import { Icon } from './Icon';

interface SiteVisionCardProps {
  data: SiteVisionResponse | null;
  isLoading: boolean;
  onScan: (modeOverride?: 'segformer' | 'index-only') => void;
  hasCoordinates: boolean;
  className?: string;
}

export const SiteVisionCard: React.FC<SiteVisionCardProps> = ({
  data,
  isLoading,
  onScan,
  hasCoordinates,
  className = '',
}) => {
  // Rank badge styling helper
  const getRankBadge = (rank: PreservationRank) => {
    switch (rank) {
      case 'preserve':
        return {
          label: 'PRESERVE',
          badgeClass: 'bg-[var(--semantic-green)]/15 text-[var(--semantic-green)]',
        };
      case 'compensate':
        return {
          label: 'COMPENSATE',
          badgeClass: 'bg-[var(--semantic-amber)]/15 text-[var(--semantic-amber)]',
        };
      case 'removable':
        return {
          label: 'REMOVABLE',
          badgeClass: 'bg-[var(--semantic-red)]/15 text-[var(--semantic-red)]',
        };
      case 'context':
      default:
        return {
          label: 'CONTEXT',
          badgeClass: 'bg-[var(--fill)] text-[var(--text-2)]',
        };
    }
  };

  // SVG Circular Progress Ring Calculation
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const rawPct =
    data && typeof data.green_cover_pct === 'number' && !isNaN(data.green_cover_pct)
      ? data.green_cover_pct
      : 0;
  const greenPct = Math.max(0, Math.min(100, rawPct));
  const strokeDashoffset = circumference - (greenPct / 100) * circumference;

  return (
    <div className={`space-y-4 w-full min-w-0 @container ${className}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--hairline)] pb-3 min-w-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-[8px] bg-[var(--accent-tint)] text-[var(--accent)] flex items-center justify-center shrink-0">
            <Icon name="satellite" size={15} />
          </div>
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold text-[var(--text-1)] tracking-tight whitespace-normal break-words">
              Ecological Site Vision & Tree Preservation
            </h3>
            <p className="text-[12px] text-[var(--text-2)] whitespace-normal break-words">
              Sentinel-2 L2A multispectral canopy & water detection
            </p>
          </div>
        </div>

        {/* Mode Badge */}
        {data && (
          <div className="flex items-center gap-1.5 shrink-0 self-start sm:self-auto">
            {data.mode === 'segformer' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--semantic-green)]/15 text-[var(--semantic-green)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--semantic-green)] animate-pulse" />
                SegFormer B0
              </span>
            )}
            {data.mode === 'index-only' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--semantic-amber)]/15 text-[var(--semantic-amber)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--semantic-amber)]" />
                Index Only
              </span>
            )}
            {data.mode === 'unavailable' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--fill)] text-[var(--text-2)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-3)]" />
                Unavailable
              </span>
            )}
          </div>
        )}
      </div>

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="space-y-4 animate-pulse">
          <div className="flex items-center gap-4 p-4 bg-[var(--fill)] rounded-[12px]">
            <div className="w-16 h-16 rounded-full bg-[var(--fill-hover)] shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-[var(--fill-hover)] rounded w-1/3" />
              <div className="h-3 bg-[var(--fill-hover)] rounded w-2/3" />
              <div className="h-3 bg-[var(--fill-hover)] rounded w-1/2" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="h-16 bg-[var(--fill)] rounded-[12px]" />
            <div className="h-16 bg-[var(--fill)] rounded-[12px]" />
            <div className="h-16 bg-[var(--fill)] rounded-[12px]" />
          </div>
          <div className="flex items-center justify-center gap-2 text-[12px] text-[var(--text-2)] py-1">
            <Icon name="loader" size={14} className="text-[var(--accent)] animate-spin" />
            <span>Fetching Sentinel-2 COG tiles & running ecological inference...</span>
          </div>
        </div>
      )}

      {/* Empty / Unscanned State */}
      {!isLoading && !data && (
        <div className="py-6 px-4 text-center bg-[var(--fill)] rounded-[16px] space-y-3">
          <div className="w-10 h-10 mx-auto rounded-full bg-[var(--accent-tint)] text-[var(--accent)] flex items-center justify-center">
            <Icon name="tree" size={20} />
          </div>
          <div className="space-y-1 max-w-sm mx-auto">
            <h4 className="text-[14px] font-semibold text-[var(--text-1)]">
              Satellite Canopy & Tree Preservation Analysis
            </h4>
            <p className="text-[12px] text-[var(--text-2)] leading-relaxed">
              Analyze Sentinel-2 multispectral imagery for this plot to compute Green Cover Index,
              tree clusters, and environmental preservation requirements.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onScan()}
            disabled={!hasCoordinates}
            className="inline-flex items-center gap-1.5 px-4 h-9 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 text-white rounded-[12px] text-[13px] font-semibold transition-all cursor-pointer disabled:cursor-not-allowed active:brightness-95 shadow-sm"
          >
            <Icon name="satellite" size={14} />
            <span>Scan Satellite Vision</span>
          </button>
        </div>
      )}

      {/* Unavailable Mode Card */}
      {!isLoading && data && data.mode === 'unavailable' && (
        <div className="space-y-3 bg-[var(--semantic-amber)]/10 border border-[var(--semantic-amber)]/25 rounded-[16px] p-4 text-[12px] text-[var(--text-1)]">
          <div className="flex items-start gap-2.5">
            <Icon name="alert-triangle" size={16} className="text-[var(--semantic-amber)] shrink-0 mt-0.5" />
            <div className="space-y-1 min-w-0">
              <h4 className="font-semibold text-[var(--text-1)] text-[13px]">
                Satellite Imagery Temporarily Unavailable
              </h4>
              <p className="text-[12px] text-[var(--text-2)] leading-relaxed">
                Cloud-free Sentinel-2 imagery could not be accessed within the latency budget. The core
                feasibility analysis remains unaffected and valid.
              </p>
              {data.warnings && data.warnings.length > 0 && (
                <ul className="list-disc list-inside text-[11px] text-[var(--text-2)] space-y-0.5 pt-1">
                  {data.warnings.map((w, idx) => (
                    <li key={idx} className="break-words">
                      {w}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={() => onScan()}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-[var(--fill)] hover:bg-[var(--fill-hover)] text-[var(--text-1)] rounded-[10px] text-[12px] font-medium transition-colors"
            >
              <Icon name="refresh" size={12} />
              <span>Retry Satellite Scan</span>
            </button>
          </div>
        </div>
      )}

      {/* Loaded Analysis Data */}
      {!isLoading && data && data.mode !== 'unavailable' && (
        <div className="space-y-4">
          {/* Circular Gauge & Metric Tiles Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4 items-center bg-[var(--fill)] rounded-[16px] p-4">
            {/* SVG Circular Progress Ring */}
            <div className="flex items-center justify-center">
              <div className="relative w-20 h-20 shrink-0">
                <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                  <circle
                    cx="40"
                    cy="40"
                    r={radius}
                    stroke="var(--fill-hover)"
                    strokeWidth="6"
                    fill="transparent"
                  />
                  <circle
                    cx="40"
                    cy="40"
                    r={radius}
                    stroke="var(--semantic-green)"
                    strokeWidth="6"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    fill="transparent"
                    className="transition-all duration-700 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-[15px] font-bold text-[var(--text-1)] tabular-nums leading-none">
                    {data.green_cover_pct.toFixed(1)}%
                  </span>
                  <span className="text-[9px] font-semibold text-[var(--text-3)] uppercase tracking-wider mt-0.5">
                    Canopy
                  </span>
                </div>
              </div>
            </div>

            {/* 3 Metric Summary Tiles */}
            <div className="grid grid-cols-3 gap-2 min-w-0">
              <div className="p-2 bg-[var(--card-bg-subtle)] border border-[var(--panel-border-color)] rounded-[12px] text-center min-w-0 shadow-sm">
                <div className="flex items-center justify-center gap-1 text-[10px] sm:text-[11px] font-medium text-[var(--semantic-green)] min-w-0">
                  <Icon name="tree" size={11} className="shrink-0" />
                  <span className="leading-tight">Green</span>
                </div>
                <div className="text-[15px] font-bold text-[var(--text-1)] tabular-nums mt-0.5">
                  {data.green_cover_pct.toFixed(1)}%
                </div>
              </div>

              <div className="p-2 bg-[var(--card-bg-subtle)] border border-[var(--panel-border-color)] rounded-[12px] text-center min-w-0 shadow-sm">
                <div className="flex items-center justify-center gap-1 text-[10px] sm:text-[11px] font-medium text-[var(--accent)] min-w-0">
                  <Icon name="droplet" size={11} className="shrink-0" />
                  <span className="leading-tight">Water</span>
                </div>
                <div className="text-[15px] font-bold text-[var(--text-1)] tabular-nums mt-0.5">
                  {data.water_cover_pct.toFixed(1)}%
                </div>
              </div>

              <div className="p-2 bg-[var(--card-bg-subtle)] border border-[var(--panel-border-color)] rounded-[12px] text-center min-w-0 shadow-sm">
                <div className="flex items-center justify-center gap-1 text-[10px] sm:text-[11px] font-medium text-[var(--text-2)] min-w-0">
                  <Icon name="layout-grid" size={11} className="shrink-0" />
                  <span className="leading-tight">Built-up</span>
                </div>
                <div className="text-[15px] font-bold text-[var(--text-1)] tabular-nums mt-0.5">
                  {data.built_up_pct.toFixed(1)}%
                </div>
              </div>
            </div>
          </div>

          {/* Tree Preservation Plan List */}
          <div className="space-y-2 min-w-0">
            <div className="flex items-center justify-between text-[12px] min-w-0">
              <div className="flex items-center gap-1.5 font-semibold text-[var(--text-1)]">
                <Icon name="tree" size={13} className="text-[var(--semantic-green)] shrink-0" />
                <span>Tree Preservation Plan</span>
                <span className="text-[11px] font-normal text-[var(--text-3)]">
                  ({data.preservation_plan.length} cluster{data.preservation_plan.length !== 1 ? 's' : ''})
                </span>
              </div>
              <span className="text-[10px] text-[var(--text-3)] font-mono">240m × 240m Window</span>
            </div>

            {data.preservation_plan.length === 0 ? (
              <div className="p-3 bg-[var(--fill)] rounded-[12px] text-center text-[12px] text-[var(--text-2)]">
                No significant tree clusters (≥ 25 m²) detected on the surveyed plot.
              </div>
            ) : (
              <div className="space-y-0 divide-y divide-[var(--hairline)] max-h-64 overflow-y-auto scrollbar-apple pr-1">
                {data.preservation_plan.map((item) => {
                  const badge = getRankBadge(item.rank);
                  return (
                    <div
                      key={item.cluster_id}
                      className="py-2.5 space-y-1.5 text-[12px] min-w-0"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-semibold text-[var(--text-1)] font-mono text-[11px]">
                            {item.cluster_id}
                          </span>
                          <span
                            className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${badge.badgeClass}`}
                          >
                            {badge.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] font-mono text-[var(--text-2)] shrink-0">
                          <span>
                            Area: <b className="text-[var(--text-1)]">{item.area_sqm} m²</b>
                          </span>
                          <span>
                            NDVI: <b className="text-[var(--text-1)]">{item.mean_ndvi.toFixed(2)}</b>
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 text-[11px]">
                        {item.overlap_footprint ? (
                          <span className="inline-flex items-center gap-1 text-[var(--semantic-red)] font-medium">
                            <Icon name="alert-triangle" size={11} className="shrink-0" />
                            Overlaps proposed building footprint
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[var(--semantic-green)] font-medium">
                            <Icon name="check-circle" size={11} className="shrink-0" />
                            Clear of building footprint
                          </span>
                        )}
                      </div>

                      <p className="text-[12px] text-[var(--text-2)] leading-relaxed break-words">
                        {item.action}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Water Bodies Presence Callout (if detected) */}
          {data.water_bodies.features.length > 0 && (
            <div className="p-3 bg-[var(--accent-tint)]/40 rounded-[12px] text-[12px] space-y-1">
              <div className="flex items-center gap-1.5 text-[var(--text-1)] font-semibold">
                <Icon name="droplet" size={13} className="text-[var(--accent)] shrink-0" />
                <span>Surface Water Detected on Site</span>
              </div>
              <p className="text-[12px] text-[var(--text-2)] leading-relaxed">
                {data.water_bodies.features.length} water feature
                {data.water_bodies.features.length !== 1 ? 's' : ''} detected covering{' '}
                <b className="text-[var(--text-1)]">{data.water_cover_pct.toFixed(1)}%</b> of the site. Maintain statutory drainage
                easement buffers (e.g. 30m lake buffer or 15m primary rajakaluve buffer per NGT norms).
              </p>
            </div>
          )}

          {/* Provenance & Citation Line */}
          <div className="pt-2 border-t border-[var(--hairline)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 text-[11px] text-[var(--text-3)]">
            <div className="whitespace-normal break-words max-w-full">
              <span>Copernicus Sentinel-2 L2A via Element84 STAC</span>
              {data.scene_metadata?.datetime && (
                <span className="font-mono ml-1">
                  ({data.scene_metadata.datetime.slice(0, 10)})
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {(data.timing_ms?.total_ms || data.timing_ms?.total_pipeline_ms) && (
                <span className="font-mono">
                  {(((data.timing_ms.total_ms || data.timing_ms.total_pipeline_ms) as number) / 1000).toFixed(1)}s
                </span>
              )}
              <button
                type="button"
                onClick={() => onScan()}
                className="text-[var(--text-2)] hover:text-[var(--text-1)] underline transition-colors cursor-pointer"
                title="Refresh Satellite Scan"
              >
                Rescan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
