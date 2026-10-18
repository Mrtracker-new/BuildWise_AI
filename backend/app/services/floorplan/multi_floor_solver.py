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
    StructuralGridSpec,
    ExtractedClientConstraints,
)
from app.schemas.floorplan import FloorPlanRequest


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

# =====================================================================
# 3. Plumbing Chase Tracker (Rule of Plumbing Wet Stacks)
# =====================================================================

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

