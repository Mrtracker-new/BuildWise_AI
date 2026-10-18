#!/usr/bin/env node
/**
 * extract_hero_massing.cjs — turn one RAW engine capture into the compact
 * geometry the landing hero extrudes, INCLUDING its real facade openings.
 *
 * WHY A GENERATOR, AGAIN. `extract_plot_samples.cjs` made the same argument for
 * the prototype: if a number is drawn on the landing it must be traceable to a
 * field the engine returned, and a generator makes that structural rather than a
 * promise. The hero needs a smaller payload than the prototype (one generation,
 * only what it draws), so it gets its own emitted module instead of a second
 * consumer of a 21 KB sample set.
 *
 * WHAT IS CARRIED, AND WHY EACH THING IS HERE
 *  · the surveyed ring, the buildable polygon and the setback band  — the site
 *  · per-floor envelopes and the stair's own floor-to-floor height     — the mass
 *  · `floors[].windows` (edge, span, sill)                              — the FACADE
 *  · exterior doors only (`from_room`/`to_room` == 'exterior')          — the entrance
 *  · `vertical_cores` and `duct_shafts`                                 — the roof furniture
 *
 * THE FACADE IS THE REASON THIS FILE EXISTS. The first 3D hero drew each storey
 * as four flat panels, and that is exactly what it looked like: four blocks. The
 * capture already contains the window schedule's PLACEMENT — `floors[i].windows`
 * gives a wall edge, a span along that wall and a sill height for every opening
 * the engine generated (2.4 m living-room windows, a 1.4 m balcony light, a small
 * frosted louvre). Drawing those openings, rather than a decorative mullion
 * pattern, is what makes the massing read as a building instead of a box — and
 * none of it is authored here.
 *
 * TWO CAPTURE FACTS WORTH KNOWING, NAMED RATHER THAN PAPERED OVER
 *  1. `windows[].width_m` and the window schedule's `width_mm` do not agree (2.40
 *     vs 2 540 mm for the living room). The opening's SPAN is therefore taken from
 *     its own `x1/x2` coordinates, which are the ones placed on the wall, and the
 *     scheduled width is not used.
 *  2. `windows[].sill_height_m` agrees with the schedule, but the array carries
 *     no opening HEIGHT. The height used here is the schedule's own most common
 *     lintel − sill (1 200 mm in this generation), applied to every opening; the
 *     one 600 mm louvre in the schedule is consequently drawn taller than it is
 *     scheduled. That is a drawing simplification, not a measurement, and it is
 *     the only facade dimension in this module that the capture does not state
 *     directly.
 *
 * Nothing here invents a wall, a floor or a window position. The roof furniture's
 * HEIGHTS (a stair head rising 2.4 m, 0.5 m duct stacks) are presentation choices
 * and live in the component, not in this file, so this module stays a verbatim
 * extract. `--check` fails if the emitted module no longer equals the capture.
 *
 * USAGE
 *   node scripts/extract_hero_massing.cjs            # write the module
 *   node scripts/extract_hero_massing.cjs --check    # fail if the module is stale
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const CAPTURES = path.join(ROOT, '..', 'backend', 'data', 'landing-captures');
const OUT = path.join(ROOT, 'src', 'landing', 'heroMassing.ts');

/** The generation the hero draws: the irregular cadastral plot. */
const INPUT = { name: 'generated-plan-irregular' };

const r3 = (v) => Math.round(v * 1000) / 1000;
const near = (a, b) => Math.abs(a - b) < 1e-6;

/** Fail loudly rather than draw an opening on the wrong wall. */
function assertOnWall(edge, w, env) {
  const onNorth = near(w.y1, 0) && near(w.y2, 0);
  const onSouth = near(w.y1, env.depth) && near(w.y2, env.depth);
  const onEast = near(w.x1, env.width) && near(w.x2, env.width);
  const onWest = near(w.x1, 0) && near(w.x2, 0);
  const ok = { north: onNorth, south: onSouth, east: onEast, west: onWest }[edge];
  if (!ok) {
    throw new Error(
      `${w.window_id || w.door_id}: wall_edge "${edge}" but its coordinates are not on that wall ` +
        `(${w.x1},${w.y1})→(${w.x2},${w.y2}) against a ${env.width}×${env.depth} envelope`,
    );
  }
}

