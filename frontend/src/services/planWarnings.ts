import type { FloorPlanResponse } from './types';

/**
 * PAGE-1 PLAN WARNINGS — one list for print, the sheet and the PDF.
 *
 * The proportion and programme evidence belongs on page 1. The in-app Print
 * Report used to read the analysis warnings only, while the
 * PDF read the plan object, so the two banners could disagree.  This module is
 * the single filter both surfaces use; the backend mirror lives in
 * `report_service.page1_plan_warnings`.
 */
export const PAGE1_PLAN_WARNING_PATTERN =
  /^(PROP-|PROGRAMME-|PLINTH:|ROOM-MIN|ROOM-MAX|ROOM-OVERLAP|SELECTION-FALLBACK|GATE-FAIL|PLATE-SHORT)/;

/**
 * Warnings loud enough to switch the banner to the red FAIL treatment.  A
 * listed proportion relaxation (`PROP-ASPECT`) is disclosed but not a FAIL by
 * itself; the squeezed-room and conflict lines are.
 */
export const CRITICAL_PLAN_WARNING_PATTERN =
  /^(GATE-FAIL|PROGRAMME-DEFICIT|PROGRAMME-SQUEEZE|PLATE-SHORT|PROP-HARD|PROP-PLATE-CAP|PROPORTION-FAIL|ROOM-MIN|ROOM-MAX|ROOM-OVERLAP|SELECTION-FALLBACK)\b/;

export function page1PlanWarnings(
  warnings?: readonly (string | null | undefined)[] | null,
): string[] {
  return (warnings ?? [])
    .map((w) => String(w ?? '').trim())
    .filter((w) => w.length > 0 && PAGE1_PLAN_WARNING_PATTERN.test(w));
}

export function isCriticalPlanWarning(w: string): boolean {
  return CRITICAL_PLAN_WARNING_PATTERN.test(String(w ?? ''));
}

/** The banner payload: analysis warnings first, then the same plan list the PDF prints. */
export function bannerWarnings<T extends { warnings?: string[] } | null | undefined>(
  analysis: T,
  plan: FloorPlanResponse | null | undefined,
): string[] {
  const base = (analysis?.warnings ?? []).map((w) => String(w));
  const merged = [...base];
  for (const w of page1PlanWarnings(plan?.warnings)) {
    if (!merged.includes(w)) merged.push(w);
  }
  return merged;
}
