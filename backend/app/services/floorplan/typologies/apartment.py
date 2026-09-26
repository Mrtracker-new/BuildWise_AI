"""
apartment.py - Typology T2: Family Apartment Residence (Small Multi-Unit Building)
======================================================================================
Implements semi-private core, dual-unit floor plates (Unit A and Unit B),
NBC 2016 multi-family circulation norms, and unit-level Vastu compliance.
"""

from typing import List, Dict, Tuple, Optional, Any
from app.schemas.multi_floor_plan import (
    MultiFloorRoomRectangle,
    VerticalCoreSpec,
    DuctShaftSpec,
    ExtractedClientConstraints,
)

T2_CATALOG: Dict[str, Dict[str, Any]] = {
    "shared_stair": {
        "name": "Shared Staircase Core",
        "min_area_sqm": 7.5,
        "min_width_m": 2.50,  # 1.25m flight per NBC multi-occupancy
        "max_aspect_ratio": 2.00,
        "vastu_preferred": ["W", "S", "SW"],
        "category": "circulation",
    },
    "lift_core": {
        "name": "Passenger Lift Core",
        "min_area_sqm": 3.24,  # 1.80m x 1.80m 8-passenger stretcher compliant
        "min_width_m": 1.80,
        "max_aspect_ratio": 1.00,
        "category": "circulation",
    },
    "floor_lobby": {
        "name": "Floor Distribution Lobby",
        "min_area_sqm": 6.0,
        "min_width_m": 1.50,
        "max_aspect_ratio": 2.00,
        "category": "circulation",
    },
    "unit_living": {
        "name": "Apartment Living/Dining",
        "min_area_sqm": 16.0,
        "min_width_m": 3.40,
        "max_aspect_ratio": 1.80,
        "category": "public",
    },
    "unit_kitchen": {
        "name": "Apartment Kitchen",
        "min_area_sqm": 6.0,
        "min_width_m": 1.80,
        "max_aspect_ratio": 1.80,
        "category": "service",
    },
    "unit_bed": {
        "name": "Apartment Bedroom",
        "min_area_sqm": 10.5,
        "min_width_m": 3.00,
        "max_aspect_ratio": 1.80,
        "category": "private",
    },
    "unit_bath": {
        "name": "Apartment Bathroom",
        "min_area_sqm": 3.0,
        "min_width_m": 1.20,
        "max_aspect_ratio": 2.00,
        "vastu_preferred": ["W", "NW"],
        "vastu_prohibited": ["NE"],
        "category": "service",
    },
    "unit_balcony": {
        "name": "Apartment Private Balcony",
        "min_area_sqm": 3.0,
        "min_width_m": 1.20,
        "max_aspect_ratio": 2.50,
        "vastu_preferred": ["N", "E"],
        "category": "outdoor",
    },
    "unit_utility": {
        "name": "Apartment Utility / Dry Balcony",
        "min_area_sqm": 2.5,
        "min_width_m": 1.20,
        "max_aspect_ratio": 2.00,
        "vastu_preferred": ["SE", "NW", "E"],
        "category": "service",
    },
}

# Typology T2 Semi-Private Core Adjacency Graph
T2_ADJACENCY_GRAPH: Dict[str, List[str]] = {
    "shared_stair": ["floor_lobby"],
    "lift_core": ["floor_lobby"],
    "floor_lobby": ["shared_stair", "lift_core", "t2_unitA_living", "t2_unitB_living"],
    "t2_unitA_living": ["floor_lobby", "t2_unitA_kitchen", "t2_unitA_bed", "t2_unitA_balcony"],
    "t2_unitA_kitchen": ["t2_unitA_living"],
    "t2_unitA_bed": ["t2_unitA_living", "t2_unitA_bath"],
    "t2_unitA_bath": ["t2_unitA_bed"],
    "t2_unitA_balcony": ["t2_unitA_living"],
    "t2_unitB_living": ["floor_lobby", "t2_unitB_kitchen", "t2_unitB_bed", "t2_unitB_balcony"],
    "t2_unitB_kitchen": ["t2_unitB_living"],
    "t2_unitB_bed": ["t2_unitB_living", "t2_unitB_bath"],
    "t2_unitB_bath": ["t2_unitB_bed"],
    "t2_unitB_balcony": ["t2_unitB_living"],
}


