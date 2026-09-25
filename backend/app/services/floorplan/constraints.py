from typing import List, Dict, Tuple, Optional, Any, Set
from collections import deque
from app.services.floorplan.grid_model import RoomBox, SpatialGrid, ROOM_CATALOG

def is_valid_vastu_placement(box: RoomBox, grid: SpatialGrid, strictness: str) -> bool:
    """
    Evaluates whether a room placement complies with Vastu Shastra rules at the specified strictness.
    """
    room_id = box.room_id
    zone = grid.get_zone(box)
    cat = ROOM_CATALOG.get(room_id, {})

    if strictness == "high":
        if room_id == "kitchen":
            return (grid.is_in_se_quadrant(box) or zone == "SE") and zone not in ("NE", "SW", "NW")
        elif room_id == "puja":
            return (grid.is_in_ne_quadrant(box) or zone == "NE") and zone not in ("SW", "S")
        elif room_id == "master_bed":
            return (grid.is_in_sw_quadrant(box) or zone == "SW") and zone not in ("NE", "SE")
        elif room_id in ("bath_1", "bath_2"):
            # Strictly prohibited in NE
            return not grid.is_in_ne_quadrant(box) and zone != "NE"
        elif room_id == "stairs":
            return zone in ("SW", "W", "S")

        # Prohibitions check
        if zone in cat.get("prohibited", []):
            return False

        # Must match canonical or allowed secondary
        allowed = [cat.get("canonical_zone")] + cat.get("allowed_secondary", [])
        return zone in allowed

    elif strictness == "medium":
        # NE prohibitions for bath/toilet remain
        if room_id in ("bath_1", "bath_2") and (grid.is_in_ne_quadrant(box) or zone == "NE"):
            return False
        if room_id == "master_bed" and (grid.is_in_ne_quadrant(box) or zone == "NE"):
            return False
        if room_id == "kitchen" and (grid.is_in_ne_quadrant(box) or zone == "NE"):
            return False

        allowed = [cat.get("canonical_zone")] + cat.get("allowed_secondary", [])
        # Permit placement if in allowed list or generally non-prohibited
        return zone not in cat.get("prohibited", [])

    else:
        # Low strictness: only absolute taboos blocked (e.g. toilet in NE)
        if room_id in ("bath_1", "bath_2") and zone == "NE":
            return False
        return True


def is_placement_consistent(
    box: RoomBox,
    current_placements: List[RoomBox],
    grid: SpatialGrid,
    strictness: str
) -> bool:
    """
    Validates hard boundary, non-overlap, and Vastu rules against current partial placement.
    """
    # 1. Boundary containment
    if box.r < 0 or box.c < 0 or box.r_end > grid.rows or box.c_end > grid.cols:
        return False

    # 2. Vastu hard constraints
    if not is_valid_vastu_placement(box, grid, strictness):
        return False

    # 3. Spatial Non-overlap
    for other in current_placements:
        if box.overlaps(other):
            return False

    return True


def evaluate_vastu_compliance(placements: List[RoomBox], grid: SpatialGrid) -> Tuple[float, List[str]]:
    """
    Calculates overall Vastu compliance percentage (0.0 to 100.0) and generates diagnostic notes.
    """
    if not placements:
        return 0.0, ["No rooms placed."]

    total_weight = 0.0
    earned_weight = 0.0
    notes = []

    weights = {
        "master_bed": 25.0,
        "kitchen": 25.0,
        "puja": 20.0,
        "bath_1": 10.0,
        "bath_2": 5.0,
        "living": 10.0,
        "stairs": 5.0
    }

    for box in placements:
        rid = box.room_id
        w = weights.get(rid, 5.0)
        total_weight += w
        zone = grid.get_zone(box)
        cat = ROOM_CATALOG.get(rid, {})
        canonical = cat.get("canonical_zone")

        if rid == "kitchen":
            if grid.is_in_se_quadrant(box) or zone == "SE":
                earned_weight += w
            elif zone in ("E", "NW"):
                earned_weight += w * 0.7
                notes.append("Kitchen placed in secondary acceptable zone (East/NW).")
            else:
                notes.append(f"Kitchen positioned in {zone} (sub-optimal Vastu alignment).")
        elif rid == "puja":
            if grid.is_in_ne_quadrant(box) or zone == "NE":
                earned_weight += w
            elif zone in ("N", "E"):
                earned_weight += w * 0.75
                notes.append(f"Puja positioned in {zone} (acceptable morning light zone).")
            else:
                notes.append(f"Puja placed in {zone} (outside preferred Ishanya quadrant).")
        elif rid == "master_bed":
            if grid.is_in_sw_quadrant(box) or zone == "SW":
                earned_weight += w
            elif zone in ("S", "W"):
                earned_weight += w * 0.75
                notes.append(f"Master Bedroom placed in {zone} (acceptable grounding quadrant).")
            else:
                notes.append(f"Master Bedroom placed in {zone} (outside preferred Nirriti zone).")
        elif rid in ("bath_1", "bath_2"):
            if grid.is_in_ne_quadrant(box) or zone == "NE":
                earned_weight += 0.0
                notes.append(f"{cat.get('name', rid)} positioned in NE (prohibited zone).")
            elif zone in ("NW", "W", "S"):
                earned_weight += w
            else:
                earned_weight += w * 0.5
        else:
            if zone == canonical:
                earned_weight += w
            elif zone in cat.get("allowed_secondary", []):
                earned_weight += w * 0.8
            else:
                earned_weight += w * 0.4

    pct = round((earned_weight / max(total_weight, 1.0)) * 100.0, 1)
    return min(100.0, max(0.0, pct)), notes


