/**
 * capturePulse.ts — one-shot tactile animations over the MapLibre canvas.
 * ==================================================================
 * MapLibre GL layers cannot use CSS animations, so the spec'd "pop" (vertex
 * placement), "shrink" (vertex delete) and "lock" (snap engage) pulses are
 * driven as tiny discrete keyframe sequences (3-4 setData / setPaintProperty
 * calls over 150-300ms). They fire only on DISCRETE events — never during
 * continuous pointer motion — so the 60fps drag/draw contract is untouched.
 *
 * All pulses are skipped under prefers-reduced-motion (the tokens contract).
 */
import type { Map as MlMap, GeoJSONSource } from 'maplibre-gl';
import type { Vertex } from '../../services/boundaryIO';
import { MAP_CAPTURE } from '../../design/tokens';

const PULSE_SRC = 'bw-capture-pulse';

/** Radius keyframes, one entry per step; STEP_MS per entry. */
const STEP_MS = 75;

function isMapReady(map: MlMap | null | undefined): map is MlMap {
  if (!map) return false;
  try {
    return Boolean(typeof map.isStyleLoaded === 'function' && map.isStyleLoaded());
  } catch {
    return false;
  }
}

function reducedMotion(): boolean {
  try {
    return Boolean(
      typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    );
  } catch {
    return false;
  }
}

/** Install the pulse source + layer once (idempotent). */
function ensurePulseLayer(map: MlMap): boolean {
  try {
    if (!map.getSource(PULSE_SRC)) {
      map.addSource(PULSE_SRC, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
    }
    if (!map.getLayer('bw-capture-pulse')) {
      map.addLayer({
        id: 'bw-capture-pulse',
        type: 'circle',
        source: PULSE_SRC,
        paint: {
          'circle-radius': ['coalesce', ['get', 'radius'], 0],
          'circle-color': MAP_CAPTURE.accent,
          'circle-opacity': ['coalesce', ['get', 'alpha'], 0],
          'circle-stroke-color': MAP_CAPTURE.vertexStroke,
          'circle-stroke-width': 2,
          'circle-stroke-opacity': ['coalesce', ['get', 'alpha'], 0],
        },
      });
    }
    return true;
  } catch {
    return false;
  }
}

interface PulseSpec {
  /** GeoJSON point to pulse at. */
  at: Vertex;
  /** [lng, lat] transform of the vertex (injected by the adapter bridge). */
  toLngLat: (v: Vertex) => [number, number];
  /** Radius keyframes over the life of the pulse. */
  radii: number[];
  /** Alpha keyframes (same length). */
  alphas: number[];
}

const activePulses = new Set<symbol>();

function runPulse(map: MlMap, spec: PulseSpec): void {
  if (!isMapReady(map) || reducedMotion()) return;
  if (!ensurePulseLayer(map)) return;
  const id = Symbol('pulse');
  activePulses.add(id);

  const setStep = (i: number): void => {
    try {
      const src = map.getSource(PULSE_SRC) as GeoJSONSource | undefined;
      if (!src || !activePulses.has(id)) {
        if (src && !activePulses.has(id)) {
          // Another pulse took over; leave its state alone.
        }
        return;
      }
      const r = spec.radii[Math.min(i, spec.radii.length - 1)];
      const a = spec.alphas[Math.min(i, spec.alphas.length - 1)];
      src.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { radius: r, alpha: a },
            geometry: { type: 'Point', coordinates: spec.toLngLat(spec.at) },
          },
        ],
      } as any);
    } catch {}
  };

  for (let i = 0; i < spec.radii.length; i++) {
    window.setTimeout(() => setStep(i), i * STEP_MS);
  }
  window.setTimeout(() => {
    activePulses.delete(id);
    try {
      const src = map.getSource(PULSE_SRC) as GeoJSONSource | undefined;
      if (src) {
        src.setData({ type: 'FeatureCollection', features: [] } as any);
      }
    } catch {}
  }, spec.radii.length * STEP_MS + 30);
}

export interface PulseBridge {
  toLngLat: (v: Vertex) => [number, number];
}

let bridge: PulseBridge | null = null;

/** CaptureSheet injects the coordinate transform before any pulse can run. */
export function setPulseBridge(b: PulseBridge): void {
  bridge = b;
}

/** Vertex placement "pop": scale 0 → overshoot → settle (200ms overall). */
export function playVertexPop(map: MlMap, at: Vertex): void {
  if (!bridge) return;
  runPulse(map, {
    at,
    toLngLat: bridge.toLngLat,
    radii: [0, 12, 9.5],
    alphas: [0, 0.85, 0.95],
  });
}

/** Vertex deletion "shrink": scale 1 → 0 over 150ms. */
export function playVertexShrink(map: MlMap, at: Vertex): void {
  if (!bridge) return;
  runPulse(map, {
    at,
    toLngLat: bridge.toLngLat,
    radii: [10, 6, 0],
    alphas: [0.95, 0.6, 0],
  });
}
/**
 * Snap "lock": scale 1.0 → 1.2 → 1.0 over ~50ms per frame — the tactile
 * magnetic click when a guide engages.
 */
export function playSnapLock(map: MlMap, at: Vertex): void {
  if (!bridge) return;
  runPulse(map, {
    at,
    toLngLat: bridge.toLngLat,
    radii: [8, 10.5, 8],
    alphas: [0.5, 0.9, 0.5],
  });
}