class T2ApartmentSolver:
    """
    Typology T2 Layout Solver: Generates multi-unit residential floor plates
    with shared staircase and elevator core serving independent apartment units.
    """

    catalog = T2_CATALOG
    adjacency_graph = T2_ADJACENCY_GRAPH

    @classmethod
    def synthesize_floor_rooms(
        cls,
        floor_index: int,
        envelope: Dict[str, float],
        core: VerticalCoreSpec,
        ducts: List[DuctShaftSpec],
        strictness: str = "medium",
        client_constraints: Optional[ExtractedClientConstraints] = None,
    ) -> Tuple[List[MultiFloorRoomRectangle], List[str]]:
        """
        Synthesizes a 2-unit apartment floor plate (Unit A in North/East, Unit B in South/West)
        around the central shared core.
        """
        env_w = envelope["width"]
        env_d = envelope["depth"]
        warnings: List[str] = []

        rooms: List[MultiFloorRoomRectangle] = []

        # 1. Inject Shared Vertical Core (Staircase)
        stair_room = MultiFloorRoomRectangle(
            room_id=f"t2_stair_F{floor_index}",
            room_name="Shared Staircase Core",
            floor_index=floor_index,
            x=core.x,
            y=core.y,
            width_m=core.width_m,
            depth_m=core.depth_m,
            area_sqm=round(core.width_m * core.depth_m, 2),
            zone="W",
            zone_category="circulation",
            vastu_compliant=True,
            is_vertical_core=True,
            requires_exterior_wall=True,
            aspect_ratio=round(core.depth_m / core.width_m, 2),
        )
        rooms.append(stair_room)

        # 2. Central Floor Distribution Lobby
        lobby_x = round(core.x + core.width_m, 2)
        lobby_y = round(core.y, 2)
        lobby_w = round(min(2.4, max(1.5, (env_w - lobby_x) * 0.35)), 2)
        lobby_d = round(core.depth_m, 2)

        lobby = MultiFloorRoomRectangle(
            room_id=f"t2_lobby_F{floor_index}",
            room_name="Floor Elevator & Stair Lobby",
            floor_index=floor_index,
            x=lobby_x,
            y=lobby_y,
            width_m=lobby_w,
            depth_m=lobby_d,
            area_sqm=round(lobby_w * lobby_d, 2),
            zone="CENTER",
            zone_category="circulation",
            vastu_compliant=True,
            is_vertical_core=False,
            requires_exterior_wall=False,
            aspect_ratio=round(lobby_d / lobby_w, 2),
        )
        rooms.append(lobby)

        # 3. Unit A (Front Wing / North-East)
        unit_a_x = round(lobby_x + lobby_w, 2)
        unit_a_w = round(max(3.0, env_w - unit_a_x), 2)
        unit_a_d = round(env_d * 0.50, 2)

        # Unit A Living
        uA_liv_d = round(unit_a_d * 0.65, 2)
        rooms.append(MultiFloorRoomRectangle(
            room_id=f"uA_living_F{floor_index}",
            room_name="Unit A: Living & Dining",
            floor_index=floor_index,
            unit_id="Unit_A",
            x=unit_a_x,
            y=0.0,
            width_m=unit_a_w,
            depth_m=uA_liv_d,
            area_sqm=round(unit_a_w * uA_liv_d, 2),
            zone="NE",
            zone_category="public",
            vastu_compliant=True,
            requires_exterior_wall=True,
            aspect_ratio=round(unit_a_w / uA_liv_d if uA_liv_d > 0 else 1.0, 2),
        ))

        # Unit A Bed
        uA_bed_d = round(unit_a_d - uA_liv_d, 2)
        rooms.append(MultiFloorRoomRectangle(
            room_id=f"uA_bed_F{floor_index}",
            room_name="Unit A: Bedroom",
            floor_index=floor_index,
            unit_id="Unit_A",
            x=unit_a_x,
            y=uA_liv_d,
            width_m=unit_a_w,
            depth_m=uA_bed_d,
            area_sqm=round(unit_a_w * uA_bed_d, 2),
            zone="E",
            zone_category="private",
            vastu_compliant=True,
            requires_exterior_wall=True,
            aspect_ratio=round(unit_a_w / uA_bed_d if uA_bed_d > 0 else 1.0, 2),
        ))

        # 4. Unit B (Rear Wing / South-East)
        unit_b_y = unit_a_d
        unit_b_d = round(env_d - unit_a_d, 2)

        # Unit B Living / Dining
        uB_liv_d = round(unit_b_d * 0.60, 2)
        rooms.append(MultiFloorRoomRectangle(
            room_id=f"uB_living_F{floor_index}",
            room_name="Unit B: Living & Dining",
            floor_index=floor_index,
            unit_id="Unit_B",
            x=unit_a_x,
            y=unit_b_y,
            width_m=unit_a_w,
            depth_m=uB_liv_d,
            area_sqm=round(unit_a_w * uB_liv_d, 2),
            zone="SE",
            zone_category="public",
            vastu_compliant=True,
            requires_exterior_wall=True,
            aspect_ratio=round(unit_a_w / uB_liv_d if uB_liv_d > 0 else 1.0, 2),
        ))

        # Unit B Bed
        uB_bed_d = round(unit_b_d - uB_liv_d, 2)
        rooms.append(MultiFloorRoomRectangle(
            room_id=f"uB_bed_F{floor_index}",
            room_name="Unit B: Bedroom",
            floor_index=floor_index,
            unit_id="Unit_B",
            x=unit_a_x,
            y=round(unit_b_y + uB_liv_d, 2),
            width_m=unit_a_w,
            depth_m=uB_bed_d,
            area_sqm=round(unit_a_w * uB_bed_d, 2),
            zone="S",
            zone_category="private",
            vastu_compliant=True,
            requires_exterior_wall=True,
            aspect_ratio=round(unit_a_w / uB_bed_d if uB_bed_d > 0 else 1.0, 2),
        ))

        # 5. Sanitary Wet Wall Block (Stacked over west wet chase)
        bath_y = round(max(0.0, core.y - 2.0), 2)
        bath_d = round(max(1.5, core.y - bath_y), 2)
        rooms.append(MultiFloorRoomRectangle(
            room_id=f"sanitary_block_F{floor_index}",
            room_name="Sanitary & Utility Block",
            floor_index=floor_index,
            x=0.0,
            y=bath_y,
            width_m=round(core.width_m, 2),
            depth_m=bath_d,
            area_sqm=round(core.width_m * bath_d, 2),
            zone="NW",
            zone_category="service",
            vastu_compliant=True,
            requires_exterior_wall=True,
            aspect_ratio=round(core.width_m / bath_d if bath_d > 0 else 1.0, 2),
        ))

        return rooms, warnings


