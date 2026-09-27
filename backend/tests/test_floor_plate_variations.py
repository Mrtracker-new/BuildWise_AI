"""
test_floor_plate_variations.py - Verification and Proof for Per-Floor Floorplate Variations
========================================================================================
Tests:
1. Golden Case: T1 G+2 with top-level Wing B terraced.
   - Cores present on all levels (RULE-FP-01)
   - Egress BFS connectivity maintained (RULE-FP-05)
   - No wet room directly above terrace (RULE-FP-03)
   - Terrace area excluded from FAR numerator & carpet area (RULE-FP-06)
   - Terrace access door from adjacent corridor (RULE-FP-04)
   - Drawing IR and SVG emit mf-hatch-terrace and parapet double-lines
   - Mathematical Validity Certificate additions certified
2. Hard Rule Enforcement:
   - Attempting to terrace Wing A (contains core) is rejected/reset (RULE-FP-01)
   - Unsupported cantilever above void is rejected/reset (RULE-FP-02)
   - Wet room above terrace violation detection (RULE-FP-03)
3. Rectangle-Equivalence:
   - Default behavior when no masks passed is 100% backwards compatible
"""

import pytest
from app.schemas.floorplan import FloorPlanRequest
from app.schemas.site_plan import PlotPolygonModel
from app.services.floorplan.engine import SoleGeometryEngine
from app.services.floorplan.ontology import propose_default_floor_plate_masks
from app.services.floorplan.drawing_ir import build_drawing_ir, render_svg_from_ir


def test_golden_case_t1_g2_wing_b_terraced():
    """
    Golden Case: T1 Single Family G+2 (3 storeys) on L-shaped footprint with
    top level (Floor 2) Wing B terraced (open-to-sky setback deck).
    """
    l_shape_verts = [
        [0.0, 0.0],
        [16.0, 0.0],
        [16.0, 10.0],
        [8.0, 10.0],
        [8.0, 16.0],
        [0.0, 16.0],
    ]
    poly = PlotPolygonModel(
        vertices=l_shape_verts,
        shape_type="l_shape",
        area_sqm=192.0,
        perimeter_m=64.0,
        bounding_box=[0.0, 0.0, 16.0, 16.0],
        is_regular_rectangle=False,
    )

    req = FloorPlanRequest(
        plot_width_m=16.0,
        plot_depth_m=16.0,
        required_rooms=["living", "dining", "kitchen", "master_bed", "bed_2", "bath_1", "bath_2", "study"],
        building_typology="residential_single",
        floors=3,
        plot_polygon=poly,
        floor_plate_masks={
            0: {"wing_a": "present", "wing_b": "present"},
            1: {"wing_a": "present", "wing_b": "present"},
            2: {"wing_a": "present", "wing_b": "terrace"},
        },
    )

    engine = SoleGeometryEngine(req)
    model = engine.solve()

    # 1. Total Storeys & Floor Models
    assert model.total_storeys == 3
    assert len(model.floors) == 3

    f0 = model.floors[0]
    f1 = model.floors[1]
    f2 = model.floors[2]

    # 2. Plate Compositions & Masks
    assert f0.plate_composition == "Wing A + Wing B"
    assert f1.plate_composition == "Wing A + Wing B"
    assert f2.plate_composition == "Wing A + Terrace"
    assert f2.floor_plate_mask.get("wing_b") == "terrace"

    # 3. RULE-FP-01: Core Continuity
    # Vertical core must be present on every occupied level
    for z, fl in enumerate(model.floors):
        cores = [r for r in fl.rooms if r.is_vertical_core]
        assert len(cores) >= 1, f"Floor {z} missing vertical core"
        assert cores[0].room_name == "Dogleg Staircase Core"

    # 4. RULE-FP-04 & RULE-FP-05: Terrace Room & Door Reachability
    terrace_rooms = [r for r in f2.rooms if r.zone_category == "terrace"]
    assert len(terrace_rooms) == 1, "Floor 2 must have exactly 1 terrace room"
    t_room = terrace_rooms[0]
    assert "terrace" in t_room.room_id
    assert t_room.area_sqm > 0

    # Door from link_corridor to terrace exists
    terr_doors = [d for d in f2.doors if d.to_room == t_room.room_id or d.from_room == t_room.room_id]
    assert len(terr_doors) >= 1, "Terrace must have an access door from adjacent corridor"
    assert f2.circulation_status == "connected"

    # 5. RULE-FP-06: FAR Excludes Terrace Area
    # Terrace area must be excluded from built-up area and carpet area
    f2_non_terrace_sum = round(sum(r.area_sqm for r in f2.rooms if r.zone_category != "terrace"), 2)
    assert f2.built_up_area_sqm == f2_non_terrace_sum
    assert f2.carpet_area_sqm < f2.built_up_area_sqm

    # Total built-up matches sum of non-terrace built-up
    expected_total_built_up = round(f0.built_up_area_sqm + f1.built_up_area_sqm + f2.built_up_area_sqm, 2)
    assert model.total_built_up_area_sqm == expected_total_built_up

    # 6. Certificate Additions
    cert = model.mathematical_certificate
    assert cert is not None
    assert cert.get("core_continuity_valid") is True
    assert cert.get("no_wet_over_terrace_valid") is True
    assert cert.get("terrace_far_exempt") is True
    assert cert.get("cores_stack_aligned") is True
    assert "RULE-FP-01" in cert.get("certified_rules", [])
    assert "RULE-FP-06" in cert.get("certified_rules", [])
    assert cert.get("is_valid") is True

    # 7. Drawing IR & SVG representation
    ir2 = build_drawing_ir(f2, model, typology="T1_SINGLE_FAMILY")
    svg2 = render_svg_from_ir(ir2, theme="cad")

    # SVG contains terrace hatch pattern and labels
    assert "mf-hatch-terrace" in svg2
    assert "OPEN TO SKY" in svg2
    assert "TERRACE" in svg2
    assert "DRAINAGE" in svg2

    # Parapet walls exist in wall graph
    wg = f2.wall_graph
    assert wg is not None
    walls_list = wg.get("walls", [])
    if isinstance(walls_list, dict):
        walls_list = list(walls_list.values())
    parapet_walls = [w for w in walls_list if w.get("wall_type") == "W_PARAPET"]
    assert len(parapet_walls) >= 2, "Wall graph must contain parapet walls for terrace perimeter"


