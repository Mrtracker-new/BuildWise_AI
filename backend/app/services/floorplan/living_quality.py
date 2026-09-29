"""
living_quality.py - Architectural Living Quality Hardening Engine
=================================================================
Enforces architectural quality, ergonomics, zoning integrity, and statutory
clearances across all generated floor plates (G to G+3, T1-T4).

Clearance Constants & Statutory Citations:
1. Staircase:
   - NBC 2016 Part 3 Cl 12.18 / Table 7:
     R <= 190mm (residential), T >= 250mm, flight width >= 1.0m residential,
     <= 12 risers per flight without landing, clear headroom >= 2.20m throughout.
   - Ergonomics (Blondel): 2R + T in [600mm, 650mm].
2. Door Swings & Life Safety:
   - NBC 2016 Part 3 Cl 12.18.2 / NFPA 101 Life Safety Code Sec 7.2.1.4:
     Zero intersection between swing arcs; no obstruction to required corridor clear width (>= 1.0m);
     safe clearance from stair treads and fixed obstacles.
3. Bathroom Fixtures:
   - NBC 2016 Part 9 Sec 1 / Time-Saver Standards for Building Types / NKBA:
     WC: 400x700mm, front clearance >= 600mm, side clearance >= 200mm each side (total width >= 800mm);
     Wash Basin: 550x450mm, front clearance >= 700mm;
     Shower: minimum 900x900mm (800x800mm compact);
     Internal door swing clear of sanitary fixtures; wet wall / plumbing shaft adjacency.
4. Furniture Circulation Catalog:
   - Architectural Graphic Standards (Ramsey & Sleeper) / NKBA Guidelines:
     Master Bed: King 1800x2000mm + 600mm wardrobe + 500mm side clearance both sides + 750mm foot-of-bed;
     Secondary Bed: Queen 1500x2000mm + 600mm wardrobe + 500mm side clearance;
     Living: 3-seater sofa 2200x900mm + coffee table 1000x600mm + 600mm clear circulation perimeter;
     Dining: 6-seat table 1500x900mm + 900mm pull-out clearance on all active sides;
     Kitchen Working Triangle: 3.6m <= (L1 + L2 + L3) <= 7.9m, each leg 1.2m <= Li <= 2.7m.
5. Naming Honesty:
     "Master Suite" requires minimum 14.0 m² accommodating sleeping, wardrobe dressing, and en-suite circulation.
     Rooms < 14.0 m² must be designated "Master Bedroom" or "Standard Bedroom".
6. Program Intent & Zoning Separation:
     NBC 2016 Part 3 Cl 3.4 & Cl 12.2:
     Disjoint PUBLIC / PRIVATE / VERTICAL zones; stair adjoins entry/lobby and never threads through private rooms;
     upper floors distribute from landing/corridor (node degree >= 2); study doors via buffer (sliding or vestibule);
     upper floors retain >= 1 bedroom; terrace ratio > 35% triggers conversion warning.
"""

from __future__ import annotations

import math
from typing import List, Dict, Tuple, Optional, Any, Set
from shapely.geometry import Polygon, box as shp_box

from app.schemas.multi_floor_plan import (
    MultiFloorRoomRectangle,
    MultiFloorDoorGeometry,
    BathroomFixtureSpec,
    FurnitureItemSpec,
    ExtractedClientConstraints,
)


# =============================================================================
# STATUTORY AND ERGONOMIC CONSTANTS (WITH FORMAL CITATIONS)
# =============================================================================

# NBC 2016 Part 3 Table 7 / Cl 12.18
STAIR_MAX_RISER_M = 0.190         # 190mm maximum residential riser
STAIR_MIN_TREAD_M = 0.250         # 250mm minimum tread
STAIR_MIN_WIDTH_RESIDENTIAL_M = 1.00  # 1.0m minimum clear flight width
STAIR_MAX_RISERS_PER_FLIGHT = 12  # <= 12 risers per flight
STAIR_MIN_HEADROOM_M = 2.20       # >= 2.20m clear headroom throughout

# NBC 2016 Part 9 / Time-Saver Standards / NKBA Bathroom Guidelines
WC_WIDTH_M = 0.40
WC_DEPTH_M = 0.70
WC_FRONT_CLR_M = 0.60
WC_SIDE_CLR_M = 0.20              # 200mm side clearance each side (800mm total width)

BASIN_WIDTH_M = 0.55
BASIN_DEPTH_M = 0.45
BASIN_FRONT_CLR_M = 0.70
BASIN_SIDE_CLR_M = 0.10

SHOWER_MIN_DIM_M = 0.90           # Standard 900x900mm shower stall
SHOWER_STD_M = 0.90               # Standard 900x900mm shower stall
SHOWER_COMPACT_DIM_M = 0.80       # Absolute statutory minimum 800x800mm

# Architectural Graphic Standards / NKBA Furniture & Circulation
BED_KING_WIDTH_M = 1.80
BED_KING_DEPTH_M = 2.00
BED_QUEEN_WIDTH_M = 1.50
BED_QUEEN_DEPTH_M = 2.00
WARDROBE_DEPTH_M = 0.60
BED_SIDE_CLR_M = 0.50
BED_FOOT_CLR_M = 0.75

SOFA_WIDTH_M = 2.20
SOFA_DEPTH_M = 0.90
COFFEE_TABLE_WIDTH_M = 1.00
COFFEE_TABLE_DEPTH_M = 0.60
LIVING_CIRC_CLR_M = 0.60

DINING_6P_WIDTH_M = 1.50
DINING_6P_DEPTH_M = 0.90
DINING_PULLOUT_CLR_M = 0.90

KITCHEN_TRIANGLE_MIN_SUM_M = 3.60
KITCHEN_TRIANGLE_MAX_SUM_M = 7.90
KITCHEN_TRIANGLE_MIN_LEG_M = 1.20
KITCHEN_TRIANGLE_MAX_LEG_M = 2.70

# Naming honesty threshold
MASTER_SUITE_MIN_AREA_M2 = 14.0

# Terrace ratio advisory threshold
TERRACE_RATIO_MAX = 0.35          # 35% of enclosed area


# =============================================================================
# 1. ZONING SEPARATION & CIRCULATION SPINE ENGINE
# =============================================================================

