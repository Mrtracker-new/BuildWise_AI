import type { AnalysisResponse, FactorScore } from '../../services/types';
import { factorProvenanceCensus, deriveFactorProvenance, type ProvenanceStatus } from './statusTaxonomy';

/**
 * Serializable honesty payload — the single wire format for contract checks
 * between the UI census, the factor badges and the PDF dossier narration.
 * The PDF adapter reads exactly these fields from the same AnalysisResponse.
 */
export interface HonestyPayload {
  warnings: string[];
  factors: { factor_id: string; status: ProvenanceStatus }[];
  counts: Record<ProvenanceStatus, number>;
  seismic_zone: string | null;
  seismic_assessed: boolean;
}

export function buildHonestyPayload(data: AnalysisResponse): HonestyPayload {
  const entries = factorProvenanceCensus((data.factors ?? []) as FactorScore[]);
  const counts: Record<ProvenanceStatus, number> = { VERIFIED: 0, CALCULATED: 0, ASSUMED: 0, UNKNOWN: 0 };
  for (const e of entries) counts[e.status] += 1;
  const zone = data.hazard_profile?.seismic?.zone ?? null;
  return {
    warnings: [...(data.warnings ?? [])],
    factors: entries.map((e) => ({ factor_id: e.factor_id, status: e.status })),
    counts,
    seismic_zone: zone,
    seismic_assessed: zone !== null,
  };
}

/** Convenience: status of one factor by id from the payload. */
export function factorStatus(payload: HonestyPayload, factorId: string): ProvenanceStatus | undefined {
  return payload.factors.find((f) => f.factor_id === factorId)?.status;
}

export { deriveFactorProvenance };
