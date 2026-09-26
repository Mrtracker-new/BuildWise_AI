"""
warehouse.py - Typology T4: Warehouse / Light Industrial Facility
====================================================================
Implements structural column bay grid (6.0m to 9.0m clear-span), clear height >= 6.0m,
loading dock shutter bays with apron access, ground storage, and office mezzanine (+3.6m).
"""

from typing import List, Dict, Tuple, Optional, Any
from app.schemas.multi_floor_plan import (
    MultiFloorRoomRectangle,
    VerticalCoreSpec,
    DuctShaftSpec,
    ExtractedClientConstraints,
)

T4_CATALOG: Dict[str, Dict[str, Any]] = {
    "storage_bay": {
        "name": "Clear-Span Storage Bay",
        "min_area_sqm": 80.0,
        "min_width_m": 6.00,
        "max_aspect_ratio": 2.50,
        "vastu_preferred": ["SW", "W", "S"],
        "category": "industrial_bay",
    },
    "dock_bay": {
        "name": "Loading Dock Shutter Bay",
        "min_area_sqm": 25.0,
        "min_width_m": 3.60,
        "max_aspect_ratio": 2.00,
        "vastu_preferred": ["N", "NW", "E"],
        "category": "industrial_bay",
    },
    "dispatch": {
        "name": "Dispatch & Staging Buffer",
        "min_area_sqm": 30.0,
        "min_width_m": 4.50,
        "max_aspect_ratio": 2.00,
        "vastu_preferred": ["N", "NW", "E"],
        "category": "industrial_bay",
    },
    "worker_amenity": {
        "name": "Staff Locker & Sanitary WC",
        "min_area_sqm": 12.0,
        "min_width_m": 2.50,
        "max_aspect_ratio": 2.00,
        "vastu_preferred": ["W", "NW"],
        "category": "service",
    },
    "admin_office": {
        "name": "Administrative Office Mezzanine",
        "min_area_sqm": 35.0,
        "min_width_m": 4.50,
        "max_aspect_ratio": 2.00,
        "vastu_preferred": ["N", "E", "NE"],
        "category": "public",
    },
    "conf_room": {
        "name": "Conference / Operations Room",
        "min_area_sqm": 18.0,
        "min_width_m": 3.60,
        "max_aspect_ratio": 1.80,
        "vastu_preferred": ["N", "E"],
        "category": "public",
    },
    "ind_stair": {
        "name": "Industrial Fire Egress Stair",
        "min_area_sqm": 7.5,
        "min_width_m": 1.50,
        "max_aspect_ratio": 2.00,
        "vastu_preferred": ["S", "SW", "W"],
        "category": "circulation",
    },
    "admin_catwalk": {
        "name": "Mezzanine Access Catwalk",
        "min_area_sqm": 15.0,
        "min_width_m": 1.50,
        "max_aspect_ratio": 4.00,
        "vastu_preferred": ["CENTER"],
        "category": "circulation",
    },
}

# Typology T4 Logistics Bay & Mezzanine Adjacency Graph
T4_ADJACENCY_GRAPH: Dict[str, List[str]] = {
    "t4_dock_bay": ["t4_dispatch"],
    "t4_dispatch": ["t4_dock_bay", "t4_storage_bay"],
    "t4_storage_bay": ["t4_dispatch", "t4_ind_stair", "t4_amenity"],
    "t4_amenity": ["t4_storage_bay"],
    "t4_ind_stair": ["t4_storage_bay", "t4_catwalk"],
    "t4_catwalk": ["t4_ind_stair", "t4_admin_office", "t4_conf_room"],
    "t4_admin_office": ["t4_catwalk", "t4_conf_room"],
    "t4_conf_room": ["t4_catwalk", "t4_admin_office"],
}


