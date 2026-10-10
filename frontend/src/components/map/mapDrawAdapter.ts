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
const BOUNDARY_LINE_SRC = 'bw-capture-boundary-line-src';
const LIVE_EDGE_SRC = 'bw-capture-live';
const GUIDES_SRC = 'bw-capture-guides';
const VERTICES_SRC = 'bw-capture-vertices';
const SUGGESTION_SRC = 'bw-capture-frontage';
const HOVER_EDGE_SRC = 'bw-capture-hover-edge';
const HOVER_VERTICES_SRC = 'bw-capture-hover-vertices';

const CLOSE_TARGET_SRC = 'bw-capture-close-target-src';
/** EDIT-mode live ring: the ring under an active vertex drag (before commit). */
const DRAG_LINE_SRC = 'bw-capture-drag-line';
/** EDIT-mode '+mid-edge' insertion handle (revealed by hover). */
const INSERT_SRC = 'bw-capture-insert-handle';
/** Ghost vertex preview in draw mode (8px faint preview following the mouse). */
const GHOST_SRC = 'bw-capture-ghost';

export const CAPTURE_CURSOR = 'crosshair';
/** Cursor while hovering a vertex handle or mid-edge insert in EDIT mode. */
export const EDIT_CURSOR = 'move';

let toLngLat: (v: Vertex) => [number, number] = (v) => [v.x, v.y];

/** Install the coordinate transform the wizard owns (local meters -> WGS84). */
export function setVertexToLngLat(fn: (v: Vertex) => [number, number]): void {
  toLngLat = fn;
}

