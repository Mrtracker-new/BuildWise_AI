#!/usr/bin/env node
/**
 * extract_plot_samples.cjs — turn the RAW engine captures into the small, typed
 * geometry module the landing preview draws from.
 *
 * WHY A GENERATOR RATHER THAN A HAND-WRITTEN MODULE
 * -------------------------------------------------
 * Every number the preview puts on screen has to be traceable to a field the
 * engine returned (T1). A generator makes that structural instead of a promise:
 * this file only ever copies fields out of
 * `backend/data/landing-captures/<name>.full.json`, records the capture's byte
 * size and sha256 in the emitted module, and can be re-run to prove the module
 * still equals the capture. A hand-typed module would drift the first time
 * anyone touched it.
 *
 * The raw captures are produced by the committed engine capture script
 * (`backend/scripts/capture_landing_generation.py`), which invokes the very
 * function `POST /api/generate-floorplan` calls, with `ai_provider="mock"` and a
 * numeric seed. Nothing here invents geometry, and nothing here is a mesh or a
 * texture: it is the engine's own survey ring, setback band, buildable polygon,
 * footprint, floor envelopes, shafts and zone polygons, in the engine's own
 * local tangent plane (metres, E/N), which is exactly the space the app's
 * capture tool draws in.
 *
 * WHAT IS DELIBERATELY NOT CARRIED
 * --------------------------------
 * The two SVG sheets (`svg_blueprint_paper`, `site_plan.svg_site_plan`) and the
 * full room/wall/door graph. They are the right artefact for the *dossier*
 * surfaces and the wrong one for a hero: 49 KB and 28 KB of print document that
 * reads as grey texture at hero scale. They stay in the raw capture; a consumer
 * that wants them (the sample gallery) can read the capture directly.
 *
 * USAGE
 *   node scripts/extract_plot_samples.cjs            # write the module
 *   node scripts/extract_plot_samples.cjs --check    # fail if the module is stale
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const CAPTURES = path.join(ROOT, '..', 'backend', 'data', 'landing-captures');
const OUT = path.join(ROOT, 'src', 'preview', 'plotSamples.ts');

/** The two REAL generations the preview draws. Both are engine captures. */
const INPUTS = [
  { name: 'generated-plan', id: 'residential-rect' },
  { name: 'generated-plan-irregular', id: 'residential-irregular' },
];

const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;

function statusCounts(layerStatuses) {
  const count = (s) => layerStatuses.filter((l) => l.status === s).length;
  return {
    pass: count('PASS'),
    warn: count('WARN'),
    fail: count('FAIL'),
    na: count('N/A'),
    total: layerStatuses.length,
  };
}

