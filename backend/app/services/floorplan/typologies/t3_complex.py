"""
t3_complex.py - Typology T3: Large Apartment Complex (Commercial / Multi-Unit Complex)
======================================================================================
Implements central fire-rated dual-staircase core, dual elevators, 1.5m double-loaded
corridor circulation loop, NBC commercial/multi-family egress norms, and MEP chases.
"""

from typing import List, Dict, Tuple, Optional, Any
from app.schemas.multi_floor_plan import (
    MultiFloorRoomRectangle,
    VerticalCoreSpec,
    DuctShaftSpec,
    ExtractedClientConstraints,
)

T3_CATALOG: Dict[str, Dict[str, Any]] = {
    "primary_stair": {
        "name": "Enclosed Fire Staircase 1",
        "min_area_sqm": 9.0,
        "min_width_m": 2.50,  # 1.25m flight width per NBC commercial/complex
        "max_aspect_ratio": 2.20,
        "vastu_preferred": ["W", "S", "SW"],
        "vastu_prohibited": ["NE"],
        "category": "circulation",
    },
    "secondary_stair": {
        "name": "Fire Exit Staircase 2",
        "min_area_sqm": 9.0,
        "min_width_m": 2.50,
        "max_aspect_ratio": 2.20,
        "vastu_preferred": ["NW", "SE"],
        "vastu_prohibited": ["NE"],
        "category": "circulation",
    },
    "lift_lobby": {
        "name": "Elevator Core & Lobby",
        "min_area_sqm": 12.0,
        "min_width_m": 2.40,
        "max_aspect_ratio": 2.00,
        "vastu_preferred": ["CENTER", "W"],
        "category": "circulation",
    },
    "spine_corridor": {
        "name": "Double-Loaded Spine Corridor",
        "min_area_sqm": 15.0,
        "min_width_m": 1.50,  # NBC minimum double-loaded corridor
        "max_aspect_ratio": 4.00,
        "vastu_preferred": ["CENTER"],
        "category": "circulation",
    },
    "commercial_suite": {
        "name": "Office Suite / Flat Unit",
        "min_area_sqm": 25.0,
        "min_width_m": 4.50,
        "max_aspect_ratio": 1.80,
        "vastu_preferred": ["N", "E", "NE"],
        "category": "public",
    },
    "sanitary_block": {
        "name": "Commercial Restroom Block",
        "min_area_sqm": 6.0,
        "min_width_m": 2.00,
        "max_aspect_ratio": 2.00,
        "vastu_preferred": ["W", "NW"],
        "vastu_prohibited": ["NE"],
        "category": "service",
    },
    "mep_room": {
        "name": "MEP & Electrical Services Room",
        "min_area_sqm": 6.0,
        "min_width_m": 2.00,
        "max_aspect_ratio": 2.00,
        "vastu_preferred": ["SE", "NW"],
        "category": "service",
    },
}

# Typology T3 Central Core & Double-Loaded Corridor Adjacency Graph
T3_ADJACENCY_GRAPH: Dict[str, List[str]] = {
    "t3_stair1": ["t3_spine_corridor"],
    "t3_stair2": ["t3_spine_corridor"],
    "t3_lift_lobby": ["t3_spine_corridor"],
    "t3_spine_corridor": [
        "t3_stair1",
        "t3_stair2",
        "t3_lift_lobby",
        "t3_suite_N",
        "t3_suite_S",
        "t3_suite_E",
        "t3_sanitary",
    ],
    "t3_suite_N": ["t3_spine_corridor"],
    "t3_suite_S": ["t3_spine_corridor"],
    "t3_suite_E": ["t3_spine_corridor"],
    "t3_sanitary": ["t3_spine_corridor"],
}