function ringPolygonFeature(ring: Vertex[]): GeoJSON.Feature<GeoJSON.Polygon> {
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

function ringLineFeature(ring: Vertex[], isClosed: boolean): GeoJSON.Feature<GeoJSON.LineString> {
  if (ring.length < 2) return emptyLine();
  const pts = isClosed ? [...ring, ring[0]] : ring;
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: pts.map((v) => toLngLat(v)),
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

function pointFeature(
  v: Vertex,
  props: Record<string, unknown> = {}
): GeoJSON.Feature<GeoJSON.Point> {
  return {
    type: 'Feature',
    properties: props,
    geometry: { type: 'Point', coordinates: toLngLat(v) },
  };
}

const CAPTURE_LAYER_IDS = [
  'bw-capture-boundary-fill',
  'bw-capture-boundary-line',
  'bw-capture-live-edge',
  'bw-capture-guides-line',
  'bw-capture-close-target',
  'bw-capture-vertices-circle',
  'bw-capture-hover-edge',
  'bw-capture-hover-vertices',
  'bw-capture-frontage-line',
  'bw-capture-drag-line',
  'bw-capture-insert-handle',
  'bw-capture-ghost',
];

function isMapReady(map: MlMap | null | undefined): map is MlMap {
  if (!map) return false;
  try {
    return Boolean(typeof map.isStyleLoaded === 'function' && map.isStyleLoaded());
  } catch {
    return false;
  }
}

/** Ensures capture layers are placed on top of base and data layers so lines are never occluded. */
export function bringCaptureLayersToFront(map: MlMap): void {
  if (!isMapReady(map)) return;
  for (const id of CAPTURE_LAYER_IDS) {
    try {
      if (map.getLayer(id)) {
        if (map.getLayoutProperty(id, 'visibility') === 'none') {
          map.setLayoutProperty(id, 'visibility', 'visible');
        }
        map.moveLayer(id);
      }
    } catch {}
  }
}

/** Install sources+layers once per map style load; idempotent. */
export function installCaptureLayers(map: MlMap): void {
  if (!isMapReady(map)) return;

  try {
    if (map.getSource(BOUNDARY_SRC) && map.getSource(BOUNDARY_LINE_SRC)) {
      bringCaptureLayersToFront(map);
      return;
    }

    if (!map.getSource(BOUNDARY_SRC)) {
      map.addSource(BOUNDARY_SRC, { type: 'geojson', data: emptyPoly() });
    }
    if (!map.getSource(BOUNDARY_LINE_SRC)) {
      map.addSource(BOUNDARY_LINE_SRC, { type: 'geojson', data: emptyLine() });
    }
    if (!map.getSource(LIVE_EDGE_SRC)) {
      map.addSource(LIVE_EDGE_SRC, { type: 'geojson', data: emptyLine() });
    }
    if (!map.getSource(GUIDES_SRC)) {
      map.addSource(GUIDES_SRC, { type: 'geojson', data: emptyFc() });
    }
    if (!map.getSource(CLOSE_TARGET_SRC)) {
      map.addSource(CLOSE_TARGET_SRC, { type: 'geojson', data: emptyFc() });
    }
    if (!map.getSource(VERTICES_SRC)) {
      map.addSource(VERTICES_SRC, { type: 'geojson', data: emptyFc() });
    }
    if (!map.getSource(SUGGESTION_SRC)) {
      map.addSource(SUGGESTION_SRC, { type: 'geojson', data: emptyLine() });
    }
    if (!map.getSource(HOVER_EDGE_SRC)) {
      map.addSource(HOVER_EDGE_SRC, { type: 'geojson', data: emptyLine() });
    }
    if (!map.getSource(HOVER_VERTICES_SRC)) {
      map.addSource(HOVER_VERTICES_SRC, { type: 'geojson', data: emptyFc() });
    }
    if (!map.getSource(DRAG_LINE_SRC)) {
      map.addSource(DRAG_LINE_SRC, { type: 'geojson', data: emptyLine() });
    }
    if (!map.getSource(INSERT_SRC)) {
      map.addSource(INSERT_SRC, { type: 'geojson', data: emptyFc() });
    }
    if (!map.getSource(GHOST_SRC)) {
      map.addSource(GHOST_SRC, { type: 'geojson', data: emptyFc() });
    }

    // EDIT-mode drag ring: slightly wider live line under the drag (visual depth).
    if (!map.getLayer('bw-capture-drag-line')) {
      map.addLayer({
        id: 'bw-capture-drag-line',
        type: 'line',
        source: DRAG_LINE_SRC,
        paint: { 'line-color': MAP_CAPTURE.accent, 'line-width': 3.5, 'line-opacity': 0.9 },
        layout: { visibility: 'visible', 'line-cap': 'round', 'line-join': 'round' },
      });
    }
    // Mid-edge '+' insertion handle: faint until hovered-hover expands it.
    if (!map.getLayer('bw-capture-insert-handle')) {
      map.addLayer({
        id: 'bw-capture-insert-handle',
        type: 'circle',
        source: INSERT_SRC,
        paint: {
          'circle-radius': 6,
          'circle-color': MAP_CAPTURE.vertexStroke,
          'circle-opacity': 0.55,
          'circle-stroke-color': MAP_CAPTURE.accent,
          'circle-stroke-width': 1.5,
        },
        layout: { visibility: 'visible' },
      });
    }
    // Draw-mode ghost vertex: 8px faint halo that tracks the pointer.
    if (!map.getLayer('bw-capture-ghost')) {
      map.addLayer({
        id: 'bw-capture-ghost',
        type: 'circle',
        source: GHOST_SRC,
        paint: {
          'circle-radius': 8,
          'circle-color': MAP_CAPTURE.accent,
          'circle-opacity': 0.18,
          'circle-stroke-color': MAP_CAPTURE.accent,
          'circle-stroke-width': 1.5,
          'circle-stroke-opacity': 0.7,
        },
        layout: { visibility: 'visible' },
      });
    }

    if (!map.getLayer('bw-capture-boundary-fill')) {
      map.addLayer({
        id: 'bw-capture-boundary-fill',
        type: 'fill',
        source: BOUNDARY_SRC,
        layout: { visibility: 'visible' },
        paint: { 'fill-color': MAP_CAPTURE.accent, 'fill-opacity': 0.12 },
      });
    }
    if (!map.getLayer('bw-capture-boundary-line')) {
      map.addLayer({
        id: 'bw-capture-boundary-line',
        type: 'line',
        source: BOUNDARY_LINE_SRC,
        paint: { 'line-color': MAP_CAPTURE.accent, 'line-width': 2.4, 'line-opacity': 1.0 },
        layout: { visibility: 'visible', 'line-cap': 'round', 'line-join': 'round' },
      });
    }
    if (!map.getLayer('bw-capture-live-edge')) {
      map.addLayer({
        id: 'bw-capture-live-edge',
        type: 'line',
        source: LIVE_EDGE_SRC,
        paint: { 'line-color': MAP_CAPTURE.accent, 'line-width': 2.0, 'line-dasharray': [2, 2], 'line-opacity': 1.0 },
        layout: { visibility: 'visible', 'line-cap': 'round', 'line-join': 'round' },
      });
    }
    if (!map.getLayer('bw-capture-guides-line')) {
      map.addLayer({
        id: 'bw-capture-guides-line',
        type: 'line',
        source: GUIDES_SRC,
        paint: { 'line-color': MAP_CAPTURE.guide, 'line-width': 1.4, 'line-dasharray': [4, 4], 'line-opacity': 1.0 },
        layout: { visibility: 'visible' },
      });
    }
    if (!map.getLayer('bw-capture-close-target')) {
      map.addLayer({
        id: 'bw-capture-close-target',
        type: 'circle',
        source: CLOSE_TARGET_SRC,
        paint: {
          'circle-radius': 11,
          'circle-color': MAP_CAPTURE.accent,
          'circle-opacity': 0.22,
          'circle-stroke-color': MAP_CAPTURE.accent,
          'circle-stroke-width': 2.5,
          'circle-stroke-opacity': 0.95,
        },
        layout: { visibility: 'visible' },
      });
    }
    if (!map.getLayer('bw-capture-vertices-circle')) {
      map.addLayer({
        id: 'bw-capture-vertices-circle',
        type: 'circle',
        source: VERTICES_SRC,
        paint: {
          'circle-radius': [
            'case',
            ['get', 'isFirst'],
            7.0,
            5.5,
          ],
          'circle-color': MAP_CAPTURE.accent,
          'circle-stroke-color': MAP_CAPTURE.vertexStroke,
          'circle-stroke-width': [
            'case',
            ['get', 'isFirst'],
            2.5,
            2.0,
          ],
          'circle-opacity': 1.0,
        },
        layout: { visibility: 'visible' },
      });
    }
    // Hover affordance for the FRONTAGE picker: a soft band under the pointer's
    // nearest edge + emphasised endpoints, so the click is aimed at a real edge.
    if (!map.getLayer('bw-capture-hover-edge')) {
      map.addLayer({
        id: 'bw-capture-hover-edge',
        type: 'line',
        source: HOVER_EDGE_SRC,
        paint: { 'line-color': MAP_CAPTURE.accent, 'line-width': 7, 'line-opacity': 0.35 },
        layout: { visibility: 'visible', 'line-cap': 'round' },
      });
    }
    if (!map.getLayer('bw-capture-hover-vertices')) {
      map.addLayer({
        id: 'bw-capture-hover-vertices',
        type: 'circle',
        source: HOVER_VERTICES_SRC,
        paint: {
          'circle-radius': 7,
          'circle-color': MAP_CAPTURE.vertexStroke,
          'circle-stroke-color': MAP_CAPTURE.accent,
          'circle-stroke-width': 2.5,
          'circle-opacity': 1.0,
        },
        layout: { visibility: 'visible' },
      });
    }
    if (!map.getLayer('bw-capture-frontage-line')) {
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
        layout: { visibility: 'visible', 'line-cap': 'round' },
      });
    }

    bringCaptureLayersToFront(map);
  } catch (err) {
    console.warn('installCaptureLayers error:', err);
  }
}

