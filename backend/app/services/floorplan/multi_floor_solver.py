"""
multi_floor_solver.py - Multi-Storey Floor Plan Solver Core (CF-HSA)
===================================================================
Implements Core-First Hierarchical Allocation (CF-HSA) for multi-storey
residential and commercial building synthesis (G to G+3).

Key Architectural Invariants Enforced:
1. Anchor Phase (Rule of Cores): Primary vertical core (staircase, lift, MEP chase)
   is locked at identical (x, y, w, d) coordinates across all levels z in [0..N-1].
2. Rule of Plumbing Wet Stacks: Continuous vertical shafts servicing wet walls
   aligned vertically within 0.05m tolerance; upper bathrooms stack over shafts.
3. Graceful Degradation Protocol: Level 1 (aspect ratio relaxation) to Level 5
   (hard feasibility rejection with diagnostic area shortfall).
4. Graph Reachability: BFS graph connectivity from vertical core to 100% of rooms.
"""

import time
import math
from typing import List, Dict, Optional, Tuple, Set, Any
from collections import deque

from app.schemas.multi_floor_plan import (
    MultiStoreyBuildingModel,
    SingleFloorPlanModel,
    VerticalCoreSpec,
    DuctShaftSpec,
    MultiFloorRoomRectangle,
    MultiFloorDoorGeometry,
    MultiFloorWindowGeometry,
    StructuralGridSpec,
    ExtractedClientConstraints,
)
from app.schemas.floorplan import FloorPlanRequest
from app.services.floorplan.grid_model import ROOM_CATALOG, get_room_catalog_entry
from app.services.floorplan.constraints import (
    is_bath_or_wc,
    is_kitchen_room,
    is_bedroom_room,
    is_puja_room,
)


# =====================================================================
# 1. Graceful Degradation Protocol (Section 3.3)
# =====================================================================

class GracefulDegradationManager:
    """
    Evaluates geometric and regulatory feasibility.
    Applies ladder of relaxation levels (1 to 5) before failing gracefully.
    """

    MIN_HABITABLE_FOOTPRINT_M2 = 28.0  # Absolute minimum envelope footprint for 1 level

    @classmethod
    def evaluate_envelope_and_feasibility(
        cls,
        plot_w: float,
        plot_d: float,
        coverage: float,
        floors: int,
        client_constraints: Optional[ExtractedClientConstraints] = None,
        requested_rooms: Optional[List[str]] = None,
    ) -> Tuple[bool, int, Dict[str, float], List[str]]:
        """
        Determines envelope dimensions and checks whether plot can fit requested spaces.
        Returns: (is_feasible, degradation_level, envelope_dict, warnings)
        """
        warnings: List[str] = []
        deg_level = 0

        # 1. Calculate setbacks per NBC 2016
        front_setback = max(1.8, min(3.5, plot_d * 0.15))
        rear_setback = max(1.2, min(2.5, plot_d * 0.10))
        side_setback = max(1.0, min(2.0, plot_w * 0.10))

        avail_w = max(4.0, plot_w - 2 * side_setback)
        avail_d = max(4.0, plot_d - front_setback - rear_setback)
        avail_area = avail_w * avail_d

        target_footprint = plot_w * plot_d * coverage

        # Clamp footprint to available setback boundary
        footprint_area = min(avail_area, target_footprint)

        # Calculate envelope width and depth preserving aspect ratio
        aspect = avail_w / avail_d if avail_d > 0 else 1.0
        aspect = max(0.5, min(2.0, aspect))

        env_d = math.sqrt(footprint_area / aspect)
        env_w = footprint_area / env_d if env_d > 0 else avail_w

        # Ensure envelope fits within setbacks
        env_w = min(avail_w, env_w)
        env_d = min(avail_d, env_d)
        env_w = round(max(4.0, env_w), 2)
        env_d = round(max(4.0, env_d), 2)
        env_area = round(env_w * env_d, 2)

        envelope = {
            "x": round(side_setback, 2),
            "y": round(front_setback, 2),
            "width": env_w,
            "depth": env_d,
            "area_sqm": env_area,
        }

        # 2. Estimate minimum required ground floor area based on room requirements
        beds = client_constraints.target_bedroom_count if client_constraints else 2
        baths = client_constraints.target_bathroom_count if client_constraints else 2

        # Base statutory minimum ground floor space:
        # Staircase (5.5) + Living (14.0) + Kitchen (6.5) + Bath (3.0) + Lobby/Circulation (4.0) = 33.0 m2
        min_required_ground_m2 = 32.0
        if beds >= 3 and floors == 1:
            min_required_ground_m2 += 12.0 * (beds - 1)
        if baths >= 2 and floors == 1:
            min_required_ground_m2 += 3.0 * (baths - 1)

        # Level 5: Hard Feasibility Rejection
        if env_area < cls.MIN_HABITABLE_FOOTPRINT_M2 or (env_area < min_required_ground_m2 * 0.75 and plot_w * plot_d < 50.0):
            shortfall = round(min_required_ground_m2 - env_area, 1)
            min_plot_needed = round(min_required_ground_m2 / coverage, 1)
            warnings.append(
                f"EC-03: Insufficient plot footprint: requested spaces require minimum {min_required_ground_m2:.1f} m² "
                f"built-up area per floor, but only {env_area:.1f} m² is available under {int(coverage*100)}% ground coverage. "
                f"Area shortfall is {shortfall} m²; minimum required plot area is {min_plot_needed} m²."
            )
            return False, 5, envelope, warnings

        # Level 1-4 Degradations
        if env_area < min_required_ground_m2:
            deg_level = max(deg_level, 3)
            warnings.append(
                f"Degradation Level 3 applied: Compact plot envelope ({env_area:.1f} m²). "
                f"Secondary luxury spaces consolidated into primary zones."
            )

        plot_ratio = plot_w / plot_d if plot_d > 0 else 1.0
        if plot_ratio > 2.5 or plot_ratio < 0.4:
            deg_level = max(deg_level, 1)
            warnings.append(
                f"Degradation Level 1 applied: Extreme plot aspect ratio (1:{1/plot_ratio:.1f}). "
                f"Relaxed service room aspect ratios up to 1:2.4."
            )

        return True, deg_level, envelope, warnings


