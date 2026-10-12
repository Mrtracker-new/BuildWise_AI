import React, { useState } from 'react';
import type { AnalysisResponse } from '../../services/types';
import { Icon, type IconName } from '../Icon';
import { CopyValueButton } from './CopyValueButton';
import { useDesign } from '../../design/primitives';
import { DataHealthStrip } from './DataHealthStrip';
import { BIOCLIMATIC_AXIS_DISCLOSURE, FAR_DISCLOSURE } from './termDisclosures';
import { AnimatedNumber } from './AnimatedNumber';
import { useUnits } from './units';

interface ReportHeroHeaderProps {
  data: AnalysisResponse;
  /**
   * 'full'    — the report hero: 96px gauge, 40px score, 4 headline tiles and
   *             the DATA HEALTH provenance strip.
   * 'compact' — the sidebar hero: 84px gauge, address/coordinate chips, the
   *             topographic + bioclimatic tiles. Same data derivations as the
   *             full variant, so the two surfaces can never disagree.
   */
  variant?: 'full' | 'compact';
  /** Compact sidebar only: makes the hero row open the full report. */
  onClickHero?: () => void;
}

/**
 * Report hero summary: score ring + verdict, reference/address/coordinate
 * chips, the headline stat tiles, and the DATA HEALTH provenance strip.
 * All values derive from the shared AnalysisResponse — the PDF dossier reads
 * the same object, so the two surfaces cannot diverge.
 */