export interface CaptureRenderState {
  ring: Vertex[];
  cursor: Vertex | null;
  guides: GuideLine[];
  isClosed?: boolean;
  /** EDIT-mode: the ring mid-drag (drawn with extra weight). */
  editLiveRing?: Vertex[] | null;
  /** EDIT-mode: the revealed '+' midpoint handle position. */
  insertHandle?: Vertex | null;
  /** Self-intersection (or any EC) invalidates the boundary stroke color. */
  invalid?: boolean;
}

/** Push capture state into the map sources (call inside rAF or state changes). */
export function updateCaptureSources(map: MlMap, state: CaptureRenderState): void {
  if (!isMapReady(map)) return;
  installCaptureLayers(map);

  const apply = (id: string, data: GeoJSON.Feature | GeoJSON.FeatureCollection): void => {
    try {
      const src = map.getSource(id) as GeoJSONSource | undefined;
      if (src) src.setData(data as any);
    } catch {}
  };

  const isClosed = Boolean(state.isClosed);

  // Polygon fill: only when closed with >= 3 vertices
  apply(
    BOUNDARY_SRC,
    isClosed && state.ring.length >= 3 ? ringPolygonFeature(state.ring) : emptyPoly()
  );

  // Boundary lines: open polyline while tracing (>= 2 vertices), closed ring when isClosed
  apply(
    BOUNDARY_LINE_SRC,
    ringLineFeature(state.ring, isClosed)
  );

  // Live edge: dashed line from last placed vertex to cursor (only when tracing)
  apply(
    LIVE_EDGE_SRC,
    !isClosed && state.cursor && state.ring.length > 0
      ? lineFeature(state.ring[state.ring.length - 1], state.cursor)
      : emptyLine()
  );

  apply(
    GUIDES_SRC,
    !isClosed && state.guides.length > 0
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
            properties: { idx: i, isFirst: i === 0, count: state.ring.length },
            geometry: { type: 'Point', coordinates: toLngLat(v) },
          })),
        }
      : emptyFc()
  );

  // Close target indicator on starting point (P1) when >= 3 vertices placed while tracing
  apply(
    CLOSE_TARGET_SRC,
    Boolean(state.cursor) && state.ring.length >= 3
      ? {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: { idx: 0 },
              geometry: { type: 'Point', coordinates: toLngLat(state.ring[0]) },
            },
          ],
        }
      : emptyFc()
  );

  // Ghost vertex (draw mode): faint preview at the snapped cursor.
  apply(
    GHOST_SRC,
    state.cursor && state.ring.length > 0 && !isClosed
      ? { type: 'FeatureCollection', features: [pointFeature(state.cursor, { role: 'ghost' })] }
      : emptyFc()
  );

  // Edit-live ring under a drag + insertion handle (both EDIT affordances).
  apply(
    DRAG_LINE_SRC,
    state.editLiveRing && state.editLiveRing.length >= 2
      ? ringLineFeature(state.editLiveRing, false)
      : emptyLine()
  );
  apply(
    INSERT_SRC,
    state.insertHandle ? { type: 'FeatureCollection', features: [pointFeature(state.insertHandle, { role: 'insert' })] } : emptyFc()
  );

  // Self-intersection / invalid ring: the boundary line turns red on the map.
  const invalidColor = 'rgba(255, 59, 48, 0.95)';
  try {
    const lineLayerId = 'bw-capture-boundary-line';
    if (map.getLayer(lineLayerId)) {
      map.setPaintProperty(
        lineLayerId,
        'line-color',
        state.invalid === true ? invalidColor : MAP_CAPTURE.accent
      );
    }
  } catch {}
}
/**
 * One-shot CSS-class-driven animations on the map canvas are impossible for
 * MapLibre GL layers, so completion/lock pulses are expressed as a short
 * drive list: the caller re-renders the boundary line with an elevated
 * stroke-width a few frames apart (see CaptureSheet). This helper emits the
 * paint keyframes for the "lock" pulse (2→4→2 px over 300ms).
 */