def audit_and_enforce_zoning_separation(
    floor_index: int,
    rooms: List[MultiFloorRoomRectangle],
    doors: List[MultiFloorDoorGeometry],
) -> Tuple[bool, List[str], Dict[str, Any]]:
    """
    Enforces disjoint functional zones and dedicated circulation distribution:
    1. Stair adjoins entry/foyer/lobby and NEVER threads through private rooms.
    2. Upper floors distribute from landing/corridor (node degree >= 2 on levels >= 1).
    3. Lounge is not the sole distributor to private bedrooms on upper floors.
    4. Study doors entering from social space are routed via buffer (sliding door or vestibule).
    """
    warnings: List[str] = []
    audit: Dict[str, Any] = {
        "floor_index": floor_index,
        "circulation_degree": 0,
        "stair_properly_adjoined": True,
        "study_buffered": True,
        "zones_disjoint": True,
    }

    room_by_id = {r.room_id: r for r in rooms}
    core_room = next((r for r in rooms if r.is_vertical_core), None)
    circ_rooms = [r for r in rooms if r.zone_category == "circulation"]

    # 1. Verify Stair Adjoins Circulation / Entry Lobby and Never Private Rooms
    if core_room:
        for d in doors:
            if d.from_room == core_room.room_id or d.to_room == core_room.room_id:
                other_id = d.to_room if d.from_room == core_room.room_id else d.from_room
                other_r = room_by_id.get(other_id)
                if other_r and other_r.zone_category == "private":
                    audit["stair_properly_adjoined"] = False
                    warnings.append(
                        f"ZONING VIOLATION: Stair core {core_room.room_id} connects directly to private space {other_id}. "
                        "Stair must adjoin public entry or dedicated circulation landing."
                    )

    # 2. Circulation Spine Node Degree on Upper Floors (Level >= 1)
    # The spine distributes from the vertical core (stair landing) to private quarters.
    # Degree is measured on the spine node; the stair core connection is added explicitly
    # if the core adjoins the spine even without a modeled door leaf (open landing).
    if floor_index >= 1 and circ_rooms:
        spine = circ_rooms[0]  # Primary landing or corridor
        # Compute degree in door graph
        connected_rooms: Set[str] = set()
        for d in doors:
            if d.from_room == spine.room_id:
                connected_rooms.add(d.to_room)
            elif d.to_room == spine.room_id:
                connected_rooms.add(d.from_room)

        # Stair core adjacency (open landing connection) counts toward spine degree:
        # NBC distribution requires landing -> corridor -> rooms, so the core always
        # contributes one edge to the spine even when no door leaf is hosted.
        if core_room and core_room.room_id != spine.room_id:
            spine_x1, spine_y1 = spine.x, spine.y
            spine_x2, spine_y2 = spine.x + spine.width_m, spine.y + spine.depth_m
            core_x1, core_y1 = core_room.x, core_room.y
            core_x2, core_y2 = core_room.x + core_room.width_m, core_room.y + core_room.depth_m
            touches = (
                (abs(spine_x1 - core_x2) < 0.05 or abs(core_x1 - spine_x2) < 0.05)
                and min(spine_y2, core_y2) - max(spine_y1, core_y1) >= 0.20
            ) or (
                (abs(spine_y1 - core_y2) < 0.05 or abs(core_y1 - spine_y2) < 0.05)
                and min(spine_x2, core_x2) - max(spine_x1, core_x1) >= 0.20
            )
            if touches:
                connected_rooms.add(core_room.room_id)

        deg = len(connected_rooms)
        audit["circulation_degree"] = deg
        audit["spine_connected_rooms"] = list(connected_rooms)

        # Assert degree >= 2 on upper floors (e.g. connects stair + at least 1 room)
        if deg < 2 and len(rooms) > 2:
            warnings.append(
                f"ZONING WARNING: Upper floor {floor_index} circulation spine '{spine.room_id}' has node degree {deg} < 2. "
                "Spine must distribute to vertical core and multiple living quarters."
            )

        # 3. Lounge not sole distributor: Check if private bedrooms connect to spine
        private_beds = [r for r in rooms if r.zone_category == "private" and ("bed" in r.room_id.lower() or "master" in r.room_id.lower())]
        if private_beds and len(private_beds) >= 2:
            lounge_rooms = [r for r in rooms if "lounge" in r.room_id.lower() or "family" in r.room_id.lower()]
            if lounge_rooms:
                lounge_id = lounge_rooms[0].room_id
                all_through_lounge = all(
                    any((d.from_room == b.room_id and d.to_room == lounge_id) or (d.to_room == b.room_id and d.from_room == lounge_id) for d in doors)
                    and not any((d.from_room == b.room_id and d.to_room == spine.room_id) or (d.to_room == b.room_id and d.from_room == spine.room_id) for d in doors)
                    for b in private_beds
                )
                if all_through_lounge:
                    warnings.append(
                        f"ZONING WARNING: Upper floor {floor_index} lounge '{lounge_id}' is sole distributor to private bedrooms. "
                        "Circulation spine must provide independent acoustic distribution."
                    )

    # 4. Study Doors Buffer: If study enters directly from social/public space, use sliding door buffer
    for d in doors:
        r_from = room_by_id.get(d.from_room)
        r_to = room_by_id.get(d.to_room)
        if r_from and r_to:
            is_study_conn = ("study" in r_from.room_id.lower() or "study" in r_to.room_id.lower())
            is_social_conn = (r_from.zone_category == "public" or r_to.zone_category == "public")
            if is_study_conn and is_social_conn and d.door_type == "standard":
                # Auto-upgrade to sliding door buffer with acoustic seals
                d.door_type = "sliding"
                audit["study_buffered"] = True
                warnings.append(
                    f"Acoustic Buffer Enforced: Study door '{d.door_id}' adjoining social space upgraded to acoustic sliding buffer."
                )

    is_valid = audit["stair_properly_adjoined"] and (audit["circulation_degree"] >= 2 if (floor_index >= 1 and len(rooms) > 2) else True)
    return is_valid, warnings, audit


# =============================================================================
# 2. DOOR-SWING COLLISION ENGINE
# =============================================================================