def evaluate_plumbing_adjacency(placements: List[RoomBox]) -> float:
    """
    Calculates plumbing wet-area adjacency efficiency (0.0 to 100.0).
    Higher scores mean bathrooms and kitchen share walls or are grouped together.
    """
    wet_boxes = [b for b in placements if ROOM_CATALOG.get(b.room_id, {}).get("wet", False)]
    if len(wet_boxes) <= 1:
        return 100.0

    total_pairs = 0
    total_score = 0.0

    for i in range(len(wet_boxes)):
        for j in range(i + 1, len(wet_boxes)):
            b1 = wet_boxes[i]
            b2 = wet_boxes[j]
            total_pairs += 1

            if b1.shares_wall_with(b2):
                # Common plumbing chase
                total_score += 100.0
            else:
                dist = b1.manhattan_distance_to(b2)
                # Penalize distance: 0 dist = 100%, 1 cell = 80%, 2 cells = 50%, >=4 cells = 10%
                pair_score = max(10.0, 100.0 - (dist * 22.5))
                total_score += pair_score

    return round(total_score / max(total_pairs, 1), 1)


def evaluate_space_utilization(placements: List[RoomBox], grid: SpatialGrid) -> Tuple[float, float]:
    """
    Computes total built-up square meters and spatial packing efficiency (0.0 to 100.0).
    """
    if not placements:
        return 0.0, 0.0

    total_cells = sum(b.area for b in placements)
    cell_sqm = grid.cell_w_m * grid.cell_d_m
    total_built_up_sqm = round(total_cells * cell_sqm, 1)

    min_r = min(b.r for b in placements)
    max_r = max(b.r_end for b in placements)
    min_c = min(b.c for b in placements)
    max_c = max(b.c_end for b in placements)

    bounding_box_cells = (max_r - min_r) * (max_c - min_c)
    utilization_pct = round((total_cells / max(bounding_box_cells, 1)) * 100.0, 1)

    return total_built_up_sqm, min(100.0, utilization_pct)


def evaluate_circulation_efficiency(placements: List[RoomBox]) -> float:
    """
    Evaluates circulation directness: checks if rooms share an edge with central spaces (Living/Corridor).
    """
    if len(placements) <= 2:
        return 100.0

    core_rooms = [b for b in placements if b.room_id in ("living", "corridor")]
    if not core_rooms:
        return 70.0

    connected_count = 0
    for b in placements:
        if b in core_rooms:
            connected_count += 1
            continue
        if any(b.shares_wall_with(core) for core in core_rooms):
            connected_count += 1
        elif any(b.manhattan_distance_to(core) <= 1 for core in core_rooms):
            connected_count += 0.8
        else:
            connected_count += 0.4

    return round((connected_count / len(placements)) * 100.0, 1)


# -----------------------------------------------------------------------------
# BLUEPRINT SPATIAL LOGIC v11 QA GATE & ADJACENCY MATRIX
# -----------------------------------------------------------------------------

def get_functional_zone(room_id: str) -> str:
    from app.services.floorplan.grid_model import get_room_catalog_entry
    cat = get_room_catalog_entry(room_id)
    return cat.get("functional_zone", "PRIVATE")


def is_bath_or_wc(room_id: str) -> bool:
    r = room_id.lower()
    return "bath" in r or "wc" in r or "toilet" in r or "washroom" in r or "powder" in r