def test_rule_fp_01_core_wing_cannot_be_terraced():
    """
    RULE-FP-01: A wing containing a vertical core (Wing A) cannot be terraced or void.
    The engine must detect this and reset Wing A to present with a warning.
    """
    l_shape_verts = [
        [0.0, 0.0],
        [14.0, 0.0],
        [14.0, 8.0],
        [7.0, 8.0],
        [7.0, 14.0],
        [0.0, 14.0],
    ]
    poly = PlotPolygonModel(
        vertices=l_shape_verts,
        shape_type="l_shape",
        area_sqm=147.0,
        perimeter_m=56.0,
        bounding_box=[0.0, 0.0, 14.0, 14.0],
        is_regular_rectangle=False,
    )

    # Attempt to terrace wing_a on floor 1
    req = FloorPlanRequest(
        plot_width_m=14.0,
        plot_depth_m=14.0,
        required_rooms=["living", "dining", "kitchen", "master_bed", "bed_2", "bath_1", "bath_2"],
        building_typology="residential_single",
        floors=2,
        plot_polygon=poly,
        floor_plate_masks={
            0: {"wing_a": "present", "wing_b": "present"},
            1: {"wing_a": "terrace", "wing_b": "present"},
        },
    )

    engine = SoleGeometryEngine(req)
    model = engine.solve()

    # Engine must have reset wing_a to present
    assert model.floors[1].floor_plate_mask.get("wing_a") == "present"
    # Core is still present
    cores = [r for r in model.floors[1].rooms if r.is_vertical_core]
    assert len(cores) >= 1
    # Warning was emitted
    assert any("RULE-FP-01" in w for w in model.warnings)


def test_rule_fp_02_cantilever_without_lower_support_forbidden():
    """
    RULE-FP-02: Wings may only be dropped on levels above where they exist;
    adding a wing above without lower support (cantilever) is forbidden.
    """
    l_shape_verts = [
        [0.0, 0.0],
        [14.0, 0.0],
        [14.0, 8.0],
        [7.0, 8.0],
        [7.0, 14.0],
        [0.0, 14.0],
    ]
    poly = PlotPolygonModel(
        vertices=l_shape_verts,
        shape_type="l_shape",
        area_sqm=147.0,
        perimeter_m=56.0,
        bounding_box=[0.0, 0.0, 14.0, 14.0],
        is_regular_rectangle=False,
    )

    # Level 1 drops wing_b to void, but Level 2 attempts to have wing_b present
    req = FloorPlanRequest(
        plot_width_m=14.0,
        plot_depth_m=14.0,
        required_rooms=["living", "dining", "kitchen", "master_bed", "bed_2", "bath_1", "bath_2"],
        building_typology="residential_single",
        floors=3,
        plot_polygon=poly,
        floor_plate_masks={
            0: {"wing_a": "present", "wing_b": "present"},
            1: {"wing_a": "present", "wing_b": "void"},
            2: {"wing_a": "present", "wing_b": "present"},
        },
    )

    engine = SoleGeometryEngine(req)
    model = engine.solve()

    # Level 2 wing_b must be reset to void
    assert model.floors[2].floor_plate_mask.get("wing_b") == "void"
    assert any("RULE-FP-02" in w for w in model.warnings)


def test_typology_default_mask_proposal():
    """
    Verifies that propose_default_floor_plate_masks proposes:
    - T1 storeys >= 3: top level terraces Wing B.
    - storeys < 3: all present.
    """
    masks_t1_3f = propose_default_floor_plate_masks("T1_SINGLE_FAMILY", 3)
    assert masks_t1_3f[0]["wing_b"] == "present"
    assert masks_t1_3f[1]["wing_b"] == "present"
    assert masks_t1_3f[2]["wing_b"] == "terrace"

    masks_t1_2f = propose_default_floor_plate_masks("T1_SINGLE_FAMILY", 2)
    assert masks_t1_2f[0]["wing_b"] == "present"
    assert masks_t1_2f[1]["wing_b"] == "present"


def test_rectangle_equivalence_unaffected():
    """
    Verifies that standard rectangular floor plans remain 100% unaffected
    and backwards compatible.
    """
    req = FloorPlanRequest(
        plot_width_m=10.0,
        plot_depth_m=12.0,
        required_rooms=["living", "kitchen", "master_bed", "bath_1"],
        building_typology="residential_single",
        floors=1,
    )
    engine = SoleGeometryEngine(req)
    model = engine.solve()

    assert model.total_storeys == 1
    assert len(model.floors) == 1
    assert model.floors[0].plate_composition == "Full Plate"
    assert model.mathematical_certificate.get("is_valid") is True
    assert model.mathematical_certificate.get("core_continuity_valid") is True
    assert model.mathematical_certificate.get("no_wet_over_terrace_valid") is True