class T4WarehouseSolver:
    """
    Typology T4 Layout Solver: Generates industrial logistics and warehouse floor plates
    featuring clear-span bays, rolling dock doors, and mezzanine administrative blocks.
    """

    catalog = T4_CATALOG
    adjacency_graph = T4_ADJACENCY_GRAPH

    @classmethod
    def synthesize_floor_rooms(
        cls,
        floor_index: int,
        envelope: Dict[str, float],
        core: VerticalCoreSpec,
        ducts: List[DuctShaftSpec],
        strictness: str = "low",
        client_constraints: Optional[ExtractedClientConstraints] = None,
    ) -> Tuple[List[MultiFloorRoomRectangle], List[str]]:
        """
        Synthesizes warehouse floor:
        - Ground Level (F0): Clear-span storage bay + Frontage loading docks + Dispatch buffer + Staff WC.
        - Mezzanine Level (F1..F3): Office block overlooking storage bay + Operations conference room + Break room.
        """
        env_w = envelope["width"]
        env_d = envelope["depth"]
        warnings: List[str] = []

        rooms: List[MultiFloorRoomRectangle] = []

        # 1. Industrial Steel Egress Staircase (Locked Anchor)
        stair_room = MultiFloorRoomRectangle(
            room_id=f"t4_ind_stair_F{floor_index}",
            room_name="Industrial Steel Staircase Core",
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

        # 2. Circulation Lobby / Access Catwalk
        lobby_x = round(core.x + core.width_m, 2)
        lobby_y = round(core.y, 2)
        lobby_w = round(min(2.0, max(1.2, (env_w - lobby_x) * 0.25)), 2)
        lobby_d = round(core.depth_m, 2)

        lobby = MultiFloorRoomRectangle(
            room_id=f"t4_catwalk_F{floor_index}",
            room_name="Ground Staging Lobby" if floor_index == 0 else "Mezzanine Access Catwalk",
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
        rem_w = round(max(4.0, env_w - rem_x), 2)

        if floor_index == 0:
            # === GROUND LEVEL: Heavy Storage & Logistics Loading Bay ===
            # Front Loading Dock Bay (North Facade / Direct Apron Access)
            dock_d = round(max(3.6, env_d * 0.30), 2)
            rooms.append(MultiFloorRoomRectangle(
                room_id="t4_dock_bay_F0",
                room_name="Loading Dock Bays (Rolling Shutters)",
                floor_index=0,
                x=rem_x,
                y=0.0,
                width_m=rem_w,
                depth_m=dock_d,
                area_sqm=round(rem_w * dock_d, 2),
                zone="N",
                zone_category="industrial_bay",
                vastu_compliant=True,
                requires_exterior_wall=True,
                aspect_ratio=round(rem_w / dock_d if dock_d > 0 else 1.0, 2),
            ))

            # Dispatch & Staging Buffer
            dispatch_d = round(max(3.0, env_d * 0.25), 2)
            rooms.append(MultiFloorRoomRectangle(
                room_id="t4_dispatch_F0",
                room_name="Dispatch & Pallet Staging Area",
                floor_index=0,
                x=rem_x,
                y=dock_d,
                width_m=rem_w,
                depth_m=dispatch_d,
                area_sqm=round(rem_w * dispatch_d, 2),
                zone="CENTER",
                zone_category="industrial_bay",
                vastu_compliant=True,
                requires_exterior_wall=False,
                aspect_ratio=round(rem_w / dispatch_d if dispatch_d > 0 else 1.0, 2),
            ))

            # Main Clear-Span Storage Bay (Rear Half)
            storage_y = round(dock_d + dispatch_d, 2)
            storage_d = round(env_d - storage_y, 2)
            rooms.append(MultiFloorRoomRectangle(
                room_id="t4_storage_bay_F0",
                room_name="Clear-Span Industrial Storage Bay",
                floor_index=0,
                x=rem_x,
                y=storage_y,
                width_m=rem_w,
                depth_m=storage_d,
                area_sqm=round(rem_w * storage_d, 2),
                zone="S",
                zone_category="industrial_bay",
                vastu_compliant=True,
                requires_exterior_wall=True,
                aspect_ratio=round(rem_w / storage_d if storage_d > 0 else 1.0, 2),
            ))

            # Staff Locker & Sanitary Block (West Flank)
            staff_y = round(max(0.0, core.y - 2.5), 2)
            staff_d = round(max(1.8, core.y - staff_y), 2)
            rooms.append(MultiFloorRoomRectangle(
                room_id="t4_worker_wc_F0",
                room_name="Staff Locker & Sanitary Amenities",
                floor_index=0,
                x=0.0,
                y=staff_y,
                width_m=round(core.width_m, 2),
                depth_m=staff_d,
                area_sqm=round(core.width_m * staff_d, 2),
                zone="NW",
                zone_category="service",
                vastu_compliant=True,
                requires_exterior_wall=True,
                aspect_ratio=round(core.width_m / staff_d if staff_d > 0 else 1.0, 2),
            ))

        else:
            # === MEZZANINE LEVEL (EC-05: Industrial Mezzanine at +3.60m) ===
            # Administrative Office (Front Facade with Daylight)
            admin_d = round(env_d * 0.55, 2)
            rooms.append(MultiFloorRoomRectangle(
                room_id=f"t4_admin_office_F{floor_index}",
                room_name="Administrative Office Mezzanine",
                floor_index=floor_index,
                x=rem_x,
                y=0.0,
                width_m=rem_w,
                depth_m=admin_d,
                area_sqm=round(rem_w * admin_d, 2),
                zone="NE",
                zone_category="public",
                vastu_compliant=True,
                requires_exterior_wall=True,
                aspect_ratio=round(rem_w / admin_d if admin_d > 0 else 1.0, 2),
            ))

            # Conference & Operations Room (Overlooking Warehouse)
            conf_d = round(env_d - admin_d, 2)
            rooms.append(MultiFloorRoomRectangle(
                room_id=f"t4_conf_room_F{floor_index}",
                room_name="Operations & Conference Room",
                floor_index=floor_index,
                x=rem_x,
                y=admin_d,
                width_m=rem_w,
                depth_m=conf_d,
                area_sqm=round(rem_w * conf_d, 2),
                zone="SE",
                zone_category="public",
                vastu_compliant=True,
                requires_exterior_wall=True,
                aspect_ratio=round(rem_w / conf_d if conf_d > 0 else 1.0, 2),
            ))

            # Mezzanine Executive Restroom
            staff_y = round(max(0.0, core.y - 2.5), 2)
            staff_d = round(max(1.8, core.y - staff_y), 2)
            rooms.append(MultiFloorRoomRectangle(
                room_id=f"t4_mezz_wc_F{floor_index}",
                room_name="Mezzanine Executive Restroom",
                floor_index=floor_index,
                x=0.0,
                y=staff_y,
                width_m=round(core.width_m, 2),
                depth_m=staff_d,
                area_sqm=round(core.width_m * staff_d, 2),
                zone="NW",
                zone_category="service",
                vastu_compliant=True,
                requires_exterior_wall=True,
                aspect_ratio=round(core.width_m / staff_d if staff_d > 0 else 1.0, 2),
            ))

        return rooms, warnings


# =============================================================================
# STAGE 3 PROTOCOL IMPLEMENTATION: T4WarehouseModule
# =============================================================================

class T4WarehouseModule:
    """
    Stage-3 typology module for T4 Warehouse / Light Industrial.
    Implements TypologyModuleProtocol - all five classmethods.
    Column grid 6m, dock apron, mezzanine +3.6m; Vastu weight OFF (0.05).
    """

    TYPOLOGY_KEY = "T4_WAREHOUSE"

    _GROUND_IDS = ["dock_bay", "dispatch", "heavy_bay", "racked_storage",
                   "worker_amenity", "guard_house"]
    _MEZZ_IDS = ["admin_catwalk", "admin_office", "conf_room"]

    @classmethod
    def catalog(cls):
        """Space types pulled from ONTOLOGY - no local re-declaration."""
        from app.services.floorplan.ontology import ONTOLOGY
        result = {}
        ids = (cls._GROUND_IDS + cls._MEZZ_IDS +
               ["storage_bay", "dock_bay", "dispatch", "ind_stair", "admin_catwalk"])
        for sid in ids:
            spec = ONTOLOGY.get_space(sid)
            if spec:
                result[sid] = spec
        return result

    @classmethod
    def vertical_program(cls, N: int):
        """
        T4 is 1-2 levels only (NBC floor_limits (1,2)).
        Level 0: ground logistics bay.
        Level 1: mezzanine administrative block at +3.6m clear height.
        """
        N = max(1, min(2, N))
        program = []
        for level in range(N):
            if level == 0:
                ids = cls._GROUND_IDS
                label = "Ground Level — Clear-Span Logistics Bay (6.0m clear height)"
            else:
                ids = cls._MEZZ_IDS
                label = "Mezzanine Level (+3.60m) — Administrative Office Block"
            program.append({"level": level, "space_ids": ids, "label": label})
        return program

    @classmethod
    def layout_strategy(cls):
        """T4: 6m column bay, 3.6m dock apron at N facade, mezzanine at +3.6m."""
        from app.services.floorplan.typologies.protocol import LayoutStrategy
        return LayoutStrategy(
            public_front_depth_frac=0.30,   # Dock apron + dispatch at front
            private_rear_depth_frac=0.50,   # Deep storage bays at rear
            column_grid_bay_m=6.00,
            dock_apron_depth_m=3.60,
            mezzanine_elevation_m=3.60,
            exterior_wall_required=["dock_bay", "storage_bay", "admin_office"],
        )

    @classmethod
    def sheet_gates(cls):
        """T4: column grid ON, dock apron ON, mezzanine section ON, vastu OFF."""
        from app.services.floorplan.typologies.protocol import SheetGates
        return SheetGates(
            vastu_diagram=False,
            column_grid=True,
            unit_schedule=False,
            dock_apron_diagram=True,
            mezzanine_section=True,
            egress_travel_diagram=True,
            dimension_chains=True,
        )

    @classmethod
    def compose_sheet(cls, level_plan, theme: str) -> str:
        """Delegates to shared SVG IR with T4 sheet gates (column grid, dock apron)."""
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
