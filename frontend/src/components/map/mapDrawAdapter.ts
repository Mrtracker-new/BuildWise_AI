/**
 * mapDrawAdapter.ts — lightweight MapLibre capture layer.
 * ==================================================================
 * Renders the in-progress boundary, live edge, guides and vertex markers, and
 * owns the visual layer of point-by-point capture. Hand-rolled (no new
 * dependency): the "one drawing plugin" role is served by this adapter — a
 * Leaflet-only plugin cannot attach to this MapLibre stack, and adding a
 * MapLibre-specific plugin is not justified when the interaction surface is a
 * single polygon ring. All rendering updates are batched through MapLibre
 * GeoJSON sources; the wizard throttles mousemove via requestAnimationFrame
 * (60fps drag contract).
 */
import type { Map as MlMap, GeoJSONSource } from 'maplibre-gl';
import type { Vertex } from '../../services/boundaryIO';
import type { GuideLine } from '../../services/captureGeometry';
import { MAP_CAPTURE, MAP_OVERLAY } from '../../design/tokens';

const BOUNDARY_SRC = 'bw-capture-boundary';
const LIVE_EDGE_SRC = 'bw-capture-live';
const GUIDES_SRC = 'bw-capture-guides';
const VERTICES_SRC = 'bw-capture-vertices';
const SUGGESTION_SRC = 'bw-capture-frontage';
const HOVER_EDGE_SRC = 'bw-capture-hover-edge';
const HOVER_VERTICES_SRC = 'bw-capture-hover-vertices';

export const CAPTURE_CURSOR = 'crosshair';

let toLngLat: (v: Vertex) => [number, number] = (v) => [v.x, v.y];

/** Install the coordinate transform the wizard owns (local meters -> WGS84). */
export function setVertexToLngLat(fn: (v: Vertex) => [number, number]): void {
  toLngLat = fn;
}

function ringFeature(ring: Vertex[]): GeoJSON.Feature<GeoJSON.Polygon> {
  const closed = ring.length > 0 ? [...ring, ring[0]] : [];
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [closed.map((v) => toLngLat(v))],
    },
  };
}

function lineFeature(a: Vertex, b: Vertex): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: [toLngLat(a), toLngLat(b)] },
  };
}

function emptyPoly(): GeoJSON.Feature<GeoJSON.Polygon> {
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[]] } };
}

function emptyLine(): GeoJSON.Feature<GeoJSON.LineString> {
  return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } };
}

function emptyFc(): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

/** Install sources+layers once per map style load; idempotent. */
export function installCaptureLayers(map: MlMap): void {
  if (map.getSource(BOUNDARY_SRC)) return;

  map.addSource(BOUNDARY_SRC, { type: 'geojson', data: emptyPoly() });
  map.addSource(LIVE_EDGE_SRC, { type: 'geojson', data: emptyLine() });
  map.addSource(GUIDES_SRC, { type: 'geojson', data: emptyFc() });
  map.addSource(VERTICES_SRC, { type: 'geojson', data: emptyFc() });
  map.addSource(SUGGESTION_SRC, { type: 'geojson', data: emptyLine() });
  map.addSource(HOVER_EDGE_SRC, { type: 'geojson', data: emptyLine() });
  map.addSource(HOVER_VERTICES_SRC, { type: 'geojson', data: emptyFc() });

  map.addLayer({
    id: 'bw-capture-boundary-fill',
    type: 'fill',
    source: BOUNDARY_SRC,
    paint: { 'fill-color': MAP_CAPTURE.accent, 'fill-opacity': 0.12 },
  });
  map.addLayer({
    id: 'bw-capture-boundary-line',
    type: 'line',
    source: BOUNDARY_SRC,
    paint: { 'line-color': MAP_CAPTURE.accent, 'line-width': 2.2 },
  });
  map.addLayer({
    id: 'bw-capture-live-edge',
    type: 'line',
    source: LIVE_EDGE_SRC,
    paint: { 'line-color': MAP_CAPTURE.accent, 'line-width': 1.8, 'line-dasharray': [2, 2] },
  });
  map.addLayer({
    id: 'bw-capture-guides-line',
    type: 'line',
    source: GUIDES_SRC,
    paint: { 'line-color': MAP_CAPTURE.guide, 'line-width': 1.2, 'line-dasharray': [4, 4] },
  });
  map.addLayer({
    id: 'bw-capture-vertices-circle',
    type: 'circle',
    source: VERTICES_SRC,
    paint: {
      'circle-radius': 5,
      'circle-color': MAP_CAPTURE.accent,
      'circle-stroke-color': MAP_CAPTURE.vertexStroke,
      'circle-stroke-width': 1.5,
    },
  });
  // Hover affordance for the FRONTAGE picker: a soft band under the pointer's
  // nearest edge + emphasised endpoints, so the click is aimed at a real edge.
  map.addLayer({
    id: 'bw-capture-hover-edge',
    type: 'line',
    source: HOVER_EDGE_SRC,
    paint: { 'line-color': MAP_CAPTURE.accent, 'line-width': 7, 'line-opacity': 0.35 },
    layout: { 'line-cap': 'round' },
  });
  map.addLayer({
    id: 'bw-capture-hover-vertices',
    type: 'circle',
    source: HOVER_VERTICES_SRC,
    paint: {
      'circle-radius': 7,
      'circle-color': MAP_CAPTURE.vertexStroke,
      'circle-stroke-color': MAP_CAPTURE.accent,
      'circle-stroke-width': 2.5,
    },
  });
  map.addLayer({
    id: 'bw-capture-frontage-line',
    type: 'line',
    source: SUGGESTION_SRC,
    paint: {
      'line-color': MAP_OVERLAY.frontage,
      'line-width': 4,
      'line-dasharray': [1.5, 1.5],
      'line-opacity': 0.95,
    },
    layout: { 'line-cap': 'round' },
  });
}

