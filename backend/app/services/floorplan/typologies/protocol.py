"""
protocol.py - Shared Protocol for Per-Typology Modules
=======================================================
Defines the ONE structural interface that all four typology modules must satisfy.
The solver (SoleGeometryEngine) consumes typology data exclusively through this
Protocol - no module re-declares constants that already exist in the ontology.

Protocol methods
    catalog()           -> space types + defaults FROM ontology (no re-declaration)
    vertical_program(N) -> per-level space allocation table (pure data, 1 <= N <= 4)
    layout_strategy()   -> declarative LayoutStrategy consumed by solver hooks
    compose_sheet(level_plan, theme)
                        -> SVG string via shared drawing IR + typology-gated layers
    sheet_gates()       -> data flags for universal-layer visibility per typology

All five methods are @classmethod so no instantiation is required.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import ClassVar, Dict, List, Any, Protocol, runtime_checkable

from app.services.floorplan.ontology import ONTOLOGY, SpaceTypeSpec


# ---------------------------------------------------------------------------
# 1. LAYOUT STRATEGY  (declarative constraints / hooks for the solver)
# ---------------------------------------------------------------------------

@dataclass
class LayoutStrategy:
    """
    Declarative solver hooks for a single typology.
    The SoleGeometryEngine reads this structure to parameterise its
    constrained-rectangular partitioning pass.  No geometry code lives here.
    """
    # Vastu zoning band fractions
    public_front_depth_frac: float = 0.40
    private_rear_depth_frac: float = 0.35

    # T2: equal half-plate per unit
    unit_split_frac: float = 0.50

    # T3: NBC min corridor width
    corridor_width_m: float = 1.50

    # T4: column bay size, dock apron depth, mezzanine elevation
    column_grid_bay_m: float = 6.00
    dock_apron_depth_m: float = 3.60
    mezzanine_elevation_m: float = 3.60

    # Extra MUST_ADJACENT overrides beyond ontology defaults
    extra_must_adjacent: List = field(default_factory=list)

    # Space IDs that must touch an exterior wall
    exterior_wall_required: List = field(default_factory=list)


# ---------------------------------------------------------------------------
# 2. SHEET GATES  (data flags for universal-layer visibility)
# ---------------------------------------------------------------------------

@dataclass
class SheetGates:
    """
    Controls which optional drawing layers are emitted by compose_sheet().
    The universal drawing IR checks these flags; the typology module only
    sets them - it does not own the SVG renderer.
    """
    vastu_diagram: bool = False
    column_grid: bool = False
    unit_schedule: bool = False
    dock_apron_diagram: bool = False
    mezzanine_section: bool = False
    egress_travel_diagram: bool = True
    dimension_chains: bool = True


# ---------------------------------------------------------------------------
# 3. TYPOLOGY MODULE PROTOCOL
# ---------------------------------------------------------------------------

@runtime_checkable
class TypologyModuleProtocol(Protocol):
    """
    Structural Protocol that every per-typology module must satisfy.
    All methods are @classmethods - no instantiation needed.

    Implementors: T1ResidenceModule, T2ApartmentModule,
                  T3ComplexModule, T4WarehouseModule
    """

    TYPOLOGY_KEY: ClassVar[str]

    @classmethod
    def catalog(cls) -> Dict[str, SpaceTypeSpec]: ...

    @classmethod
    def vertical_program(cls, N: int) -> List[Dict[str, Any]]: ...

    @classmethod
    def layout_strategy(cls) -> LayoutStrategy: ...

    @classmethod
    def compose_sheet(cls, level_plan: Dict[str, Any], theme: str) -> str: ...

    @classmethod
    def sheet_gates(cls) -> SheetGates: ...
