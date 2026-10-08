/**
 * CaptureSheet.tsx — STEP ZERO: map-first site capture wizard.
 * =====================================================================
 * Four steps: LOCATE -> TRACE -> FRONTAGE -> REVIEW.
 * - TRACE: point-by-point vertices with FREE/ORTHOGONAL/PARALLEL snap,
 *   magnetic guides, live length+bearing badges, live area/perimeter,
 *   close via first-vertex/double-click, ESC cancels, invalid rings blocked
 *   with the statutory reason (EC-01/02/03 mirror).
 * - FRONTAGE: click the road-facing edge (a smart suggestion is offered).
 * - REVIEW: summary chips; commit enables "Run Site Feasibility" upstream.
 * Single source of truth: every path exits through the SAME commit payload.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Map as MlMap } from 'maplibre-gl';
import { projectToLocal, unprojectToLngLat, type LocalOrigin } from '../../services/projection';
import { parseBoundaryText } from '../../services/boundaryIO';
import {
  buildPlotPolygonPayload,
  BoundaryError,
  metricsFor,
  presetVertices,
  rectangleVertices,
  ensureCCW,
  validateLiveRing,
  edgeBearingLength,
  type PresetId,
  type SharedBoundaryState,
} from '../../services/siteBoundary';
import type { Vertex } from '../../services/boundaryIO';
import { azimuthDeg, quadrantBearing } from '../../services/projection';
import {
  snapPoint,
  distanceToFirstVertex,
  nearestEdgeWithin,
  edgeCallouts,
  type SnapMode,
} from '../../services/captureGeometry';
import {
  installCaptureLayers,
  updateCaptureSources,
  clearCaptureSources,
  setCaptureCursor,
  setVertexToLngLat,
  updateFrontageSuggestion,
  updateHoveredEdge,
} from './mapDrawAdapter';
import { fetchNearestRoad } from '../../services/siteIntelligenceApi';
import {
  suggestFrontageEdge,
  type FrontageSuggestion,
  type NearestRoadResponse,
} from '../../services/siteIntelligence';
import { Icon } from '../Icon';

export type CaptureStep = 'locate' | 'trace' | 'frontage' | 'review';

export interface CaptureSheetProps {
  open: boolean;
  step: CaptureStep;
  onStepChange: (step: CaptureStep) => void;
  /** Existing boundary loaded for editing (may be null on first capture). */
  boundary: SharedBoundaryState | null;
  pin: { lat: number; lon: number } | null;
  /** Move the app pin (LOCATE step). */
  onPinChange: (lat: number, lon: number) => void;
  /** Commit the boundary (single funnel — same payload for every path). */
  onCommit: (boundary: SharedBoundaryState) => void;
  onCancel: () => void;
  /** Access the live MapLibre instance (owned by MapCanvas). */
  getMap: () => MlMap | null;
}

const CLOSE_TOLERANCE_M = 3.0;
/** Pointer-to-edge pick band in SCREEN space (converted to meters at the current
 *  zoom), so the highlight follows the cursor, not the zoom level. */
const HOVER_TOLERANCE_PX = 18;
/** Geographic floor for the pick band — never finer than a fingertip click. */
const HOVER_TOLERANCE_MIN_M = 4.0;
/** Zoom ceiling while capturing (matches the map's active-site session cap). */
const SITE_PICK_MAX_ZOOM = 20;