export interface CaptureRenderState {
  ring: Vertex[];
  cursor: Vertex | null;
  guides: GuideLine[];
}

/** Push capture state into the map sources (call inside rAF). */
export function updateCaptureSources(map: MlMap, state: CaptureRenderState): void {
  const apply = (id: string, data: GeoJSON.Feature | GeoJSON.FeatureCollection): void => {
    const src = map.getSource(id) as GeoJSONSource | undefined;
    if (src) src.setData(data as any);
  };

  apply(BOUNDARY_SRC, state.ring.length >= 3 ? ringFeature(state.ring) : emptyPoly());
  apply(
    LIVE_EDGE_SRC,
    state.cursor && state.ring.length > 0
      ? lineFeature(state.ring[state.ring.length - 1], state.cursor)
      : emptyLine()
  );
  apply(
    GUIDES_SRC,
    state.guides.length > 0
      ? {
          type: 'FeatureCollection',
          features: state.guides.map((g) => ({
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: [toLngLat(g.a), toLngLat(g.b)] },
          })),
        }
      : emptyFc()
  );
  apply(
    VERTICES_SRC,
    state.ring.length > 0
      ? {
          type: 'FeatureCollection',
          features: state.ring.map((v, i) => ({
            type: 'Feature',
            properties: { idx: i },
            geometry: { type: 'Point', coordinates: toLngLat(v) },
          })),
        }
      : emptyFc()
  );
}

export function clearCaptureSources(map: MlMap): void {
  updateCaptureSources(map, { ring: [], cursor: null, guides: [] });
  updateFrontageSuggestion(map, [], null);
  updateHoveredEdge(map, [], null);
}

/**
 * Highlight the edge nearest the pointer (FRONTAGE picker). Pass edgeIndex=null
 * to clear. No-op when the sources are not installed.
 */
export function updateHoveredEdge(map: MlMap, ring: Vertex[], edgeIndex: number | null): void {
  const edgeSrc = map.getSource(HOVER_EDGE_SRC) as GeoJSONSource | undefined;
  const vertSrc = map.getSource(HOVER_VERTICES_SRC) as GeoJSONSource | undefined;
  if (!edgeSrc || !vertSrc) return;
  const valid =
    edgeIndex !== null && ring.length >= 3 && edgeIndex >= 0 && edgeIndex < ring.length;
  if (!valid) {
    edgeSrc.setData(emptyLine() as any);
    vertSrc.setData(emptyFc() as any);
    return;
  }
  const i = edgeIndex as number;
  const a = ring[i];
  const b = ring[(i + 1) % ring.length];
  edgeSrc.setData(lineFeature(a, b) as any);
  vertSrc.setData({
    type: 'FeatureCollection',
    features: [a, b].map((v) => ({
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'Point' as const, coordinates: toLngLat(v) },
    })),
  } as any);
}

/**
 * Highlights the suggested frontage edge (Overpass suggestion).
 * Pass edgeIndex=null to clear. No-op when the source is not installed.
 */
export function updateFrontageSuggestion(map: MlMap, ring: Vertex[], edgeIndex: number | null): void {
  const src = map.getSource(SUGGESTION_SRC) as GeoJSONSource | undefined;
  if (!src) return;
  if (edgeIndex === null || ring.length < 3 || edgeIndex < 0 || edgeIndex >= ring.length) {
    src.setData(emptyLine());
    return;
  }
  const a = ring[edgeIndex];
  const b = ring[(edgeIndex + 1) % ring.length];
  src.setData({
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: [toLngLat(a), toLngLat(b)] },
  });
}

/** Crosshair cursor while capturing. */
export function setCaptureCursor(map: MlMap, capturing: boolean): void {
  map.getCanvas().style.cursor = capturing ? CAPTURE_CURSOR : '';
}