export const ReportHeroHeader: React.FC<ReportHeroHeaderProps> = ({
  data,
  variant = 'full',
  onClickHero,
}) => {
  const { pushToast } = useDesign();
  const [copiedRef, setCopiedRef] = useState(false);
  const isCompact = variant === 'compact';
  const score = data.overall_suitability_score;
  const verdict = data.suitability_verdict;

  // The ring, badge icon and status dot paint with the bright hue; anything
  // that is TEXT (the verdict pill) uses the -ink hue, because the bright green
  // measured 2.01:1 as 13px text on its own 12% tint.
  let gaugeColor = 'var(--semantic-green)';
  let gaugeInk = 'var(--semantic-green-ink)';
  let badgeIcon: IconName = 'shield-check';
  if (score < 50.0) {
    gaugeColor = 'var(--semantic-red)';
    gaugeInk = 'var(--semantic-red-ink)';
    badgeIcon = 'shield-alert';
  } else if (score < 70.0) {
    gaugeColor = 'var(--semantic-amber)';
    gaugeInk = 'var(--semantic-amber-ink)';
    badgeIcon = 'alert-triangle';
  }

  const verdictBg =
    gaugeColor === 'var(--semantic-green)'
      ? 'rgba(52, 199, 89, 0.12)'
      : gaugeColor === 'var(--semantic-amber)'
      ? 'rgba(255, 159, 10, 0.12)'
      : 'rgba(255, 59, 48, 0.12)';

  // SVG ring gauge (static geometry; the global reduced-motion rule freezes
  // any transition). Compact sidebar uses a smaller ring than the report.
  const gaugeSize = isCompact ? 84 : 96;
  const center = gaugeSize / 2;
  const radius = isCompact ? 36 : 40;
  const strokeWidth = isCompact ? 6 : 7;
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

  const tiles: { label: string; value: string; sub: string; info?: React.ReactNode }[] = [
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
      info: FAR_DISCLOSURE,
    },
    {
      label: 'Civil cost estimate',
      value: cost ? formatInr(cost.total_estimated_cost_inr) : '—',
      sub: cost ? `range ${formatInr(cost.cost_range_min_inr)} – ${formatInr(cost.cost_range_max_inr)}` : '',
    },
  ];

  // Compact sidebar tiles: topographic + bioclimatic (single source = factors/orientation).
  const slopeFactor = data.factors.find((f) => f.factor_id === 'slope');
  const slopeScore = slopeFactor?.score ?? 0;
  const slopeGrad = slopeFactor?.raw_value ?? 0;

  const heroRow = (
    <div
      className={`flex items-center gap-4 min-w-0 ${
        onClickHero
          ? 'cursor-pointer group hover:bg-[var(--fill)]/50 transition-colors rounded-[10px] p-1 -m-1'
          : ''
      }`}
      onClick={onClickHero}
      role={onClickHero ? 'button' : undefined}
      tabIndex={onClickHero ? 0 : undefined}
      onKeyDown={
        onClickHero
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClickHero();
              }
            }
          : undefined
      }
      title={onClickHero ? 'Click to open full report' : undefined}
    >
      <div className="relative shrink-0 flex items-center justify-center" style={{ width: gaugeSize, height: gaugeSize }}>
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
          <Icon name={badgeIcon} size={isCompact ? 22 : 24} />
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5 leading-none">
          <span className="text-[40px] font-bold text-[var(--text-1)] leading-none tabular-nums tracking-tight">
            <AnimatedNumber value={score} format={(n) => n.toFixed(1)} durationMs={750} testId="hero-score-value" />
          </span>
          <span className="text-[15px] font-normal text-[var(--text-3)]">/100</span>
        </div>
        <div className="mt-1.5">
          <span
            className="inline-flex items-center gap-1.5 font-semibold text-[13px] px-3 py-0.5 rounded-full"
            style={{ backgroundColor: verdictBg, color: gaugeInk }}
          >
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: gaugeColor }} />
            <span>{verdict}</span>
          </span>
        </div>
      </div>
    </div>
  );

  const identityChips = (
    <div
      className={
        isCompact
          ? 'w-full min-w-0 space-y-1.5'
          : 'flex-1 min-w-0 space-y-1.5 md:border-l md:border-[var(--hairline)] md:pl-5'
      }
    >
      <p
        className={`text-[13px] font-semibold text-[var(--text-1)] leading-snug break-words ${
          isCompact ? 'line-clamp-2' : 'line-clamp-1'
        }`}
        title={data.formatted_address}
      >
        {data.formatted_address}
      </p>
      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] bg-[var(--fill)] font-mono text-[11px] text-[var(--text-2)] tabular-nums whitespace-nowrap max-w-full"
          title="WGS84 site coordinates"
        >
          {data.coordinates.latitude.toFixed(5)}, {data.coordinates.longitude.toFixed(5)}
        </span>
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-[4px] bg-[var(--fill)] text-[var(--text-3)] tracking-wide shrink-0">
          WGS84
        </span>
        <button
          type="button"
          onClick={handleCopyRef}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] bg-[var(--fill)] hover:bg-[var(--fill-hover)] font-mono text-[11px] text-[var(--text-2)] hover:text-[var(--text-1)] transition-colors cursor-pointer select-none whitespace-nowrap max-w-full"
          title="Copy analysis reference ID"
        >
          <Icon
            name={copiedRef ? 'check' : 'copy'}
            size={11}
            className={copiedRef ? 'text-[var(--semantic-green-ink)]' : 'text-[var(--text-3)]'}
          />
          <span>{copiedRef ? 'Copied' : `Ref ${data.request_id.slice(0, 8)}`}</span>
        </button>
      </div>
    </div>
  );

  return (
    <section
      aria-label="Report summary"
      className="bw-card rounded-[16px] border border-[var(--hairline)] bg-[var(--card-bg-subtle)] p-4 sm:p-[18px] w-full min-w-0 space-y-4"
    >
      {/* Row 1: gauge + score/verdict + identity chips.
          The compact hero lives in the 360px sidebar. A viewport breakpoint
          here laid the identity column out as a ROW inside that panel, so the
          chip block was squeezed to its min-content width (measured 16px) and
          the coordinate/ref chips escaped the card by up to 58px while the
          address collapsed to a 22px "A.." sliver. Compact therefore always
          stacks; only the full-width report hero goes side-by-side. */}
      <div
        className={
          isCompact
            ? 'flex flex-col gap-3'
            : 'flex flex-col md:flex-row md:items-center gap-4 md:gap-5'
        }
      >
        <div className={isCompact ? 'min-w-0' : 'flex items-center gap-4 min-w-0 shrink-0'}>
          {heroRow}
        </div>
        {identityChips}
      </div>

      {isCompact ? (
        /* Compact sidebar: topographic + bioclimatic readings (same
           derivations). Rendered as full-width reading rows rather than two
           141px tiles: at that width the tile labels wrapped to two lines and
           the axis label (which needs 184px) was cut to "East-West (1.4 d…".
           A row gives the label and the secondary line the full card width. */
        <div className="space-y-2">
          <div className="bg-[var(--fill)] px-3.5 py-2.5 rounded-[12px] min-w-0">
            <div className="flex items-baseline justify-between gap-3 min-w-0">
              <span className="text-[12px] font-normal text-[var(--text-3)] min-w-0 truncate">
                Topographic aspect
              </span>
              <span className="text-[18px] font-semibold text-[var(--text-1)] tabular-nums leading-tight shrink-0">
                {slopeScore.toFixed(0)}/100
              </span>
            </div>
            <span className="text-[11.5px] text-[var(--text-2)] block leading-snug mt-0.5">
              {slopeGrad.toFixed(1)}% gradient
            </span>
          </div>
          <div className="bg-[var(--fill)] px-3.5 py-2.5 rounded-[12px] min-w-0">
            <div className="flex items-baseline justify-between gap-3 min-w-0">
              <span className="inline-flex items-center gap-1 text-[12px] font-normal text-[var(--text-3)] min-w-0">
                <span className="truncate">Bioclimatic axis</span>
                {BIOCLIMATIC_AXIS_DISCLOSURE}
              </span>
              <span className="text-[18px] font-semibold text-[var(--text-1)] tabular-nums leading-tight shrink-0">
                {data.orientation.optimal_axis_degrees.toFixed(0)}°
              </span>
            </div>
            <span className="text-[11.5px] text-[var(--text-2)] block leading-snug mt-0.5">
              {data.orientation.axis_label}
            </span>
          </div>
        </div>
      ) : (
        <>
          {/* Row 2: headline stat tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            {tiles.map((tile) => (
              <div key={tile.label} className="bg-[var(--fill)] rounded-[12px] px-3.5 py-3 min-w-0">
                <span className="flex items-center justify-between gap-1 text-[11px] font-medium text-[var(--text-3)] block mb-1">
                  <span className="inline-flex items-center gap-1 min-w-0">
                    <span className="truncate">{tile.label}</span>
                    {tile.info}
                  </span>
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
        </>
      )}
    </section>
  );
};