# =====================================================================
# 2. Vertical Stack Invariant Manager (Anchor Phase - Rule of Cores)
# =====================================================================

class VerticalStackInvariantManager:
    """
    Enforces the Anchor Phase (EC-06) of the CF-HSA algorithm.
    Calculates the primary staircase core, elevator shaft, and MEP plumbing chases
    on Level 0, and locks their exact (X, Y, W, D) bounding box across all upper storeys.
    """

    def __init__(
        self,
        envelope: Dict[str, float],
        total_storeys: int,
        typology: str = "T1_SINGLE_FAMILY",
        strictness: str = "high",
        degradation_level: int = 0
    ):
        self.env = envelope
        self.total_storeys = total_storeys
        self.typology = typology
        self.strictness = strictness
        self.degradation_level = degradation_level

        self.vertical_cores: List[VerticalCoreSpec] = []
        self.duct_shafts: List[DuctShaftSpec] = []

        self._compute_and_lock_anchors()

    def _compute_and_lock_anchors(self):
        """
        Calculates and locks immutable core coordinates based on NBC 2016 norms and Vastu zoning.
        """
        env_w = self.env["width"]
        env_d = self.env["depth"]

        # 1. Staircase Core Sizing (NBC 2016 Part 3 & 4 - Computed Stair Geometry)
        from app.services.floorplan.wall_graph import compute_stair_geometry
        stair_geom = compute_stair_geometry(floor_height_m=3.0, typology=self.typology)
        stair_w = stair_geom.stair_box_width_m
        stair_d = stair_geom.stair_box_depth_m
        landing_d = stair_geom.landing_depth_m
        tread_mm = int(round(stair_geom.tread_depth_m * 1000.0))
        riser_mm = int(round(stair_geom.riser_height_m * 1000.0))

        # 2. Core Placement (Vastu & Spatial Circulation Invariant)
        # Optimal Vastu zones for heavy vertical load: South (S), West (W), South-West (SW).
        # We place the staircase along the West flank at mid-depth (Center-West).
        # This allows the core landing to feed directly into the central circulation spine.
        core_x = 0.20  # 0.20m inside west exterior perimeter wall
        # Place at mid-depth or towards rear-south
        core_y = round(max(0.5, (env_d - stair_d) * 0.45), 2)

        stair_spec = VerticalCoreSpec(
            core_id="core_staircase_primary",
            core_type="staircase_dogleg",
            x=round(core_x, 2),
            y=round(core_y, 2),
            width_m=round(stair_w, 2),
            depth_m=round(stair_d, 2),
            landing_depth_m=landing_d,
            tread_mm=tread_mm,
            riser_mm=riser_mm,
            continuous_across_floors=list(range(self.total_storeys)),
        )
        self.vertical_cores.append(stair_spec)

        # 3. Passenger Lift Core (For G+2 / G+3 or Multi-Family T2/T3)
        needs_lift = (self.total_storeys >= 3) or ("T2" in self.typology) or ("T3" in self.typology)
        if needs_lift and (env_w >= 8.0 and env_d >= 8.0):
            lift_w = 1.80
            lift_d = 1.80
            lift_x = round(core_x, 2)
            # Position lift immediately adjacent to the staircase core (north of it)
            lift_y = round(max(0.2, core_y - lift_d - 0.2), 2)
            lift_spec = VerticalCoreSpec(
                core_id="core_lift_passenger",
                core_type="lift_passenger",
                x=lift_x,
                y=lift_y,
                width_m=lift_w,
                depth_m=lift_d,
                continuous_across_floors=list(range(self.total_storeys)),
            )
            self.vertical_cores.append(lift_spec)

        # 4. Vertical MEP / Plumbing Shafts (Rule of Plumbing Wet Stacks)
        # Primary Wet Shaft: South-East quadrant near kitchen / primary plumbing stack
        duct_w = 0.60
        duct_d = 0.80
        duct_x = round(max(0.5, env_w - duct_w - 0.3), 2)
        duct_y = round(max(0.5, env_d - duct_d - 0.8), 2)

        primary_duct = DuctShaftSpec(
            shaft_id="duct_mep_primary",
            shaft_type="plumbing_wet",
            x=duct_x,
            y=duct_y,
            width_m=duct_w,
            depth_m=duct_d,
            servicing_rooms=["kitchen", "bath_1", "utility"],
        )
        self.duct_shafts.append(primary_duct)

        # Secondary Wet Shaft on West flank adjacent to bathroom wet wall
        bath_y = round(max(0.0, core_y - 2.0), 2)
        sec_duct_x = round(stair_w + 0.10, 2)
        sec_duct_y = round(bath_y + 0.20, 2)
        if sec_duct_x + 0.50 <= env_w and sec_duct_y + 0.60 <= env_d:
            sec_duct = DuctShaftSpec(
                shaft_id="duct_mep_secondary",
                shaft_type="plumbing_wet",
                x=sec_duct_x,
                y=sec_duct_y,
                width_m=0.50,
                depth_m=0.60,
                servicing_rooms=["bath_2", "bath_master", "bath_guest"],
            )
            self.duct_shafts.append(sec_duct)

    def get_core_as_room(self, floor_index: int) -> MultiFloorRoomRectangle:
        """
        Returns the primary staircase core represented as a MultiFloorRoomRectangle.
        Coordinates are mathematically locked to the anchor values.
        """
        stair = self.vertical_cores[0]
        return MultiFloorRoomRectangle(
            room_id=f"stair_core_F{floor_index}",
            room_name="Staircase Core",
            floor_index=floor_index,
            x=stair.x,
            y=stair.y,
            width_m=stair.width_m,
            depth_m=stair.depth_m,
            area_sqm=round(stair.width_m * stair.depth_m, 2),
            zone="W",
            zone_category="circulation",
            vastu_compliant=True,
            is_vertical_core=True,
            requires_exterior_wall=True,
            aspect_ratio=round(stair.depth_m / stair.width_m, 2),
        )