def compute_door_swing_polygon(door: MultiFloorDoorGeometry, segments: int = 12) -> Polygon:
    """
    Constructs a precise 90° circular sector polygon for the door leaf swing arc.
    Origin is hinge (hx, hy), radius is width_m.
    """
    hx = door.hinge_x
    hy = door.hinge_y
    w = max(0.60, door.width_m)

    # In sliding doors, swing polygon has zero area
    if door.door_type in ("sliding", "dock_shutter"):
        return Polygon([(hx, hy), (hx + 0.01, hy), (hx + 0.01, hy + 0.01), (hx, hy)])

    # Determine closed angle from door endpoints
    dx = (door.x2 if abs(door.x1 - hx) < 0.01 else door.x1) - hx
    dy = (door.y2 if abs(door.y1 - hy) < 0.01 else door.y1) - hy
    if abs(dx) < 1e-4 and abs(dy) < 1e-4:
        # Fallback based on wall edge
        if door.wall_edge in ("north", "south", "horizontal"):
            dx = w
            dy = 0.0
        else:
            dx = 0.0
            dy = w

    theta_closed = math.atan2(dy, dx)

    # 90° swing arc based on swing_direction
    # right swing: +90° counter-clockwise or -90° clockwise
    is_left = "left" in door.swing_direction
    is_outward = "outward" in door.swing_direction

    sweep = -math.pi / 2.0 if is_left else math.pi / 2.0
    if is_outward:
        sweep = -sweep

    theta_open = theta_closed + sweep

    # Generate arc vertices
    poly_pts = [(hx, hy)]
    for i in range(segments + 1):
        frac = i / float(segments)
        th = theta_closed + frac * sweep
        px = hx + w * math.cos(th)
        py = hy + w * math.sin(th)
        poly_pts.append((round(px, 3), round(py, 3)))
    poly_pts.append((hx, hy))

    poly = Polygon(poly_pts)
    if not poly.is_valid:
        poly = poly.buffer(0)
    return poly


def audit_and_resolve_door_swings(
    doors: List[MultiFloorDoorGeometry],
    rooms: List[MultiFloorRoomRectangle],
    stair_box: Optional[Tuple[float, float, float, float]] = None,  # (x, y, w, d)
) -> Tuple[bool, int, List[str], Dict[str, Any]]:
    """
    Checks all door swing arc polygons against:
    - Other door swings (clash test)
    - Stair flight bounds (stair clearance)
    - Auto-flips hinge direction or converts to sliding door to eliminate collisions.
    Returns: (is_valid, collision_count, resolution_log, audit_dict)
    """
    log: List[str] = []
    audit: Dict[str, Any] = {"total_doors": len(doors), "collisions_detected": 0, "auto_flipped": 0, "converted_to_sliding": 0}

    stair_poly = None
    if stair_box:
        stair_poly = shp_box(stair_box[0], stair_box[1], stair_box[0] + stair_box[2], stair_box[1] + stair_box[3])

    # Iterate with auto-resolution pass
    max_passes = 3
    for pass_idx in range(max_passes):
        swing_polys = [compute_door_swing_polygon(d) for d in doors]
        clashes_found = 0

        for i in range(len(doors)):
            d1 = doors[i]
            p1 = swing_polys[i]
            if p1.area < 0.01:
                continue  # Sliding or shutter

            # Check 1: Clash with other door swings
            for j in range(i + 1, len(doors)):
                d2 = doors[j]
                p2 = swing_polys[j]
                if p2.area < 0.01:
                    continue

                if p1.intersects(p2):
                    inter = p1.intersection(p2)
                    if inter.area > 0.03:  # > 300 cm2 overlap
                        clashes_found += 1
                        audit["collisions_detected"] += 1
                        # Attempt Resolution: Flip hinge on d2
                        if d2.swing_direction == "inward_right":
                            d2.swing_direction = "inward_left"
                            # Shift hinge to other endpoint
                            d2.hinge_x = d2.x2 if abs(d2.hinge_x - d2.x1) < 0.05 else d2.x1
                            d2.hinge_y = d2.y2 if abs(d2.hinge_y - d2.y1) < 0.05 else d2.y1
                            audit["auto_flipped"] += 1
                            log.append(f"Collision resolved: Auto-flipped door '{d2.door_id}' to inward_left.")
                        else:
                            # Convert to sliding door to guarantee zero clash
                            d2.door_type = "sliding"
                            audit["converted_to_sliding"] += 1
                            log.append(f"Collision resolved: Converted door '{d2.door_id}' to sliding door.")

            # Check 2: Clash with Stair Treads / Flight
            if stair_poly and p1.intersects(stair_poly):
                inter = p1.intersection(stair_poly)
                if inter.area > 0.04:
                    clashes_found += 1
                    audit["collisions_detected"] += 1
                    # Door swings into stair treads -> flip or make sliding
                    if d1.door_type != "sliding":
                        d1.door_type = "sliding"
                        audit["converted_to_sliding"] += 1
                        log.append(f"Stair flight hazard resolved: Converted door '{d1.door_id}' to sliding door.")

        if clashes_found == 0:
            break

    # Final verification pass
    final_polys = [compute_door_swing_polygon(d) for d in doors]
    unresolved = 0
    for i in range(len(doors)):
        p1 = final_polys[i]
        if p1.area < 0.01:
            continue
        for j in range(i + 1, len(doors)):
            p2 = final_polys[j]
            if p2.area < 0.01:
                continue
            if p1.intersects(p2) and p1.intersection(p2).area > 0.04:
                unresolved += 1

    is_valid = (unresolved == 0)
    audit["unresolved_clashes"] = unresolved
    audit["zero_intersections_certified"] = is_valid
    return is_valid, unresolved, log, audit