/**
 * The opening's distance along its wall, measured from the face's own start
 * corner — the same corner order the component walks (`rectPath` is clockwise in
 * the plane: north, east, south, west), so `alongM` needs no further conversion.
 */
function alongFor(edge, w, env) {
  if (edge === 'north') return Math.min(w.x1, w.x2);
  if (edge === 'east') return Math.min(w.y1, w.y2);
  if (edge === 'south') return env.width - Math.max(w.x1, w.x2);
  return env.depth - Math.max(w.y1, w.y2); // west
}

/** The wall's length in plane metres, for the bounds check below. */
const wallLength = (edge, env) => (edge === 'north' || edge === 'south' ? env.width : env.depth);

/** The most common scheduled opening height, in metres. */
function typicalOpeningHeightM(schedule) {
  const counts = new Map();
  for (const s of schedule) {
    const h = (s.lintel_mm - s.sill_mm) / 1000;
    counts.set(h, (counts.get(h) || 0) + 1);
  }
  let best = 1.2;
  let bestCount = -1;
  for (const [h, n] of counts) {
    if (n > bestCount || (n === bestCount && h > best)) {
      best = h;
      bestCount = n;
    }
  }
  return r3(best);
}

function build() {
  const file = path.join(CAPTURES, `${INPUT.name}.full.json`);
  if (!fs.existsSync(file)) {
    throw new Error(
      `missing capture ${file}\nRun the committed engine capture first:\n` +
        '  cd backend && .venv-audit/Scripts/python.exe scripts/capture_landing_generation.py',
    );
  }
  const raw = fs.readFileSync(file);
  const json = JSON.parse(raw.toString('utf8'));
  const sp = json.site_plan;

  /** Deduplicate a closed ring: `[...]` plus the first point repeated. */
  const open = (ring) => {
    const pts = ring.map(([x, y]) => [r3(x), r3(y)]);
    if (pts.length > 1) {
      const [fx, fy] = pts[0];
      const [lx, ly] = pts[pts.length - 1];
      if (near(fx, lx) && near(fy, ly)) pts.pop();
    }
    return pts;
  };

  const floors = json.multi_storey.floors.map((floor) => {
    const env = {
      x: r3(floor.envelope.x),
      y: r3(floor.envelope.y),
      widthM: r3(floor.envelope.width),
      depthM: r3(floor.envelope.depth),
    };
    const head = typicalOpeningHeightM(floor.window_schedule);

    const windows = floor.windows.map((w) => {
      assertOnWall(w.wall_edge, w, { width: env.widthM, depth: env.depthM });
      const alongM = r3(alongFor(w.wall_edge, w, { width: env.widthM, depth: env.depthM }));
      const span = r3(Math.abs(w.x2 - w.x1) + Math.abs(w.y2 - w.y1));
      if (alongM < -1e-6 || alongM + span > wallLength(w.wall_edge, { width: env.widthM, depth: env.depthM }) + 1e-6) {
        throw new Error(`${w.window_id}: span ${span} m at ${alongM} m falls outside the ${w.wall_edge} wall`);
      }
      return {
        kind: 'window',
        id: w.window_id,
        edge: w.wall_edge[0].toUpperCase(),
        alongM,
        widthM: span,
        sillM: r3(w.sill_height_m),
        headM: r3(w.sill_height_m + head),
      };
    });

    /* EXTERIOR DOORS ONLY. Interior doors live inside the plan and would print on
       a facade that does not have one — their `wall_edge` is even spelled
       differently ('horizontal'/'vertical' for some of them), so the exterior
       filter is what makes this list meaningful rather than lucky. */
    const doors = floor.doors
      .filter((d) => d.from_room === 'exterior' || d.to_room === 'exterior')
      .map((d) => {
        const edge = d.wall_edge;
        if (!['north', 'east', 'south', 'west'].includes(edge)) {
          throw new Error(`${d.door_id}: exterior door on an unsupported wall "${edge}"`);
        }
        assertOnWall(edge, d, { width: env.widthM, depth: env.depthM });
        const alongM = r3(alongFor(edge, d, { width: env.widthM, depth: env.depthM }));
        return {
          kind: 'door',
          id: d.door_id,
          edge: edge[0].toUpperCase(),
          alongM,
          widthM: r3(Math.abs(d.x2 - d.x1) + Math.abs(d.y2 - d.y1)),
          /* The opening runs from the floor to the schedule's 2100 mm lintel. */
          sillM: 0,
          headM: r3((d.lintel_mm ?? 2100) / 1000),
        };
      });

    return {
      index: floor.floor_index,
      name: floor.floor_name,
      envelope: env,
      rooms: floor.rooms.length,
      openings: [...windows, ...doors].sort(
        (a, b) => a.edge.localeCompare(b.edge) || a.alongM - b.alongM,
      ),
    };
  });

  /* Shafts and ducts are stated RELATIVE TO THE ENVELOPE
     (`duct_x = max(0.5, env_w - duct_w - 0.3)` — see the engine), so they are
     moved into absolute plane metres here, once, rather than in the drawing. */
  const base = floors[0].envelope;
  const stair = json.multi_storey.vertical_cores[0];
  const stairHead = {
    id: stair.core_id,
    type: stair.core_type,
    x: r3(base.x + stair.x),
    y: r3(base.y + stair.y),
    widthM: r3(stair.width_m),
    depthM: r3(stair.depth_m),
  };

  const stacks = json.multi_storey.duct_shafts.map((d) => ({
    id: d.shaft_id,
    x: r3(base.x + d.x),
    y: r3(base.y + d.y),
    widthM: r3(d.width_m),
    depthM: r3(d.depth_m),
  }));

  return {
    generationId: json.generation_id,
    seed: String(json.seed),
    typology: json.params_snapshot?.building_typology ?? json.multi_storey.building_typology,
    storeys: json.multi_storey.total_storeys,
    floorHeightM: r3(json.multi_storey.floors[0].stair_geometry.floor_height_m),
    plot: {
      ring: open(sp.plot_polygon.vertices),
      areaSqm: r3(sp.plot_polygon.area_sqm),
      perimeterM: r3(sp.plot_polygon.perimeter_m),
    },
    buildable: {
      ring: open(sp.buildable_polygon_coords),
      areaSqm: r3(sp.buildable_area_sqm),
      setbackBandAreaSqm: r3(sp.setback_band_area_sqm),
    },
    footprint: {
      x: r3(sp.footprint.x),
      y: r3(sp.footprint.y),
      widthM: r3(sp.footprint.width_m),
      depthM: r3(sp.footprint.depth_m),
      areaSqm: r3(sp.footprint.area_sqm),
    },
    floors,
    stairHead,
    stacks,
    outdoor: (sp.outdoor_zones ?? []).map((o) => ({ id: o.fragment_id, ring: open(o.polygon_coords) })),
    figures: {
      plotCoveragePct: r3(json.metrics.plot_coverage_pct),
    },
    certificate: {
      isValid: Boolean(json.mathematical_certificate?.is_valid),
      pass: json.mathematical_certificate?.layer_statuses?.filter((l) => l.status === 'PASS').length ?? 0,
      warn: json.mathematical_certificate?.layer_statuses?.filter((l) => l.status === 'WARN').length ?? 0,
      na: json.mathematical_certificate?.layer_statuses?.filter((l) => l.status === 'N/A').length ?? 0,
      total: json.mathematical_certificate?.layer_statuses?.length ?? 0,
    },
    provenance: {
      capture: `backend/data/landing-captures/${INPUT.name}.full.json`,
      bytes: raw.length,
      sha256: crypto.createHash('sha256').update(raw).digest('hex'),
    },
  };
}

