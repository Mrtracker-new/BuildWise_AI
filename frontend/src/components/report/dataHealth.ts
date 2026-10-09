import type { AnalysisResponse } from '../../services/types';

export interface DataHealthCounts {
  verified: number;
  calculated: number;
  assumed: number;
  unknown: number;
}

/**
 * Derives the report-wide provenance census from the SAME AnalysisResponse
 * object the PDF dossier consumes — the two surfaces can never diverge.
 *
 * Taxonomy (mirrors the drawing-sheet annotation taxonomy):
 * - VERIFIED:  value measured from live external telemetry (factor has a real
 *              raw value; hazard profile carries high confidence).
 * - CALCULATED: deterministic engine output derived on the server (scores,
 *              costs, orientation, valuation from a matched table).
 * - ASSUMED:   synthetic fallback / modelled baseline in effect — every
 *              disclosed warning plus low-confidence hazard profiles.
 * - UNKNOWN:   telemetry unreachable; honest neutral placeholder used.
 */
export function computeDataHealth(data: AnalysisResponse): DataHealthCounts {
  let verified = 0;
  let calculated = 0;
  let assumed = 0;
  let unknown = 0;

  for (const f of data.factors ?? []) {
    if (f.status === 'unknown' || f.raw_value === null || f.raw_value === undefined) {
      unknown += 1;
    } else {
      verified += 1;
    }
  }

  const hazard = data.hazard_profile;
  if (hazard) {
    for (const conf of [
      hazard.seismic?.confidence,
      hazard.flood?.confidence,
      hazard.storm_cyclone?.confidence,
    ]) {
      if (conf === 'high') verified += 1;
      else if (conf === 'low') assumed += 1;
      else if (conf === 'moderate') calculated += 1;
    }
  }

  // Deterministic server-side outputs
  calculated += 1; // overall suitability score
  if (data.cost_estimate) calculated += 1;
  if (data.orientation) calculated += 1;
  if (data.vastu_advisory) calculated += 1;
  if (data.land_value) {
    if (data.land_value.indicative_rate_per_sqft != null) calculated += 1;
    else unknown += 1;
    if (data.land_value.confidence_warning) assumed += 1;
  }

  // Each disclosed degradation notice = one assumption applied to the report
  assumed += data.warnings?.length ?? 0;

  return { verified, calculated, assumed, unknown };
}