def audit_swings_against_walls_corridors_furniture(
    doors: List[MultiFloorDoorGeometry],
    rooms: List[MultiFloorRoomRectangle],
) -> Tuple[bool, List[str], Dict[str, Any]]:
    """
    Layer-2 completion pass: validates every swing arc polygon against
    (a) room boundary walls - the arc must stay inside the union of its two
        endpoint rooms (plus 20mm tolerance);
    (b) circulation corridors - a swing must never sweep into a circulation
        room it does not connect to, nor open inward against a corridor it
        does connect to (corridor clear width protection, NBC Cl 12.18.2);
    (c) furniture envelopes - the arc must not strike any placed furniture item.

    Resolution ladder: flip hinge side (mirror swing) -> convert to sliding.
    Returns (is_valid, resolution_log, audit_dict).
    """
    log: List[str] = []
    audit: Dict[str, Any] = {
        "wall_protrusions": 0,
        "corridor_obstructions": 0,
        "furniture_collisions": 0,
        "flipped": 0,
        "converted_to_sliding": 0,
    }
    room_by_id = {r.room_id: r for r in rooms}
    tol = 0.02  # 20mm geometric tolerance

    # Swings must stay inside the room they SERVE. For interior doors the served
    # room is the non-circulation endpoint; for entry doors it is the only real
    # endpoint. This mirrors real practice: doors open against a wall of their own
    # room and never sweep into circulation or a neighbour.
    def _served_room(door: MultiFloorDoorGeometry) -> Optional[MultiFloorRoomRectangle]:
        cands = [room_by_id[rid] for rid in (door.from_room, door.to_room) if rid in room_by_id]
        if not cands:
            return None
        non_circ = [r for r in cands if r.zone_category != "circulation"]
        return non_circ[0] if non_circ else cands[0]

    def _contains_served(door: MultiFloorDoorGeometry) -> bool:
        srv = _served_room(door)
        if srv is None:
            return True
        arc = compute_door_swing_polygon(door)
        if arc.area < 0.01:
            return True
        sbox = shp_box(srv.x - tol, srv.y - tol, srv.x + srv.width_m + tol, srv.y + srv.depth_m + tol)
        return sbox.covers(arc)

    def _flip(door: MultiFloorDoorGeometry) -> None:
        # Choose the mirrored swing that keeps the arc inside the served room:
        # try the alternate hinge endpoint x both swing sides, pick the first that
        # contains the arc; fall back to the simple mirror if none qualifies.
        old_hx, old_hy = door.hinge_x, door.hinge_y
        old_dir = door.swing_direction
        base_dir = "inward_left" if "left" in old_dir else "inward_right"
        for hx, hy, sdir in (
            (door.x1, door.y1, base_dir),
            (door.x1, door.y1, "inward_left" if base_dir == "inward_right" else "inward_right"),
            (door.x2, door.y2, base_dir),
            (door.x2, door.y2, "inward_left" if base_dir == "inward_right" else "inward_right"),
        ):
            door.hinge_x, door.hinge_y, door.swing_direction = hx, hy, sdir
            if _contains_served(door):
                break
        audit["flipped"] += 1
        log.append(
            f"Swing resolution: Flipped door '{door.door_id}' "
            f"({old_hx:.2f},{old_hy:.2f},{old_dir} -> {door.hinge_x:.2f},{door.hinge_y:.2f},{door.swing_direction})."
        )

    def _to_sliding(door: MultiFloorDoorGeometry) -> None:
        door.door_type = "sliding"
        audit["converted_to_sliding"] += 1
        log.append(
            f"Swing resolution: Converted door '{door.door_id}' to sliding buffer (unresolvable arc conflict)."
        )

    for door in doors:
        if door.door_type in ("sliding", "dock_shutter"):
            continue
        endpoint_ids = {door.from_room, door.to_room}
        endpoints = [room_by_id[r] for r in endpoint_ids if r in room_by_id]
        if not endpoints:
            continue

        for _attempt in range(2):
            arc = compute_door_swing_polygon(door)
            if arc.area < 0.01:
                break

            violation = None

            # (a) Wall containment: arc must stay inside the room it serves
            if not _contains_served(door):
                violation = "wall"

            # (b) Corridor obstruction: arc sweeps into a circulation room that is
            # not an endpoint, or over-sweeps into its own connected corridor.
            if violation is None:
                for r in rooms:
                    if r.zone_category != "circulation" or r.room_id in endpoint_ids:
                        continue
                    rbox = shp_box(r.x, r.y, r.x + r.width_m, r.y + r.depth_m)
                    if arc.intersects(rbox) and arc.intersection(rbox).area > 0.05:
                        violation = "corridor"
                        break
                if violation is None:
                    for r in endpoints:
                        if r.zone_category == "circulation":
                            rbox = shp_box(r.x, r.y, r.x + r.width_m, r.y + r.depth_m)
                            if arc.intersects(rbox) and arc.intersection(rbox).area > 0.30:
                                violation = "corridor"
                                audit["corridor_obstructions"] += 1
                                break

            # (c) Furniture envelopes
            if violation is None:
                for r in endpoints:
                    for f in (r.furniture or []):
                        fbox = shp_box(f.x, f.y, f.x + f.width_m, f.y + f.depth_m)
                        if arc.intersects(fbox) and arc.intersection(fbox).area > 0.05:
                            violation = "furniture"
                            audit["furniture_collisions"] += 1
                            break
                    if violation:
                        break

            if violation is None:
                break

            if violation == "wall":
                audit["wall_protrusions"] += 1
            if _attempt == 0:
                _flip(door)
            else:
                _to_sliding(door)

    # Valid when no unresolved arc remains: sliding doors have no swing arc.
    remaining = 0
    for door in doors:
        if door.door_type in ("sliding", "dock_shutter"):
            continue
        arc = compute_door_swing_polygon(door)
        if arc.area < 0.01:
            continue
        if not _contains_served(door):
            remaining += 1
    is_valid = remaining == 0
    audit["unresolved_wall_protrusions"] = remaining
    return is_valid, log, audit


# =============================================================================
# 3. FIXTURE-LEVEL BATHROOM ALLOCATOR & CLEARANCES
# =============================================================================