function build({ name, id }) {
  const file = path.join(CAPTURES, `${name}.full.json`);
  const raw = fs.readFileSync(file);
  const json = JSON.parse(raw.toString('utf8'));
  const sp = json.site_plan;
  const cert = json.mathematical_certificate;
  const layerStatuses = cert.layer_statuses.map((l) => ({
    id: l.layer_id,
    title: l.title,
    status: l.status,
    summary: l.summary,
  }));

  return {
    id,
    generationId: json.generation_id,
    seed: String(json.seed),
    typology: json.params_snapshot?.building_typology ?? json.multi_storey.building_typology,
    storeys: json.multi_storey.total_storeys,
    solverStatus: json.status,

    /** The surveyed ring, in the engine's local tangent plane (metres, E/N). */
    ring: sp.plot_polygon.vertices.map(([x, y]) => [r3(x), r3(y)]),
    shapeType: sp.plot_polygon.shape_type,
    isRegularRectangle: sp.plot_polygon.is_regular_rectangle,
    plotAreaSqm: r2(sp.plot_polygon.area_sqm),
    plotPerimeterM: r2(sp.plot_polygon.perimeter_m),

    /** P1..Pn as the engine numbers them, for the on-drawing vertex labels. */
    vertexTable: sp.vertex_table.map((v) => ({ id: v.id, x: r3(v.x_m), y: r3(v.y_m) })),

    /** Edge table with the engine's own quadrant bearings (N 90° 00' E). */
    edges: sp.edges.map((e) => ({
      index: e.edge_index,
      from: e.from_vertex,
      to: e.to_vertex,
      lengthM: r2(e.length_m),
      bearingDeg: r2(e.bearing_deg),
      bearingDms: e.bearing_dms,
    })),

    /** Statutory inset, per edge, as the engine resolved it. */
    setbacks: {
      frontM: r2(sp.setback_dimensions.front_m),
      rearM: r2(sp.setback_dimensions.rear_m),
      leftM: r2(sp.setback_dimensions.left_m),
      rightM: r2(sp.setback_dimensions.right_m),
      nominalM: r2(sp.setback_dimensions.nominal_m),
      reduced: Boolean(sp.reduced_setback_applied),
    },

    /** What the inset leaves buildable — the engine's polygon, not an offset. */
    buildable: {
      ring: sp.buildable_polygon_coords.map(([x, y]) => [r3(x), r3(y)]),
      areaSqm: r2(sp.buildable_area_sqm),
      setbackBandAreaSqm: r2(sp.setback_band_area_sqm),
    },

    footprint: {
      x: r3(sp.footprint.x),
      y: r3(sp.footprint.y),
      widthM: r2(sp.footprint.width_m),
      depthM: r2(sp.footprint.depth_m),
      areaSqm: r2(sp.footprint.area_sqm),
      rotationDeg: r2(sp.footprint.rotation_angle_deg),
      topology: sp.footprint.topology_type,
    },

    /** Per-storey plates: the envelope the engine actually extruded. */
    floors: json.multi_storey.floors.map((f) => ({
      index: f.floor_index,
      name: f.floor_name,
      envelope: {
        x: r3(f.envelope.x),
        y: r3(f.envelope.y),
        widthM: r2(f.envelope.width),
        depthM: r2(f.envelope.depth),
      },
      builtUpSqm: r2(f.built_up_area_sqm),
      vastuPct: f.vastu_score_pct,
      rooms: f.rooms.length,
      circulation: f.circulation_status,
    })),

    /**
     * The stair's own floor-to-floor height (3.00 m on both captures) — the
     * extrusion height for the storey plates. Taken from `stair_geometry`
     * because that is where the engine states it, and a headroom rule depends on
     * it; nothing here picks a value to make the drawing look right.
     */
    floorHeightM: r2(json.multi_storey.floors[0].stair_geometry.floor_height_m),

    /*
     * `structural_grid` IS DELIBERATELY NOT CARRIED.
     *
     * It holds `bay_spacing_{x,y}_m` plus `columns_{x,y}` — and the capture cannot
     * tell a reader which frame the column positions are in. For this generation
     * `columns_x = [0, 5.25, 10.5]` against a footprint at x = 1.5 and width 12, and
     * `columns_y = [0, 4.55, 9.1]` against a depth of 9.75: read as envelope-relative
     * they land inside the building, read as absolute they straddle the plot line.
     * The shafts settled their own question because their formula is visible in
     * engine.py (`env_w - duct_w - 0.3`); the grid has no such tell. A drawing that
     * cannot be checked is not worth its bytes, so the field is left in the raw
     * capture and named here as an open question for whoever draws it next.
     */

    /** Vertical circulation and wet shafts — the silhouette's real interruptions. */
    cores: json.multi_storey.vertical_cores.map((c) => ({
      id: c.core_id,
      type: c.core_type,
      x: r3(c.x),
      y: r3(c.y),
      widthM: r2(c.width_m),
      depthM: r2(c.depth_m),
    })),
    ducts: json.multi_storey.duct_shafts.map((d) => ({
      id: d.shaft_id,
      wet: d.shaft_type === 'plumbing_wet',
      x: r3(d.x),
      y: r3(d.y),
      widthM: r2(d.width_m),
      depthM: r2(d.depth_m),
    })),

    /** Everything the inset left outside the building line, as the engine saw it. */
    wedges: (sp.wedge_zones ?? []).map((w) => ({
      id: w.wedge_id,
      classification: w.classification,
      name: w.name,
      areaSqm: r2(w.area_sqm),
      ring: w.polygon_coords.map(([x, y]) => [r3(x), r3(y)]),
    })),
    outdoor: (sp.outdoor_zones ?? []).map((o) => ({
      id: o.fragment_id,
      name: o.name,
      areaSqm: r2(o.area_sqm),
      ring: o.polygon_coords.map(([x, y]) => [r3(x), r3(y)]),
    })),
    /**
     * Parking bays, in absolute plane metres — CARRIED, NOT DRAWN.
     *
     * The engine's own capture script records that in this generation the bay and
     * its drive aisle run across the building line (bay y 0.5–5.5 m against a
     * footprint starting at y 1.95 m), so drawing them here would put a car inside
     * the ground floor. They are kept in the module because they are real capture
     * output and a consumer that can place them correctly (the site plan view) will
     * want them; the preview's drawing leaves them out and says so.
     */
    bays: (sp.parking.bays ?? []).map((b) => ({
      id: b.bay_id,
      x: r3(b.x),
      y: r3(b.y),
      widthM: r2(b.width_m),
      lengthM: r2(b.length_m),
    })),

    /** The engine's own six-step derivation, verbatim — the reasoning on screen. */
    derivation: sp.derivation_chain.slice(),

    /** Rule verdicts. This sample is WARN, and the module says so. */
    certificate: {
      isValid: Boolean(cert.is_valid),
      layerStatuses,
      counts: statusCounts(layerStatuses),
    },

    metrics: {
      vastuPct: json.metrics.vastu_compliance_pct,
      plumbingAdjacency: json.metrics.plumbing_adjacency_score,
      spaceUtilizationPct: json.metrics.space_utilization_pct,
      plotCoveragePct: r2(json.metrics.plot_coverage_pct),
      totalBuiltUpSqm: r2(json.metrics.total_built_up_sqm),
      circulation: json.metrics.circulation_status,
    },

    provenance: {
      capture: `backend/data/landing-captures/${name}.full.json`,
      bytes: raw.length,
      sha256: crypto.createHash('sha256').update(raw).digest('hex'),
    },
  };
}

