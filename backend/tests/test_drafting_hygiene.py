"""
test_drafting_hygiene.py - drafting hygiene consolidation
=================================================================
Executable pins for the drafting hygiene checklist:
  - m² everywhere on sheet labels (no raw "m2"/"sqm" strings)
  - door schedule levels use the L0/L1 ladder
  - ellipsized strings keep the ".." marker
  - room schedule == on-sheet labels (single naming source)
  - stepped dimension chains present on every solved floor
  - north arrow (compass) + scale bar on every sheet
  - title block carries GEN id, plot dims, storeys label
  - terrace drainage set complete: slope arrows, DRAIN, DP -> SO-01,
    OVERFLOW weir, RWP/DP legend lines (and absent on terrace-free plates)
  - ghost overlay clipped to real cores
  - sheet truth: freshness token carries confirmed frontage + polygon hash;
    the polygon hash matches the frontend sheetTruth algorithm exactly
    (fixed cross-language vector).
"""

import re

import pytest

from app.schemas.floorplan import FloorPlanRequest
from app.services.floorplan.engine import SoleGeometryEngine
from app.services.floorplan.drawing_ir import (
    build_drawing_ir,
    _ellipsize_str,
    _polygon_hash_short,
)


def _build(**kw):
    req = FloorPlanRequest(
        plot_width_m=20.0,
        plot_depth_m=18.0,
        floors=2,
        building_typology="T1_SINGLE_FAMILY",
        required_rooms=["living", "kitchen", "master_bed", "bath_1", "dining", "stairs"],
    )
    for k, v in kw.items():
        setattr(req, k, v)
    return SoleGeometryEngine(req).solve()


BASE = dict(plot_width_m=20.0, plot_depth_m=18.0, floors=2, building_typology="T1_SINGLE_FAMILY")


def _rendered_text(ir) -> str:
    from app.services.floorplan.drawing_ir import render_svg_from_ir
    svg = render_svg_from_ir(ir)
    return re.sub(r"<[^>]+>", " ", svg)


def test_m2_superscript_on_sheet_area_labels():
    """Area labels use the superscript form; no raw 'm2'/'sqm' leaks to sheets."""
    b = _build()
    for fl in b.floors:
        ir = build_drawing_ir(floor_data=fl, building_model=b, gen_id="GEN-T1-2F-42")
        txt = _rendered_text(ir)
        for m in re.finditer(r"\b(\d+(?:\.\d+)?)\s*(m2|sqm)\b", txt, flags=re.IGNORECASE):
            raise AssertionError(f"raw area unit leaked to sheet text: {m.group(0)!r}")
        assert txt.count("m²") >= 1, "expected superscript m² area labels on the sheet"


def test_door_schedule_levels_use_l0_l1_ladder():
    b = _build()
    for fl in b.floors:
        wg = fl.wall_graph or {}
        for d in wg.get("door_schedule", []):
            level = str(d.get("level", ""))
            assert level in ("L0", "L1"), f"door {d.get('tag')} level {level!r} off-ladder"


def test_ellipsize_contract():
    assert _ellipsize_str("abcdef", 4) == "ab.."
    assert _ellipsize_str("ab", 4) == "ab"
    assert _ellipsize_str("  abcdef  ", 5) == "abc.."


def test_room_schedule_matches_floor_rooms():
    """Single naming source: IR room schedule ids/names == solved floor rooms."""
    b = _build()
    fl = b.floors[0]
    ir = build_drawing_ir(floor_data=fl, building_model=b, gen_id="GEN-T1-2F-42")
    schedule_ids = {r.get("room_id") for r in ir.room_schedule}
    floor_ids = {r.room_id for r in fl.rooms}
    assert schedule_ids == floor_ids, "room schedule drifted from solved rooms"
    for r in ir.room_schedule:
        match = next(rr for rr in fl.rooms if rr.room_id == r.get("room_id"))
        assert r.get("room_name") == match.room_name


def test_dimension_chains_stepped_on_every_floor():
    b = _build()
    for fl in b.floors:
        wg = fl.wall_graph or {}
        levels = {c.get("level") for c in (wg.get("dim_chains_x", []) + wg.get("dim_chains_y", []))}
        assert "clear_rooms" in levels and "overall" in levels, f"F{fl.floor_index}: chains not stepped"


def test_compass_scale_bar_title_block_and_entrance_on_every_sheet():
    """North arrow, scale bar, title block and MAIN ENTRY pointer ride the
    VERIFIED annotation primitive of every floor sheet."""
    b = _build()
    for fl in b.floors:
        ir = build_drawing_ir(floor_data=fl, building_model=b, gen_id="GEN-T1-2F-42")
        annots = [p for p in ir.primitives if getattr(p, "compass", None) and getattr(p, "scale_bar", None)]
        assert annots, f"F{fl.floor_index}: no annotation primitive with compass+scale bar"
        annot = annots[0]
        assert annot.compass.get("x") is not None and annot.scale_bar.get("x") is not None
        tb = getattr(annot, "title_block", None) or {}
        assert tb, f"F{fl.floor_index}: title block missing"
        if fl.floor_index == 0:
            assert getattr(annot, "entrance_pointer", None), "ground sheet lacks MAIN ENTRY pointer"