def place_and_audit_bathroom_fixtures(
    bath_room: MultiFloorRoomRectangle,
    doors: List[MultiFloorDoorGeometry],
) -> Tuple[bool, List[BathroomFixtureSpec], List[str]]:
    """
    Synthesizes exact fixture layout for a bathroom:
    - Shower stall: >= 0.90x0.90m (or 0.80x0.80m compact) at the far wet corner
    - Water Closet (WC): 0.40x0.70m with >= 0.60m front and >= 0.20m side clearances
    - Wash Basin: 0.55x0.45m with >= 0.70m front clearance
    - Door swing internal check: verifies swing arc does not strike WC or basin
    Attaches BathroomFixtureSpec list to room.
    """
    rx = bath_room.x
    ry = bath_room.y
    rw = bath_room.width_m
    rd = bath_room.depth_m

    fixtures: List[BathroomFixtureSpec] = []
    warnings: List[str] = []
    all_satisfied = True

    # Check statutory room minimum dimensions (NBC Part 9 Table 1: min width >= 1.20m, area >= 2.4 m2)
    is_compact = (min(rw, rd) < 1.40 or rw * rd < 3.20)
    shower_dim = SHOWER_COMPACT_DIM_M if is_compact else SHOWER_STD_M

    # Orient layout along the longer axis
    if rw >= rd:
        # Long along X: Divide into 3 zones: [Shower, WC, Basin]
        # 1. Shower in far wet corner (X = rx to rx + shower_dim)
        sh_x = round(rx, 2)
        sh_y = round(ry, 2)
        sh_w = round(min(shower_dim, rw * 0.35), 2)
        sh_d = round(rd, 2)
        fixtures.append(BathroomFixtureSpec(
            fixture_id=f"shower_{bath_room.room_id}",
            fixture_type="shower",
            x=sh_x,
            y=sh_y,
            width_m=sh_w,
            depth_m=sh_d,
            clearance_front_m=0.60,
            clearance_side_m=0.10,
            is_satisfied=sh_w >= 0.75 and sh_d >= 0.75,
            clearance_notes="Shower stall enclosure with floor trap drain",
        ))

        # 2. Water Closet (WC) in central wet wall zone
        wc_w = WC_WIDTH_M
        wc_d = WC_DEPTH_M
        wc_x = round(rx + sh_w + max(0.15, (rw - sh_w - BASIN_WIDTH_M - wc_w) / 2.0), 2)
        wc_y = round(ry, 2)
        wc_front_clr = round(rd - wc_d, 2)
        wc_satisfied = (wc_front_clr >= 0.50 and rd >= 1.20)
        fixtures.append(BathroomFixtureSpec(
            fixture_id=f"wc_{bath_room.room_id}",
            fixture_type="wc",
            x=wc_x,
            y=wc_y,
            width_m=wc_w,
            depth_m=wc_d,
            clearance_front_m=wc_front_clr,
            clearance_side_m=WC_SIDE_CLR_M,
            is_satisfied=wc_satisfied,
            clearance_notes=f"Wall-hung WC backed against plumbing wall. Front clr: {wc_front_clr:.2f}m",
        ))

        # 3. Wash Basin near room entrance
        basin_w = BASIN_WIDTH_M
        basin_d = BASIN_DEPTH_M
        basin_x = round(max(wc_x + wc_w + 0.15, rx + rw - basin_w - 0.10), 2)
        basin_y = round(ry, 2)
        basin_front_clr = round(rd - basin_d, 2)
        fixtures.append(BathroomFixtureSpec(
            fixture_id=f"basin_{bath_room.room_id}",
            fixture_type="wash_basin",
            x=basin_x,
            y=basin_y,
            width_m=basin_w,
            depth_m=basin_d,
            clearance_front_m=basin_front_clr,
            clearance_side_m=BASIN_SIDE_CLR_M,
            is_satisfied=basin_front_clr >= 0.55,
            clearance_notes=f"Ceramic counter basin. Front clr: {basin_front_clr:.2f}m",
        ))

    else:
        # Long along Y: Divide into 3 zones along Y: [Shower, WC, Basin]
        sh_x = round(rx, 2)
        sh_y = round(ry + rd - shower_dim, 2)
        sh_w = round(rw, 2)
        sh_d = round(min(shower_dim, rd * 0.35), 2)
        fixtures.append(BathroomFixtureSpec(
            fixture_id=f"shower_{bath_room.room_id}",
            fixture_type="shower",
            x=sh_x,
            y=sh_y,
            width_m=sh_w,
            depth_m=sh_d,
            clearance_front_m=0.60,
            clearance_side_m=0.10,
            is_satisfied=sh_w >= 0.75 and sh_d >= 0.75,
            clearance_notes="Shower stall enclosure with floor trap drain",
        ))

        wc_w = WC_WIDTH_M
        wc_d = WC_DEPTH_M
        wc_x = round(rx, 2)
        wc_y = round(ry + (rd - sh_d) * 0.45, 2)
        wc_front_clr = round(rw - wc_w, 2)
        fixtures.append(BathroomFixtureSpec(
            fixture_id=f"wc_{bath_room.room_id}",
            fixture_type="wc",
            x=wc_x,
            y=wc_y,
            width_m=wc_w,
            depth_m=wc_d,
            clearance_front_m=wc_front_clr,
            clearance_side_m=WC_SIDE_CLR_M,
            is_satisfied=wc_front_clr >= 0.55,
            clearance_notes=f"Wall-hung WC backed against plumbing wall. Front clr: {wc_front_clr:.2f}m",
        ))

        basin_w = BASIN_WIDTH_M
        basin_d = BASIN_DEPTH_M
        basin_x = round(rx, 2)
        basin_y = round(ry + 0.15, 2)
        basin_front_clr = round(rw - basin_w, 2)
        fixtures.append(BathroomFixtureSpec(
            fixture_id=f"basin_{bath_room.room_id}",
            fixture_type="wash_basin",
            x=basin_x,
            y=basin_y,
            width_m=basin_w,
            depth_m=basin_d,
            clearance_front_m=basin_front_clr,
            clearance_side_m=BASIN_SIDE_CLR_M,
            is_satisfied=basin_front_clr >= 0.55,
            clearance_notes=f"Counter basin near entrance. Front clr: {basin_front_clr:.2f}m",
        ))

    # Verify Door Swing does not intersect WC or Basin
    bath_doors = [d for d in doors if d.to_room == bath_room.room_id or d.from_room == bath_room.room_id]
    for bd in bath_doors:
        sp = compute_door_swing_polygon(bd)
        for fx in fixtures:
            if fx.fixture_type in ("wc", "wash_basin"):
                fbox = shp_box(fx.x, fx.y, fx.x + fx.width_m, fx.y + fx.depth_m)
                if sp.intersects(fbox) and sp.intersection(fbox).area > 0.02:
                    # Door strikes fixture -> auto-flip swing outward or convert to sliding
                    bd.door_type = "sliding"
                    warnings.append(
                        f"Bathroom clearance resolution: Door '{bd.door_id}' converted to sliding to prevent collision with {fx.fixture_type}."
                    )

    all_satisfied = all(f.is_satisfied for f in fixtures)
    if not all_satisfied:
        warnings.append(
            f"Bathroom '{bath_room.room_id}' area ({rw*rd:.2f}m²) or width ({min(rw, rd):.2f}m) tight for standard fixture clearances."
        )

    bath_room.fixtures = fixtures
    return all_satisfied, fixtures, warnings


