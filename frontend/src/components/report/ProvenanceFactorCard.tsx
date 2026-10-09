import React from 'react';
import type { DataSourceProvenance, FactorScore } from '../../services/types';
import { Icon, type IconName } from '../Icon';
import { StatusBadge } from './StatusBadge';
import { MethodologyPopover, type MethodologyPayload } from './MethodologyPopover';
import { deriveFactorProvenance } from './statusTaxonomy';

interface ProvenanceFactorCardProps {
  factor: FactorScore;
  /** Order key of this factor among rendered cards. */
  rank?: number;
  /** Server-verified per-source fetch provenance (real timestamps). */
  dataSources?: Record<string, DataSourceProvenance>;
}

function getFactorIcon(id: string): IconName {
  switch (id) {
    case 'slope': return 'mountain';
    case 'flood_risk': return 'droplet';
    case 'road_access': return 'truck';
    case 'environmental_comfort': return 'sun';
    case 'facility_proximity': return 'layers';
    default: return 'info';
  }
}

/** Plain-language scoring basis + actually consulted data source per factor. */
const METHODOLOGY: Record<string, { formula: string; source: string }> = {
  slope: {
    formula: 'Piecewise bands: 100 at ≤2%, −5 per % up to 6%, then steeper decrements to a 20 floor below 18%.',
    source: 'Open-Elevation / Open-Meteo digital elevation model (channel elevation samples)',
  },
  flood_risk: {
    formula: 'Elevation head vs. annual precipitation bands; conservative fusion with river-discharge flood pressure (worse of the two governs).',
    source: 'Open-Meteo GloFAS river discharge + ECMWF ERA5 hydrology; NDMA flood atlas',
  },
  road_access: {
    formula: 'Distance bands scored 90/80/70/55 from the Overpass nearest-road distance; critical below 500 m road frontage.',
    source: 'OpenStreetMap Overpass API (nearest highway geometry)',
  },
  environmental_comfort: {
    formula: 'Diurnal temperature range, wind exposure and rainfall comfort bands from the annual climate profile.',
    source: 'ECMWF ERA5 observed 365-day archive',
  },
  facility_proximity: {
    formula: 'Modelled locality band score (not a measured survey).',
    source: 'Deterministic locality model based on land-use statistics',
  },
};

/** Which upstream data_sources entry feeds each factor. */
const FACTOR_SOURCE_KEY: Record<string, string> = {
  slope: 'elevation',
  flood_risk: 'flood',
  road_access: 'road',
  environmental_comfort: 'climate',
};

export const ProvenanceFactorCard: React.FC<ProvenanceFactorCardProps> = ({ factor, rank, dataSources }) => {
  const status = deriveFactorProvenance(factor);
  const isUnknown = status === 'UNKNOWN';
  const isAssumed = status === 'ASSUMED';

  // Contribution = weight × score, expressed in score-percent points (0-100).
  const contribution = factor.weight * factor.score;
  const barColor = isUnknown
    ? 'var(--text-3)'
    : factor.score >= 75
    ? 'var(--semantic-green)'
    : factor.score >= 50
    ? 'var(--semantic-amber)'
    : 'var(--semantic-red)';

  const methodology = METHODOLOGY[factor.factor_id] ?? {
    formula: 'Weighted multi-criteria band scoring from measured site inputs.',
    source: 'Deterministic suitability engine (server-side)',
  };
  // Real server fetch timestamp for this factor's upstream (null when the
  // source degraded to its disclosed fallback model).
  const sourceKey = FACTOR_SOURCE_KEY[factor.factor_id];
  const provenance = sourceKey ? dataSources?.[sourceKey] : undefined;
  const payload: MethodologyPayload = {
    formula: methodology.formula,
    dataSource: provenance?.source ?? methodology.source,
    fetchedAt: provenance?.fetched_at ?? null,
    status,
    fallbackNote: provenance?.is_fallback
      ? `${sourceKey === 'road' ? 'Road network telemetry was unavailable' : 'The upstream service was unreachable'} during this analysis; the value shown is the disclosed deterministic fallback, not a live reading.`
      : undefined,
  };

  const barColorAssumed = isAssumed ? 'opacity-70' : '';

  return (
    <div
      data-testid={`factor-card-${factor.factor_id}`}
      className="flex flex-col gap-1.5 py-3 min-w-0 first:pt-1 last:pb-1"
    >
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <Icon name={getFactorIcon(factor.factor_id)} size={14} className="text-[var(--text-2)] shrink-0" />
          {rank !== undefined && (
            <span className="text-[10px] font-semibold text-[var(--text-3)] tabular-nums order-first">
              {rank}
            </span>
          )}
          <span className="text-[13px] font-semibold text-[var(--text-1)] truncate">
            {factor.name}
          </span>
          <span className="text-[11px] text-[var(--text-3)] tabular-nums shrink-0">
            w&nbsp;{Math.round(factor.weight * 100)}%
          </span>
          <StatusBadge status={status} />
          <MethodologyPopover factorName={factor.name} payload={payload} />
        </div>
        <div className="flex items-center gap-2 text-right shrink-0">
          <span className="text-[11px] text-[var(--text-3)] tabular-nums">
            contrib&nbsp;{contribution.toFixed(1)}
          </span>
          <span className={`text-[13px] font-semibold tabular-nums ${isUnknown ? 'text-[var(--text-3)]' : 'text-[var(--text-1)]'}`}>
            {factor.score.toFixed(0)}
          </span>
        </div>
      </div>

      {/* Contribution bar: width = weight × score (capped at 25 pts on this scale). */}
      <div className="w-full bg-[var(--fill)] rounded-full h-1.5 overflow-hidden">
        <div
          className={`h-full rounded-full ${barColorAssumed}`}
          style={{ width: `${Math.min(100, contribution / 2.5)}%`, backgroundColor: barColor }}
        />
      </div>

      <p className="text-[12px] text-[var(--text-2)] leading-normal">{factor.details}</p>
    </div>
  );
};
