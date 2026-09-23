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
          borderClass: 'border-l-4 border-emerald-500',
          badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
        };
      case 'compensate':
        return {
          label: 'COMPENSATE',
          borderClass: 'border-l-4 border-amber-500',
          badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
        };
      case 'removable':
        return {
          label: 'REMOVABLE',
          borderClass: 'border-l-4 border-rose-500',
          badgeClass: 'bg-rose-100 text-rose-800 border-rose-300',
        };
      case 'context':
      default:
        return {
          label: 'CONTEXT',
          borderClass: 'border-l-4 border-slate-400',
          badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
        };
    }
  };

  // SVG Circular Progress Ring Calculation
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const rawPct = (data && typeof data.green_cover_pct === 'number' && !isNaN(data.green_cover_pct)) ? data.green_cover_pct : 0;
  const greenPct = Math.max(0, Math.min(100, rawPct));
  const strokeDashoffset = circumference - (greenPct / 100) * circumference;

  return (
    <div
      className={`bg-white rounded-lg border border-slate-200 shadow-sm p-4 sm:p-5 space-y-4 w-full min-w-0 @container ${className}`}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 bg-emerald-50 text-emerald-700 rounded border border-emerald-200 shrink-0">
            <Icon name="satellite" size={17} />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 tracking-tight whitespace-normal break-words">
              Ecological Site Vision & Tree Preservation
            </h3>
            <p className="text-[11px] text-slate-500 whitespace-normal break-words">
              Sentinel-2 L2A multispectral canopy & water detection
            </p>
          </div>
        </div>

        {/* Mode Badge */}
        {data && (
          <div className="flex items-center gap-1.5 shrink-0 self-start sm:self-auto">
            {data.mode === 'segformer' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                SegFormer B0
              </span>
            )}
            {data.mode === 'index-only' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                Index Only
              </span>
            )}
            {data.mode === 'unavailable' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-300">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                Unavailable
              </span>
            )}
          </div>
        )}
      </div>

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="space-y-4 animate-pulse">
          <div className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg border border-slate-100">
            <div className="w-18 h-18 rounded-full bg-slate-200 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-slate-200 rounded w-1/3" />
              <div className="h-3 bg-slate-200 rounded w-2/3" />
              <div className="h-3 bg-slate-200 rounded w-1/2" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="h-16 bg-slate-100 rounded border border-slate-200" />
            <div className="h-16 bg-slate-100 rounded border border-slate-200" />
            <div className="h-16 bg-slate-100 rounded border border-slate-200" />
          </div>
          <div className="h-20 bg-slate-50 rounded border border-slate-200" />
          <div className="flex items-center justify-center gap-2 text-xs text-slate-500 py-1">
            <Icon name="loader" size={14} className="text-emerald-600" />
            <span>Fetching Sentinel-2 COG tiles & running ecological inference...</span>
          </div>
        </div>
      )}

      {/* Empty / Unscanned State */}
      {!isLoading && !data && (
        <div className="py-6 px-4 text-center bg-slate-50/70 border border-dashed border-slate-300 rounded-lg space-y-3">
          <div className="w-10 h-10 mx-auto rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center">
            <Icon name="tree" size={20} />
          </div>
          <div className="space-y-1 max-w-sm mx-auto">
            <h4 className="text-xs font-semibold text-slate-900">
              Satellite Canopy & Tree Preservation Analysis
            </h4>
            <p className="text-[11px] text-slate-500 leading-normal">
              Analyze Sentinel-2 multispectral imagery (B02, B03, B04, B08, B11) for this plot to compute
              Green Cover Index, tree clusters, and environmental preservation requirements.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onScan()}
            disabled={!hasCoordinates}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded text-xs font-medium shadow-sm transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            <Icon name="eye" size={14} />
            <span>Scan Satellite Vision</span>
          </button>
        </div>
      )}

      {/* Unavailable Mode Card */}
      {!isLoading && data && data.mode === 'unavailable' && (
        <div className="space-y-3 bg-amber-50/60 border border-amber-200 rounded-lg p-3.5 text-xs text-amber-900">
          <div className="flex items-start gap-2.5">
            <Icon name="alert-triangle" size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1 min-w-0">
              <h4 className="font-semibold text-amber-950 text-xs">
                Satellite Imagery Temporarily Unavailable
              </h4>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                Cloud-free Sentinel-2 imagery could not be accessed within the latency budget. The core
                feasibility analysis remains unaffected and valid.
              </p>
              {data.warnings && data.warnings.length > 0 && (
                <ul className="list-disc list-inside text-[10px] text-amber-700 space-y-0.5 pt-1">
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
              className="inline-flex items-center gap-1 px-3 py-1 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded text-xs font-medium transition-colors"
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
          <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-3 sm:gap-4 items-center bg-slate-50/90 rounded-lg p-3 sm:p-4 border border-slate-200/80">
            {/* SVG Circular Progress Ring */}
            <div className="flex items-center justify-center gap-3">
              <div className="relative w-20 h-20 shrink-0">
                <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                  <circle
                    cx="40"
                    cy="40"
                    r={radius}
                    className="stroke-slate-200"
                    strokeWidth="6"
                    fill="transparent"
                  />
                  <circle
                    cx="40"
                    cy="40"
                    r={radius}
                    className="stroke-emerald-600 transition-all duration-700 ease-out"
                    strokeWidth="6"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    fill="transparent"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-sm font-bold text-slate-900 tabular-nums">
                    {data.green_cover_pct.toFixed(1)}%
                  </span>
                  <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-tighter">
                    Canopy
                  </span>
                </div>
              </div>
            </div>

            {/* 3 Metric Summary Tiles */}
            <div className="grid grid-cols-3 gap-2 min-w-0">
              <div className="p-2 bg-white rounded border border-slate-200 text-center min-w-0">
                <div className="flex items-center justify-center gap-1 text-[10px] font-medium text-emerald-800">
                  <Icon name="tree" size={11} className="text-emerald-600 shrink-0" />
                  <span className="whitespace-normal break-words leading-tight">Green Cover</span>
                </div>
                <div className="text-sm font-bold text-slate-900 tabular-nums mt-0.5">
                  {data.green_cover_pct.toFixed(1)}%
                </div>
              </div>

              <div className="p-2 bg-white rounded border border-slate-200 text-center min-w-0">
                <div className="flex items-center justify-center gap-1 text-[10px] font-medium text-sky-800">
                  <Icon name="droplet" size={11} className="text-sky-600 shrink-0" />
                  <span className="whitespace-normal break-words leading-tight">Water Cover</span>
                </div>
                <div className="text-sm font-bold text-slate-900 tabular-nums mt-0.5">
                  {data.water_cover_pct.toFixed(1)}%
                </div>
              </div>

              <div className="p-2 bg-white rounded border border-slate-200 text-center min-w-0">
                <div className="flex items-center justify-center gap-1 text-[10px] font-medium text-slate-600">
                  <Icon name="layout-grid" size={11} className="text-slate-500 shrink-0" />
                  <span className="whitespace-normal break-words leading-tight">Built-up</span>
                </div>
                <div className="text-sm font-bold text-slate-900 tabular-nums mt-0.5">
                  {data.built_up_pct.toFixed(1)}%
                </div>
              </div>
            </div>
          </div>

          {/* Tree Preservation Plan List */}
          <div className="space-y-2 min-w-0">
            <div className="flex items-center justify-between text-xs min-w-0">
              <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                <Icon name="tree" size={13} className="text-emerald-700 shrink-0" />
                <span>Tree Preservation Plan</span>
                <span className="text-[10px] font-normal text-slate-500">
                  ({data.preservation_plan.length} cluster{data.preservation_plan.length !== 1 ? 's' : ''})
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">240m x 240m Window</span>
            </div>

            {data.preservation_plan.length === 0 ? (
              <div className="p-3 bg-slate-50 rounded border border-slate-200 text-center text-xs text-slate-500">
                No significant tree clusters (&ge; 25 m²) detected on the surveyed plot.
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1 scrollbar-thin">
                {data.preservation_plan.map((item) => {
                  const badge = getRankBadge(item.rank);
                  return (
                    <div
                      key={item.cluster_id}
                      className={`p-2.5 bg-slate-50/70 rounded border border-slate-200 ${badge.borderClass} space-y-1.5 text-xs transition-colors hover:bg-slate-50 min-w-0`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-semibold text-slate-900 font-mono text-[11px]">
                            {item.cluster_id}
                          </span>
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${badge.badgeClass}`}
                          >
                            {badge.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-mono text-slate-600 shrink-0">
                          <span>
                            Area: <b className="text-slate-900">{item.area_sqm} m²</b>
                          </span>
                          <span>
                            NDVI: <b className="text-slate-900">{item.mean_ndvi.toFixed(2)}</b>
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 text-[10px]">
                        {item.overlap_footprint ? (
                          <span className="inline-flex items-center gap-1 text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded font-medium">
                            <Icon name="alert-triangle" size={10} className="shrink-0" />
                            Overlaps proposed building footprint
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded font-medium">
                            <Icon name="check-circle" size={10} className="shrink-0" />
                            Clear of building footprint
                          </span>
                        )}
                      </div>

                      <p className="text-[11px] text-slate-600 leading-normal break-words">
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
            <div className="p-2.5 bg-sky-50/70 border border-sky-200 rounded text-xs space-y-1">
              <div className="flex items-center gap-1.5 text-sky-900 font-semibold">
                <Icon name="droplet" size={13} className="text-sky-600 shrink-0" />
                <span>Surface Water Detected on Site</span>
              </div>
              <p className="text-[11px] text-sky-800 leading-normal">
                {data.water_bodies.features.length} water feature
                {data.water_bodies.features.length !== 1 ? 's' : ''} detected covering{' '}
                <b>{data.water_cover_pct.toFixed(1)}%</b> of the site. Maintain statutory drainage
                easement buffers (e.g. 30m lake buffer or 15m primary rajakaluve buffer per NGT norms).
              </p>
            </div>
          )}

          {/* Provenance & Citation Line */}
          <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 text-[10px] text-slate-400">
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
                className="text-slate-500 hover:text-slate-800 underline transition-colors"
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
