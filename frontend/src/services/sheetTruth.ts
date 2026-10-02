/**
 * sheetTruth.ts — sheet-truth helpers (viewer header + sheet parity).
 * ==========================================================================
 * The viewer header and the drawn sheets must carry the same provenance
 * markers so any plan can be traced back to the exact captured boundary:
 *   - confirmed frontage edge (index + source) from site-plan provenance,
 *   - a deterministic polygon hash over the canonical plot vertices.
 *
 * polygonHashShort must stay byte-identical with the backend implementation
 * drawing_ir._polygon_hash_short (djb2 over 2-decimal vertex strings);
 * a parity pin in backend/tests enforces this on the Python side and the
 * boundary pipeline pins the JS side.
 */

export interface PolygonLike {
  vertices?: Array<{ x: number; y: number } | [number, number]> | null;
}

/** Deterministic 8-hex djb2 hash of the canonical plot polygon (2-decimal verts). */
export function polygonHashShort(poly: PolygonLike | null | undefined): string {
  const verts = Array.isArray(poly?.vertices) ? poly!.vertices! : [];
  if (verts.length === 0) return '';
  let h = 5381;
  for (const v of verts) {
    const xs = Array.isArray(v) ? v[0] : v.x;
    const ys = Array.isArray(v) ? v[1] : v.y;
    for (const c of [Number(xs) || 0, Number(ys) || 0]) {
      // Python parity: f"{c:.2f}".encode('utf-8'), h = ((h*33)+byte) & 0xFFFFFFFF
      const s = c.toFixed(2);
      for (let i = 0; i < s.length; i++) {
        h = ((h * 33) + s.charCodeAt(i)) >>> 0;
      }
    }
  }
  return h.toString(16).padStart(8, '0');
}

/** Header chip text for the confirmed frontage edge (NA when not confirmed). */
export function frontageChipText(
  frontageEdgeIndex: number | null | undefined,
  frontageSource?: string | null,
): string {
  let txt = frontageEdgeIndex === null || frontageEdgeIndex === undefined ? 'NA' : String(frontageEdgeIndex);
  if (frontageSource) txt = `${txt} (${frontageSource})`;
  return `FRTG ${txt}`;
}

/** Header chip text for the polygon hash (NA when the plan has no polygon). */
export function polygonChipText(poly: PolygonLike | null | undefined): string {
  return `POLYHASH ${polygonHashShort(poly) || 'NA'}`;
}