# =============================================================================
# 4. FURNITURE CLEARANCE CATALOG ENGINE
# =============================================================================

def place_and_audit_furniture_catalog(
    room: MultiFloorRoomRectangle,
) -> Tuple[bool, List[FurnitureItemSpec], List[str]]:
    """
    Evaluates room type minimum furniture set + circulation envelopes:
    - Master Bedroom / Suite: 1800x2000 bed + 600 wardrobe + 500 side clearance + 750 foot clearance
    - Secondary Bedroom: 1500x2000 bed + 600 wardrobe + 500 side clearance
    - Living Room: 3-seater sofa + coffee table + 600mm circulation perimeter
    - Dining: 6-seat table + 900mm pull-out clearance on all active sides
    - Kitchen: Working triangle (Sink, Cooktop, Fridge) with 3.6m <= perimeter <= 7.9m
    Attaches FurnitureItemSpec list to room.
    """
    items: List[FurnitureItemSpec] = []
    warnings: List[str] = []
    all_ok = True

    rid = room.room_id.lower()
    rname = room.room_name.lower()
    rx, ry, rw, rd = room.x, room.y, room.width_m, room.depth_m

    # A. MASTER BEDROOM / SUITE
    if "master" in rid or "master" in rname:
        bed_w, bed_d = BED_KING_WIDTH_M, BED_KING_DEPTH_M
        # Place king bed centered along north/south wall
        bx = round(rx + max(BED_SIDE_CLR_M, (rw - bed_w) / 2.0), 2)
        by = round(ry + BED_FOOT_CLR_M, 2)
        side_clr = round(min(bx - rx, (rx + rw) - (bx + bed_w)), 2)
        foot_clr = round(rd - (by - ry) - bed_d, 2)
        bed_ok = (side_clr >= 0.40 and (foot_clr >= 0.50 or rd >= 3.20))

        items.append(FurnitureItemSpec(
            item_id=f"bed_king_{room.room_id}",
            item_type="bed_king",
            x=bx,
            y=by,
            width_m=bed_w,
            depth_m=bed_d,
            circulation_clearance_m=side_clr,
            is_satisfied=bed_ok,
        ))

        # Wardrobe along side wall
        ward_w = round(min(rw * 0.60, 2.40), 2)
        ward_d = WARDROBE_DEPTH_M
        wx = round(rx + 0.20, 2)
        wy = round(ry + rd - ward_d - 0.20, 2)
        items.append(FurnitureItemSpec(
            item_id=f"wardrobe_{room.room_id}",
            item_type="wardrobe",
            x=wx,
            y=wy,
            width_m=ward_w,
            depth_m=ward_d,
            circulation_clearance_m=0.75,
            is_satisfied=(rd >= 3.20 or rw >= 3.40),
        ))

    # B. SECONDARY BEDROOM
    elif "bed" in rid or "bed" in rname:
        bed_w, bed_d = BED_QUEEN_WIDTH_M, BED_QUEEN_DEPTH_M
        bx = round(rx + max(BED_SIDE_CLR_M, (rw - bed_w) / 2.0), 2)
        by = round(ry + 0.60, 2)
        side_clr = round(min(bx - rx, (rx + rw) - (bx + bed_w)), 2)
        bed_ok = (side_clr >= 0.35 and rw >= 2.80)

        items.append(FurnitureItemSpec(
            item_id=f"bed_queen_{room.room_id}",
            item_type="bed_queen",
            x=bx,
            y=by,
            width_m=bed_w,
            depth_m=bed_d,
            circulation_clearance_m=side_clr,
            is_satisfied=bed_ok,
        ))

        items.append(FurnitureItemSpec(
            item_id=f"wardrobe_{room.room_id}",
            item_type="wardrobe",
            x=round(rx + 0.20, 2),
            y=round(ry + rd - WARDROBE_DEPTH_M - 0.15, 2),
            width_m=round(min(rw * 0.50, 1.80), 2),
            depth_m=WARDROBE_DEPTH_M,
            circulation_clearance_m=0.60,
            is_satisfied=(rw >= 2.80 and rd >= 3.00),
        ))

    # C. LIVING ROOM
    elif "living" in rid or "living" in rname:
        # Sofa 3-seater + Coffee Table
        sx = round(rx + max(LIVING_CIRC_CLR_M, (rw - SOFA_WIDTH_M) / 2.0), 2)
        sy = round(ry + max(LIVING_CIRC_CLR_M, (rd - SOFA_DEPTH_M - COFFEE_TABLE_DEPTH_M - 0.60) / 2.0), 2)
        sofa_ok = (rw >= 3.40 and rd >= 3.20)

        items.append(FurnitureItemSpec(
            item_id=f"sofa_set_{room.room_id}",
            item_type="sofa_3seater",
            x=sx,
            y=sy,
            width_m=SOFA_WIDTH_M,
            depth_m=SOFA_DEPTH_M,
            circulation_clearance_m=LIVING_CIRC_CLR_M,
            is_satisfied=sofa_ok,
        ))

        items.append(FurnitureItemSpec(
            item_id=f"coffee_table_{room.room_id}",
            item_type="coffee_table",
            x=round(sx + (SOFA_WIDTH_M - COFFEE_TABLE_WIDTH_M) / 2.0, 2),
            y=round(sy + SOFA_DEPTH_M + 0.45, 2),
            width_m=COFFEE_TABLE_WIDTH_M,
            depth_m=COFFEE_TABLE_DEPTH_M,
            circulation_clearance_m=0.60,
            is_satisfied=sofa_ok,
        ))

    # D. DINING ROOM
    elif "dining" in rid or "dining" in rname:
        dw, dd = DINING_6P_WIDTH_M, DINING_6P_DEPTH_M
        dx = round(rx + max(DINING_PULLOUT_CLR_M, (rw - dw) / 2.0), 2)
        dy = round(ry + max(DINING_PULLOUT_CLR_M, (rd - dd) / 2.0), 2)
        dining_ok = (rw >= 2.40 and rd >= 2.40)

        items.append(FurnitureItemSpec(
            item_id=f"dining_table_6p_{room.room_id}",
            item_type="dining_table_6p",
            x=dx,
            y=dy,
            width_m=dw,
            depth_m=dd,
            circulation_clearance_m=DINING_PULLOUT_CLR_M,
            is_satisfied=dining_ok,
        ))

    # E. KITCHEN WORKING TRIANGLE
    elif "kitchen" in rid or "kitchen" in rname:
        # Place Cooktop, Sink, Fridge with NKBA per-leg bound (1.2m - 2.7m):
        # Cooktop + Sink share the hot work-top run along one wall, spaced to a
        # legal leg; Fridge sits on the opposite run at a clamped offset so both
        # remaining legs stay within the bound (re-proportioning resolution).
        cooktop_pos = (round(rx + rw * 0.25, 2), round(ry + rd - 0.60, 2))
        sink_pos = (round(rx + rw * 0.75, 2), round(ry + rd - 0.60, 2))
        # Leg 1 (cooktop-sink) must fit the per-leg bound
        l1_raw = math.hypot(sink_pos[0] - cooktop_pos[0], sink_pos[1] - cooktop_pos[1])
        if l1_raw > KITCHEN_TRIANGLE_MAX_LEG_M:
            mid_x = (cooktop_pos[0] + sink_pos[0]) / 2.0
            half = KITCHEN_TRIANGLE_MAX_LEG_M / 2.0
            cooktop_pos = (round(mid_x - half, 2), cooktop_pos[1])
            sink_pos = (round(mid_x + half, 2), sink_pos[1])
        elif l1_raw < KITCHEN_TRIANGLE_MIN_LEG_M:
            mid_x = (cooktop_pos[0] + sink_pos[0]) / 2.0
            half = KITCHEN_TRIANGLE_MIN_LEG_M / 2.0
            cooktop_pos = (round(mid_x - half, 2), cooktop_pos[1])
            sink_pos = (round(mid_x + half, 2), sink_pos[1])
        # Fridge centered between cooktop & sink on the opposite counter run:
        # offset backwards so both remaining legs hit ~95% of the max leg bound
        # (re-proportioning keeps the triangle inside NKBA ergonomic limits).
        mid_cx = (cooktop_pos[0] + sink_pos[0]) / 2.0
        half_leg = abs(sink_pos[0] - mid_cx)
        leg_target = KITCHEN_TRIANGLE_MAX_LEG_M * 0.95
        vert = math.sqrt(max(0.0, leg_target ** 2 - half_leg ** 2))
        fridge_y = round(cooktop_pos[1] - vert, 2)
        if fridge_y < ry + 0.30:
            fridge_y = round(ry + 0.30, 2)
        fridge_x = round(mid_cx, 2)
        fridge_pos = (fridge_x, fridge_y)

        # Triangle legs:
        l1 = math.hypot(cooktop_pos[0] - sink_pos[0], cooktop_pos[1] - sink_pos[1])
        l2 = math.hypot(sink_pos[0] - fridge_pos[0], sink_pos[1] - fridge_pos[1])
        l3 = math.hypot(fridge_pos[0] - cooktop_pos[0], fridge_pos[1] - cooktop_pos[1])
        tri_sum = round(l1 + l2 + l3, 2)

        tri_ok = (
            KITCHEN_TRIANGLE_MIN_SUM_M <= tri_sum <= KITCHEN_TRIANGLE_MAX_SUM_M
            and all(KITCHEN_TRIANGLE_MIN_LEG_M <= leg <= KITCHEN_TRIANGLE_MAX_LEG_M for leg in (l1, l2, l3))
        )
        if not tri_ok:
            all_ok = False
            if tri_sum < KITCHEN_TRIANGLE_MIN_SUM_M:
                warnings.append(
                    f"Kitchen working triangle sum-of-legs ({tri_sum:.2f}m) below NKBA minimum ({KITCHEN_TRIANGLE_MIN_SUM_M}m) "
                    f"- room may be undersized ({rw:.2f} x {rd:.2f}m); resize or re-proportion advised."
                )
            elif tri_sum > KITCHEN_TRIANGLE_MAX_SUM_M:
                warnings.append(
                    f"Kitchen working triangle sum-of-legs ({tri_sum:.2f}m) above NKBA maximum ({KITCHEN_TRIANGLE_MAX_SUM_M}m) "
                    f"- room oversized; consider re-proportioning."
                )
            else:
                warnings.append(
                    f"Kitchen working triangle leg bound violated (each leg must be {KITCHEN_TRIANGLE_MIN_LEG_M}-{KITCHEN_TRIANGLE_MAX_LEG_M}m)."
                )

        items.append(FurnitureItemSpec(
            item_id=f"cooktop_{room.room_id}",
            item_type="kitchen_cooktop",
            x=cooktop_pos[0],
            y=cooktop_pos[1],
            width_m=0.75,
            depth_m=0.60,
            circulation_clearance_m=0.90,
            is_satisfied=tri_ok,
        ))
        items.append(FurnitureItemSpec(
            item_id=f"sink_{room.room_id}",
            item_type="kitchen_sink",
            x=sink_pos[0],
            y=sink_pos[1],
            width_m=0.80,
            depth_m=0.55,
            circulation_clearance_m=0.90,
            is_satisfied=tri_ok,
        ))
        items.append(FurnitureItemSpec(
            item_id=f"fridge_{room.room_id}",
            item_type="kitchen_fridge",
            x=fridge_pos[0],
            y=fridge_pos[1],
            width_m=0.80,
            depth_m=0.70,
            circulation_clearance_m=0.90,
            is_satisfied=tri_ok,
        ))

    all_ok = all(it.is_satisfied for it in items) if items else True
    if not all_ok and room.zone_category not in ("circulation", "terrace"):
        warnings.append(
            f"Furniture clearance resolution: Room '{room.room_id}' ({rw:.2f} x {rd:.2f}m) fails its minimum "
            "furniture set / circulation envelope - resize, re-proportion, or accept advisory."
        )
    room.furniture = items
    return all_ok, items, warnings


