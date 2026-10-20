"""Land-economics report and SPACE-EFFICIENCY certificate."""

from __future__ import annotations

from typing import Dict, List, Optional, Tuple

from pydantic import BaseModel, Field


class ResidualSliver(BaseModel):
    sliver_id: str
    area_sqm: float
    centroid: Tuple[float, float]
    polygon_coords: List[Tuple[float, float]] = Field(default_factory=list)
    absorbed_as: str = "planter"
    rationale: str = ""


class LandEconomicsCertificate(BaseModel):
    status: str = "PASS"  # PASS | WARN | FAIL
    checks: Dict[str, bool] = Field(default_factory=dict)
    warnings: List[str] = Field(default_factory=list)


class LandEconomicsReport(BaseModel):
    """Program-aware land use, footprint fit, residuals and efficiency."""

    program_needed_area_m2: float = 0.0
    buildable_area_sqm: float = 0.0
    coverage_limit_area_sqm: float = 0.0
    footprint_area_sqm: float = 0.0
    footprint_source: str = "coverage"  # coverage | program | inscribed
    program_aware_footprint: bool = False
    program_deficit_sqm: float = 0.0
    ground_program_area_sqm: float = 0.0
    ground_circulation_area_sqm: float = 0.0
    total_gfa_sqm: float = 0.0
    land_use_efficiency_pct: float = 0.0  # Phase A eff_g
    footprint_utilization_pct: float = 0.0
    floor_area_ratio: float = 0.0
    circulation_ratio_pct: float = 0.0
    wedge_area_sqm: float = 0.0
    outdoor_area_sqm: float = 0.0
    occupied_area_sqm: float = 0.0
    waste_area_sqm: float = 0.0
    waste_pct: float = 0.0
    anonymous_outdoor_area_sqm: float = 0.0
    dead_corner_area_sqm: float = Field(
        default=0.0,
        description="Ground-floor footprint area not covered by any room, counting regions >= 1 m²",
    )
    sliver_count: int = Field(
        default=0,
        description="Residual site regions >= 1 m² found and labelled as wedge zones",
    )
    slivers: List[ResidualSliver] = Field(default_factory=list)
    absorbed_residual_count: int = Field(
        default=0,
        description="Residual regions converted into labelled wedge zones",
    )
    furniture_fit_pct: Optional[float] = None
    warnings: List[str] = Field(default_factory=list)
    certificate: LandEconomicsCertificate = Field(default_factory=LandEconomicsCertificate)


def compute_program_needed_area(engine: object) -> float:
    """Programme + walls + circulation area required by the largest floor.

    This is deliberately computed from the ontology catalogue (minimum carpet
    areas), not from the geometry that was already produced, so the footprint
    is never sized by its own output.
    """
    from app.services.floorplan.constrained_solver import expand_program
    from app.services.floorplan.wall_graph import compute_stair_geometry

    total_storeys = max(1, int(getattr(engine, "total_storeys", 1)))
    typology = getattr(engine, "typology", "T1_SINGLE_FAMILY")
    profile = getattr(engine, "profile", None)
    floor_height = float(getattr(profile, "floor_height_m", 3.0) or 3.0)
    stair = compute_stair_geometry(floor_height_m=floor_height, typology=typology)
    core_area = float(stair.stair_box_width_m) * float(stair.stair_box_depth_m)
    if typology in ("T2_FAMILY_APARTMENT", "T3_LARGE_COMPLEX"):
        core_area += 3.24  # passenger lift
    if typology == "T3_LARGE_COMPLEX":
        core_area += 3.0  # secondary egress stair allowance

    worst = 0.0
    for z in range(total_storeys):
        rooms = expand_program(engine, z)
        if not rooms:
            continue
        program = sum(float(r.spec.min_area_sqm) for r in rooms)
        circulation = max(8.0, program * 0.14)
        walls = program * 0.08
        worst = max(worst, program + circulation + walls + core_area)
    return round(max(worst, 30.0), 2)