function emit(samples) {
  const header = `/**
 * plotSamples.ts — the REAL engine geometry the landing preview draws from.
 *
 * GENERATED FILE. Do not edit by hand: run
 *   cd frontend && node scripts/extract_plot_samples.cjs
 * which reads the raw captures produced by the committed engine capture script
 * (../backend/scripts/capture_landing_generation.py) and rewrites this module.
 *
 * Every field below is copied out of a real \`POST /api/generate-floorplan\`
 * response. Coordinates are in the engine's local tangent plane, in metres
 * (E/N), which is the same space the app's capture tool draws the plot ring in —
 * so the preview can hand them straight to the SHIPPED client geometry
 * (\`services/siteBoundary\`) with no conversion and no re-implementation.
 *
 * These are CANDIDATE generations, not marketing figures: each carries the
 * certificate verdict the engine actually returned, WARN layers included. If a
 * number appears on screen it is one of these, or it was computed by the same
 * module the app computes it with.
 */
export interface PlotEdge {
  index: number;
  from: string;
  to: string;
  lengthM: number;
  bearingDeg: number;
  bearingDms: string;
}

export interface PlotLayerStatus {
  id: string;
  title: string;
  status: 'PASS' | 'WARN' | 'FAIL' | 'N/A';
  summary: string;
}

export interface PlotSample {
  id: string;
  generationId: string;
  seed: string;
  typology: string;
  storeys: number;
  solverStatus: string;
  ring: ReadonlyArray<readonly [number, number]>;
  shapeType: string;
  isRegularRectangle: boolean;
  plotAreaSqm: number;
  plotPerimeterM: number;
  vertexTable: ReadonlyArray<{ id: string; x: number; y: number }>;
  edges: ReadonlyArray<PlotEdge>;
  setbacks: { frontM: number; rearM: number; leftM: number; rightM: number; nominalM: number; reduced: boolean };
  buildable: { ring: ReadonlyArray<readonly [number, number]>; areaSqm: number; setbackBandAreaSqm: number };
  footprint: { x: number; y: number; widthM: number; depthM: number; areaSqm: number; rotationDeg: number; topology: string };
  floors: ReadonlyArray<{
    index: number;
    name: string;
    envelope: { x: number; y: number; widthM: number; depthM: number };
    builtUpSqm: number;
    vastuPct: number;
    rooms: number;
    circulation: string;
  }>;
  floorHeightM: number;
  cores: ReadonlyArray<{ id: string; type: string; x: number; y: number; widthM: number; depthM: number }>;
  ducts: ReadonlyArray<{ id: string; wet: boolean; x: number; y: number; widthM: number; depthM: number }>;
  wedges: ReadonlyArray<{ id: string; classification: string; name: string; areaSqm: number; ring: ReadonlyArray<readonly [number, number]> }>;
  outdoor: ReadonlyArray<{ id: string; name: string; areaSqm: number; ring: ReadonlyArray<readonly [number, number]> }>;
  bays: ReadonlyArray<{ id: string; x: number; y: number; widthM: number; lengthM: number }>;
  derivation: ReadonlyArray<string>;
  certificate: { isValid: boolean; layerStatuses: ReadonlyArray<PlotLayerStatus>; counts: { pass: number; warn: number; fail: number; na: number; total: number } };
  metrics: {
    vastuPct: number;
    plumbingAdjacency: number;
    spaceUtilizationPct: number;
    plotCoveragePct: number;
    totalBuiltUpSqm: number;
    circulation: string;
  };
  provenance: { capture: string; bytes: number; sha256: string };
}

/**
 * The samples, in the order the preview offers them: the rectangle first —
 * it is the shape a reader recognises as "my plot" — then the six-vertex
 * irregular ring, which is what most cadastral plots actually are and which the
 * engine handles without a special case.
 */
export const PLOT_SAMPLES: ReadonlyArray<PlotSample> = `;

  return `${header}${JSON.stringify(samples, null, 2)} as unknown as ReadonlyArray<PlotSample>;\n`;
}