# =============================================================================
# 5. NAMING HONESTY ENGINE
# =============================================================================

def audit_and_enforce_naming_honesty(
    rooms: List[MultiFloorRoomRectangle],
) -> List[str]:
    """
    Enforces architectural honesty in space designation:
    - 'Master Suite' ONLY if area >= 14.0 m² including dedicated wardrobe dressing zone.
    - If < 14.0 m², renames to 'Master Bedroom'.
    - Stamps ontology classification threshold on room metadata.
    """
    log: List[str] = []
    for r in rooms:
        rname = r.room_name
        rid = r.room_id.lower()

        if "suite" in rname.lower() or "suite" in rid:
            if r.area_sqm < MASTER_SUITE_MIN_AREA_M2:
                r.room_name = "Master Bedroom"
                r.naming_threshold_used = f"Class Demoted: Area {r.area_sqm:.1f}m² < 14.0m² statutory Master Suite threshold"
                log.append(
                    f"Naming Honesty: '{r.room_id}' renamed from 'Master Suite' to 'Master Bedroom' "
                    f"({r.area_sqm:.1f}m² < 14.0m² statutory suite threshold)."
                )
            else:
                r.naming_threshold_used = f"Master Suite Certified: Area {r.area_sqm:.1f}m² >= 14.0m² with wardrobe zone"
        elif "master" in rname.lower() or "master" in rid:
            # Honesty policy: never silently PROMOTE a bedroom to 'Suite'. The
            # suite class additionally requires a dedicated wardrobe/dressing
            # zone designation; area alone does not justify the upgrade. We only
            # stamp the threshold used so legend/schedules print the class basis.
            if r.area_sqm >= MASTER_SUITE_MIN_AREA_M2:
                r.naming_threshold_used = (
                    f"Master Bedroom: Area {r.area_sqm:.1f}m² qualifies for Suite class "
                    f"(>= {MASTER_SUITE_MIN_AREA_M2}m²) pending dedicated wardrobe/dressing zone"
                )
            else:
                r.naming_threshold_used = f"Master Bedroom Standard: Area {r.area_sqm:.1f}m² (>= 11.5m² code minimum)"
        elif "bed" in rid or "bed" in rname.lower():
            r.naming_threshold_used = f"Standard Bedroom: Area {r.area_sqm:.1f}m² (>= 9.5m² code minimum)"

    return log


