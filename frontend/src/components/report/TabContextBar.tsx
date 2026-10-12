import React from 'react';
import type { AnalysisResponse, SiteVisionResponse } from '../../services/types';
import { deriveFactorProvenance } from './statusTaxonomy';

type TabId = 'overview' | 'hazards' | 'ecology' | 'cost_plan';

interface TabContextBarProps {
  tab: TabId;
  data: AnalysisResponse;
  siteVision: SiteVisionResponse | null;
  /** Specification grade actually used for this analysis (lives on the request,
   *  not the response). Omitted from the copy when unknown — never guessed. */
  qualityGrade?: string;
}

/**
 * One-line, data-driven contextual sub-header rendered under the tab bar.
 * Every clause is derived from the shared AnalysisResponse — nothing is
 * hardcoded, and a degraded/absent section reads as an explicit "not assessed"
 * rather than a blank strip.
 */
export const TabContextBar: React.FC<TabContextBarProps> = ({ tab, data, siteVision, qualityGrade }) => {
  const factors = data.factors ?? [];
  const totalFactors = factors.length;
  const assumed = factors.filter((f) => deriveFactorProvenance(f) === 'ASSUMED').length;
  const unmeasured = factors.filter((f) => deriveFactorProvenance(f) === 'UNKNOWN').length;
  const warningCount = data.warnings?.length ?? 0;

  let text = '';
  let tone: 'muted' | 'warn' = 'muted';

  if (tab === 'overview') {
    if (totalFactors === 0) {
      text = 'No scored factors returned · review provenance';
      tone = 'warn';
    } else if (assumed > 0) {
      text = `${assumed} of ${totalFactors} factors assumed · review provenance`;
      tone = 'warn';
    } else if (unmeasured > 0) {
      text = `${unmeasured} of ${totalFactors} factors unmeasured · review provenance`;
      tone = 'warn';
    } else {
      text = `${totalFactors} factors measured · review provenance`;
    }
  } else if (tab === 'hazards') {
    const seismic = data.hazard_profile?.seismic;
    if (!seismic) {
      text = 'Hazards not assessed · no hazard profile returned';
      tone = 'warn';
    } else if (!seismic.zone) {
      text = 'Seismic not assessed · site is outside the IS 1893:2016 mapping extent';
      tone = 'warn';
    } else {
      // The payload's zone value already reads "Zone II"; never render "Zone Zone II".
      const zone = seismic.zone.replace(/^zone\s+/i, '');
      text = `Seismic Zone ${zone} · ${seismic.confidence} confidence`;
    }
  } else if (tab === 'ecology') {
    if (!siteVision || siteVision.mode === 'unavailable') {
      text = 'Site vision unavailable · no satellite canopy read';
      tone = 'warn';
    } else {
      const clusters = siteVision.tree_clusters?.features?.length ?? 0;
      const rating = data.orientation?.cross_ventilation_rating;
      text = `${clusters} canopy cluster${clusters === 1 ? '' : 's'} detected${
        rating ? ` · ${rating} orientation` : ''
      }`;
    }
  } else {
    const cost = data.cost_estimate;
    const grade = qualityGrade?.trim();
    // No margin_pct exists on the payload; the published range half-width as a
    // share of the point estimate is the honest equivalent.
    const margin =
      cost && cost.total_estimated_cost_inr > 0 && cost.cost_range_max_inr > cost.cost_range_min_inr
        ? Math.round(((cost.cost_range_max_inr - cost.cost_range_min_inr) / 2 / cost.total_estimated_cost_inr) * 100)
        : null;
    text = `Estimate${grade ? ` at ${grade} grade` : ''}${margin !== null ? ` · ±${margin}% published range` : ''}`;
    if (!cost) {
      text = 'Cost estimate unavailable · review the breakdown';
      tone = 'warn';
    }
  }

  if (warningCount > 0 && tab !== 'hazards') {
    text += ` · ${warningCount} degradation notice${warningCount === 1 ? '' : 's'}`;
    tone = 'warn';
  }

  return (
    <p
      data-testid={`tab-context-${tab}`}
      data-tone={tone}
      className={`text-[12px] leading-snug text-left truncate ${
        tone === 'warn' ? 'text-[var(--semantic-amber-ink)]' : 'text-[var(--text-3)]'
      }`}
    >
      {text}
    </p>
  );
};