export function pulseBoundaryLock(map: MlMap): void {
  if (!isMapReady(map)) return;
  const layerId = 'bw-capture-boundary-line';
  if (!map.getLayer(layerId)) return;
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;
  const KEYFRAMES = [2, 4, 2];
  const STEP_MS = 150;
  KEYFRAMES.forEach((w, i) => {
    window.setTimeout(() => {
      try {
        if (map.getLayer(layerId)) map.setPaintProperty(layerId, 'line-width', w);
      } catch {}
      if (i === KEYFRAMES.length - 1) {
        // Restore the token width when the pulse ends.
        try {
          map.setPaintProperty(layerId, 'line-width', 2.4);
        } catch {}
      }
    }, i * STEP_MS);
  });
}

export function clearCaptureSources(map: MlMap): void {
  if (!isMapReady(map)) return;
  updateCaptureSources(map, { ring: [], cursor: null, guides: [], isClosed: false });
  updateFrontageSuggestion(map, [], null);
  updateHoveredEdge(map, [], null);
  // Reset invalid styling whenever the sheet closes or resets.
  try {
    if (map.getLayer('bw-capture-boundary-line')) {
      map.setPaintProperty('bw-capture-boundary-line', 'line-color', MAP_CAPTURE.accent);
      map.setPaintProperty('bw-capture-boundary-line', 'line-width', 2.4);
    }
  } catch {}
}

/**
 * Highlight the edge nearest the pointer (FRONTAGE picker). Pass edgeIndex=null
 * to clear. No-op when the sources are not installed.
 */
export function updateHoveredEdge(map: MlMap, ring: Vertex[], edgeIndex: number | null): void {
  if (!isMapReady(map)) return;
  try {
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
  } catch {}
}

/**
 * Highlights the suggested frontage edge (Overpass suggestion).
 * Pass edgeIndex=null to clear. No-op when the source is not installed.
 */
export function updateFrontageSuggestion(map: MlMap, ring: Vertex[], edgeIndex: number | null): void {
  if (!isMapReady(map)) return;
  try {
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
  } catch {}
}

/** Crosshair cursor while capturing; contextual overrides win instantly. */
export function setCaptureCursor(map: MlMap, capturing: boolean): void {
  try {
    const canvas = map?.getCanvas?.();
    if (canvas && canvas.style) {
      canvas.style.cursor = capturing ? CAPTURE_CURSOR : '';
    }
  } catch {}
}
/**
 * Instant contextual cursor (drag hover = move; drag active = grabbing).
 * Called on every pointermove hit-test result — a single style write, zero lag.
 */
export function setEditCursor(map: MlMap, cursorCss: '' | 'move' | 'grabbing' | 'crosshair' | 'copy'): void {
  try {
    const canvas = map?.getCanvas?.();
    if (canvas && canvas.style) {
      canvas.style.cursor = cursorCss;
    }
  } catch {}
}