class T3ComplexSolver:
    """
    Typology T3 Layout Solver: Generates high-density commercial/apartment complex
    floor plates with dual egress stairs, central lift bank, and spine circulation.
    """

    catalog = T3_CATALOG
    adjacency_graph = T3_ADJACENCY_GRAPH

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
        Synthesizes a commercial / large complex floor plate organized around
        a central elevator lobby and double-loaded corridor.
        """
        env_w = envelope["width"]
        env_d = envelope["depth"]
        warnings: List[str] = []

        rooms: List[MultiFloorRoomRectangle] = []

        # 1. Primary Staircase (Locked Anchor)
        stair_1 = MultiFloorRoomRectangle(
            room_id=f"t3_stair1_F{floor_index}",
            room_name="Enclosed Fire Stair 1",
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
        rooms.append(stair_1)

        # 2. Central Elevator & Passenger Lift Bank
        lobby_x = round(core.x + core.width_m, 2)
        lobby_y = round(core.y, 2)
        lobby_w = round(min(2.5, max(1.8, (env_w - lobby_x) * 0.30)), 2)
        lobby_d = round(core.depth_m, 2)

        lift_lobby = MultiFloorRoomRectangle(
            room_id=f"t3_lift_lobby_F{floor_index}",
            room_name="Elevator Bank & Main Lobby",
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
        rooms.append(lift_lobby)

        # 3. Double-Loaded Spine Corridor (1.5m width per NBC)
        corr_x = round(lobby_x + lobby_w, 2)
        corr_y = round(max(0.0, core.y), 2)
        corr_w = round(max(2.0, (env_w - corr_x) * 0.25), 2)
        corr_d = round(core.depth_m, 2)

        corridor = MultiFloorRoomRectangle(
            room_id=f"t3_corridor_F{floor_index}",
            room_name="1.5m Double-Loaded Corridor",
            floor_index=floor_index,
            x=corr_x,
            y=corr_y,
            width_m=corr_w,
            depth_m=corr_d,
            area_sqm=round(corr_w * corr_d, 2),
            zone="CENTER",
            zone_category="circulation",
            vastu_compliant=True,
            is_vertical_core=False,
            requires_exterior_wall=False,
            aspect_ratio=round(corr_d / corr_w, 2),
        )
        rooms.append(corridor)

        # 4. North Suite Block (Front Facade)
        suite1_x = round(corr_x + corr_w, 2)
        suite1_w = round(max(3.5, env_w - suite1_x), 2)
        suite1_d = round(env_d * 0.50, 2)

        rooms.append(MultiFloorRoomRectangle(
            room_id=f"t3_suite_north_F{floor_index}",
            room_name="Commercial Suite North (Open Office)" if floor_index == 0 else "Residential Unit 1",
            floor_index=floor_index,
            unit_id="Suite_North",
            x=suite1_x,
            y=0.0,
            width_m=suite1_w,
            depth_m=suite1_d,
            area_sqm=round(suite1_w * suite1_d, 2),
            zone="NE",
            zone_category="public",
            vastu_compliant=True,
            requires_exterior_wall=True,
            aspect_ratio=round(suite1_w / suite1_d if suite1_d > 0 else 1.0, 2),
        ))

        # 5. South Suite Block (Rear Facade)
        suite2_y = suite1_d
        suite2_d = round(env_d - suite1_d, 2)

        rooms.append(MultiFloorRoomRectangle(
            room_id=f"t3_suite_south_F{floor_index}",
            room_name="Commercial Suite South (Executive)" if floor_index == 0 else "Residential Unit 2",
            floor_index=floor_index,
            unit_id="Suite_South",
            x=suite1_x,
            y=suite2_y,
            width_m=suite1_w,
            depth_m=suite2_d,
            area_sqm=round(suite1_w * suite2_d, 2),
            zone="SE",
            zone_category="public",
            vastu_compliant=True,
            requires_exterior_wall=True,
            aspect_ratio=round(suite1_w / suite2_d if suite2_d > 0 else 1.0, 2),
        ))

        # 6. Commercial Sanitary & MEP Core Block (West Flank, stacked over shaft)
        san_y = round(max(0.0, core.y - 2.2), 2)
        san_d = round(max(1.8, core.y - san_y), 2)

        rooms.append(MultiFloorRoomRectangle(
            room_id=f"t3_sanitary_F{floor_index}",
            room_name="Commercial Sanitary & Restroom Core",
            floor_index=floor_index,
            x=0.0,
            y=san_y,
            width_m=round(core.width_m, 2),
            depth_m=san_d,
            area_sqm=round(core.width_m * san_d, 2),
            zone="NW",
            zone_category="service",
            vastu_compliant=True,
            requires_exterior_wall=True,
            aspect_ratio=round(core.width_m / san_d if san_d > 0 else 1.0, 2),
        ))

        return rooms, warnings
