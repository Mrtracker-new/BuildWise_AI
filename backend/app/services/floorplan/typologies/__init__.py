"""
typologies package - Typology-Aware Multi-Storey Architecture Engines
====================================================================
Provides specialized solvers and spatial rule catalogs for:
- T1: Single-Family Residence (Individual Villa / House)
- T2: Family Apartment Residence (Small Multi-Unit Building)
- T3: Large Apartment Complex (Commercial / Multi-Unit Complex)
- T4: Warehouse / Light Industrial Facility
"""

from typing import Literal, Dict, Any, List

TYPOLOGY_T1 = "T1_SINGLE_FAMILY"
TYPOLOGY_T2 = "T2_FAMILY_APARTMENT"
TYPOLOGY_T3 = "T3_LARGE_COMPLEX"
TYPOLOGY_T4 = "T4_WAREHOUSE"

CanonicalTypology = Literal[
    "T1_SINGLE_FAMILY",
    "T2_FAMILY_APARTMENT",
    "T3_LARGE_COMPLEX",
    "T4_WAREHOUSE"
]


def normalize_typology(typology: str | None) -> CanonicalTypology:
    """
    Normalizes diverse typology identifiers into one of the 4 canonical typology keys.
    """
    if not typology:
        return TYPOLOGY_T1

    t = typology.strip().lower()
    if t in ("t1_single_family", "residential_single", "residential", "villa", "bungalow", "house", "t1"):
        return TYPOLOGY_T1
    elif t in ("t2_family_apartment", "residential_multi", "apartment", "duplex", "builder_floor", "t2"):
        return TYPOLOGY_T2
    elif t in ("t3_large_complex", "commercial", "complex", "office", "mixed_use", "t3"):
        return TYPOLOGY_T3
    elif t in ("t4_warehouse", "industrial", "warehouse", "logistics", "shed", "factory", "t4"):
        return TYPOLOGY_T4

    return TYPOLOGY_T1


def get_typology_solver(typology: str | None):
    """
    Returns the specialized solver class for the resolved canonical typology.
    """
    canonical = normalize_typology(typology)
    if canonical == TYPOLOGY_T1:
        from app.services.floorplan.typologies.single_family import T1ResidenceSolver
        return T1ResidenceSolver
    elif canonical == TYPOLOGY_T2:
        from app.services.floorplan.typologies.apartment import T2ApartmentSolver
        return T2ApartmentSolver
    elif canonical == TYPOLOGY_T3:
        from app.services.floorplan.typologies.commercial_complex import T3ComplexSolver
        return T3ComplexSolver
    elif canonical == TYPOLOGY_T4:
        from app.services.floorplan.typologies.warehouse import T4WarehouseSolver
        return T4WarehouseSolver

    from app.services.floorplan.typologies.single_family import T1ResidenceSolver
    return T1ResidenceSolver


def get_typology_catalog(typology: str | None) -> Dict[str, Dict[str, Any]]:
    """
    Returns the NBC statutory room catalog & Vastu matrices for the requested typology.
    """
    canonical = normalize_typology(typology)
    if canonical == TYPOLOGY_T1:
        from app.services.floorplan.typologies.single_family import T1_CATALOG
        return T1_CATALOG
    elif canonical == TYPOLOGY_T2:
        from app.services.floorplan.typologies.apartment import T2_CATALOG
        return T2_CATALOG
    elif canonical == TYPOLOGY_T3:
        from app.services.floorplan.typologies.commercial_complex import T3_CATALOG
        return T3_CATALOG
    elif canonical == TYPOLOGY_T4:
        from app.services.floorplan.typologies.warehouse import T4_CATALOG
        return T4_CATALOG

    from app.services.floorplan.typologies.single_family import T1_CATALOG
    return T1_CATALOG


def get_typology_adjacency_graph(typology: str | None) -> Dict[str, List[str]]:
    """
    Returns the topological circulation adjacency graph for the requested typology.
    """
    canonical = normalize_typology(typology)
    if canonical == TYPOLOGY_T1:
        from app.services.floorplan.typologies.single_family import T1_ADJACENCY_GRAPH
        return T1_ADJACENCY_GRAPH
    elif canonical == TYPOLOGY_T2:
        from app.services.floorplan.typologies.apartment import T2_ADJACENCY_GRAPH
        return T2_ADJACENCY_GRAPH
    elif canonical == TYPOLOGY_T3:
        from app.services.floorplan.typologies.commercial_complex import T3_ADJACENCY_GRAPH
        return T3_ADJACENCY_GRAPH
    elif canonical == TYPOLOGY_T4:
        from app.services.floorplan.typologies.warehouse import T4_ADJACENCY_GRAPH
        return T4_ADJACENCY_GRAPH

    from app.services.floorplan.typologies.single_family import T1_ADJACENCY_GRAPH
    return T1_ADJACENCY_GRAPH


def get_typology_module(typology: str | None):
    """
    Returns the TypologyModule class for the resolved canonical typology.
    Each module implements TypologyModuleProtocol (catalog, vertical_program,
    layout_strategy, compose_sheet, sheet_gates) — all as @classmethods.
    """
    canonical = normalize_typology(typology)
    if canonical == TYPOLOGY_T1:
        from app.services.floorplan.typologies.single_family import T1ResidenceModule
        return T1ResidenceModule
    elif canonical == TYPOLOGY_T2:
        from app.services.floorplan.typologies.apartment import T2ApartmentModule
        return T2ApartmentModule
    elif canonical == TYPOLOGY_T3:
        from app.services.floorplan.typologies.commercial_complex import T3ComplexModule
        return T3ComplexModule
    elif canonical == TYPOLOGY_T4:
        from app.services.floorplan.typologies.warehouse import T4WarehouseModule
        return T4WarehouseModule

    from app.services.floorplan.typologies.single_family import T1ResidenceModule
    return T1ResidenceModule