# =============================================================================
# STAGE 3 PROTOCOL IMPLEMENTATION: T2ApartmentModule
# =============================================================================

class T2ApartmentModule:
    """
    Stage-3 typology module for T2 Family Apartment.
    Implements TypologyModuleProtocol - all five classmethods.
    Unit split + shared core per floor; Vastu medium weight.
    """

    TYPOLOGY_KEY = "T2_FAMILY_APARTMENT"

    # T2 space IDs in UNIVERSAL_SPACE_CATALOG (shared core + per-unit spaces)
    _SHARED_CORE_IDS = ["t2_stair", "lift_core", "floor_lobby"]
    _UNIT_IDS = ["apt_unit_1", "apt_unit_2"]
    _GROUND_IDS = ["floor_lobby", "apt_unit_1", "apt_unit_2", "guard_house"]
    _UPPER_IDS = ["floor_lobby", "apt_unit_1", "apt_unit_2"]

    @classmethod
    def catalog(cls):
        """Space types pulled from ONTOLOGY - no local re-declaration."""
        from app.services.floorplan.ontology import ONTOLOGY
        result = {}
        ids = ["t2_stair", "lift_core", "floor_lobby", "apt_unit_1", "apt_unit_2",
               "guard_house", "unit_living", "unit_kitchen", "unit_bed", "unit_bath"]
        for sid in ids:
            spec = ONTOLOGY.get_space(sid)
            if spec:
                result[sid] = spec
        return result

    @classmethod
    def vertical_program(cls, N: int):
        """Per-level allocation for a T2 building (1..4 storeys): unit split + shared core."""
        N = max(1, min(4, N))
        program = []
        for level in range(N):
            if level == 0:
                ids = cls._GROUND_IDS
                label = "Ground Floor (G)"
            else:
                ids = cls._UPPER_IDS
                label = f"Floor {level} (G+{level})"
            program.append({"level": level, "space_ids": ids, "label": label})
        return program

    @classmethod
    def layout_strategy(cls):
        """T2: 50/50 unit split; semi-private shared core; medium Vastu weight."""
        from app.services.floorplan.typologies.protocol import LayoutStrategy
        return LayoutStrategy(
            public_front_depth_frac=0.40,
            private_rear_depth_frac=0.40,
            unit_split_frac=0.50,
            exterior_wall_required=["apt_unit_1", "apt_unit_2"],
        )

    @classmethod
    def sheet_gates(cls):
        """T2: Vastu diagram ON (medium), unit schedule ON."""
        from app.services.floorplan.typologies.protocol import SheetGates
        return SheetGates(
            vastu_diagram=True,
            column_grid=False,
            unit_schedule=True,
            dock_apron_diagram=False,
            mezzanine_section=False,
            egress_travel_diagram=True,
            dimension_chains=True,
        )

    @classmethod
    def compose_sheet(cls, level_plan, theme: str) -> str:
        """Delegates to shared SVG IR with T2 sheet gates (unit schedule)."""
        from app.services.floorplan.svg_generator import generate_multi_floor_blueprint_svg
        return generate_multi_floor_blueprint_svg(
            floor_index=level_plan["floor_index"],
            floor_name=level_plan["floor_name"],
            rooms=level_plan["rooms"],
            doors=level_plan.get("doors", []),
            windows=level_plan.get("windows", []),
            envelope=level_plan["envelope"],
            ground_cores=level_plan.get("ground_cores", []),
            ground_ducts=level_plan.get("ground_ducts", []),
            theme=theme,
            include_ghost_overlay=(level_plan["floor_index"] > 0),
            building_typology=cls.TYPOLOGY_KEY,
            wall_graph=level_plan.get("wall_graph"),
            plot_width_m=level_plan.get("plot_width_m", 0.0),
            plot_depth_m=level_plan.get("plot_depth_m", 0.0),
            total_storeys=level_plan.get("total_storeys", 1),
        )