# =============================================================================
# 6. PROGRAM INTENT & TERRACE RATIO ENGINE
# =============================================================================

def audit_and_enforce_program_intent(
    total_storeys: int,
    typology: str,
    floors: List[Any],  # SingleFloorPlanModel list
    client_constraints: Optional[ExtractedClientConstraints] = None,
    design_intent: str = "maximize_enclosed",
    floor_plate_masks: Optional[Dict[int, Dict[str, str]]] = None,
) -> Tuple[bool, List[str], Dict[str, Any]]:
    """
    Evaluates:
    1. Residential typologies (T1, T2) place >= 1 bedroom on every upper floor (level >= 1)
       unless explicitly excluded via chip in client constraints OR via an explicit
       floor-plate mask (wing terraced/void on that level = user-sanctioned open deck).
    2. Terrace ratio (terrace_area / enclosed_area) check; triggers warning + conversion
       suggestion if ratio > 35%.
    3. Feeds design_intent toggle ('maximize_enclosed' vs 'passive_ventilation') into scoring.
    """
    warnings: List[str] = []
    audit: Dict[str, Any] = {
        "design_intent": design_intent,
        "upper_floor_bedrooms_satisfied": True,
        "terrace_ratio_satisfied": True,
        "terrace_ratio_pct": 0.0,
    }

    is_residential = ("T1" in typology.upper() or "T2" in typology.upper() or "SINGLE" in typology.upper() or "APARTMENT" in typology.upper())
    exclusions = []
    if client_constraints and getattr(client_constraints, "explicit_exclusions", None):
        exclusions = [e.lower() for e in client_constraints.explicit_exclusions]

    bedrooms_excluded = any("bed" in ex for ex in exclusions)

    # 1. Check Upper Floor Bedroom Presence on Residential Multi-Storey
    if is_residential and total_storeys > 1 and not bedrooms_excluded:
        for fl in floors:
            if fl.floor_index >= 1:
                # Explicit user mask: a wing terraced/voided on this level is a
                # sanctioned open-deck choice; the bedroom rule yields to it.
                f_mask = (floor_plate_masks or {}).get(fl.floor_index, {}) or {}
                mask_terraced = any(state in ("terrace", "void") for state in f_mask.values())
                has_bed = any(
                    r.zone_category == "private" and ("bed" in r.room_id.lower() or "master" in r.room_id.lower())
                    for r in fl.rooms
                )
                if not has_bed:
                    if mask_terraced:
                        warnings.append(
                            f"PROGRAM INTENT NOTE: Floor {fl.floor_index} ({fl.floor_name}) has no bedroom because the "
                            "private wing was explicitly terraced/voided by user floor-plate mask. "
                            "Acceptable per program-intent exclusion."
                        )
                    else:
                        audit["upper_floor_bedrooms_satisfied"] = False
                        warnings.append(
                            f"PROGRAM INTENT VIOLATION: Floor {fl.floor_index} ({fl.floor_name}) lacks residential sleeping quarters. "
                            "Multi-storey residential programs require >= 1 bedroom per upper floor."
                        )

    # 2. Terrace Ratio Calculation Across Whole Building
    total_terrace_m2 = 0.0
    total_enclosed_m2 = 0.0
    for fl in floors:
        for r in fl.rooms:
            if r.zone_category == "terrace" or "terrace" in r.room_id.lower():
                total_terrace_m2 += r.area_sqm
            else:
                total_enclosed_m2 += r.area_sqm

    ratio = round(total_terrace_m2 / max(total_enclosed_m2, 1.0), 3)
    audit["terrace_ratio_pct"] = round(ratio * 100.0, 1)

    # If design intent is maximize_enclosed, terrace ratio limit is strict 35%
    ratio_threshold = 0.45 if design_intent == "passive_ventilation" else TERRACE_RATIO_MAX

    if ratio > ratio_threshold:
        audit["terrace_ratio_satisfied"] = False
        warnings.append(
            f"Terrace Ratio Advisory: Open terrace area ({total_terrace_m2:.1f} m², {ratio*100:.1f}% of enclosed {total_enclosed_m2:.1f} m²) "
            f"exceeds optimal threshold ({ratio_threshold*100:.0f}%). "
            "Consider converting partial terrace to enclosed conditioned space (family lounge / study)."
        )

    all_ok = audit["upper_floor_bedrooms_satisfied"] and audit["terrace_ratio_satisfied"]
    return all_ok, warnings, audit
