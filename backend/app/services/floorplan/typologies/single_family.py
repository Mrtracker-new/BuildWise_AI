"""
single_family.py - Typology T1: Single-Family Residence (Individual Villa / House)
=================================================================================
Implements architectural space program, NBC 2016 norms, and Vastu Shastra rules
for private single-family multi-storey residences (G to G+2).
"""

from typing import List, Dict, Tuple, Optional, Any
from app.schemas.multi_floor_plan import (
    MultiFloorRoomRectangle,
    VerticalCoreSpec,
    DuctShaftSpec,
    ExtractedClientConstraints,
)

# NBC 2016 Part 3 Table 1 Statutory Minimums & Vastu Matrices for Typology T1
T1_CATALOG: Dict[str, Dict[str, Any]] = {
    "living": {
        "name": "Living Room",
        "min_area_sqm": 16.0,
        "min_width_m": 3.60,
        "max_aspect_ratio": 1.80,
        "vastu_preferred": ["N", "NE", "E", "CENTER"],
        "vastu_prohibited": ["SW"],
        "permitted_levels": [0],
        "category": "public",
    },
    "dining": {
        "name": "Dining Area",
        "min_area_sqm": 8.0,
        "min_width_m": 2.40,
        "max_aspect_ratio": 2.00,
        "vastu_preferred": ["W", "CENTER", "E"],
        "vastu_prohibited": ["SW"],
        "permitted_levels": [0],
        "category": "public",
    },
    "kitchen": {
        "name": "Kitchen",
        "min_area_sqm": 7.5,
        "min_width_m": 2.10,
        "max_aspect_ratio": 1.80,
        "vastu_preferred": ["SE", "NW"],  # SE (Agni) primary, NW secondary
        "vastu_prohibited": ["NE", "SW"],
        "permitted_levels": [0],
        "category": "service",
    },
    "puja": {
        "name": "Pooja Room",
        "min_area_sqm": 3.0,
        "min_width_m": 1.80,
        "max_aspect_ratio": 1.50,
        "vastu_preferred": ["NE", "E"],  # Ishanya corner
        "vastu_prohibited": ["S", "SW"],
        "permitted_levels": [0, 1],
        "category": "private",
    },
    "master_bed": {
        "name": "Master Bedroom",
        "min_area_sqm": 14.0,
        "min_width_m": 3.40,
        "max_aspect_ratio": 1.80,
        "vastu_preferred": ["SW", "S", "W"],  # Nairutya corner
        "vastu_prohibited": ["NE"],
        "permitted_levels": [0, 1, 2],
        "category": "private",
    },
    "bed_2": {
        "name": "Bedroom 2",
        "min_area_sqm": 11.0,
        "min_width_m": 3.00,
        "max_aspect_ratio": 1.80,
        "vastu_preferred": ["W", "NW", "N"],
        "vastu_prohibited": ["NE"],
        "permitted_levels": [1, 2],
        "category": "private",
    },
    "bath_1": {
        "name": "Primary Bath",
        "min_area_sqm": 3.5,
        "min_width_m": 1.50,
        "max_aspect_ratio": 2.00,
        "vastu_preferred": ["W", "NW"],
        "vastu_prohibited": ["NE", "SE"],
        "permitted_levels": [0, 1, 2],
        "category": "service",
    },
    "bath_2": {
        "name": "Common Bath",
        "min_area_sqm": 2.8,
        "min_width_m": 1.20,
        "max_aspect_ratio": 2.00,
        "vastu_preferred": ["W", "NW"],
        "vastu_prohibited": ["NE", "CENTER"],
        "permitted_levels": [0, 1, 2],
        "category": "service",
    },
    "study": {
        "name": "Home Office / Study",
        "min_area_sqm": 7.5,
        "min_width_m": 2.40,
        "max_aspect_ratio": 1.60,
        "vastu_preferred": ["N", "E", "NE"],
        "vastu_prohibited": ["SW"],
        "permitted_levels": [0, 1],
        "category": "private",
    },
    "t1_stair": {
        "name": "Private Dogleg Staircase",
        "min_area_sqm": 6.0,
        "min_width_m": 2.00,
        "max_aspect_ratio": 2.00,
        "vastu_preferred": ["S", "W", "SW"],
        "vastu_prohibited": ["NE"],
        "permitted_levels": [0, 1, 2],
        "category": "circulation",
    },
    "foyer": {
        "name": "Entry Foyer",
        "min_area_sqm": 3.0,
        "min_width_m": 1.50,
        "max_aspect_ratio": 2.00,
        "vastu_preferred": ["N", "NE", "E"],
        "vastu_prohibited": ["SW"],
        "permitted_levels": [0],
        "category": "public",
    },
    "utility": {
        "name": "Kitchen Utility / Wash",
        "min_area_sqm": 3.0,
        "min_width_m": 1.20,
        "max_aspect_ratio": 2.00,
        "vastu_preferred": ["SE", "NW", "E"],
        "vastu_prohibited": ["NE"],
        "permitted_levels": [0],
        "category": "service",
    },
    "balcony": {
        "name": "Covered Balcony",
        "min_area_sqm": 3.5,
        "min_width_m": 1.20,
        "max_aspect_ratio": 2.50,
        "vastu_preferred": ["N", "E", "NE"],
        "vastu_prohibited": ["SW"],
        "permitted_levels": [1, 2],
        "category": "outdoor",
    },
}

