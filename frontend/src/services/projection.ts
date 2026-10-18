/**
 * projection.ts — client mirror of backend/app/services/floorplan/site_geometry.py
 * ============================================================
 * Local tangent-plane projection: (lat, lon) -> (x=East m, y=North m)
 * relative to an origin, using equirectangular scaling with cos(lat).
 * Mirrors R_EARTH = 6_378_137.0 and the forward/inverse formulas exactly so
 * client-side capture and backend site math agree (round-trip < 0.05 m @ 2 km).
 */

const R_EARTH = 6378137.0;

export interface LocalOrigin {
  lat: number;
  lon: number;
}

/** Forward: WGS84 degrees -> local metric tangent plane (x East, y North). */
export function projectToLocal(lat: number, lon: number, origin: LocalOrigin): { x: number; y: number } {
  const latRad = (origin.lat * Math.PI) / 180;
  const x = ((lon - origin.lon) * Math.PI) / 180 * R_EARTH * Math.cos(latRad);
  const y = ((lat - origin.lat) * Math.PI) / 180 * R_EARTH;
  return { x: round3(x), y: round3(y) };
}

/** Inverse: local metric tangent plane -> WGS84 degrees. */
export function unprojectToLngLat(p: { x: number; y: number }, origin: LocalOrigin): { lat: number; lon: number } {
  const latRad = (origin.lat * Math.PI) / 180;
  const lat = origin.lat + (p.y / R_EARTH) * (180 / Math.PI);
  const lon = origin.lon + (p.x / (R_EARTH * Math.cos(latRad))) * (180 / Math.PI);
  return { lat: round7(lat), lon: round7(lon) };
}

/** Azimuth from North (0=N, 90=E), clockwise, in [0, 360). */
export function azimuthDeg(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const az = (Math.atan2(dx, dy) * 180) / Math.PI;
  return ((az % 360) + 360) % 360;
}

/** Quadrant bearing string, e.g. "N 23°30′ E". */
export function quadrantBearing(azimuthDegValue: number): string {
  const az = ((azimuthDegValue % 360) + 360) % 360;
  const dirs = ['N', 'E', 'S', 'W'];
  const idx = Math.floor(((az + 45) % 360) / 90);
  const rel = az - idx * 90;
  const from = dirs[idx];
  const to = dirs[(idx + 1) % 4];
  const degrees = Math.floor(rel);
  const minutes = Math.round((rel - degrees) * 60);
  if (minutes === 60) {
    // rollover, e.g. N 59°60′ E -> N 00°00′ E next quadrant
    const nextRel = 0;
    const nd = Math.floor(nextRel);
    return `${from} ${pad2(nd)}°${pad2(0)}′ ${to}`;
  }
  return `${from} ${pad2(degrees)}°${pad2(minutes)}′ ${to}`;
}

export function edgeLength(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}


export function formatBearing(azimuthDegValue: number): string {
  return quadrantBearing(azimuthDegValue);
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
function round7(v: number): number {
  return Math.round(v * 1e7) / 1e7;
}
function pad2(v: number): string {
  return v.toString().padStart(2, '0');
}