def test_title_block_fields_in_svg():
    b = _build()
    ir = build_drawing_ir(floor_data=b.floors[0], building_model=b, gen_id="GEN-T1-2F-42")
    txt = _rendered_text(ir)
    assert "GEN-T1-2F-42" in txt
    assert "20.0" in txt and "18.0" in txt
    assert "G+1" in txt


def test_terrace_drainage_set_complete_and_floor_scoped():
    req = FloorPlanRequest(**BASE, terrace_bands={1: {"edge": "N", "depth_m": 2.5}})
    b = SoleGeometryEngine(req).solve()
    ir1 = build_drawing_ir(floor_data=b.floors[1], building_model=b, gen_id="GEN-T1-2F-42")
    texts1 = [p.text for p in ir1.primitives if getattr(p, "text", None)]
    assert "DRAIN" in texts1
    assert any(t.startswith("DP") and "SO-01" in t for t in texts1), "downpipe tag missing"
    assert any("OVERFLOW" in t for t in texts1), "overflow weir annotation missing"
    # Legend is composed at render time; the rendered sheet must teach every symbol.
    legend_blob = _rendered_text(ir1)
    assert "RWP" in legend_blob and "DRAIN" in legend_blob and "DP = downpipe" in legend_blob

    ir0 = build_drawing_ir(floor_data=b.floors[0], building_model=b, gen_id="GEN-T1-2F-42")
    texts0 = [p.text for p in ir0.primitives if getattr(p, "text", None)]
    assert "DRAIN" not in texts0 and not any("OVERFLOW" in t for t in texts0), \
        "drainage set leaked onto a terrace-free plate"


def test_ghost_overlay_clipped_to_real_cores():
    """Upper-floor ghost anchors mirror the ground floor's REAL cores 1:1."""
    b = _build()
    ir = build_drawing_ir(floor_data=b.floors[1], building_model=b, gen_id="GEN-T1-2F-42")
    ghosts = [p for p in ir.primitives if type(p).__name__ == "GhostPrimitive"]
    assert ghosts, "upper-floor sheet lacks the ghost core overlay"
    ground_cores = [(c.x, c.y, c.width_m, c.depth_m)
                    for c in b.floors[0].rooms if c.is_vertical_core]
    all_core_rects = [r for g in ghosts for r in g.core_rects]
    assert len(all_core_rects) == len(ground_cores), (
        f"ghost cores ({len(all_core_rects)}) != real cores ({len(ground_cores)})"
    )
    # Every ghost rect must be dimensionally identical to a real ground core
    # (clipped to real geometry - no invented ghost boxes).
    real_dims = sorted((round(w, 3), round(d, 3)) for _, _, w, d in ground_cores)
    ghost_dims = sorted((round(w, 3), round(d, 3)) for _, _, w, d in all_core_rects)
    assert ghost_dims == real_dims, f"ghost dims {ghost_dims} != real core dims {real_dims}"


def test_sheet_truth_freshness_frontage_and_polyhash():
    b = _build()
    ir = build_drawing_ir(floor_data=b.floors[0], building_model=b, gen_id="GEN-T1-2F-42")
    token = ir.header.freshness_token
    assert "FRTG" in token, "frontage marker missing from sheet header"
    expected_hash = _polygon_hash_short(b.plot_polygon)
    assert expected_hash and f"POLYHASH {expected_hash}" in token
    assert f"POLYHASH {expected_hash}" in token and "FRTG" in token
    # The token must reach the rendered sheet VERBATIM (never ellipsized away),
    # on every floor - this is the stale-guard trace back to the boundary.
    from app.services.floorplan.drawing_ir import render_svg_from_ir
    for fl in b.floors:
        _ir = build_drawing_ir(floor_data=fl, building_model=b, gen_id="GEN-T1-2F-42")
        svg = render_svg_from_ir(_ir)
        assert _ir.header.freshness_token in svg, (
            f"freshness token missing verbatim from floor {fl.floor_index} sheet"
        )


def test_polygon_hash_fixed_vector_cross_language():
    """Parity vector shared with frontend sheetTruth.polygonHashShort (pipeline pin)."""
    class _P:
        def __init__(self, verts):
            self.vertices = verts

    h = _polygon_hash_short(_P([(0.0, 0.0), (10.0, 0.0), (10.0, 8.0), (0.0, 8.0)]))
    assert h == "1674dc47", "hash algorithm drifted from the pinned cross-language vector"
    # 2-decimal rounding stability (the stale-guard property)
    h_noisy = _polygon_hash_short(_P([(0.001, 0.0), (9.999, 0.0), (10.001, 8.0), (0.0, 8.004)]))
    assert h_noisy == h