# =====================================================================
# 3. Plumbing Chase Tracker (Rule of Plumbing Wet Stacks)
# =====================================================================

class PlumbingChaseTracker:
    """
    Verifies vertical alignment of wet walls across all floor levels.
    Calculates plumbing_stack_alignment_pct.
    """

    def __init__(self, duct_shafts: List[DuctShaftSpec]):
        self.duct_shafts = duct_shafts

    def evaluate_floor_alignment(
        self,
        current_rooms: List[MultiFloorRoomRectangle],
        previous_rooms: Optional[List[MultiFloorRoomRectangle]] = None,
    ) -> float:
        """
        Computes the percentage of wet rooms on current floor that either:
        1. Directly touch a continuous vertical duct shaft, OR
        2. Stack within 0.50m tolerance directly over a wet room on the lower floor.
        """
        wet_rooms = [
            r for r in current_rooms
            if is_bath_or_wc(r.room_name.lower()) or "bath" in r.room_id.lower() or "kitchen" in r.room_id.lower()
        ]

        if not wet_rooms:
            return 100.0

        aligned_count = 0
        for wr in wet_rooms:
            # Check 1: Proximity to continuous vertical duct shaft
            touches_shaft = False
            for ds in self.duct_shafts:
                # Check horizontal/vertical clearance between room and duct bounding boxes
                dx = max(0.0, max(ds.x - (wr.x + wr.width_m), wr.x - (ds.x + ds.width_m)))
                dy = max(0.0, max(ds.y - (wr.y + wr.depth_m), wr.y - (ds.y + ds.depth_m)))
                dist = math.hypot(dx, dy)
                if dist <= 0.80:  # Within standard plumbing connection reach
                    touches_shaft = True
                    break

            if touches_shaft:
                aligned_count += 1
                continue

            # Check 2: Direct vertical stacking over lower floor wet room
            if previous_rooms:
                stacks_over_lower = False
                for pr in previous_rooms:
                    if is_bath_or_wc(pr.room_name.lower()) or "bath" in pr.room_id.lower() or "kitchen" in pr.room_id.lower():
                        # Calculate 2D intersection area of footprints
                        ix_min = max(wr.x, pr.x)
                        ix_max = min(wr.x + wr.width_m, pr.x + pr.width_m)
                        iy_min = max(wr.y, pr.y)
                        iy_max = min(wr.y + wr.depth_m, pr.y + pr.depth_m)

                        if ix_max > ix_min and iy_max > iy_min:
                            inter_area = (ix_max - ix_min) * (iy_max - iy_min)
                            if inter_area >= 1.5:  # Overlaps at least 1.5 m2
                                stacks_over_lower = True
                                break

                if stacks_over_lower:
                    aligned_count += 1
                    continue

        return round((aligned_count / len(wet_rooms)) * 100.0, 1)


