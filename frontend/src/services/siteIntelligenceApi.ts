/**
 * siteIntelligenceApi.ts — fetchers for the site intelligence proxy
 * endpoints (/api/nearest-road, /api/site/preview). Kept separate from the
 * pure logic in siteIntelligence.ts (which the boundary-pipeline test harness
 * transpiles without import.meta support).
 */
import { API_BASE_URL } from './api';
import type { NearestRoadResponse, SitePreviewPayload, SitePreviewResponse } from './siteIntelligence';

/** Overpass nearest-road proxy (server cache + <=1 req/s upstream throttle). */
export async function fetchNearestRoad(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<NearestRoadResponse> {
  const url = `${API_BASE_URL}/api/nearest-road?lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}`;
  const resp = await fetch(url, { signal });
  if (!resp.ok) {
    const errData = await resp.json().catch(() => ({}));
    throw new Error(errData.detail || `Nearest-road request failed with status: ${resp.status}`);
  }
  return resp.json();
}

/**
 * Deterministic site geometry preview (no floor solve). The backend is
 * hash-cached; callers should still debounce ~400 ms while drawing.
 */
export async function fetchSitePreview(
  payload: SitePreviewPayload,
  signal?: AbortSignal,
): Promise<SitePreviewResponse> {
  const resp = await fetch(`${API_BASE_URL}/api/site/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  if (!resp.ok) {
    const errData = await resp.json().catch(() => ({}));
    throw new Error(errData.detail || `Site preview failed with status: ${resp.status}`);
  }
  return resp.json();
}