function emit(model) {
  const header = `/**
 * heroMassing.ts — the geometry the landing hero extrudes, and its facade openings.
 *
 * GENERATED FILE. Do not edit by hand:
 *   cd frontend && node scripts/extract_hero_massing.cjs
 * reads the raw capture written by the committed engine capture script
 * (\`../backend/scripts/capture_landing_generation.py\`) and rewrites this module.
 * \`--check\` fails if the module no longer equals that capture.
 *
 * Every number below is copied out of one real \`POST /api/generate-floorplan\`
 * response (\`generationId\` and \`provenance.sha256\` name it). Coordinates are the
 * engine's local tangent plane in metres (E/N) — the same space the app's capture
 * tool draws the plot ring in. \`floors[].openings\` are the engine's OWN window and
 * exterior-door placements (\`floors[].windows\`, \`floors[].doors\`): a wall edge, a
 * span along that wall and a sill height. Nothing here is an authored mesh,
 * texture or stock model.
 *
 * ONE DRAWING SIMPLIFICATION, DISCLOSED. The capture's window records carry no
 * opening HEIGHT, so \`headM\` is the sill plus the schedule's most common
 * lintel − sill (1.20 m). The schedule's one 600 mm louvre is therefore drawn
 * taller than it is scheduled, and is the only facade dimension here that the
 * capture does not state directly. See the generator's header for the second
 * capture inconsistency (scheduled widths vs placed spans — the placed span wins).
 *
 * These are CANDIDATE generations, not marketing figures: the certificate counts
 * are carried so the hero can print the verdict the engine actually returned.
 */
export type MassingEdge = 'N' | 'E' | 'S' | 'W';

export interface MassingOpening {
  kind: 'window' | 'door';
  id: string;
  edge: MassingEdge;
  /** Metres along the wall from the face's start corner (N → E → S → W, clockwise). */
  alongM: number;
  widthM: number;
  /** Height of the opening's sill above its own floor. */
  sillM: number;
  /** Height of the opening's head above its own floor. */
  headM: number;
}

export interface MassingStorey {
  index: number;
  name: string;
  envelope: { x: number; y: number; widthM: number; depthM: number };
  rooms: number;
  openings: ReadonlyArray<MassingOpening>;
}

export interface HeroMassing {
  generationId: string;
  seed: string;
  typology: string;
  storeys: number;
  floorHeightM: number;
  plot: { ring: ReadonlyArray<readonly [number, number]>; areaSqm: number; perimeterM: number };
  buildable: { ring: ReadonlyArray<readonly [number, number]>; areaSqm: number; setbackBandAreaSqm: number };
  footprint: { x: number; y: number; widthM: number; depthM: number; areaSqm: number };
  floors: ReadonlyArray<MassingStorey>;
  /** The captured stair core, in absolute plane metres. */
  stairHead: { id: string; type: string; x: number; y: number; widthM: number; depthM: number };
  stacks: ReadonlyArray<{ id: string; x: number; y: number; widthM: number; depthM: number }>;
  outdoor: ReadonlyArray<{ id: string; ring: ReadonlyArray<readonly [number, number]> }>;
  figures: { plotCoveragePct: number };
  certificate: { isValid: boolean; pass: number; warn: number; na: number; total: number };
  provenance: { capture: string; bytes: number; sha256: string };
}

/** The generation the hero draws — the irregular cadastral plot. */
export const HERO_MASSING: HeroMassing = `;

  return `${header}${JSON.stringify(model, null, 2)} as HeroMassing;\n`;
}

function main() {
  const model = build();
  const out = emit(model);
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (current !== out) {
      console.error('heroMassing.ts is STALE — re-run node scripts/extract_hero_massing.cjs');
      process.exit(1);
    }
    console.log('heroMassing.ts matches the capture');
    return;
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, out);
  const windows = model.floors.reduce((n, f) => n + f.openings.filter((o) => o.kind === 'window').length, 0);
  const doors = model.floors.reduce((n, f) => n + f.openings.filter((o) => o.kind === 'door').length, 0);
  console.log(
    `${model.generationId}  ${model.storeys} storeys @ ${model.floorHeightM} m  ` +
      `plot ${model.plot.areaSqm} m²  footprint ${model.footprint.widthM}×${model.footprint.depthM} m  ` +
      `${windows} windows / ${doors} exterior doors  sha ${model.provenance.sha256.slice(0, 12)}`,
  );
  console.log(`wrote ${path.relative(ROOT, OUT)} (${fs.statSync(OUT).size} bytes)`);
}

main();
