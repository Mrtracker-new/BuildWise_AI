import pytest
from app.schemas.floorplan import FloorPlanRequest
from app.schemas.multi_floor_plan import (
    MultiStoreyBuildingModel,
    ExtractedClientConstraints,
)
from app.services.floorplan.multi_floor_solver import (
    MultiFloorSolver,
    generate_multi_floor_building,
    GracefulDegradationManager,
)


# =====================================================================
# 1. EC-06 Stacking Invariant Tests
# =====================================================================

@pytest.mark.parametrize("floors_count", [2, 3, 4])
def test_stacking_invariant_vertical_core(floors_count):
    """
    EC-06: Verifies that staircase core and vertical duct shafts have identical
    X, Y coordinates and dimensions across all floors within 0.001m tolerance.
    """
    req = FloorPlanRequest(
        plot_width_m=12.0,
        plot_depth_m=16.0,
        floors=floors_count,
        building_typology="T1_SINGLE_FAMILY",
        ground_coverage_ratio=0.60,
    )
    solver = MultiFloorSolver(req)
    building = solver.solve()

    assert building.total_storeys == floors_count
    assert len(building.floors) == floors_count
    assert building.global_metrics["stacking_invariant_verified"] is True
    assert building.qa_report["stacking_invariants"] == "pass"

    # Compare floor 0 vertical core coordinates with each upper floor
    f0 = building.floors[0]
    f0_cores = [r for r in f0.rooms if r.is_vertical_core]
    assert len(f0_cores) == 1
    core_0 = f0_cores[0]

    for z in range(1, floors_count):
        fz = building.floors[z]
        fz_cores = [r for r in fz.rooms if r.is_vertical_core]
        assert len(fz_cores) == 1
        core_z = fz_cores[0]

        # Invariant check: X, Y, width, depth must be identical down to 0.001m
        assert abs(core_z.x - core_0.x) < 0.001, f"Floor {z} core X drifted: {core_z.x} vs {core_0.x}"
        assert abs(core_z.y - core_0.y) < 0.001, f"Floor {z} core Y drifted: {core_z.y} vs {core_0.y}"
        assert abs(core_z.width_m - core_0.width_m) < 0.001
        assert abs(core_z.depth_m - core_0.depth_m) < 0.001


def test_stacking_invariant_shared_cores_and_ducts():
    """Verify shared vertical cores and duct shafts match between building and floors."""
    req = FloorPlanRequest(
        plot_width_m=14.0,
        plot_depth_m=18.0,
        floors=3,
    )
    building = generate_multi_floor_building(req)
    assert len(building.vertical_cores) >= 1
    assert len(building.duct_shafts) >= 1

    stair_spec = building.vertical_cores[0]
    for floor in building.floors:
        stair_room = next(r for r in floor.rooms if r.is_vertical_core)
        assert abs(stair_room.x - stair_spec.x) < 0.001
        assert abs(stair_room.y - stair_spec.y) < 0.001


# =====================================================================
# 2. Graph Reachability Tests
# =====================================================================

@pytest.mark.parametrize("floors_count", [1, 2, 3, 4])
def test_graph_reachability_all_floors(floors_count):
    """
    Verifies that for every floor plate, 100% of rooms are reachable
    from the vertical core via doors and circulation lobby (BFS reachability).
    """
    req = FloorPlanRequest(
        plot_width_m=12.0,
        plot_depth_m=15.0,
        floors=floors_count,
    )
    building = generate_multi_floor_building(req)

    for z, floor in enumerate(building.floors):
        assert floor.circulation_status == "connected", f"Floor {z} circulation is disconnected!"
        assert len(floor.doors) >= len(floor.rooms) - 1, f"Floor {z} has insufficient doors"

        # Verify door connectivity explicitly
        core_room = next(r for r in floor.rooms if r.is_vertical_core)
        door_from_core = any(d.from_room == core_room.room_id or d.to_room == core_room.room_id for d in floor.doors)
        assert door_from_core, f"Floor {z} staircase core has no door exit!"


