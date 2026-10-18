/**
 * interaction/geometry.ts — the engine's own units, and the one place they are
 * converted for a browser.
 *
 * Coordinates are the engine's LOCAL TANGENT PLANE, in metres (E/N) — the same
 * space the app's capture tool draws the plot ring in, so a captured ring can be
 * handed to the shipped client geometry (`services/siteBoundary`) with no
 * conversion and no re-implementation. That is the whole reason this module is
 * small: anything bigger would be a second geometry engine.
 *
 * North is +y in the plane and −y in SVG (SVG grows downward), so exactly one
 * function performs the flip and everything else calls it.
 *
 * PURE: no React, no DOM. The React-facing pieces live in `./hooks`.
 */
import type { Vertex } from '../../services/boundaryIO';

export interface ViewBox {
  /** Left edge in plane metres. */
  x: number;
  /** Top edge in SVG space (already negated plane y — see `toSvgY`). */
  svgY: number;
  w: number;
  h: number;
}

/** The single flip between the plane's north-up convention and SVG's y-down. */
export const toSvgY = (planeY: number): number => -planeY;

/**
 * A view box containing a ring with proportional margin, in the ring's own metre
 * units — so every stroke width and dash pattern is in metres too, and the
 * drawing scales as one object rather than as a set of independently-sized
 * strokes. It also means nothing here needs to know the pixel size of the box it
 * is drawn in.
 */
export function viewBoxFor(
  ring: ReadonlyArray<readonly [number, number]>,
  marginFraction = 0.14,
): ViewBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);
  const span = Math.max(w, h);
  const margin = span * marginFraction + span * 0.05;
  return { x: minX - margin, svgY: -(maxY + margin), w: w + margin * 2, h: h + margin * 2 };
}

/**
 * The same view box widened (or heightened) to a given width:height ratio, about
 * its own centre.
 *
 * A drawing sheet is not the shape of the thing on it. The plot's bounding box is
 * whatever the survey says it is — 1.24:1 for the captured irregular ring — and a
 * stage that took that ratio would be 1 040 px tall at a 1 200 px column, i.e.
 * taller than the viewport it is supposed to sit in. This pads the box instead of
 * cropping it, so the drawing keeps its scale and the sheet gets margins.
 *
 * It is the SINGLE place the padding is decided, because the box's aspect ratio is
 * also what `metresToPx` is derived from: if the stage's CSS ratio and this helper
 * disagreed by even a little, every extruded face would sit off its own plate.
 */
export function fitAspect(vb: ViewBox, aspect: number): ViewBox {
  if (!(aspect > 0) || !(vb.h > 0) || !(vb.w > 0)) return vb;
  const current = vb.w / vb.h;
  if (Math.abs(current - aspect) < 1e-6) return vb;
  if (current < aspect) {
    const w = vb.h * aspect;
    return { ...vb, x: vb.x - (w - vb.w) / 2, w };
  }
  const h = vb.w / aspect;
  return { ...vb, svgY: vb.svgY - (h - vb.h) / 2, h };
}

/** A closed path for a ring, in SVG space. */
export function ringPath(path: ReadonlyArray<readonly [number, number]>): string {
  if (path.length < 2) return '';
  const [first, ...rest] = path;
  return (
    `M ${first[0]} ${toSvgY(first[1])} ` +
    rest.map(([x, y]) => `L ${x} ${toSvgY(y)}`).join(' ') +
    ' Z'
  );
}

/** A clockwise rectangle path in plane metres — footprints, bays, shaft quads. */
export function rectPath(x: number, y: number, w: number, h: number): string {
  return ringPath([
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ]);
}

/**
 * Plane metres → CSS pixels inside a box of `boxWidth`.
 *
 * The box is given the SAME aspect ratio as the view box, so one scale factor is
 * exact on both axes and `preserveAspectRatio` never letterboxes. The `y` flip is
 * the one `toSvgY` performs.
 */
export function makePlaneToCss(vb: ViewBox, boxWidth: number) {
  const s = boxWidth / vb.w;
  return {
    scale: s,
    x: (planeX: number) => (planeX - vb.x) * s,
    y: (planeY: number) => (toSvgY(planeY) - vb.svgY) * s,
    length: (metres: number) => metres * s,
  };
}

/** A ring as the mutable vertices a drag owns. */
export const toVertices = (ring: ReadonlyArray<readonly [number, number]>): Vertex[] =>
  ring.map(([x, y]) => ({ x, y }));

/** Same ring, to a tolerance well below the engine's own precision. */
export const sameRing = (a: ReadonlyArray<Vertex>, b: ReadonlyArray<Vertex>): boolean =>
  a.length === b.length &&
  a.every((p, i) => Math.abs(p.x - b[i].x) < 1e-4 && Math.abs(p.y - b[i].y) < 1e-4);

/** How far outside its own survey frame a dragged corner may go, as a fraction. */
export const DRAG_SLACK = 0.02;

/**
 * The box the drawn ring must stay inside. Used to clamp a corner drag so the plot
 * cannot be pulled out of its own survey frame — a drawing constraint AND an
 * honest one: the engine's drawing covers the surveyed plot, and a marketing hero
 * must not invite the reader to draw a three-kilometre plot.
 */
export function dragBounds(vb: ViewBox, ring: ReadonlyArray<readonly [number, number]>) {
  const slack = Math.max(vb.w, vb.h) * DRAG_SLACK;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX: minX - slack, minY: minY - slack, maxX: maxX + slack, maxY: maxY + slack };
}

export type Bounds = ReturnType<typeof dragBounds>;

/** Nearest vertex to a plane point within `radiusM`, or -1. For hit-testing. */
export function nearestVertex(
  ring: ReadonlyArray<Vertex>,
  point: { x: number; y: number },
  radiusM: number,
): number {
  let best = -1;
  let bestDistance = radiusM;
  ring.forEach((vertex, index) => {
    const d = Math.hypot(vertex.x - point.x, vertex.y - point.y);
    if (d <= bestDistance) {
      bestDistance = d;
      best = index;
    }
  });
  return best;
}

/** Snap a plane value to a survey-friendly precision (metres). */
export const snapMetres = (value: number, precisionM = 0.05): number =>
  precisionM > 0 ? Math.round(value / precisionM) * precisionM : value;