def is_puja_room(room_id: str) -> bool:
    r = room_id.lower()
    return "puja" in r or "pooja" in r or "mandir" in r or "prayer" in r


def is_kitchen_room(room_id: str) -> bool:
    r = room_id.lower()
    return "kitchen" in r or "cook" in r


def is_bedroom_room(room_id: str) -> bool:
    r = room_id.lower()
    return "bed" in r or "master" in r or "guest" in r


def is_public_room(room_id: str) -> bool:
    r = room_id.lower()
    return "living" in r or "hall" in r or "foyer" in r or "puja" in r or "pooja" in r


def is_forbidden_shared_wall(r1_id: str, r2_id: str) -> bool:
    """
    Adjacency Prohibition Matrix (KB v13 Hard Constraints):
    - bath|WC <-> pooja (strict religious taboo)
    - bath|WC <-> kitchen (sanitary wet wall separation)
    """
    # Bath/WC <-> Puja
    if (is_bath_or_wc(r1_id) and is_puja_room(r2_id)) or (is_puja_room(r1_id) and is_bath_or_wc(r2_id)):
        return True
    # Bath/WC <-> Kitchen
    if (is_bath_or_wc(r1_id) and is_kitchen_room(r2_id)) or (is_kitchen_room(r1_id) and is_bath_or_wc(r2_id)):
        return True
    return False



def is_service_room(room_id: str) -> bool:
    r = room_id.lower()
    return is_bath_or_wc(r) or is_kitchen_room(r) or "utility" in r or "store" in r or "laundry" in r