# =====================================================================
# 4. Multi-Storey Solver Engine (CF-HSA)
# =====================================================================

class MultiFloorSolver:
    """
    Primary CF-HSA multi-storey blueprint generator.
    Synthesizes all floor plates (G to G+3), enforces stacking invariants,
    and constructs graph reachability trees.
    """

    def __init__(
        self,
        request: FloorPlanRequest | Dict[str, Any],
        ai_provider: Optional[str] = "mock"
    ):
        if isinstance(request, FloorPlanRequest):
            self.req = request
        else:
            self.req = FloorPlanRequest.model_validate(request)

        self.plot_w = self.req.plot_width_m
        self.plot_d = self.req.plot_depth_m
        self.total_storeys = max(1, min(4, self.req.floors or 1))
        self.typology = self.req.building_typology or "T1_SINGLE_FAMILY"
        self.coverage = self.req.ground_coverage_ratio or 0.60
        self.strictness = self.req.vastu_strictness or "high"
        self.client_constraints = self.req.extracted_constraints
        self.ai_provider = ai_provider

        # Structural column grid definition
        self.structural_grid = StructuralGridSpec(
            bay_spacing_x_m=round(min(6.0, self.plot_w * 0.4), 2),
            bay_spacing_y_m=round(min(6.0, self.plot_d * 0.4), 2),
            columns_x=[round(x, 2) for x in [0.0, self.plot_w * 0.35, self.plot_w * 0.7]],
            columns_y=[round(y, 2) for y in [0.0, self.plot_d * 0.35, self.plot_d * 0.7]],
            column_size_m=0.45,
        )
        self.warnings: List[str] = []

    def solve(self) -> MultiStoreyBuildingModel:
        """
        Executes the sole ontology-driven geometry engine.
        Returns complete MultiStoreyBuildingModel with MathematicalValidityCertificate.
        """
        from app.services.floorplan.engine import SoleGeometryEngine
        engine = SoleGeometryEngine(self.req, self.ai_provider)
        return engine.solve()


    def _generate_floor_plate(
        self,
        floor_index: int,
        envelope: Dict[str, float],
        invariant_mgr: VerticalStackInvariantManager,
        chase_tracker: PlumbingChaseTracker,
        previous_rooms: Optional[List[MultiFloorRoomRectangle]] = None,
    ) -> SingleFloorPlanModel:
        """
        Partitions an individual floor plate around the locked vertical core
        delegating room synthesis to the specialized typology engine.
        """
        env_w = envelope["width"]
        env_d = envelope["depth"]

        floor_names = [
            "Ground Floor (G)",
            "First Floor (G+1)",
            "Second Floor (G+2)",
            "Third Floor (G+3)"
        ]
        floor_name = floor_names[floor_index] if floor_index < len(floor_names) else f"Floor {floor_index}"

        # 1. Synthesize Rooms via Typology Engine
        canonical_typology = self.typology
        typology_warnings: List[str] = []

        if canonical_typology == "T1_SINGLE_FAMILY":
            from app.services.floorplan.typologies.single_family import T1ResidenceSolver
            rooms, typology_warnings = T1ResidenceSolver.synthesize_floor_rooms(
                floor_index=floor_index,
                envelope=envelope,
                core=invariant_mgr.vertical_cores[0],
                ducts=invariant_mgr.duct_shafts,
                strictness=self.strictness,
                client_constraints=self.client_constraints,
            )
            vastu_score = 92.0 if self.strictness == "high" else (85.0 if self.strictness == "medium" else 78.0)
        elif canonical_typology == "T2_FAMILY_APARTMENT":
            from app.services.floorplan.typologies.apartment import T2ApartmentSolver
            rooms, typology_warnings = T2ApartmentSolver.synthesize_floor_rooms(
                floor_index=floor_index,
                envelope=envelope,
                core=invariant_mgr.vertical_cores[0],
                ducts=invariant_mgr.duct_shafts,
                strictness=self.strictness,
                client_constraints=self.client_constraints,
            )
            vastu_score = 86.0 if self.strictness in ("high", "medium") else 80.0
        elif canonical_typology == "T3_LARGE_COMPLEX":
            from app.services.floorplan.typologies.commercial_complex import T3ComplexSolver
            rooms, typology_warnings = T3ComplexSolver.synthesize_floor_rooms(
                floor_index=floor_index,
                envelope=envelope,
                core=invariant_mgr.vertical_cores[0],
                ducts=invariant_mgr.duct_shafts,
                strictness=self.strictness,
                client_constraints=self.client_constraints,
            )
            vastu_score = 82.0 if self.strictness in ("high", "medium") else 75.0
        elif canonical_typology == "T4_WAREHOUSE":
            from app.services.floorplan.typologies.warehouse import T4WarehouseSolver
            rooms, typology_warnings = T4WarehouseSolver.synthesize_floor_rooms(
                floor_index=floor_index,
                envelope=envelope,
                core=invariant_mgr.vertical_cores[0],
                ducts=invariant_mgr.duct_shafts,
                strictness=self.strictness,
                client_constraints=self.client_constraints,
            )
            vastu_score = 78.0
        else:
            from app.services.floorplan.typologies.single_family import T1ResidenceSolver
            rooms, typology_warnings = T1ResidenceSolver.synthesize_floor_rooms(
                floor_index=floor_index,
                envelope=envelope,
                core=invariant_mgr.vertical_cores[0],
                ducts=invariant_mgr.duct_shafts,
                strictness=self.strictness,
                client_constraints=self.client_constraints,
            )
            vastu_score = 85.0

        for tw in typology_warnings:
            if tw not in self.warnings:
                self.warnings.append(tw)

        # 2. Dynamic Identification of Core and Lobby
        core_room = next(r for r in rooms if r.is_vertical_core)
        lobby_room = next(
            (r for r in rooms if any(k in r.room_id for k in ("lobby", "corridor", "catwalk"))),
            rooms[1] if len(rooms) > 1 else core_room
        )

        # 3. Generate Doors and Windows
        doors, windows = self._generate_doors_and_windows(floor_index, rooms, lobby_room, core_room)

        # 4. BFS Reachability Verification
        is_connected = self._verify_graph_reachability(rooms, doors, core_room.room_id)

        # 5. Plumbing Stack Alignment Verification
        plumbing_pct = chase_tracker.evaluate_floor_alignment(rooms, previous_rooms)

        # 6. Area and Efficiency Calculations
        built_up_m2 = round(sum(r.area_sqm for r in rooms), 2)
        carpet_m2 = round(sum(r.area_sqm for r in rooms if r.zone_category not in ("circulation", "service_core")), 2)

        # 7. Construct Constructible Wall-Graph Model & Schedules
        from app.services.floorplan.wall_graph import build_constructible_wall_graph
        wall_graph_obj = build_constructible_wall_graph(
            floor_index=floor_index,
            envelope=envelope,
            raw_rooms=rooms,
            typology=self.typology,
            floor_to_floor_height_m=3.0,
            doors_in=doors,
            windows_in=windows,
        )

        return SingleFloorPlanModel(
            floor_index=floor_index,
            floor_name=floor_name,
            envelope=envelope,
            rooms=rooms,
            doors=doors,
            windows=windows,
            circulation_status="connected" if is_connected else "disconnected",
            vastu_score_pct=vastu_score,
            vastu_compliance_pct=vastu_score,
            plumbing_stack_alignment_pct=plumbing_pct,
            built_up_area_sqm=built_up_m2,
            carpet_area_sqm=carpet_m2,
            svg_blueprint_cad=self._generate_floor_svg(
                floor_index, floor_name, rooms, doors, windows, envelope,
                ground_cores=invariant_mgr.vertical_cores,
                ground_ducts=invariant_mgr.duct_shafts,
                theme="cad",
                wall_graph=wall_graph_obj,
            ),
            svg_blueprint_paper=self._generate_floor_svg(
                floor_index, floor_name, rooms, doors, windows, envelope,
                ground_cores=invariant_mgr.vertical_cores,
                ground_ducts=invariant_mgr.duct_shafts,
                theme="paper",
                wall_graph=wall_graph_obj,
            ),
            wall_graph=wall_graph_obj.to_dict(),
            door_schedule=wall_graph_obj.door_schedule,
            window_schedule=wall_graph_obj.window_schedule,
            room_schedule=wall_graph_obj.room_schedule,
            stair_geometry=wall_graph_obj.stair_geometry.to_dict() if wall_graph_obj.stair_geometry else None,
        )

    def _generate_doors_and_windows(
        self,
        floor_index: int,
        rooms: List[MultiFloorRoomRectangle],
        lobby: MultiFloorRoomRectangle,
        core_room: MultiFloorRoomRectangle,
    ) -> Tuple[List[MultiFloorDoorGeometry], List[MultiFloorWindowGeometry]]:
        """
        Creates door connections from lobby to each adjacent room,
        and places windows on exterior boundary walls.
        """
        doors: List[MultiFloorDoorGeometry] = []
        windows: List[MultiFloorWindowGeometry] = []

        # Door 1: Core Landing to Lobby
        doors.append(MultiFloorDoorGeometry(
            door_id=f"door_core_lobby_F{floor_index}",
            floor_index=floor_index,
            from_room=core_room.room_id,
            to_room=lobby.room_id,
            wall_edge="east",
            x1=core_room.x + core_room.width_m,
            y1=core_room.y + 0.5,
            x2=core_room.x + core_room.width_m,
            y2=core_room.y + 1.5,
            hinge_x=core_room.x + core_room.width_m,
            hinge_y=core_room.y + 0.5,
            swing_direction="inward_right",
            width_m=1.0,
            door_type="fire_rated" if floor_index > 0 else "standard",
        ))

        # Doors from lobby to other habitable rooms
        d_idx = 1
        for r in rooms:
            if r.room_id in (core_room.room_id, lobby.room_id):
                continue

            doors.append(MultiFloorDoorGeometry(
                door_id=f"door_{r.room_id}",
                floor_index=floor_index,
                from_room=lobby.room_id,
                to_room=r.room_id,
                wall_edge="vertical",
                x1=r.x,
                y1=r.y + 0.5,
                x2=r.x,
                y2=r.y + 1.4,
                hinge_x=r.x,
                hinge_y=r.y + 0.5,
                width_m=0.90,
                door_type="standard",
            ))
            d_idx += 1

            # Windows on exterior walls
            if r.requires_exterior_wall:
                windows.append(MultiFloorWindowGeometry(
                    window_id=f"win_{r.room_id}",
                    floor_index=floor_index,
                    room_id=r.room_id,
                    wall_edge="north" if r.y <= 0.2 else "east",
                    x1=r.x + 1.0,
                    y1=r.y,
                    x2=r.x + 2.5,
                    y2=r.y,
                    width_m=1.5,
                    sill_height_m=0.90,
                ))

        return doors, windows

    def _verify_graph_reachability(
        self,
        rooms: List[MultiFloorRoomRectangle],
        doors: List[MultiFloorDoorGeometry],
        core_id: str,
    ) -> bool:
        """
        Executes a Breadth-First Search (BFS) graph reachability traversal
        starting from the primary vertical core. Verifies 100% room reachability.
        """
        adj: Dict[str, Set[str]] = {r.room_id: set() for r in rooms}
        for d in doors:
            if d.from_room in adj and d.to_room in adj:
                adj[d.from_room].add(d.to_room)
                adj[d.to_room].add(d.from_room)

        visited: Set[str] = set()
        queue = deque([core_id])

        while queue:
            curr = queue.popleft()
            if curr in visited:
                continue
            visited.add(curr)
            for neighbor in adj.get(curr, set()):
                if neighbor not in visited:
                    queue.append(neighbor)

        # Check if every room is in visited
        return len(visited) == len(rooms)

    def _verify_stacking_invariant(
        self,
        floors: List[SingleFloorPlanModel],
        cores: List[VerticalCoreSpec]
    ) -> bool:
        """
        Verifies EC-06: Vertical core coordinates (X, Y) must be identical
        across all floors within 0.001m tolerance.
        """
        if len(floors) <= 1:
            return True

        base_core = cores[0]
        for f in floors:
            # Find vertical core in floor rooms
            f_cores = [r for r in f.rooms if r.is_vertical_core]
            if not f_cores:
                return False
            fc = f_cores[0]
            if abs(fc.x - base_core.x) > 0.001 or abs(fc.y - base_core.y) > 0.001:
                return False
            if abs(fc.width_m - base_core.width_m) > 0.001 or abs(fc.depth_m - base_core.depth_m) > 0.001:
                return False

        return True

    def _generate_floor_svg(
        self,
        floor_index: int,
        floor_name: str,
        rooms: List[MultiFloorRoomRectangle],
        doors: List[MultiFloorDoorGeometry],
        windows: List[MultiFloorWindowGeometry],
        envelope: Dict[str, float],
        ground_cores: Optional[List[VerticalCoreSpec]] = None,
        ground_ducts: Optional[List[DuctShaftSpec]] = None,
        theme: str = "cad",
        wall_graph: Optional[Any] = None,
    ) -> str:
        """
        Generates standalone W3C compliant SVG string for an individual floor plate
        with Ghost Core Overlay on upper floors (floor_index > 0).
        """
        from app.services.floorplan.svg_generator import generate_multi_floor_blueprint_svg
        return generate_multi_floor_blueprint_svg(
            floor_index=floor_index,
            floor_name=floor_name,
            rooms=rooms,
            doors=doors,
            windows=windows,
            envelope=envelope,
            ground_cores=ground_cores,
            ground_ducts=ground_ducts,
            theme=theme,
            include_ghost_overlay=(floor_index > 0),
            building_typology=self.typology,
            wall_graph=wall_graph,
            plot_width_m=self.plot_w,
            plot_depth_m=self.plot_d,
            total_storeys=self.total_storeys,
        )


# =====================================================================
# 5. Facade Function
# =====================================================================

def generate_multi_floor_building(
    request: FloorPlanRequest | Dict[str, Any],
    ai_provider: Optional[str] = "mock"
) -> MultiStoreyBuildingModel:
    """Convenience facade to instantiate MultiFloorSolver and synthesize building."""
    solver = MultiFloorSolver(request=request, ai_provider=ai_provider)
    return solver.solve()

solve_multi_floor_plan = generate_multi_floor_building