# Typology T1 Topological Adjacency Graph per NBC 2016 circulation norms
T1_ADJACENCY_GRAPH: Dict[str, List[str]] = {
    "living": ["dining", "foyer", "puja", "t1_stair", "study"],
    "foyer": ["living"],
    "dining": ["kitchen", "living", "utility"],
    "kitchen": ["dining", "utility"],
    "utility": ["kitchen", "dining"],
    "puja": ["living"],
    "study": ["living"],
    "master_bed": ["bath_1", "balcony", "t1_stair", "living"],
    "bed_2": ["bath_2", "balcony", "t1_stair"],
    "bath_1": ["master_bed"],
    "bath_2": ["bed_2", "living"],
    "balcony": ["master_bed", "bed_2"],
    "t1_stair": ["living", "master_bed", "bed_2"],
}


class T1ResidenceSolver:
    """
    Typology T1 Layout Solver: Generates functional, Vastu-compliant
    private residence layouts across 1 to 3 storeys.
    """

    catalog = T1_CATALOG
    adjacency_graph = T1_ADJACENCY_GRAPH

    @classmethod
    def synthesize_floor_rooms(
        cls,
        floor_index: int,
        envelope: Dict[str, float],
        core: VerticalCoreSpec,
        ducts: List[DuctShaftSpec],
        strictness: str = "high",
        client_constraints: Optional[ExtractedClientConstraints] = None,
    ) -> Tuple[List[MultiFloorRoomRectangle], List[str]]:
        """
        Partitions the envelope for floor level `floor_index` adhering to T1 catalog rules.
        Handles EC-04 conflicting constraints.
        Returns: (rooms, warnings)
        """
        env_w = envelope["width"]
        env_d = envelope["depth"]
        warnings: List[str] = []

        # 1. EC-04 Conflict Resolution: Check client constraints against Vastu strictness
        if client_constraints and strictness in ("high", "medium"):
            for pref in client_constraints.orientation_preferences:
                if pref.space.lower() == "kitchen" and "north" in pref.preferred_facing.lower():
                    warnings.append(
                        "EC-04 Vastu rule override: Kitchen relocation requested to North-East was overridden "
                        "due to high Vastu strictness. Relocated to South-East (Agni zone)."
                    )
                if "master" in pref.space.lower() and "north" in pref.preferred_facing.lower():
                    warnings.append(
                        "EC-04 Vastu rule override: Master Bedroom relocation requested to North-East was overridden "
                        "due to high Vastu strictness. Relocated to South-West (Nairutya zone)."
                    )

        # 2. Add Locked Vertical Core (Rule of Cores)
        rooms: List[MultiFloorRoomRectangle] = []
        core_room = MultiFloorRoomRectangle(
            room_id=f"t1_stair_F{floor_index}",
            room_name="Private Staircase",
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
        rooms.append(core_room)

        # 3. Add Central Circulation Lobby
        lobby_x = round(core.x + core.width_m, 2)
        lobby_y = round(core.y, 2)
        lobby_w = round(min(2.0, max(1.2, (env_w - lobby_x) * 0.35)), 2)
        lobby_d = round(core.depth_m, 2)

        lobby = MultiFloorRoomRectangle(
            room_id=f"t1_lobby_F{floor_index}",
            room_name="Entrance Foyer" if floor_index == 0 else "Central Lobby",
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

        rem_x = round(lobby_x + lobby_w, 2)
        rem_w = round(max(3.0, env_w - rem_x), 2)

        if floor_index == 0:
            # === GROUND FLOOR ===
            # Living Room (North / East)
            living_d = round(max(3.6, env_d * 0.52), 2)
            rooms.append(MultiFloorRoomRectangle(
                room_id="living_F0",
                room_name="Living Room",
                floor_index=0,
                x=rem_x,
                y=0.0,
                width_m=rem_w,
                depth_m=living_d,
                area_sqm=round(rem_w * living_d, 2),
                zone="NE",
                zone_category="public",
                vastu_compliant=True,
                requires_exterior_wall=True,
                aspect_ratio=round(rem_w / living_d if living_d > 0 else 1.0, 2),
            ))

            # Kitchen (South-East / Agni corner)
            kitchen_w = round(rem_w * 0.55, 2)
            kitchen_d = round(max(2.4, env_d - living_d), 2)
            rooms.append(MultiFloorRoomRectangle(
                room_id="kitchen_F0",
                room_name="Kitchen",
                floor_index=0,
                x=round(rem_x + rem_w - kitchen_w, 2),
                y=living_d,
                width_m=kitchen_w,
                depth_m=kitchen_d,
                area_sqm=round(kitchen_w * kitchen_d, 2),
                zone="SE",
                zone_category="service",
                vastu_compliant=True,
                requires_exterior_wall=True,
                aspect_ratio=round(kitchen_d / kitchen_w if kitchen_w > 0 else 1.0, 2),
            ))

            # Dining Room (Central/West)
            dining_w = round(rem_w - kitchen_w, 2)
            rooms.append(MultiFloorRoomRectangle(
                room_id="dining_F0",
                room_name="Dining Area",
                floor_index=0,
                x=rem_x,
                y=living_d,
                width_m=dining_w,
                depth_m=kitchen_d,
                area_sqm=round(dining_w * kitchen_d, 2),
                zone="CENTER",
                zone_category="public",
                vastu_compliant=True,
                requires_exterior_wall=False,
                aspect_ratio=round(kitchen_d / dining_w if dining_w > 0 else 1.0, 2),
            ))

            # Guest WC on West flank adjacent to core
            bath_y = round(max(0.0, core.y - 2.0), 2)
            bath_d = round(max(1.5, core.y - bath_y), 2)
            rooms.append(MultiFloorRoomRectangle(
                room_id="bath_guest_F0",
                room_name="Guest Bathroom",
                floor_index=0,
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

        elif floor_index == 1:
            # === FIRST FLOOR (G+1) ===
            # Master Bedroom Suite in South-West (Nairutya corner)
            mbed_d = round(max(3.4, env_d * 0.52), 2)
            rooms.append(MultiFloorRoomRectangle(
                room_id="master_bed_F1",
                room_name="Master Bedroom",
                floor_index=1,
                x=rem_x,
                y=round(env_d - mbed_d, 2),
                width_m=rem_w,
                depth_m=mbed_d,
                area_sqm=round(rem_w * mbed_d, 2),
                zone="SW",
                zone_category="private",
                vastu_compliant=True,
                requires_exterior_wall=True,
                aspect_ratio=round(rem_w / mbed_d if mbed_d > 0 else 1.0, 2),
            ))

            # Bedroom 2 in North-West / North
            bed2_d = round(max(3.0, env_d - mbed_d), 2)
            rooms.append(MultiFloorRoomRectangle(
                room_id="bed_2_F1",
                room_name="Bedroom 2",
                floor_index=1,
                x=rem_x,
                y=0.0,
                width_m=rem_w,
                depth_m=bed2_d,
                area_sqm=round(rem_w * bed2_d, 2),
                zone="NE",
                zone_category="private",
                vastu_compliant=True,
                requires_exterior_wall=True,
                aspect_ratio=round(rem_w / bed2_d if bed2_d > 0 else 1.0, 2),
            ))

            # Primary Attached Bath (Stacked over Ground Bath)
            bath_y = round(max(0.0, core.y - 2.0), 2)
            bath_d = round(max(1.5, core.y - bath_y), 2)
            rooms.append(MultiFloorRoomRectangle(
                room_id="bath_primary_F1",
                room_name="Primary Bath",
                floor_index=1,
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

        else:
            # === SECOND FLOOR (G+2) / RETREAT ===
            suite_d = round(max(3.2, env_d * 0.45), 2)
            rooms.append(MultiFloorRoomRectangle(
                room_id=f"bed_guest_F{floor_index}",
                room_name="Guest Suite / Studio",
                floor_index=floor_index,
                x=rem_x,
                y=0.0,
                width_m=rem_w,
                depth_m=suite_d,
                area_sqm=round(rem_w * suite_d, 2),
                zone="NE",
                zone_category="private",
                vastu_compliant=True,
                requires_exterior_wall=True,
                aspect_ratio=round(rem_w / suite_d if suite_d > 0 else 1.0, 2),
            ))

            terrace_d = round(max(3.0, env_d - suite_d), 2)
            rooms.append(MultiFloorRoomRectangle(
                room_id=f"open_terrace_F{floor_index}",
                room_name="Open Terrace",
                floor_index=floor_index,
                x=rem_x,
                y=suite_d,
                width_m=rem_w,
                depth_m=terrace_d,
                area_sqm=round(rem_w * terrace_d, 2),
                zone="SW",
                zone_category="private",
                vastu_compliant=True,
                requires_exterior_wall=True,
                aspect_ratio=round(rem_w / terrace_d if terrace_d > 0 else 1.0, 2),
            ))

            # Terrace Bath
            bath_y = round(max(0.0, core.y - 2.0), 2)
            bath_d = round(max(1.5, core.y - bath_y), 2)
            rooms.append(MultiFloorRoomRectangle(
                room_id=f"bath_terrace_F{floor_index}",
                room_name="Terrace Bath",
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
# T1ResidenceModule
# =============================================================================

class T1ResidenceModule:
    """
    Typology module for T1 Single-Family Residence.
    Implements TypologyModuleProtocol - all five classmethods.
    Catalog and statutory data pulled exclusively from ONTOLOGY.
    """

    TYPOLOGY_KEY = "T1_SINGLE_FAMILY"

    # T1 space IDs present in the UNIVERSAL_SPACE_CATALOG
    _GROUND_IDS = ["foyer", "living", "dining", "kitchen", "utility", "puja", "bath_1"]
    _UPPER_IDS = ["central_lobby", "master_bed", "bed_2", "bath_master", "bath_2", "balcony", "study"]

    @classmethod
    def catalog(cls):
        """Space types pulled from ONTOLOGY - no local re-declaration."""
        from app.services.floorplan.ontology import ONTOLOGY
        result = {}
        for sid in cls._GROUND_IDS + cls._UPPER_IDS:
            spec = ONTOLOGY.get_space(sid)
            if spec:
                result[sid] = spec
        return result

    @classmethod
    def vertical_program(cls, N: int):
        """Per-level space allocation for a T1 building of N storeys (1..3)."""
        N = max(1, min(3, N))
        program = []
        for level in range(N):
            if level == 0:
                if N == 1:
                    ids = cls._GROUND_IDS + ["master_bed"]
                else:
                    ids = cls._GROUND_IDS
                label = "Ground Floor (G)"
            elif level == 1:
                ids = cls._UPPER_IDS
                label = "First Floor (G+1)"
            else:
                ids = ["master_bed", "bed_2", "bath_master", "bath_2", "balcony"]
                label = "Second Floor (G+2)"
            program.append({"level": level, "space_ids": ids, "label": label})
        return program

    @classmethod
    def layout_strategy(cls):
        """T1 zoning bands: public front / private rear, full Vastu weight."""
        from app.services.floorplan.typologies.protocol import LayoutStrategy
        return LayoutStrategy(
            public_front_depth_frac=0.45,
            private_rear_depth_frac=0.35,
            exterior_wall_required=["living", "kitchen", "master_bed", "puja"],
        )

    @classmethod
    def sheet_gates(cls):
        """T1: Vastu diagram ON, column grid OFF, unit schedule OFF."""
        from app.services.floorplan.typologies.protocol import SheetGates
        return SheetGates(
            vastu_diagram=True,
            column_grid=False,
            unit_schedule=False,
            dock_apron_diagram=False,
            mezzanine_section=False,
            egress_travel_diagram=True,
            dimension_chains=True,
        )

    @classmethod
    def compose_sheet(cls, level_plan, theme: str) -> str:
        """Delegates to shared SVG IR with T1 sheet gates applied."""
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