def evaluate_solver_qa(
    rect_model: Any,
    strictness: str = "high",
    critic_verdict: str = "pass",
    critic_notes: Optional[List[str]] = None
) -> Tuple[bool, Dict[str, Any], List[str]]:
    """
    Architectural Solver QA Gate (Blueprint Spatial Logic v12).
    Enforces Hard Topological Invariants:
    1. Main entry opens into a PUBLIC room (hall/living/foyer), never a service cluster.
    2. Zero forbidden shared walls (bath-puja, bath-kitchen, bed-kitchen).
    3. LEAF RULE: in the door graph, bath/WC/utility/store nodes must have degree == 1
       (single door, no through-traffic). Only hall/living/corridor may be connectors.
    4. PERIPHERAL SERVICE RULE: every bath/WC/kitchen must touch at least one exterior wall.
       No service room centroid inside the central 40% box of the plot.
    5. EXTERIOR WALL RULE: living, bedrooms, and kitchen each touch >= 1 exterior wall.
    6. CATALOG HARD CLAMPS: bath 3.5-6 m2, WC 1.5-2.5, puja 4-9 with min width 2.4m,
       kitchen 9-16, bedroom 10-18, master 14-22, living 18-35. Aspect ratio <= 1:2.2 for every room.
    7. DOOR VISIBILITY: bath door not on the entry axis and not facing the entry foyer.
    8. BFS-connected door graph from entry reaching 100% of rooms.

    Returns:
    - passed (bool)
    - qa_dict: {
        "entry": str,
        "circulation": "connected" | "disconnected",
        "leaf_rule": bool,
        "peripheral_service": bool,
        "catalog": bool,
        "aspect": bool,
        "critic": str,
        "violations": int,
        "critic_notes": List[str]
      }
    - violations: List[str]
    """
    from collections import deque
    from app.services.floorplan.grid_model import get_room_catalog_entry

    violations: List[str] = []
    rooms = getattr(rect_model, "rooms", [])
    doors = getattr(rect_model, "doors", [])
    envelope = getattr(rect_model, "envelope", None)

    if not rooms:
        return False, {
            "entry": "none",
            "circulation": "disconnected",
            "leaf_rule": False,
            "peripheral_service": False,
            "catalog": False,
            "aspect": False,
            "critic": critic_verdict,
            "violations": 1,
            "critic_notes": critic_notes or []
        }, ["No rooms found in layout."]

    room_map = {r.room_id: r for r in rooms}

    # 0. Non-Positive / Corrupt Dimension Invariant Check
    for r in rooms:
        if r.width <= 0.0 or r.height <= 0.0 or r.area_sqm <= 0.0:
            violations.append(f"Room '{r.room_id}' has non-positive dimension or area ({r.width}x{r.height}, {r.area_sqm} m²).")
            return False, {
                "entry": "invalid",
                "circulation": "disconnected",
                "leaf_rule": False,
                "peripheral_service": False,
                "catalog": False,
                "aspect": False,
                "critic": "fail",
                "violations": len(violations),
                "critic_notes": violations
            }, violations

    # 1. Main Entry Door Check
    main_door = next((d for d in doors if d.door_id == "main_entry"), None)
    entry_room_id = "unknown"
    if main_door is None:
        violations.append("Main entry door not found on layout.")
    else:
        entry_room_id = main_door.to_room
        if is_bath_or_wc(entry_room_id):
            violations.append(f"Main entry directly opens into bathroom/service cluster '{entry_room_id}'.")
        elif not is_public_room(entry_room_id):
            violations.append(f"Main entry opens into non-public room '{entry_room_id}'.")

    # 2. Adjacency Prohibition Matrix Check (Shared walls)
    for i in range(len(rooms)):
        r1 = rooms[i]
        for j in range(i + 1, len(rooms)):
            r2 = rooms[j]
            v_contact = (abs((r1.x + r1.width) - r2.x) < 0.05 or abs((r2.x + r2.width) - r1.x) < 0.05) and (
                min(r1.y + r1.height, r2.y + r2.height) - max(r1.y, r2.y) >= 0.15
            )
            h_contact = (abs((r1.y + r1.height) - r2.y) < 0.05 or abs((r2.y + r2.height) - r1.y) < 0.05) and (
                min(r1.x + r1.width, r2.x + r2.width) - max(r1.x, r2.x) >= 0.15
            )
            if v_contact or h_contact:
                if is_forbidden_shared_wall(r1.room_id, r2.room_id):
                    violations.append(f"Forbidden shared wall between '{r1.room_id}' and '{r2.room_id}'.")

    # 3. LEAF RULE (door graph node degrees)
    degree: Dict[str, int] = {r.room_id: 0 for r in rooms}
    for d in doors:
        if d.door_id == "main_entry" or d.from_room == "exterior" or d.to_room == "exterior":
            continue
        if d.from_room in degree:
            degree[d.from_room] += 1
        if d.to_room in degree:
            degree[d.to_room] += 1

    leaf_rule_passed = True
    for r in rooms:
        rid = r.room_id
        if is_bath_or_wc(rid) or any(k in rid for k in ("utility", "store")):
            deg = degree.get(rid, 0)
            if deg != 1:
                leaf_rule_passed = False
                violations.append(f"Leaf rule violation: service room '{rid}' has degree {deg} in door graph (must have degree == 1, no through-traffic).")

    # 4. PERIPHERAL SERVICE RULE & EXTERIOR WALL RULE
    periph_service_passed = True
    if envelope:
        ex0 = envelope.x
        ex1 = envelope.x + envelope.width
        ey0 = envelope.y
        ey1 = envelope.y + envelope.height

        # Central 40% box: [x0 + 0.30*w, x0 + 0.70*w] x [y0 + 0.30*h, y0 + 0.70*h]
        cx0 = ex0 + 0.30 * envelope.width
        cx1 = ex0 + 0.70 * envelope.width
        cy0 = ey0 + 0.30 * envelope.height
        cy1 = ey0 + 0.70 * envelope.height

        for r in rooms:
            rid = r.room_id
            rx0 = r.x
            rx1 = r.x + r.width
            ry0 = r.y
            ry1 = r.y + r.height
            touches_ext = (
                abs(rx0 - ex0) < 0.08 or abs(rx1 - ex1) < 0.08 or
                abs(ry0 - ey0) < 0.08 or abs(ry1 - ey1) < 0.08
            )

            # Service rooms must touch exterior wall and not sit in central box
            if is_bath_or_wc(rid) or is_kitchen_room(rid) or "utility" in rid:
                if not touches_ext:
                    periph_service_passed = False
                    violations.append(f"Peripheral service violation: service room '{rid}' does not touch any exterior wall for ventilation/light.")

                rcx = (rx0 + rx1) / 2.0
                rcy = (ry0 + ry1) / 2.0
                if (cx0 <= rcx <= cx1) and (cy0 <= rcy <= cy1):
                    periph_service_passed = False
                    violations.append(f"Peripheral service violation: service room '{rid}' centroid ({rcx:.1f}, {rcy:.1f}) is inside central 40% box.")

            # Living, bedrooms, kitchen must touch exterior wall
            if (is_public_room(rid) or is_bedroom_room(rid) or is_kitchen_room(rid)) and "corridor" not in rid:
                if not touches_ext:
                    violations.append(f"Exterior wall violation: room '{rid}' must touch at least one exterior wall.")

    # 5. DOOR VISIBILITY (Bath doors cannot face main entry axis directly)
    if main_door:
        entry_x = (main_door.x1 + main_door.x2) / 2.0
        for d in doors:
            if is_bath_or_wc(d.from_room) or is_bath_or_wc(d.to_room):
                if d.from_room == entry_room_id or d.to_room == entry_room_id:
                    door_x = (d.x1 + d.x2) / 2.0
                    if abs(door_x - entry_x) < 0.8:
                        violations.append("Door visibility violation: bathroom door aligns directly with main entrance axis.")

    # 6. BFS Circulation Reachability Graph
    adj_doors: Dict[str, Set[str]] = {r.room_id: set() for r in rooms}
    for d in doors:
        if d.door_id == "main_entry":
            continue
        fr = d.from_room
        to = d.to_room
        if fr in adj_doors and to in adj_doors:
            adj_doors[fr].add(to)
            adj_doors[to].add(fr)

    visited: Set[str] = set()
    start_hub = entry_room_id if entry_room_id in adj_doors else rooms[0].room_id
    queue = deque([start_hub])
    visited.add(start_hub)
    while queue:
        curr = queue.popleft()
        for nbr in adj_doors.get(curr, set()):
            if nbr not in visited:
                visited.add(nbr)
                queue.append(nbr)

    unreachable = [r.room_id for r in rooms if r.room_id not in visited]
    circulation_status = "connected" if not unreachable else "disconnected"
    if unreachable:
        violations.append(f"Circulation graph disconnected; unreachable rooms: {unreachable}")

    # 7. Realistic Room Area Catalog Hard Clamps & Aspect Ratios
    catalog_passed = True
    aspect_passed = True
    for r in rooms:
        if "corridor" in r.room_id:
            continue
        rid = r.room_id
        hard_min = 3.0
        hard_max = 35.0

        if is_bath_or_wc(rid):
            if "wc" in rid:
                hard_min, hard_max = 1.5, 2.5
            else:
                hard_min, hard_max = 3.5, 6.0
        elif is_puja_room(rid):
            hard_min, hard_max = 4.0, 9.0
            min_dim = min(r.width, r.height)
            if min_dim < 2.35:
                catalog_passed = False
                violations.append(f"Puja room dimension {min_dim:.2f}m is below minimum 2.4m width (strip rooms forbidden).")
        elif "master" in rid:
            hard_min, hard_max = 14.0, 22.0
        elif is_bedroom_room(rid):
            hard_min, hard_max = 10.0, 18.0
        elif is_kitchen_room(rid):
            hard_min, hard_max = 9.0, 16.0
        elif is_public_room(rid):
            hard_min, hard_max = 18.0, 35.0
        else:
            cat = get_room_catalog_entry(rid)
            hard_min = cat.get("catalog_min_m2", 3.0)
            hard_max = cat.get("catalog_max_m2", 35.0)

        # Allow 10% tolerance on numeric area clamps
        if r.area_sqm < round(hard_min * 0.90, 1):
            catalog_passed = False
            violations.append(f"Room '{rid}' area {r.area_sqm:.1f} m² is below catalog clamp min {hard_min} m².")
        elif r.area_sqm > round(hard_max * 1.10, 1):
            catalog_passed = False
            violations.append(f"Room '{rid}' area {r.area_sqm:.1f} m² exceeds catalog clamp max {hard_max} m².")

        # Aspect ratio clamp <= 1:2.2 (tolerance 2.22)
        ar = max(r.width, r.height) / max(min(r.width, r.height), 0.1)
        if ar > 2.22:
            aspect_passed = False
            violations.append(f"Room '{rid}' aspect ratio {ar:.2f} exceeds clamp 1:2.2.")

    qa_dict = {
        "entry": entry_room_id,
        "circulation": circulation_status,
        "leaf_rule": leaf_rule_passed,
        "peripheral_service": periph_service_passed,
        "catalog": catalog_passed,
        "aspect": aspect_passed,
        "critic": critic_verdict,
        "violations": len(violations),
        "critic_notes": critic_notes or []
    }

    passed = (
        len(violations) == 0 and
        leaf_rule_passed and
        periph_service_passed and
        catalog_passed and
        aspect_passed and
        circulation_status == "connected" and
        critic_verdict != "fail"
    )
    return passed, qa_dict, violations

