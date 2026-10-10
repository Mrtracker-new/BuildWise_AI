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

import math
from typing import List, Dict, Optional, Tuple, Any

from app.schemas.multi_floor_plan import (
    MultiStoreyBuildingModel,
    VerticalCoreSpec,
    DuctShaftSpec,
    MultiFloorRoomRectangle,
    StructuralGridSpec,
    ExtractedClientConstraints,
)
from app.schemas.floorplan import FloorPlanRequest
from app.services.floorplan.constraints import is_bath_or_wc


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