function main() {
  const check = process.argv.includes('--check');
  for (const input of INPUTS) {
    const file = path.join(CAPTURES, `${input.name}.full.json`);
    if (!fs.existsSync(file)) {
      console.error(
        `missing capture ${file}\n` +
          'Run the committed engine capture first:\n' +
          '  cd backend && .venv-audit/Scripts/python.exe scripts/capture_landing_generation.py',
      );
      process.exit(2);
    }
  }

  const samples = INPUTS.map(build);
  const out = emit(samples);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });

  if (check) {
    const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (current !== out) {
      console.error('plotSamples.ts is STALE — re-run node scripts/extract_plot_samples.cjs');
      process.exit(1);
    }
    console.log('plotSamples.ts matches the captures');
    return;
  }

  fs.writeFileSync(OUT, out);
  for (const s of samples) {
    console.log(
      `${s.id.padEnd(24)} ${s.generationId}  ring ${s.ring.length}V  ${
        s.plotAreaSqm
      } m²  buildable ${s.buildable.areaSqm} m²  cert ${s.certificate.counts.pass}P/${s.certificate.counts.warn}W/${
        s.certificate.counts.na
      }N/A  sha ${s.provenance.sha256.slice(0, 12)}`,
    );
  }
  console.log(`\nwrote ${path.relative(ROOT, OUT)} (${fs.statSync(OUT).size} bytes)`);
}

main();
