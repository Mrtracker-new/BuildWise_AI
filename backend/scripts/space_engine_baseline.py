#!/usr/bin/env python
"""space_engine_baseline.py - Phase A land-use baseline (READ-ONLY).

Measures the CURRENT blueprint engine on the golden matrix:
    T1-T4 x {1, 3} storeys x {rectangle 12x15, L-shape 14x14,
                              trapezoid 14x16, curvilinear 14x14+bay}

It changes no engine code. It calls the same public entry point the API uses
(``generate_floor_plan``), then measures the returned model with Shapely and the
ontology.

LAND-USE DEFINITIONS (pinned here for consistent comparison)
--------------------------------------------------------------------------
plot_area          canonical polygon area (shoelace, m2)
buildable_area     site_plan.buildable_area_sqm (after NBC setbacks)
footprint_area     ground-floor envelope area (m2)
gfa                sum of non-terrace room areas, all storeys (m2)
program_area       sum of public + private + industrial_bay room areas
service_area       sum of service room areas
circulation_area   sum of circulation room areas
terrace_area       sum of terrace room areas
eff_g_pct          (program_g + circulation_g) / buildable * 100   <- LAND USE
eff_total_pct      (program + circulation) / buildable * 100       <- GFA ratio
circ_ratio_pct     circulation / gfa * 100      (target band 12-20% res.)
waste_area         buildable - footprint - functional outdoor/wedge cover
waste_pct          waste_area / buildable * 100
sliver_count       anonymous regions >= 1.0 m2 with no functional label,
                   plus interior dead regions (footprint - rooms) >= 1.0 m2
below_minima       rooms whose clear area/width < ontology SpaceTypeSpec min
terrace_ratio_pct  terrace / gfa * 100
furniture_pass_pct rooms with a furniture set whose items all fit / rooms
                   with a furniture set * 100

Outputs:
    docs_ignore/space-engine/phase-a-baseline.json   full evidence
    docs_ignore/space-engine/phase-a-baseline.md     published table

Usage (from backend/):
    python scripts/space_engine_baseline.py
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from shapely.geometry import Polygon, box
from shapely.ops import unary_union

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.schemas.floorplan import FloorPlanRequest
from app.schemas.site_plan import PlotPolygonModel
from app.services.floorplan.floorplan_service import generate_floor_plan
from app.services.floorplan.identity import summarize_identities
from app.services.floorplan.ontology import ONTOLOGY

OUT_DIR = Path(__file__).resolve().parents[2] / "docs_ignore" / "space-engine"

# ---------------------------------------------------------------------------
# Golden plots
# ---------------------------------------------------------------------------
RECT = {
    "label": "rect 12x15",
    "plot_width_m": 12.0,
    "plot_depth_m": 15.0,
    "polygon": None,
}

L_SHAPE = {
    "label": "L-shape 14x14",
    "plot_width_m": 14.0,
    "plot_depth_m": 14.0,
    "polygon": {
        "vertices": [(0, 0), (14, 0), (14, 8), (8, 8), (8, 14), (0, 14)],
        "shape_type": "l_shape",
        "has_curved_edges": False,
    },
}

TRAPEZOID = {
    "label": "trapezoid 14x16",
    "plot_width_m": 14.0,
    "plot_depth_m": 16.0,
    "polygon": {
        "vertices": [(0, 0), (14, 0), (11, 16), (2, 16)],
        "shape_type": "trapezoid",
        "has_curved_edges": False,
    },
}

CURVILINEAR = {
    "label": "curvilinear 14x14+bay",
    "plot_width_m": 15.8,
    "plot_depth_m": 14.0,
    "polygon": {
        "vertices": [(0, 0), (14, 0), (15, 3), (15.8, 7), (15, 11), (14, 14), (0, 14)],
        "shape_type": "polygon",
        "has_curved_edges": True,
    },
}

SHAPES = [RECT, L_SHAPE, TRAPEZOID, CURVILINEAR]

TYPOLOGIES = [
    ("T1", "residential_single"),
    ("T2", "apartment"),
    ("T3", "commercial"),
    ("T4", "warehouse"),
]

# ---------------------------------------------------------------------------
# Room-id -> ontology id resolution (explicit; unmapped ids are reported, not
# silently guessed). This is deliberately a measurement-side map so Phase A
# does not change production code.
# ---------------------------------------------------------------------------
def ontology_id_for(room_id: str, typology: str) -> Optional[str]:
    rid = room_id
    # strip per-floor suffix
    if "_F" in rid:
        head, _, tail = rid.rpartition("_F")
        if tail.isdigit():
            rid = head

    direct = ONTOLOGY.get_space(rid)
    if direct is not None and direct.id == rid:
        return rid

    # T2 unit-scoped leaves: t2_unitA_bath -> unit_bath
    if rid.startswith("t2_unitA_") or rid.startswith("t2_unitB_"):
        unit_rid = "unit_" + rid.split("_", 2)[2]
        spec = ONTOLOGY.get_space(unit_rid)
        return spec.id if spec is not None and spec.id == unit_rid else None

    table = {
        # T1
        "core_staircase_primary": {"T1": "t1_stair", "T2": "shared_stair", "T3": "primary_stair", "T4": "ind_stair"},
        "lobby_spine": {"T1": "central_lobby", "T2": "floor_lobby", "T3": "spine_corridor", "T4": "admin_catwalk"},
        "guest_bed": {"T1": "bed_2"},
        "ensuite_bath": {"T1": "bath_master"},
        # T2
        "t2_amenity": {},
        # T3
        "t3_sanitary": {"T3": "sanitary_block"},
        "reception": {"T3": "reception_lobby"},
        "t3_suite_N": {"T3": "commercial_suite"},
        "t3_suite_E": {"T3": "commercial_suite"},
        "t3_suite_S": {"T3": "commercial_suite"},
        "t3_suite_W": {"T3": "commercial_suite"},
        # T4
        "t4_dock_bay": {"T4": "dock_bay"},
        "t4_dispatch": {"T4": "dispatch"},
        "t4_storage_bay": {"T4": "storage_bay"},
        "t4_admin_office": {"T4": "admin_office"},
        "t4_conf_room": {"T4": "conf_room"},
        "t4_catwalk": {"T4": "admin_catwalk"},
        "t4_deck": {},
    }
    mapped = table.get(rid, {}).get(typology)
    if mapped:
        return mapped
    # exact ontology name match (case-insensitive)
    for key, spec in ONTOLOGY.all_spaces.items():
        if rid == key:
            return key
    return None


def room_rect(r: Any) -> Polygon:
    return box(r.x, r.y, r.x + r.width_m, r.y + r.depth_m)


def safe_union(geoms: List[Polygon]) -> Polygon:
    geoms = [g for g in geoms if g is not None and not g.is_empty]
    if not geoms:
        return Polygon()
    return unary_union(geoms)


def poly_from_points(points: List[Tuple[float, float]]) -> Polygon:
    if not points:
        return Polygon()
    try:
        p = Polygon(points)
        return p if p.is_valid else Polygon()
    except Exception:
        return Polygon()


def measure(case: Dict[str, Any], response: Any) -> Dict[str, Any]:
    typ_key = case["typology_key"]
    ms = response.multi_storey
    site = response.site_plan
    floors = ms.floors if ms else []

    rooms = [r for f in floors for r in f.rooms]
    interior_rooms = [r for r in rooms if r.zone_category != "terrace"]

    program = [r for r in interior_rooms if r.zone_category in ("public", "private", "industrial_bay")]
    service = [r for r in interior_rooms if r.zone_category == "service"]
    circulation = [r for r in interior_rooms if r.zone_category == "circulation"]
    terraces = [r for r in rooms if r.zone_category == "terrace"]

    gfa = round(sum(r.area_sqm for r in interior_rooms), 2)
    program_area = round(sum(r.area_sqm for r in program), 2)
    service_area = round(sum(r.area_sqm for r in service), 2)
    circulation_area = round(sum(r.area_sqm for r in circulation), 2)
    terrace_area = round(sum(r.area_sqm for r in terraces), 2)

    ground_rooms = [r for r in floors[0].rooms if r.zone_category != "terrace"] if floors else []
    program_g = round(sum(r.area_sqm for r in ground_rooms if r.zone_category in ("public", "private", "industrial_bay")), 2)
    circ_g = round(sum(r.area_sqm for r in ground_rooms if r.zone_category == "circulation"), 2)

    buildable = float(site.buildable_area_sqm) if site else 0.0
    plot_area = float(site.plot_polygon.area_sqm) if site else 0.0
    footprint = float(site.footprint.area_sqm) if site else 0.0
    footprint_poly = Polygon()
    if site:
        fp = site.footprint
        if fp.wings:
            footprint_poly = safe_union([box(w.x, w.y, w.x + w.width_m, w.y + w.depth_m) for w in fp.wings])
        else:
            footprint_poly = box(fp.x, fp.y, fp.x + fp.width_m, fp.y + fp.depth_m)

    # --- Residual / waste accounting (geometric, disjoint) ------------------
    buildable_poly = poly_from_points(site.buildable_polygon_coords) if site else Polygon()
    residual = buildable_poly.difference(footprint_poly) if (buildable_poly.is_valid and footprint_poly.is_valid) else Polygon()

    wedge_polys = [poly_from_points(w.polygon_coords) for w in (site.wedge_zones if site else [])]
    wedge_polys = [p for p in wedge_polys if not p.is_empty]
    wedge_union = safe_union(wedge_polys)

    outdoor_pairs = [(poly_from_points(o.polygon_coords), o) for o in (site.outdoor_zones if site else [])]
    outdoor_pairs = [(p, o) for p, o in outdoor_pairs if not p.is_empty]
    named_outdoor_polys = [p for p, o in outdoor_pairs if not str(o.name).lower().startswith("setback buffer")]
    anonymous_outdoor_polys = [p for p, o in outdoor_pairs if str(o.name).lower().startswith("setback buffer")]
    functional_cover = safe_union([wedge_union] + named_outdoor_polys).intersection(residual)
    waste_poly = residual.difference(functional_cover)
    waste_area = round(waste_poly.area, 2)
    wedge_area = round(wedge_union.intersection(residual).area, 2)
    named_outdoor_area = round(safe_union(named_outdoor_polys).intersection(residual).area, 2)
    anonymous_outdoor_area = round(safe_union(anonymous_outdoor_polys).intersection(residual).area, 2)

    anonymous_slivers: List[Dict[str, Any]] = []
    for g in getattr(waste_poly, "geoms", [waste_poly]):
        if not g.is_empty and g.area >= 1.0:
            c = g.centroid
            anonymous_slivers.append({"kind": "outdoor_unlabelled", "area_sqm": round(g.area, 2),
                                      "centroid": [round(c.x, 2), round(c.y, 2)]})

    # Interior dead space: footprint minus every placed room rectangle.
    # NOTE: floor-plate partitioners emit LOCAL coordinates (origin 0,0) while
    # site_plan.footprint carries the setback-anchored origin. Translate rooms
    # into the footprint frame before measuring (this is measurement-side only;
    # the production coordinate-space split is itself a Phase A finding).
    off_x = float(site.footprint.x) if site else 0.0
    off_y = float(site.footprint.y) if site else 0.0
    room_union = safe_union([
        box(r.x + off_x, r.y + off_y, r.x + r.width_m + off_x, r.y + r.depth_m + off_y) for r in rooms
    ])
    interior_dead = footprint_poly.difference(room_union) if footprint_poly.is_valid else Polygon()
    interior_dead_area = round(interior_dead.area, 2)
    for g in getattr(interior_dead, "geoms", [interior_dead]):
        if not g.is_empty and g.area >= 1.0:
            c = g.centroid
            anonymous_slivers.append({"kind": "interior_unassigned", "area_sqm": round(g.area, 2),
                                      "centroid": [round(c.x, 2), round(c.y, 2)]})

    # --- Ontology minima ----------------------------------------------------
    below_minima = []
    unmapped_rooms = sorted({r.room_id for r in rooms if ontology_id_for(r.room_id, typ_key) is None})
    for r in interior_rooms:
        sid = ontology_id_for(r.room_id, typ_key)
        if sid is None:
            continue
        spec = ONTOLOGY.get_space(sid)
        if spec is None:
            continue
        min_w = min(r.width_m, r.depth_m)
        if r.area_sqm + 1e-6 < spec.min_area_sqm or min_w + 1e-6 < spec.min_width_m:
            below_minima.append({
                "room_id": r.room_id,
                "ontology_id": sid,
                "area_sqm": r.area_sqm,
                "min_area_sqm": spec.min_area_sqm,
                "min_width_m": spec.min_width_m,
                "clear_min_width_m": round(min_w, 2),
            })

    # --- Furniture / ventilation / gate ------------------------------------
    furnished = [r for r in interior_rooms if r.furniture]
    furniture_ok = [r for r in furnished if all(f.is_satisfied for f in r.furniture)]
    furniture_pass_pct = round(len(furniture_ok) / len(furnished) * 100.0, 1) if furnished else None

    gate = ms.validation_gate if ms else None
    layers = {l.get("layer_id"): l.get("status") for l in (gate or {}).get("layers", [])}
    vent = next((l for l in (gate or {}).get("layers", []) if l.get("layer_id") == "L9"), {})
    vent_records = (vent.get("details") or {}).get("records") or []
    vent_zero_miss = all(rec.get("status") == "pass" for rec in vent_records) if vent_records else None

    warnings = list(response.warnings or []) + list((ms.warnings if ms else []) or [])
    dedup_warnings = list(dict.fromkeys(warnings))
    identity_report = summarize_identities(rooms)

    return {
        "case_id": case["case_id"],
        "shape": case["shape"],
        "typology": typ_key,
        "typology_raw": case["typology_raw"],
        "floors": case["floors"],
        "status": response.status,
        "plot_area_sqm": plot_area,
        "buildable_area_sqm": buildable,
        "footprint_area_sqm": footprint,
        "gfa_sqm": gfa,
        "program_area_sqm": program_area,
        "service_area_sqm": service_area,
        "circulation_area_sqm": circulation_area,
        "terrace_area_sqm": terrace_area,
        "eff_g_pct": round((program_g + circ_g) / buildable * 100.0, 1) if buildable else 0.0,
        "eff_total_pct": round((program_area + circulation_area) / buildable * 100.0, 1) if buildable else 0.0,
        "circ_ratio_pct": round(circulation_area / gfa * 100.0, 1) if gfa else 0.0,
        "waste_area_sqm": waste_area,
        "waste_pct": round(waste_area / buildable * 100.0, 1) if buildable else 0.0,
        "wedge_area_sqm": wedge_area,
        "named_outdoor_area_sqm": named_outdoor_area,
        "anonymous_outdoor_area_sqm": anonymous_outdoor_area,
        "sliver_count": len(anonymous_slivers),
        "slivers": anonymous_slivers,
        "interior_dead_area_sqm": interior_dead_area,
        "below_minima_count": len(below_minima),
        "below_minima": below_minima,
        "unmapped_rooms": unmapped_rooms,
        "terrace_ratio_pct": round(terrace_area / gfa * 100.0, 1) if gfa else 0.0,
        "furniture_pass_pct": furniture_pass_pct,
        "vent_zero_miss": vent_zero_miss,
        "gate_status": (gate or {}).get("overall_status"),
        "gate_layers": layers,
        "room_count": len(rooms),
        "rooms": [{"room_id": r.room_id, "room_name": r.room_name, "zone_category": r.zone_category,
                   "area_sqm": r.area_sqm, "unit_id": r.unit_id} for r in rooms],
        "unmet_requirements": [u.model_dump() if hasattr(u, "model_dump") else dict(u) for u in (ms.unmet_requirements if ms else [])],
        "identity_coverage_pct": identity_report["coverage_pct"],
        "identity_fallback": identity_report["fallback"],
        "identity_shared_display_name_count": len(identity_report["shared_display_names"]),
        "warning_count": len(dedup_warnings),
        "warnings_sample": dedup_warnings[:8],
    }


def build_case_request(case: Dict[str, Any]) -> FloorPlanRequest:
    shape = case["shape_cfg"]
    kwargs: Dict[str, Any] = dict(
        plot_width_m=shape["plot_width_m"],
        plot_depth_m=shape["plot_depth_m"],
        building_typology=case["typology_raw"],
        floors=case["floors"],
        vastu_strictness="high",
        bypass_cache=True,
        ai_provider="mock",
        seed="42",
        program_aware_footprint=bool(os.environ.get("PROGRAM_AWARE")),
    )
    if shape["polygon"]:
        verts = shape["polygon"]["vertices"]
        xs = [p[0] for p in verts]
        ys = [p[1] for p in verts]
        kwargs["plot_polygon"] = PlotPolygonModel(
            vertices=verts,
            shape_type=shape["polygon"]["shape_type"],
            has_curved_edges=shape["polygon"]["has_curved_edges"],
            is_regular_rectangle=False,
            area_sqm=0.0,
            perimeter_m=0.0,
            bounding_box=(min(xs), min(ys), max(xs), max(ys)),
        )
    return FloorPlanRequest(**kwargs)


VOLATILE_KEYS = {
    "timing_ms",
    "solver_timing_ms",
    "duration_ms",
    "generated_at",
    "evaluated_at",
}


def _strip_volatile(value: Any) -> Any:
    """Recursively drop wall-clock fields; nested gate copies carry their own."""
    if isinstance(value, dict):
        return {k: _strip_volatile(v) for k, v in value.items() if k not in VOLATILE_KEYS}
    if isinstance(value, list):
        return [_strip_volatile(v) for v in value]
    return value


def canonical_response(response: Any) -> str:
    """Hashable geometry payload: timestamps and durations removed at any depth."""
    data = _strip_volatile(response.model_dump(mode="json"))
    return json.dumps(data, sort_keys=True, separators=(",", ":"))


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    results: List[Dict[str, Any]] = []
    determinism: Dict[str, Any] = {"checked": 0, "mismatches": []}

    for shape in SHAPES:
        for typ_key, typ_raw in TYPOLOGIES:
            for floors in (1, 3):
                case = {
                    "case_id": f"{typ_key}-{shape['label'].split()[0]}-F{floors}",
                    "shape": shape["label"],
                    "shape_cfg": shape,
                    "typology_key": typ_key,
                    "typology_raw": typ_raw,
                    "floors": floors,
                }
                req = build_case_request(case)
                try:
                    resp = generate_floor_plan(req)
                    row = measure(case, resp)
                except Exception as exc:  # measurement must surface failures, not hide them
                    row = {
                        "case_id": case["case_id"], "shape": case["shape"], "typology": typ_key,
                        "typology_raw": typ_raw, "floors": floors, "status": "CRASH",
                        "error": f"{type(exc).__name__}: {exc}",
                    }
                results.append(row)
                print(f"[{len(results):02d}] {row['case_id']:26s} {row.get('status'):8s} "
                      f"eff_g={row.get('eff_g_pct')}% waste={row.get('waste_pct')}% "
                      f"slivers={row.get('sliver_count')} minima={row.get('below_minima_count')}")

                # Determinism probe on one representative case per typology.
                if shape is RECT and floors == 1:
                    try:
                        second = generate_floor_plan(build_case_request(case))
                        determinism["checked"] += 1
                        if canonical_response(resp) != canonical_response(second):
                            determinism["mismatches"].append(case["case_id"])
                    except Exception as exc:
                        determinism["mismatches"].append(f"{case['case_id']}: {type(exc).__name__}: {exc}")

    program_aware = bool(os.environ.get("PROGRAM_AWARE"))
    suffix = "-program-aware" if program_aware else ""
    payload = {
        "phase": "A-program-aware" if program_aware else "A",
        "engine_entry": "app.services.floorplan.floorplan_service.generate_floor_plan",
        "definitions": {
            "eff_g_pct": "(ground program + ground circulation) / buildable * 100",
            "eff_total_pct": "(all-storey program + circulation) / buildable * 100",
            "circ_ratio_pct": "circulation / gfa * 100",
            "waste_pct": "unlabelled residual (buildable - footprint - wedges - named outdoor) / buildable",
            "sliver_count": "anonymous residual regions >= 1.0 m2 + interior dead regions >= 1.0 m2",
            "below_minima": "clear area/width below ontology SpaceTypeSpec minimum",
        },
        "determinism": determinism,
        "cases": results,
    }

    json_path = OUT_DIR / f"phase-a-baseline{suffix}.json"
    json_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    lines = [
        "# Phase A - Land-Use Baseline (current engine" + (
            ", programme-aware footprint" if program_aware else ""
        ) + ")",
        "",        "Generated by `backend/scripts/space_engine_baseline.py` (read-only harness)."
        + (" `PROGRAM_AWARE=1`: opt-in programme-sized footprint." if program_aware else ""),
        "Engine entry: `generate_floor_plan` -> `SoleGeometryEngine.solve_floorplan_response`.",
        "",
        "Definitions: `eff_g` = (ground program + ground circulation) / buildable; "
        "`eff_total` = all-storey program+circulation / buildable; `circ` = circulation / GFA; "
        "`waste` = buildable - footprint - labelled wedge/outdoor; "
        "`slivers` = anonymous residual regions >= 1.0 m2 + interior dead regions >= 1.0 m2.",
        "",
        "| Case | Status | Plot m2 | Buildable | Ftprnt | GFA | Program | Circ | eff_g % | eff_total % | circ % | waste % | slivers | <min | terrace % | furn % | L9 | gate |",
        "|:--|:--|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|:--|:--|",
    ]
    for r in results:
        if r.get("status") == "CRASH":
            lines.append(f"| {r['case_id']} | CRASH | - | - | - | - | - | - | - | - | - | - | - | - | - | - | {r.get('error','')} |")
            continue
        furn = "-" if r["furniture_pass_pct"] is None else f"{r['furniture_pass_pct']:.0f}"
        lines.append(
            f"| {r['case_id']} | {r['status']} | {r['plot_area_sqm']:.1f} | {r['buildable_area_sqm']:.1f} | "
            f"{r['footprint_area_sqm']:.1f} | {r['gfa_sqm']:.1f} | {r['program_area_sqm']:.1f} | "
            f"{r['circulation_area_sqm']:.1f} | {r['eff_g_pct']:.1f} | {r['eff_total_pct']:.1f} | "
            f"{r['circ_ratio_pct']:.1f} | {r['waste_pct']:.1f} | {r['sliver_count']} | "
            f"{r['below_minima_count']} | {r['terrace_ratio_pct']:.1f} | {furn} | "
            f"{r.get('gate_layers', {}).get('L9', '-')} | {r['gate_status']} |"
        )
    lines += [
        "",
        f"Determinism probes: {determinism['checked']} double-solves, "
        f"mismatches: {determinism['mismatches'] or 'none'}.",
    ]
    _covers = [r.get("identity_coverage_pct") for r in results if r.get("identity_coverage_pct") is not None]
    _fallbacks = sum(len(r.get("identity_fallback") or []) for r in results)
    _shared = sum(r.get("identity_shared_display_name_count", 0) or 0 for r in results)
    if _covers:
        lines.append(
            f"Identity coverage: {min(_covers):.1f}–{max(_covers):.1f}% across {len(results)} cases; "
            f"fallback identities: {_fallbacks}; repeated display names kept (not deduped): {_shared}."
        )
    lines.append("")
    md_path = OUT_DIR / f"phase-a-baseline{suffix}.md"
    (md_path).write_text("\n".join(lines), encoding="utf-8")

    print(f"\nWrote {json_path}")
    print(f"Wrote {md_path}")
    print(f"Determinism: {determinism}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
