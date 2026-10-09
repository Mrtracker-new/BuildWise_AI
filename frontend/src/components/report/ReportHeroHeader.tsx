import React, { useState } from 'react';
import type { AnalysisResponse } from '../../services/types';
import { Icon, type IconName } from '../Icon';
import { CopyValueButton } from './CopyValueButton';
import { useDesign } from '../../design/primitives';
import { DataHealthStrip } from './DataHealthStrip';
import { useUnits } from './units';

interface ReportHeroHeaderProps {
  data: AnalysisResponse;
}

/**
 * Report hero summary: score ring + verdict, reference/address/coordinate
 * chips, the four headline stat tiles, and the DATA HEALTH provenance strip.
 * All values derive from the shared AnalysisResponse — the PDF dossier reads
 * the same object, so the two surfaces cannot diverge.
 */
export const ReportHeroHeader: React.FC<ReportHeroHeaderProps> = ({ data }) => {
  const { pushToast } = useDesign();
  const [copiedRef, setCopiedRef] = useState(false);
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

  const verdictBg =
    gaugeColor === 'var(--semantic-green)'
      ? 'rgba(52, 199, 89, 0.12)'
      : gaugeColor === 'var(--semantic-amber)'
      ? 'rgba(255, 159, 10, 0.12)'
      : 'rgba(255, 59, 48, 0.12)';

  // 96px SVG ring gauge (static geometry; CSS transition only animates stroke
  // paint-on-load and is disabled globally under prefers-reduced-motion).
  const gaugeSize = 96;
  const center = 48;
  const radius = 40;
  const strokeWidth = 7;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  const handleCopyRef = () => {
    navigator.clipboard.writeText(data.request_id);
    setCopiedRef(true);
    pushToast({ message: 'Reference ID copied', tone: 'success' });
    setTimeout(() => setCopiedRef(false), 1500);
  };

  // Headline tiles — same derivation rules as the PDF hero band.
  const cost = data.cost_estimate;
  const baseRate = cost?.base_rate_per_sqft ?? 0;
  const builtUpAreaSqft =
    cost && baseRate > 0 ? cost.base_cost_inr / baseRate : 0;
  const plotAreaSqft = data.land_value?.plot_area_sqft ?? 0;
  const coveragePct = (data.land_value?.ground_coverage_ratio_applied ?? 0.6) * 100;
  const far =
    builtUpAreaSqft > 0 && plotAreaSqft > 0 ? builtUpAreaSqft / plotAreaSqft : null;

  const formatInr = (val: number) => {
    if (val >= 10000000) return `₹${(val / 10000000).toFixed(2)} Cr`;
    if (val >= 100000) return `₹${(val / 100000).toFixed(2)} L`;
    return `₹${val.toLocaleString('en-IN')}`;
  };

  // Plot area renders in the active unit preference (sq ft native; m² on toggle).
  const { area, formatArea } = useUnits();
  const plotAreaValue =
    plotAreaSqft > 0
      ? area === 'sqft'
        ? Math.round(plotAreaSqft).toLocaleString('en-IN')
        : formatArea(plotAreaSqft * 0.092903, { decimals: 1, withUnit: false })
      : '—';

  const tiles: { label: string; value: string; sub: string }[] = [
    {
      label: 'Plot area',
      value: plotAreaValue,
      sub: plotAreaSqft > 0 ? (area === 'sqft' ? 'sq ft (captured boundary)' : 'm² (captured boundary)') : 'boundary not captured',
    },
    {
      label: 'Ground coverage',
      value: plotAreaSqft > 0 ? `${coveragePct.toFixed(1)}%` : '—',
      sub: 'statutory ratio applied',
    },
    {
      label: 'FAR (implied)',
      value: far !== null ? far.toFixed(2) : '—',
      sub: 'built-up ÷ plot area',
    },
    {
      label: 'Civil cost estimate',
      value: cost ? formatInr(cost.total_estimated_cost_inr) : '—',
      sub: cost ? `range ${formatInr(cost.cost_range_min_inr)} – ${formatInr(cost.cost_range_max_inr)}` : '',
    },
  ];

  return (
    <section
      aria-label="Report summary"
      className="rounded-[16px] border border-[var(--hairline)] bg-[var(--card-bg-subtle)] p-4 sm:p-[18px] w-full min-w-0 space-y-4"
    >
      {/* Row 1: gauge + score/verdict + identity chips */}
      <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-5">
        <div className="flex items-center gap-4 min-w-0 shrink-0">
          <div className="relative shrink-0 flex items-center justify-center w-[96px] h-[96px] min-w-[96px]">
            <svg
              data-testid="score-gauge-svg"
              className="-rotate-90 block"
              style={{ width: gaugeSize, height: gaugeSize }}
              viewBox={`0 0 ${gaugeSize} ${gaugeSize}`}
              width={gaugeSize}
              height={gaugeSize}
              role="img"
              aria-label={`Suitability score ${score.toFixed(1)} out of 100, ${verdict}`}
            >
              <circle cx={center} cy={center} r={radius} stroke="var(--fill)" strokeWidth={strokeWidth} fill="none" />
              <circle
                cx={center}
                cy={center}
                r={radius}
                stroke={gaugeColor}
                strokeWidth={strokeWidth}
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                fill="none"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ color: gaugeColor }}>
              <Icon name={badgeIcon} size={24} />
            </div>
          </div>

          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5 leading-none">
              <span className="text-[40px] font-bold text-[var(--text-1)] leading-none tabular-nums tracking-tight">
                {score.toFixed(1)}
              </span>
              <span className="text-[15px] font-normal text-[var(--text-3)]">/100</span>
            </div>
            <div className="mt-1.5">
              <span
                className="inline-flex items-center gap-1.5 font-semibold text-[13px] px-3 py-0.5 rounded-full"
                style={{ backgroundColor: verdictBg, color: gaugeColor }}
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: gaugeColor }} />
                <span>{verdict}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Identity chips: address, coordinates, ref id (copy) */}
        <div className="flex-1 min-w-0 md:border-l md:border-[var(--hairline)] md:pl-5 space-y-1.5">
          <p
            className="text-[13px] font-semibold text-[var(--text-1)] leading-snug line-clamp-1 break-words"
            title={data.formatted_address}
          >
            {data.formatted_address}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] bg-[var(--fill)] font-mono text-[11px] text-[var(--text-2)] tabular-nums"
              title="WGS84 site coordinates"
            >
              {data.coordinates.latitude.toFixed(5)}, {data.coordinates.longitude.toFixed(5)}
            </span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-[4px] bg-[var(--fill)] text-[var(--text-3)] tracking-wide">
              WGS84
            </span>
            <button
              type="button"
              onClick={handleCopyRef}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] bg-[var(--fill)] hover:bg-[var(--fill-hover)] font-mono text-[11px] text-[var(--text-2)] hover:text-[var(--text-1)] transition-colors cursor-pointer select-none"
              title="Copy analysis reference ID"
            >
              <Icon
                name={copiedRef ? 'check' : 'copy'}
                size={11}
                className={copiedRef ? 'text-[var(--semantic-green)]' : 'text-[var(--text-3)]'}
              />
              <span>{copiedRef ? 'Copied' : `Ref ${data.request_id.slice(0, 8)}`}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Row 2: headline stat tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {tiles.map((tile) => (
          <div key={tile.label} className="bg-[var(--fill)] rounded-[12px] px-3.5 py-3 min-w-0">
            <span className="flex items-center justify-between gap-1 text-[11px] font-medium text-[var(--text-3)] block mb-1">
              <span className="truncate">{tile.label}</span>
              <CopyValueButton value={tile.value} label={tile.label} />
            </span>
            <span className="text-[20px] font-semibold text-[var(--text-1)] tabular-nums leading-tight block truncate">
              {tile.value}
            </span>
            <span className="text-[11px] text-[var(--text-3)] block truncate mt-0.5" title={tile.sub}>
              {tile.sub}
            </span>
          </div>
        ))}
      </div>

      {/* Row 3: provenance census */}
      <DataHealthStrip data={data} />
    </section>
  );
};
