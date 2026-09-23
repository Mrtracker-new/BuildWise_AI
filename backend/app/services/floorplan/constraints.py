from typing import List, Dict, Tuple, Optional
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