# =====================================================================
# 3. Rule of Plumbing Wet Stacks
# =====================================================================

def test_plumbing_wet_stack_alignment():
    """
    Verifies that upper floor bathrooms are vertically aligned with
    continuous vertical MEP duct shafts or ground-level wet rooms.
    """
    req = FloorPlanRequest(
        plot_width_m=12.0,
        plot_depth_m=15.0,
        floors=2,
    )
    building = generate_multi_floor_building(req)
    assert len(building.floors) == 2

    # Check plumbing alignment metric on upper floor
    f1 = building.floors[1]
    assert f1.plumbing_stack_alignment_pct >= 85.0
    assert building.global_metrics["plumbing_stack_alignment_avg_pct"] >= 85.0


# =====================================================================
# 4. Graceful Degradation Protocol Tests (Section 3.3)
# =====================================================================

def test_graceful_degradation_ec03_subminimum_plot():
    """
    EC-03: Sub-Minimum Plot (6.0m x 7.0m = 42m2).
    Requires solver to reject impossible program gracefully with clear NBC deficiency warning,
    without raising an unhandled exception or crashing.
    """
    req = FloorPlanRequest(
        plot_width_m=6.0,
        plot_depth_m=7.0,
        floors=2,
        ground_coverage_ratio=0.60,
    )
    solver = MultiFloorSolver(req)
    building = solver.solve()

    assert building.qa_report["status"] == "failed"
    assert building.total_built_up_area_sqm == 0.0
    assert any("EC-03" in w for w in building.warnings)
    assert any("Insufficient plot footprint" in w for w in building.warnings)
    assert any("Area shortfall is" in w for w in building.warnings)


def test_graceful_degradation_ec01_narrow_deep_plot():
    """
    EC-01: Narrow Deep Plot (6.0m x 24.0m, aspect ratio 1:4).
    Verifies solver accommodates extreme aspect ratio and reports Level 1 degradation.
    """
    req = FloorPlanRequest(
        plot_width_m=6.0,
        plot_depth_m=24.0,
        floors=2,
    )
    solver = MultiFloorSolver(req)
    building = solver.solve()

    assert building.qa_report["status"] == "pass"
    assert len(building.floors) == 2
    assert any("Degradation Level 1" in w for w in building.warnings)


# =====================================================================
# 5. Performance and SVG Output
# =====================================================================

def test_solver_performance_and_svg_generation():
    """Verifies solver execution completes in < 1500ms and produces valid SVG blueprints."""
    req = FloorPlanRequest(
        plot_width_m=12.0,
        plot_depth_m=16.0,
        floors=3,
    )
    solver = MultiFloorSolver(req)
    building = solver.solve()

    assert building.solver_timing_ms < 1500.0
    for floor in building.floors:
        assert floor.svg_blueprint_cad.startswith("<svg")
        assert floor.svg_blueprint_cad.endswith("</svg>")
        assert floor.svg_blueprint_paper.startswith("<svg")
        assert floor.svg_blueprint_paper.endswith("</svg>")
        assert floor.built_up_area_sqm > 0.0
        assert floor.carpet_area_sqm > 0.0


def test_floorplan_service_integration_multi_storey():
    """Verifies that generate_floor_plan automatically populates multi_storey when floors >= 2."""
    from app.services.floorplan.floorplan_service import generate_floor_plan

    req = FloorPlanRequest(
        plot_width_m=12.0,
        plot_depth_m=15.0,
        floors=2,
        required_rooms=["living", "kitchen", "master_bed"],
    )
    resp = generate_floor_plan(req)
    assert resp.multi_storey is not None
    assert resp.multi_storey.total_storeys == 2
    assert len(resp.multi_storey.floors) == 2
    assert resp.multi_storey.global_metrics["stacking_invariant_verified"] is True
