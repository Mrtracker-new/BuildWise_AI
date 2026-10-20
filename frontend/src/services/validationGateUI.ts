/**
 * validationGateUI.ts — QA-panel presentation logic (pure, testable).
 * ==========================================================================
 * The Universal Validation Gate (L1-L15) must never be hidden in the UI:
 * every layer renders as a row, N/A rows carry their explicit reason, WARN
 * layers surface as chips, and a gate that arrives incomplete is itself
 * flagged instead of silently rendering fewer rows.
 *
 * Single source for the QA panel in FloorPlanGeneratorCard and any future
 * QA surface (PDF legend parity is pinned backend-side in test_validation_gate).
 */

export type GateLayerStatus = 'PASS' | 'WARN' | 'FAIL' | 'N/A';

export interface GateLayer {
  layer_id: string;
  title?: string;
  status: GateLayerStatus;
  summary?: string;
  reason?: string;
  findings?: string[];
  citation?: string;
}

export interface GateReport {
  layers?: GateLayer[];
  overall_status?: string;
  validated_layers?: string[];
}

/** Canonical gate order — a report missing any of these is incomplete. */
export const GATE_LAYER_IDS: string[] = Array.from({ length: 15 }, (_, i) => `L${i + 1}`);

/** Status chip classes shared by every QA surface (design-token adjacent). */
export const QA_CHIP_CLASSES: Record<string, string> = {
  PASS: 'bg-emerald-500/15 text-[var(--semantic-green-ink)]',
  WARN: 'bg-amber-500/15 text-[var(--semantic-amber-ink)]',
  FAIL: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  'N/A': 'bg-slate-500/15 text-slate-600 dark:text-slate-300',
};

/**
 * Groups the gate for panel rendering. N/A rows and WARN chips are returned
 * separately so the panel can never drop them; layers without any report
 * fall back to an honest PASS verdict only when there is truly nothing.
 */
export function groupGateLayers(gate: GateReport | null | undefined): {
  layers: GateLayer[];
  naRows: GateLayer[];
  warnChips: GateLayer[];
  failRows: GateLayer[];
  overall: string;
  incompleteIds: string[];
} {
  const layers = Array.isArray(gate?.layers) ? gate!.layers! : [];
  const naRows = layers.filter((l) => l.status === 'N/A');
  const warnChips = layers.filter((l) => l.status === 'WARN');
  const failRows = layers.filter((l) => l.status === 'FAIL');
  const overall =
    gate?.overall_status ??
    (failRows.length > 0 ? 'FAIL' : warnChips.length > 0 ? 'WARN' : 'PASS');
  return {
    layers,
    naRows,
    warnChips,
    failRows,
    overall,
    incompleteIds: missingGateLayerIds(layers),
  };
}

/** Layer ids absent from a report — non-empty means the gate itself is hidden/incomplete. */
export function missingGateLayerIds(layers: GateLayer[]): string[] {
  const present = new Set(layers.map((l) => l.layer_id));
  return GATE_LAYER_IDS.filter((id) => !present.has(id));
}

/**
 * Row text for a layer. N/A MUST surface its explicit reason (zero silent
 * skips contract); every other status shows its summary or title.
 */
export function qaRowText(ld: GateLayer): string {
  if (ld.status === 'N/A') {
    return `N/A: ${ld.reason || 'not applicable'}`;
  }
  return ld.summary || ld.title || ld.layer_id;
}
