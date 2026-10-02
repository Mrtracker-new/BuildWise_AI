/**
 * boundaryIO.ts — shared boundary import/export.
 * =======================================================
 * Every import path (GeoJSON, KML) funnels through parseBoundaryText and
 * produces the same canonical vertex model: [{x, y}] in local tangent-plane
 * meters. Canonical CCW ordering and statutory validation happen downstream
 * in siteBoundary.ts / backend site_geometry.py — this module only parses.
 */
import { projectToLocal, unprojectToLngLat, type LocalOrigin } from './projection';

export type Vertex = { x: number; y: number };

export interface ParsedBoundary {
  vertices: Vertex[];
  /** KML Placemark name or GeoJSON properties.name, when present. */
  name?: string;
}

/** Parse a pasted/uploaded boundary file (GeoJSON or KML) into local vertices. */
export function parseBoundaryText(text: string, origin: LocalOrigin): ParsedBoundary {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Empty boundary file.');
  if (trimmed.startsWith('{')) return parseGeoJson(trimmed, origin);
  if (trimmed.startsWith('<')) return parseKml(trimmed, origin);
  throw new Error('Unsupported boundary format. Paste GeoJSON or KML.');
}

/* ---------------- GeoJSON ---------------- */

function parseGeoJson(json: string, origin: LocalOrigin): ParsedBoundary {
  let doc: any;
  try {
    doc = JSON.parse(json);
  } catch {
    throw new Error('Invalid GeoJSON: not parseable JSON.');
  }

  const candidates: any[] = [];
  const pushRing = (coords: any): void => {
    if (Array.isArray(coords) && coords.length >= 3) candidates.push(coords);
  };

  if (doc.type === 'FeatureCollection' && Array.isArray(doc.features)) {
    for (const f of doc.features) {
      const geom = f?.geometry;
      if (!geom) continue;
      if (geom.type === 'Polygon') pushRing(geom.coordinates?.[0]);
      else if (geom.type === 'MultiPolygon') {
        for (const part of geom.coordinates ?? []) pushRing(part?.[0]);
      } else if (geom.type === 'LineString' && Array.isArray(geom.coordinates)) {
        pushRing(geom.coordinates);
      }
    }
  } else if (doc.type === 'Feature' && doc.geometry) {
    if (doc.geometry.type === 'Polygon') pushRing(doc.geometry.coordinates?.[0]);
    else if (doc.geometry.type === 'MultiPolygon') {
      for (const part of doc.geometry.coordinates ?? []) pushRing(part?.[0]);
    }
  } else if (doc.type === 'Polygon') {
    pushRing(doc.coordinates?.[0]);
  } else if (doc.type === 'MultiPolygon') {
    for (const part of doc.coordinates ?? []) pushRing(part?.[0]);
  }

  if (candidates.length === 0) {
    throw new Error('No Polygon geometry found in GeoJSON.');
  }
  const largest = candidates.reduce((a, b) => (ringArea(a, origin) >= ringArea(b, origin) ? a : b));
  const name =
    doc.properties?.name ??
    (doc.type === 'Feature' ? doc.properties?.name : undefined) ??
    doc.features?.find((f: any) => f?.properties?.name)?.properties?.name;

  return { vertices: ringToLocal(largest, origin), name };
}

/* ---------------- KML ---------------- */

function parseKml(xml: string, origin: LocalOrigin): ParsedBoundary {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) {
    throw new Error('Invalid KML: XML parse error.');
  }
  const placemarks = Array.from(doc.getElementsByTagName('Placemark'));

  // Candidate outer rings, largest-area wins (Polygon > LinearRing fallback).
  let best: { ring: [number, number][]; area: number; name?: string } | null = null;

  for (const poly of Array.from(doc.getElementsByTagName('Polygon'))) {
    const outer = poly.getElementsByTagName('outerBoundaryIs')[0];
    if (!outer) continue;
    const coordsEl = outer.getElementsByTagName('coordinates')[0];
    if (!coordsEl?.textContent) continue;
    const ring = parseKmlCoordinates(coordsEl.textContent);
    if (ring.length < 3) continue;
    const area = Math.abs(kmlShoelace(ring));
    if (!best || area > best.area) {
      best = { ring, area, name: placemarkNameFor(poly, placemarks) };
    }
  }

  if (!best) {
    for (const ringEl of Array.from(doc.getElementsByTagName('LinearRing'))) {
      const coordsEl = ringEl.getElementsByTagName('coordinates')[0];
      if (!coordsEl?.textContent) continue;
      const ring = parseKmlCoordinates(coordsEl.textContent);
      if (ring.length < 3) continue;
      const area = Math.abs(kmlShoelace(ring));
      if (!best || area > best.area) {
        best = { ring, area, name: placemarkNameFor(ringEl, placemarks) };
      }
    }
  }

  if (!best) throw new Error('No polygon geometry found in KML.');
  return { vertices: ringToLocal(best.ring, origin), name: best.name };
}

/* ---------------- helpers ---------------- */

function parseKmlCoordinates(text: string): [number, number][] {
  const points: [number, number][] = [];
  for (const token of text.trim().split(/\s+/)) {
    const [lonS, latS] = token.split(',');
    const lon = Number(lonS);
    const lat = Number(latS);
    if (Number.isFinite(lon) && Number.isFinite(lat)) points.push([lon, lat]);
  }
  return points;
}

function kmlShoelace(ring: [number, number][]): number {
  // Planar shoelace on lon/lat degrees — comparison only, not an area claim.
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

function placemarkNameFor(el: Element, placemarks: Element[]): string | undefined {
  let cur: Element | null = el;
  while (cur) {
    if (placemarks.includes(cur)) {
      const nameEl = cur.getElementsByTagName('name')[0];
      return nameEl?.textContent?.trim() || undefined;
    }
    cur = cur.parentElement;
  }
  return undefined;
}

function ringArea(ring: any[], origin: LocalOrigin): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const pa = projectToLocal(Number(a[1]), Number(a[0]), origin);
    const pb = projectToLocal(Number(b[1]), Number(b[0]), origin);
    sum += pa.x * pb.y - pb.x * pa.y;
  }
  return Math.abs(sum / 2);
}

function ringToLocal(ring: any[], origin: LocalOrigin): Vertex[] {
  const pts = ring.map((c) => projectToLocal(Number(c[1]), Number(c[0]), origin));
  return dedupeAndUnclose(pts);
}

export function dedupeAndUnclose(pts: { x: number; y: number }[]): Vertex[] {
  const out: Vertex[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last.x - p.x) > 1e-4 || Math.abs(last.y - p.y) > 1e-4) out.push(p);
  }
  if (out.length > 1) {
    const first = out[0];
    const last = out[out.length - 1];
    if (Math.abs(first.x - last.x) <= 1e-4 && Math.abs(first.y - last.y) <= 1e-4) out.pop();
  }
  return out;
}

/* ---------------- export ---------------- */

/** Build a GeoJSON Feature of the boundary in WGS84 for export/download. */
export function verticesToGeoJson(
  vertices: Vertex[],
  origin: LocalOrigin,
  props: Record<string, unknown> = {}
): { type: 'Feature'; geometry: { type: 'Polygon'; coordinates: [number, number][][] }; properties: Record<string, unknown> } {
  const ring = [...vertices, vertices[0]].map((v) => {
    const ll = unprojectToLngLat(v, origin);
    return [round7(ll.lon), round7(ll.lat)] as [number, number];
  });
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [ring] },
    properties: { ...props },
  };
}

function round7(v: number): number {
  return Math.round(v * 1e7) / 1e7;
}