export const CaptureSheet: React.FC<CaptureSheetProps> = ({
  open,
  step,
  onStepChange,
  boundary,
  pin,
  onPinChange: _onPinChange,
  onCommit,
  onCancel,
  getMap,
}) => {
  const [origin] = useState<LocalOrigin>(() => ({
    lat: boundary?.origin.lat ?? pin?.lat ?? 12.9716,
    lon: boundary?.origin.lon ?? pin?.lon ?? 77.5946,
  }));
  const [vertices, setVertices] = useState<Vertex[]>(() => boundary?.vertices ?? []);
  const [cursor, setCursor] = useState<Vertex | null>(null);
  const [snapMode, setSnapMode] = useState<SnapMode>('ORTHOGONAL');
  const [lastBearing, setLastBearing] = useState<number | null>(null);
  const [frontageEdge, setFrontageEdge] = useState<number | null>(boundary?.frontageEdgeIndex ?? null);
  // Overpass-backed frontage suggestion (ASSUMED until the user confirms).
  const [road, setRoad] = useState<NearestRoadResponse | null>(null);
  const [roadLoading, setRoadLoading] = useState<boolean>(false);
  const [roadError, setRoadError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<FrontageSuggestion | null>(null);
  const [frontageConfirmed, setFrontageConfirmed] = useState<boolean>(false);
  /** The frontage that will commit: explicit pick, else the accepted suggestion. */
  const activeFrontage = frontageConfirmed ? frontageEdge : (suggestion?.edgeIndex ?? frontageEdge);
  const [guides, setGuides] = useState<{ a: Vertex; b: Vertex }[]>([]);
  /** FRONTAGE picker: edge under the pointer (null when the pointer is off-ring). */
  const [hoveredEdge, setHoveredEdge] = useState<number | null>(null);
  /** Shown when a frontage click lands away from every edge (no silent pick). */
  const [missHint, setMissHint] = useState<boolean>(false);
  /** Pointer position (map pixels) driving the hover callout badge. */
  const [hoverPx, setHoverPx] = useState<{ x: number; y: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importText, setImportText] = useState('');
  const [rectW, setRectW] = useState(12);
  const [rectD, setRectD] = useState(18);
  const [rectRot, setRectRot] = useState(0);
  const rafRef = useRef<number | null>(null);
  const pendingCursorRef = useRef<Vertex | null>(null);
  const stepRef = useRef(step);
  stepRef.current = step;

  /* ---------- origin + projection transform ---------- */
  useEffect(() => {
    if (!open) return;
    setVertexToLngLat((v: Vertex): [number, number] => {
      const ll = unprojectToLngLat(v, origin);
      return [ll.lon, ll.lat];
    });
  }, [open, origin]);

  /* ---------- map lifecycle: layers, cursor, listeners ---------- */
  useEffect(() => {
    if (!open) return;
    const map = getMap();
    if (!map) return;
    installCaptureLayers(map);
    setCaptureCursor(map, step === 'trace' || step === 'frontage');

    const toLocal = (lngLat: { lng: number; lat: number }): Vertex =>
      projectToLocal(lngLat.lat, lngLat.lng, origin);

    // The dashed live edge + magnetic guides are a TRACE-step affordance only.
    // Once the ring is closed (or the wizard moved to FRONTAGE/REVIEW) a line
    // tracking the pointer is meaningless geometry and reads as a stray dashed
    // outline left over the traced boundary - never schedule it then.
    const scheduleCursor = (v: Vertex): void => {
      if (stepRef.current !== 'trace') return;
      pendingCursorRef.current = v;
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const next = pendingCursorRef.current;
        if (!next) return;
        if (stepRef.current !== 'trace') return;
        const anchor = vertices[vertices.length - 1] ?? null;
        const snap = snapPoint(next, anchor, lastBearing, snapMode);
        setCursor(snap.point);
        setGuides(snap.guides);
        updateCaptureSources(map, { ring: vertices, cursor: snap.point, guides: snap.guides });
      });
    };

    /** Pick band in meters for the current zoom: HOVER_TOLERANCE_PX pixels. */
    const hoverToleranceM = (point: { x: number; y: number } | undefined, local: Vertex): number => {
      if (!point) return HOVER_TOLERANCE_MIN_M;
      try {
        const probe = map.unproject([point.x + HOVER_TOLERANCE_PX, point.y]);
        const probeLocal = projectToLocal(probe.lat, probe.lng, origin);
        return Math.max(
          HOVER_TOLERANCE_MIN_M,
          Math.hypot(probeLocal.x - local.x, probeLocal.y - local.y)
        );
      } catch {
        return HOVER_TOLERANCE_MIN_M;
      }
    };

    const onMouseMove = (e: any): void => {
      if (stepRef.current === 'trace') {
        scheduleCursor(toLocal(e.lngLat));
        return;
      }
      // FRONTAGE: highlight the edge under the pointer so the pick is aimed.
      if (stepRef.current !== 'frontage' || vertices.length < 3) return;
      const local = toLocal(e.lngLat);
      const idx = nearestEdgeWithin(vertices, local, hoverToleranceM(e.point, local));
      setHoveredEdge((prev) => (prev === idx ? prev : idx));
      updateHoveredEdge(map, vertices, idx);
      setHoverPx(idx !== null && e.point ? { x: e.point.x, y: e.point.y } : null);
      // Aiming at an edge again retires the "click an edge" hint.
      if (idx !== null) setMissHint(false);
    };

    const clearHover = (): void => {
      setHoveredEdge(null);
      setHoverPx(null);
      updateHoveredEdge(map, vertices, null);
    };

    const onClick = (e: any): void => {
      const local = toLocal(e.lngLat);
      if (stepRef.current === 'trace') {
        // Close if near first vertex (with >= 3 already placed)
        if (vertices.length >= 3 && distanceToFirstVertex(local, vertices[0]) <= CLOSE_TOLERANCE_M) {
          finishTrace();
          return;
        }
        const anchor = vertices[vertices.length - 1] ?? null;
        const snap = snapPoint(local, anchor, lastBearing, snapMode);
        const nextRing = [...vertices, snap.point];
        setVertices(nextRing);
        setLastBearing(anchor ? snap.azimuth : null);
        setCursor(null);
        updateCaptureSources(map, { ring: nextRing, cursor: null, guides: [] });
      } else if (stepRef.current === 'frontage') {
        if (vertices.length >= 3) {
          // Precision pick: only the edge under the pointer (within the band).
          // A click on empty map must not silently grab some other edge - that
          // is exactly the guesswork the callouts exist to remove.
          const idx = nearestEdgeWithin(vertices, local, hoverToleranceM(e.point, local));
          if (idx === null) {
            setMissHint(true);
            return;
          }
          setMissHint(false);
          setFrontageEdge(idx);
          setFrontageConfirmed(true); // explicit user choice wins over the suggestion
        }
      }
    };

    const onDblClick = (): void => {
      if (stepRef.current === 'trace' && vertices.length >= 3) {
        finishTrace();
      }
    };

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
      }
    };

    map.on('mousemove', onMouseMove);
    map.on('click', onClick);
    map.on('dblclick', onDblClick);
    map.on('mouseout', clearHover);
    // Camera moves invalidate a pointer-relative hover (and its badge).
    map.on('movestart', clearHover);
    map.on('zoomstart', clearHover);
    window.addEventListener('keydown', onKey, true);

    // Leaving the picker step must never leave a highlighted edge behind.
    if (stepRef.current !== 'frontage') clearHover();

    return () => {
      map.off('mousemove', onMouseMove);
      map.off('click', onClick);
      map.off('dblclick', onDblClick);
      map.off('mouseout', clearHover);
      map.off('movestart', clearHover);
      map.off('zoomstart', clearHover);
      window.removeEventListener('keydown', onKey, true);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      setCaptureCursor(map, false);
      clearCaptureSources(map);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, origin, vertices, snapMode, lastBearing, guides]);

  /* ---------- render loop side effects ---------- */
  useEffect(() => {
    const map = getMap();
    if (!map || !open) return;
    // Guard the single render path: outside the TRACE step the live edge and
    // guides are always empty, whatever stale cursor/guides state remains.
    const tracing = step === 'trace';
    updateCaptureSources(map, {
      ring: vertices,
      cursor: tracing ? cursor : null,
      guides: tracing ? guides : [],
    });
  }, [open, step, vertices, cursor, guides, getMap]);

  /* ---------- Road telemetry + frontage suggestion ---------- */
  // Debounced (400 ms) /api/nearest-road fetch while the frontage step is
  // open. Honors AbortController; a failure degrades to manual selection and
  // never fabricates a bearing (Amendment 1).
  useEffect(() => {
    if (!open || step !== 'frontage' || !pin) return;
    const controller = new AbortController();
    setRoadLoading(true);
    setRoadError(null);
    const timer = setTimeout(() => {
      fetchNearestRoad(pin.lat, pin.lon, controller.signal)
        .then((resp) => {
          setRoad(resp);
          if (resp.warning) setRoadError(resp.warning);
        })
        .catch((e: unknown) => {
          if (controller.signal.aborted) return;
          setRoadError(e instanceof Error ? e.message : 'Road lookup unavailable.');
          setRoad(null);
        })
        .finally(() => {
          if (!controller.signal.aborted) setRoadLoading(false);
        });
    }, 400);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [open, step, pin]);

  // Map the road bearing onto the current ring; clear the suggestion when
  // the user picks a different edge (their choice wins over the heuristic).
  useEffect(() => {
    if (!open || step !== 'frontage') {
      const map = getMap();
      if (map) updateFrontageSuggestion(map, vertices, null);
      return;
    }
    if (frontageConfirmed) return;
    const bearing = road?.found ? (road.road?.bearing_degrees ?? null) : null;
    setSuggestion(bearing === null ? null : suggestFrontageEdge(vertices, bearing));
  }, [open, step, road, vertices, frontageConfirmed, getMap]);

  // Reflect the (confirmed or suggested) frontage on the map.
  useEffect(() => {
    if (!open || step !== 'frontage') return;
    const map = getMap();
    if (!map) return;
    const active = frontageConfirmed ? frontageEdge : (suggestion?.edgeIndex ?? frontageEdge);
    updateFrontageSuggestion(map, vertices, active);
  }, [open, step, vertices, suggestion, frontageEdge, frontageConfirmed, getMap]);

  /* ---------- trace helpers ---------- */
  const finishTrace = useCallback((): void => {
    if (vertices.length < 3) return;
    setHoveredEdge(null);
    const _m = getMap();
    if (_m) updateHoveredEdge(_m, vertices, null);
    // Drop the in-flight live edge immediately (a queued rAF frame would
    // otherwise repaint the dashed line after the ring closes).
    pendingCursorRef.current = null;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setCursor(null);
    setGuides([]);
    resetFrontageChoice();
    const map = getMap();
    if (map) updateCaptureSources(map, { ring: vertices, cursor: null, guides: [] });
    frameRing(vertices);
    onStepChange('frontage');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vertices, onStepChange, getMap]);

  const resetFrontageChoice = (): void => {
    setFrontageEdge(boundary?.frontageEdgeIndex ?? null);
    setFrontageConfirmed(false);
    setSuggestion(null);
    setMissHint(false);
  };

  const undoVertex = (): void => {
    setVertices((prev) => prev.slice(0, -1));
    setLastBearing(null);
  };

  const resetTrace = (): void => {
    setVertices([]);
    setLastBearing(null);
    setCursor(null);
    setGuides([]);
    resetFrontageChoice();
    const map = getMap();
    if (map) clearCaptureSources(map);
  };

  /* ---------- quick paths (same funnel on commit) ---------- */
  /** Quick paths jump straight to FRONTAGE: clear the trace-only state first. */
  const dropTraceCursor = (): void => {
    setHoveredEdge(null);
    const _hoverMap = getMap();
    if (_hoverMap) updateHoveredEdge(_hoverMap, [], null);
    pendingCursorRef.current = null;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setCursor(null);
    setGuides([]);
  };

  const applyRect = (): void => {
    const center: Vertex = { x: 0, y: 0 };
    const vs = rectangleVertices({ widthM: rectW, depthM: rectD, rotationDeg: rectRot }, center);
    setVertices(vs);
    dropTraceCursor();
    resetFrontageChoice();
    const map = getMap();
    if (map) updateCaptureSources(map, { ring: vs, cursor: null, guides: [] });
    frameRing(vs);
    onStepChange('frontage');
  };

  const applyPreset = (id: PresetId): void => {
    const vs = presetVertices(id, 20, { x: 0, y: 0 });
    setVertices(vs);
    dropTraceCursor();
    resetFrontageChoice();
    const map = getMap();
    if (map) updateCaptureSources(map, { ring: vs, cursor: null, guides: [] });
    frameRing(vs);
    onStepChange('frontage');
  };

  const handleImport = (): void => {
    setImportError(null);
    try {
      const parsed = parseBoundaryText(importText, origin);
      if (parsed.vertices.length < 3) throw new Error('Fewer than 3 vertices after parsing.');
      const vs = ensureCCW(parsed.vertices);
      setVertices(vs);
      setImportText('');
      resetFrontageChoice();
      const map = getMap();
      if (map) updateCaptureSources(map, { ring: vs, cursor: null, guides: [] });
      onStepChange('frontage');
    } catch (e: any) {
      setImportError(e?.message ?? 'Import failed.');
    }
  };

  /* ---------- commit (single funnel) ---------- */
  const live = useMemo(() => metricsFor(vertices), [vertices]);
  const liveRingCheck = useMemo(() => validateLiveRing(vertices, cursor), [vertices, cursor]);

  const commit = (): void => {
    try {
      // Validation happens inside the funnel; throws BoundaryError on invalid.
      buildPlotPolygonPayload({
        vertices,
        origin,
        source: inferSource(),
        frontageEdgeIndex: activeFrontage,
      });
      const committed: SharedBoundaryState = {
        vertices: ensureCCW(vertices),
        origin,
        source: inferSource(),
        frontageEdgeIndex: activeFrontage,
      };
      onCommit(committed);
    } catch (e) {
      if (e instanceof BoundaryError) setImportError(e.message);
    }
  };

  function inferSource(): SharedBoundaryState['source'] {
    if (boundary?.source === 'legacy') return 'legacy';
    if (vertices.length === 4 && rectW && rectD) return 'rectangle';
    return 'trace';
  }

  /* ---------- derived UI state ---------- */
  const stepIndex = ['locate', 'trace', 'frontage', 'review'].indexOf(step);
  const canClose = vertices.length >= 3;
  const liveValid = live.valid;
  const canCommit = liveValid;
  const liveEdgeInfo = useMemo(() => {
    if (step !== 'trace' || !cursor || vertices.length === 0) return null;
    const anchor = vertices[vertices.length - 1];
    const az = azimuthDeg(anchor, cursor);
    const len = Math.hypot(cursor.x - anchor.x, cursor.y - anchor.y);
    return { az, len, bearing: quadrantBearing(az) };
  }, [step, cursor, vertices]);

  /* ---------- per-edge callouts (frontage precision) ---------- */
  // Every edge carries its own length + quadrant bearing. The map caps at z18,
  // where a 12 m urban plot is only ~20 px wide - per-edge badges on the map
  // would overlap into noise, so the callouts live as a readable edge table in
  // the sheet, while the map shows a single badge that follows the pointer.
  const edgeRows = useMemo(() => edgeCallouts(vertices), [vertices]);

  /** Role tag for an edge: is it the suggestion, the pick, or plain geometry. */
  const edgeRole = (index: number): 'PICKED' | 'SUGGESTED' | null => {
    if (frontageConfirmed && frontageEdge === index) return 'PICKED';
    if (!frontageConfirmed && suggestion !== null && suggestion.edgeIndex === index) return 'SUGGESTED';
    return null;
  };

  /**
   * Frame the finished ring: the frontage picker needs the plot on screen at a
   * workable scale (the map itself caps at z18). Padding keeps the plot clear of
   * the sidebar, the results panel and this sheet.
   */
  const frameRing = useCallback(
    (ring: Vertex[]): void => {
      if (ring.length < 3) return;
      const map = getMap();
      if (!map) return;
      const pts = ring.map((v) => unprojectToLngLat(v, origin));
      const lngs = pts.map((p) => p.lon);
      const lats = pts.map((p) => p.lat);
      const box = map.getContainer();
      const w = box.clientWidth || 1;
      const h = box.clientHeight || 1;
      try {
        map.fitBounds(
          [
            [Math.min(...lngs), Math.min(...lats)],
            [Math.max(...lngs), Math.max(...lats)],
          ],
          {
            padding: {
              left: Math.min(380, w * 0.3),
              right: Math.min(400, w * 0.32),
              top: Math.min(120, h * 0.14),
              bottom: Math.min(320, h * 0.36),
            },
            maxZoom: SITE_PICK_MAX_ZOOM,
            duration: 450,
          }
        );
      } catch {
        // Non-fatal: a failed fit only means the user keeps their current view.
      }
    },
    [getMap, origin]
  );

  /** Pick an edge from the table (same single-source choice as a map click). */
  const pickEdge = (index: number): void => {
    setMissHint(false);
    setFrontageEdge(index);
    setFrontageConfirmed(true);
    const map = getMap();
    if (map) updateFrontageSuggestion(map, vertices, index);
  };

  if (!open) return null;

  /* ---------- render ---------- */
  return (
    <>
      {/* ESC hint while tracing */}
      {step === 'trace' && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none">
          <div className="vibrancy-pill px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-[12px] font-medium text-[var(--text-1)] border border-[var(--panel-border-color)]">
            <Icon name="crosshair" size={14} className="text-[var(--accent)] shrink-0" />
            <span>
              Click to add vertices · click first point or double-click to close · ESC to cancel
            </span>
          </div>
        </div>
      )}

      {/* Hovered-edge callout: one badge pinned to the pointer, readable at any zoom */}
      {step === 'frontage' && hoveredEdge !== null && hoverPx && edgeRows[hoveredEdge] && (
        <div
          style={{ left: hoverPx.x + 14, top: hoverPx.y - 12 }}
          className="absolute z-[900] pointer-events-none"
        >
          <span
            data-testid="frontage-hover-badge"
            className="inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ui-font-tabular border border-[var(--accent)] bg-[var(--accent)] text-white shadow-sm"
          >
            {edgeRows[hoveredEdge].label}
          </span>
        </div>
      )}

      {/* Stepped capture panel */}
      <div
        className="absolute bottom-12 sm:bottom-14 left-2 sm:left-3 lg:left-[364px] z-[1000] pointer-events-auto w-[320px] max-w-[calc(100vw-16px)] vibrancy-panel rounded-[16px] shadow-2xl border border-[var(--panel-border-color)] pb-[var(--safe-area-bottom)]"
        data-testid="capture-sheet"
      >
        {/* Step rail */}
        <div className="flex items-center gap-1 px-3.5 pt-3">
          {(['locate', 'trace', 'frontage', 'review'] as CaptureStep[]).map((s, i) => (
            <React.Fragment key={s}>
              <button
                type="button"
                onClick={() => i <= stepIndex && onStepChange(s)}
                className={`bw-touch-target w-6 h-6 rounded-full text-[11px] font-semibold flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                  i === stepIndex
                    ? 'bg-[var(--accent)] text-white'
                    : i < stepIndex
                      ? 'bg-[var(--accent-tint)] text-[var(--accent)]'
                      : 'bg-[var(--fill)] text-[var(--text-3)]'
                }`}
                aria-current={i === stepIndex ? 'step' : undefined}
                aria-label={`Step ${i + 1}: ${s}`}
              >
                {i + 1}
              </button>
              {i < 3 && <div className="flex-1 h-[1px] bg-[var(--hairline)]" />}
            </React.Fragment>
          ))}
        </div>

        <div className="px-3.5 py-3 space-y-3">
          {/* STEP 1 — LOCATE */}
          {step === 'locate' && (
            <>
              <div className="text-[13px] font-semibold text-[var(--text-1)]">Locate the site</div>
              <p className="text-[12px] text-[var(--text-2)] leading-snug">
                Click the map to move the pin, or use search. The boundary origin is the pin.
              </p>
              {pin && (
                <div className="text-[11px] ui-font-tabular text-[var(--text-2)]">
                  {pin.lat.toFixed(5)}, {pin.lon.toFixed(5)}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={onCancel}
                  className="text-[12px] font-medium px-3 py-1.5 min-h-[34px] rounded-[8px] text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--fill)] transition-colors active:scale-95 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => onStepChange('trace')}
                  className="text-[12px] font-semibold px-3.5 py-1.5 min-h-[34px] rounded-[8px] bg-[var(--accent)] text-white hover:brightness-105 active:scale-95 transition-colors shadow-sm cursor-pointer"
                >
                  Trace boundary
                </button>
              </div>
            </>
          )}

          {/* STEP 2 — TRACE */}
          {step === 'trace' && (
            <>
              <div className="flex items-center justify-between">
                <div className="text-[13px] font-semibold text-[var(--text-1)]">Trace the boundary</div>
                <div className="flex items-center rounded-[8px] bg-[var(--fill)] p-[2px]">
                  {(['FREE', 'ORTHOGONAL', 'PARALLEL'] as SnapMode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setSnapMode(m)}
                      className={`px-1.5 py-0.5 rounded-[6px] text-[10px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                        snapMode === m ? 'bg-[var(--segmented-active-bg)] text-[var(--segmented-active-label)] shadow-sm' : 'text-[var(--text-2)]'
                      }`}
                    >
                      {m === 'ORTHOGONAL' ? 'ORTHO' : m}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 text-[12px] ui-font-tabular text-[var(--text-2)]">
                <span>{vertices.length} vertices</span>
                <span>·</span>
                <span>{live.areaSqm.toFixed(1)} m²</span>
                <span>·</span>
                <span>{live.perimeterM.toFixed(1)} m</span>
              </div>
              {liveEdgeInfo && (
                <div className="text-[11px] ui-font-tabular text-[var(--accent)]">
                  Live edge: {liveEdgeInfo.len.toFixed(2)} m · {liveEdgeInfo.bearing}
                </div>
              )}
              {!liveRingCheck.valid && cursor && (
                <div className="text-[11px] text-[var(--semantic-red)]">{liveRingCheck.reason}</div>
              )}

              {/* Quick paths */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <input type="number" min={6} max={60} step={0.5} value={rectW} onChange={(e) => setRectW(Number(e.target.value) || 12)} className="w-14 h-7 rounded-[6px] bg-[var(--fill)] px-1.5 text-[11px] ui-font-tabular text-[var(--text-1)]" aria-label="Rectangle width (m)" />
                <span className="text-[var(--text-3)] text-[11px]">×</span>
                <input type="number" min={6} max={60} step={0.5} value={rectD} onChange={(e) => setRectD(Number(e.target.value) || 18)} className="w-14 h-7 rounded-[6px] bg-[var(--fill)] px-1.5 text-[11px] ui-font-tabular text-[var(--text-1)]" aria-label="Rectangle depth (m)" />
                <input type="number" min={0} max={359} step={1} value={rectRot} onChange={(e) => setRectRot(Number(e.target.value) || 0)} className="w-14 h-7 rounded-[6px] bg-[var(--fill)] px-1.5 text-[11px] ui-font-tabular text-[var(--text-1)]" aria-label="Rotation (degrees)" />
                <button type="button" onClick={applyRect} className="text-[11px] font-medium px-2 py-1 rounded-[6px] bg-[var(--accent-tint)] text-[var(--accent)]">Rect</button>
                {(['rect', 'l_shape', 'trapezoid', 'pentagon'] as PresetId[]).map((id) => (
                  <button key={id} type="button" onClick={() => applyPreset(id)} className="text-[11px] font-medium px-2 py-1 rounded-[6px] bg-[var(--fill)] text-[var(--text-1)] hover:bg-[var(--fill-hover)]">
                    {id === 'rect' ? 'R' : id === 'l_shape' ? 'L' : id === 'trapezoid' ? 'T' : 'P'}
                  </button>
                ))}
              </div>

              {/* Import */}
              <details className="text-[12px]">
                <summary className="cursor-pointer text-[var(--text-2)] select-none">Import GeoJSON / KML</summary>
                <textarea
                  rows={3}
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder='{"type":"Polygon",...} or <kml>...'
                  className="mt-1.5 w-full text-[11px] font-mono p-2 rounded-[6px] bg-[var(--fill)] border border-[var(--hairline)] text-[var(--text-1)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
                />
                {importError && <div className="text-[11px] text-[var(--semantic-red)] mt-1">{importError}</div>}
                <button type="button" onClick={handleImport} className="mt-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-[6px] bg-[var(--accent-tint)] text-[var(--accent)]">
                  Import
                </button>
              </details>

              <div className="flex justify-between items-center pt-1">
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={undoVertex}
                    disabled={vertices.length === 0}
                    className="text-[11px] font-medium px-2.5 py-1 min-h-[32px] rounded-[6px] bg-[var(--fill)] text-[var(--text-1)] hover:bg-[var(--fill-hover)] disabled:opacity-40 active:scale-95 transition-colors cursor-pointer disabled:cursor-not-allowed"
                  >
                    Undo
                  </button>
                  <button
                    type="button"
                    onClick={resetTrace}
                    className="text-[11px] font-medium px-2.5 py-1 min-h-[32px] rounded-[6px] bg-[var(--fill)] text-[var(--text-1)] hover:bg-[var(--fill-hover)] active:scale-95 transition-colors cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
                <button
                  type="button"
                  onClick={finishTrace}
                  disabled={!canClose}
                  className="text-[12px] font-semibold px-3.5 py-1.5 min-h-[32px] rounded-[8px] bg-[var(--accent)] text-white hover:brightness-105 active:scale-95 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm cursor-pointer"
                >
                  Close shape
                </button>
              </div>
            </>
          )}

          {/* STEP 3 - FRONTAGE */}
          {step === 'frontage' && (
            <>
              <div className="text-[13px] font-semibold text-[var(--text-1)]">Confirm the frontage</div>
              <p className="text-[12px] text-[var(--text-2)] leading-snug">
                Hover an edge to read its length and bearing, then click it. The amber
                edge is the Overpass suggestion.
              </p>
              {hoveredEdge !== null && edgeRows[hoveredEdge] && (
                <div
                  data-testid="frontage-hover-readout"
                  className="text-[11px] ui-font-tabular text-[var(--accent)] font-semibold"
                >
                  {edgeRows[hoveredEdge].label} · click to pick
                </div>
              )}

              {/* Every edge with its length + bearing: pick by measurement, not guesswork. */}
              {edgeRows.length >= 3 && (
                <div className="space-y-1" data-testid="frontage-edge-table">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)]">
                    Edges (length · bearing)
                  </div>
                  {edgeRows.map((row) => {
                    const role = edgeRole(row.index);
                    const isHovered = hoveredEdge === row.index;
                    return (
                      <button
                        key={`edge-row-${row.index}`}
                        type="button"
                        data-testid={`edge-row-${row.index}`}
                        aria-label={`Edge ${row.index + 1}: ${row.label.split(' · ').slice(1).join(', ')}`}
                        aria-pressed={role === 'PICKED'}
                        onClick={() => pickEdge(row.index)}
                        className={`w-full flex items-center justify-between gap-2 rounded-[8px] px-2 py-1 text-[11px] ui-font-tabular text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                          isHovered
                            ? 'bg-[var(--accent-tint)] text-[var(--accent)]'
                            : 'bg-[var(--fill)] text-[var(--text-2)] hover:bg-[var(--fill-hover)]'
                        }`}
                      >
                        <span className="font-semibold text-[var(--text-1)]">
                          P{row.index + 1}
                        </span>
                        <span className="flex-1 text-right">
                          {row.lengthM.toFixed(2)} m · {row.label.split(' · ')[2]}
                        </span>
                        {role && (
                          <span
                            className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold tracking-[0.06em] ${
                              role === 'PICKED'
                                ? 'bg-[var(--semantic-green)]/15 text-[var(--semantic-green)]'
                                : 'bg-[var(--semantic-amber)]/15 text-[var(--semantic-amber)]'
                            }`}
                          >
                            {role}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              {missHint && (
                <div
                  data-testid="frontage-miss-hint"
                  className="text-[11px] text-[var(--semantic-amber)]"
                >
                  Click directly on an edge - each label shows its length and bearing.
                </div>
              )}

              {/* Road telemetry status (ASSUMED until confirmed — never fabricated) */}
              {roadLoading && (
                <div className="flex items-center gap-2 text-[11px] text-[var(--text-3)]">
                  <span className="h-3 w-24 rounded-full bg-[var(--fill)] animate-pulse" />
                  <span>Looking for nearby roads…</span>
                </div>
              )}
              {!roadLoading && roadError && (
                <div className="text-[11px] text-[var(--semantic-amber)]">{roadError}</div>
              )}
              {!roadLoading && !roadError && road?.found && road.road && (
                <div className="text-[11px] ui-font-tabular text-[var(--text-2)]">
                  Nearest road: {road.road.road_name ?? road.road.highway_class ?? 'unnamed'}
                  {road.road.distance_meters !== null ? ` · ${road.road.distance_meters.toFixed(0)} m` : ''}
                  {road.road.bearing_degrees !== null ? ` · from ${road.road.approach_side}` : ''}
                  {road.cached ? ' · cached' : ''}
                </div>
              )}

              {(() => {
                if (frontageEdge === null && suggestion === null) return null;
                const idx = frontageEdge ?? suggestion!.edgeIndex;
                const info = edgeBearingLength(vertices, idx);
                const fromSuggestion = !frontageConfirmed && suggestion !== null && suggestion.edgeIndex === idx;
                return (
                  <div className="space-y-1">
                    <div className="text-[11px] ui-font-tabular text-[var(--text-2)]">
                      {`${info.lengthM.toFixed(2)} m · ${info.bearing}`}
                    </div>
                    {fromSuggestion ? (
                      <div className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold tracking-[0.06em] bg-[var(--semantic-amber)]/15 text-[var(--semantic-amber)]">ASSUMED</span>
                        <span className="text-[11px] text-[var(--text-2)]">Suggested from OSM road bearing</span>
                        <button
                          type="button"
                          onClick={() => {
                            setFrontageEdge(suggestion!.edgeIndex);
                            setFrontageConfirmed(true);
                          }}
                          className="text-[11px] font-semibold px-2 py-0.5 rounded-[6px] bg-[var(--accent-tint)] text-[var(--accent)]"
                        >
                          Accept
                        </button>
                      </div>
                    ) : frontageConfirmed && frontageEdge !== null ? (
                      <div className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold tracking-[0.06em] bg-[var(--semantic-green)]/15 text-[var(--semantic-green)]">VERIFIED</span>
                        <span className="text-[11px] text-[var(--text-2)]">Confirmed by you on the map</span>
                      </div>
                    ) : null}
                  </div>
                );
              })()}
              <div className="flex justify-between items-center pt-1">
                <button
                  type="button"
                  onClick={() => onStepChange('trace')}
                  className="text-[11px] font-medium px-2.5 py-1 min-h-[32px] rounded-[6px] bg-[var(--fill)] text-[var(--text-1)] hover:bg-[var(--fill-hover)] active:scale-95 transition-colors cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => onStepChange('review')}
                  disabled={frontageEdge === null && suggestion === null}
                  className="text-[12px] font-semibold px-3.5 py-1.5 min-h-[32px] rounded-[8px] bg-[var(--accent)] text-white hover:brightness-105 active:scale-95 transition-colors disabled:opacity-40 shadow-sm cursor-pointer disabled:cursor-not-allowed"
                >
                  Review
                </button>
              </div>
            </>
          )}

          {/* STEP 4 - REVIEW */}
          {step === 'review' && (
            <>
              <div className="text-[13px] font-semibold text-[var(--text-1)]">Review boundary</div>
              <div className="flex flex-wrap gap-1.5">
                <span className="px-2 py-0.5 rounded-full bg-[var(--fill)] text-[11px] ui-font-tabular text-[var(--text-1)]">{live.areaSqm.toFixed(1)} m²</span>
                <span className="px-2 py-0.5 rounded-full bg-[var(--fill)] text-[11px] ui-font-tabular text-[var(--text-1)]">{live.perimeterM.toFixed(1)} m</span>
                <span className="px-2 py-0.5 rounded-full bg-[var(--fill)] text-[11px] ui-font-tabular text-[var(--text-1)]">{live.vertexCount} vertices</span>
                <span className="px-2 py-0.5 rounded-full bg-[var(--accent-tint)] text-[11px] text-[var(--accent)]">{String(live.shapeType).replace('_', '-')}</span>
              </div>
              {activeFrontage !== null && (
                <div className="text-[11px] text-[var(--text-2)] ui-font-tabular">
                  Frontage: edge P{activeFrontage + 1}–P{(activeFrontage % vertices.length) + 1}
                  {!frontageConfirmed && suggestion !== null && suggestion.edgeIndex === activeFrontage ? ' (suggested)' : ''}
                </div>
              )}
              <div className="flex justify-between items-center pt-1">
                <button
                  type="button"
                  onClick={() => onStepChange('frontage')}
                  className="text-[11px] font-medium px-2.5 py-1 min-h-[32px] rounded-[6px] bg-[var(--fill)] text-[var(--text-1)] hover:bg-[var(--fill-hover)] active:scale-95 transition-colors cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={commit}
                  disabled={!canCommit}
                  className="text-[12px] font-semibold px-3.5 py-1.5 min-h-[34px] rounded-[8px] bg-[var(--accent)] text-white hover:brightness-105 active:scale-95 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm cursor-pointer"
                >
                  Use this boundary
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
};
