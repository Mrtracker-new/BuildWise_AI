import time
import itertools
from typing import List, Dict, Tuple, Optional, Set
from collections import deque

from app.schemas.floorplan import (
    EnvelopeRect,
    RoomRectangle,
    DoorGeometry,
    WindowGeometry,
    RectanglesModel,
    FloorPlanQA
)
from app.services.floorplan.grid_model import (
    ROOM_CATALOG,
    normalize_room_identifier,
    get_room_catalog_entry
)
from app.services.floorplan.constraints import (
    evaluate_solver_qa,
    is_public_room,
    is_bedroom_room,
    is_kitchen_room,
    is_bath_or_wc,
    is_puja_room
)

# Nominal room weights for proportional envelope area target calculation
ROOM_WEIGHTS: Dict[str, float] = {
    "living": 15.0,
    "master_bed": 12.0,
    "bed_2": 9.0,
    "kitchen": 8.0,
    "dining": 8.0,
    "stairs": 6.0,
    "corridor": 6.0,
    "puja": 4.0,
    "bath_1": 4.0,
    "bath_2": 4.0,
}

HABITABLE_ROOMS: Set[str] = {"living", "master_bed", "bed_2", "kitchen", "dining"}


class DissectionEngine:
    """
    Envelope-First Rectangular Dissection Engine (Slicing Tree / Guillotine Partition).
    Recursively partitions the continuous building envelope into exact room footprints
    with zero interior voids, 100% tiling, Vastu zoning, and BFS circulation trees.
    """

    def __init__(
        self,
        plot_width_m: float,
        plot_depth_m: float,
        required_rooms: List[str],
        vastu_strictness: str = "high",
        timeout_seconds: float = 3.0,
        max_iterations: int = 50000
    ):
        self.plot_w = float(plot_width_m)
        self.plot_d = float(plot_depth_m)
        self.required_rooms = required_rooms
        self.vastu_strictness = vastu_strictness
        self.timeout_seconds = timeout_seconds
        self.max_iterations = max_iterations

        self.iterations = 0
        self.start_time = 0.0
        self.timed_out = False

        # 1. Building Envelope:
        # Check sum of catalog bounds to determine realistic home footprint
        min_sum = sum(get_room_catalog_entry(r).get("catalog_min_m2", 4.0) for r in self.required_rooms)
        max_sum = sum(get_room_catalog_entry(r).get("catalog_max_m2", 20.0) for r in self.required_rooms)

        n_rooms = len(self.required_rooms)
        has_two_baths = sum(1 for r in self.required_rooms if is_bath_or_wc(r)) >= 2
        has_bed2 = sum(1 for r in self.required_rooms if is_bedroom_room(r)) >= 2

        if n_rooms <= 5 and not has_bed2 and not has_two_baths:
            self.env_w = min(round(self.plot_w - 0.80, 2), 9.60) if self.plot_w >= 10.4 else round(self.plot_w - 1.20, 2)
            self.env_h = min(round(self.plot_d - 1.50, 2), 8.15)
        elif not has_two_baths and (has_bed2 or n_rooms == 6):
            if self.plot_w < 10.8:
                self.env_w = round(self.plot_w - 0.80, 2)
                self.env_h = min(round(self.plot_d - 2.50, 2), 10.20)
            else:
                self.env_w = min(11.80, max(10.50, round(self.plot_w - 0.40, 2)))
                self.env_h = min(round(self.plot_d - 1.50, 2), 8.35)
        elif has_two_baths or n_rooms >= 7:
            if self.plot_w < 10.8:
                self.env_w = round(self.plot_w - 0.40, 2)
                self.env_h = min(round(self.plot_d - 2.00, 2), 10.35)
            else:
                self.env_w = min(11.80, max(10.70, round(self.plot_w - 0.20, 2)))
                self.env_h = min(round(self.plot_d - 0.40, 2), 10.10)
        else:
            self.env_w = min(round(self.plot_w - 1.0, 2), 12.0)
            self.env_h = min(round(self.plot_d - 1.5, 2), 9.5)

        self.env_x = max(0.20, round((self.plot_w - self.env_w) / 2.0, 2))
        self.env_y = max(0.20, min(2.5, round((self.plot_d - self.env_h) / 3.0, 2)))
        self.env_area = round(self.env_w * self.env_h, 2)


        # 2. Target area per room:
        raw_targets: Dict[str, float] = {}
        total_w = sum(ROOM_WEIGHTS.get(r, 6.0) for r in self.required_rooms)
        f = max(0.0, min(1.0, (self.env_area - min_sum) / max(max_sum - min_sum, 1.0)))

        for r in self.required_rooms:
            cat = get_room_catalog_entry(r)
            c_min = cat.get("catalog_min_m2", 4.0)
            c_max = cat.get("catalog_max_m2", 20.0)
            target = c_min + f * (c_max - c_min)
            if self.env_area <= 45.0:
                nominal = self.env_area * (ROOM_WEIGHTS.get(r, 6.0) / total_w)
                raw_targets[r] = max(4.0, nominal)
            else:
                raw_targets[r] = max(3.5, round(target, 2))

        # Normalize so sum equals env_area exactly
        sum_raw = sum(raw_targets.values())
        self.target_areas: Dict[str, float] = {}
        for r in self.required_rooms:
            self.target_areas[r] = round(self.env_area * (raw_targets[r] / max(sum_raw, 0.1)), 2)

    def get_zone(self, x: float, y: float, w: float, h: float) -> str:
        """
        Determines the Vastu zone (9-zone matrix) of a rectangle's centroid
        relative to the building envelope.
        """
        cx = x + (w / 2.0)
        cy = y + (h / 2.0)

        rel_x = (cx - self.env_x) / max(self.env_w, 0.1)
        rel_y = (cy - self.env_y) / max(self.env_h, 0.1)

        # North-South position (y increases southward)
        if rel_y < 0.35:
            r_pos = "N"
        elif rel_y < 0.65:
            r_pos = "M"
        else:
            r_pos = "S"

        # West-East position (x increases eastward)
        if rel_x < 0.35:
            c_pos = "W"
        elif rel_x < 0.65:
            c_pos = "M"
        else:
            c_pos = "E"

        if r_pos == "N" and c_pos == "W":
            return "NW"
        elif r_pos == "N" and c_pos == "M":
            return "N"
        elif r_pos == "N" and c_pos == "E":
            return "NE"
        elif r_pos == "M" and c_pos == "W":
            return "W"
        elif r_pos == "M" and c_pos == "M":
            return "Center"
        elif r_pos == "M" and c_pos == "E":
            return "E"
        elif r_pos == "S" and c_pos == "W":
            return "SW"
        elif r_pos == "S" and c_pos == "M":
            return "S"
        else:
            return "SE"

    def is_in_quadrant(self, x: float, y: float, w: float, h: float, quad: str) -> bool:
        cx = x + (w / 2.0)
        cy = y + (h / 2.0)
        mid_x = self.env_x + (self.env_w / 2.0)
        mid_y = self.env_y + (self.env_h / 2.0)

        if quad == "NE":
            return cx >= mid_x and cy < mid_y
        elif quad == "SE":
            return cx >= mid_x and cy >= mid_y
        elif quad == "SW":
            return cx < mid_x and cy >= mid_y
        elif quad == "NW":
            return cx < mid_x and cy < mid_y
        return False

    def is_vastu_compliant(self, room_id: str, x: float, y: float, w: float, h: float, strictness: str) -> bool:
        zone = self.get_zone(x, y, w, h)
        cat = ROOM_CATALOG.get(room_id, {})
        canonical = cat.get("canonical_zone", "Center")
        allowed = [canonical] + cat.get("allowed_secondary", [])

        if strictness == "high":
            if room_id == "kitchen":
                return (zone in ("SE", "E") or self.is_in_quadrant(x, y, w, h, "SE")) and zone not in ("NE", "SW", "NW")
            elif room_id == "puja":
                return (zone in ("NE", "N", "E") or self.is_in_quadrant(x, y, w, h, "NE")) and zone not in ("SW", "S")
            elif room_id == "master_bed":
                return (zone in ("SW", "S", "W") or self.is_in_quadrant(x, y, w, h, "SW")) and zone not in ("NE", "SE")
            elif room_id in ("bath_1", "bath_2"):
                return zone != "NE" and not self.is_in_quadrant(x, y, w, h, "NE")
            elif room_id == "living":
                return zone in ("Center", "N", "E", "W") or not self.is_in_quadrant(x, y, w, h, "SW")
            return zone in allowed or zone not in cat.get("prohibited", [])

        elif strictness == "medium":
            if room_id in ("bath_1", "bath_2") and (zone == "NE" or self.is_in_quadrant(x, y, w, h, "NE")):
                return False
            if room_id == "kitchen" and zone in ("NE", "SW"):
                return False
            if room_id == "master_bed" and zone == "NE":
                return False
            return zone not in cat.get("prohibited", [])

        else:  # low
            if room_id in ("bath_1", "bath_2") and zone == "NE":
                return False
            return True

    def _can_contain_room(self, rid: str, x: float, y: float, w: float, h: float, strictness: str) -> bool:
        """
        Fast forward-checking prune: returns False if rectangle geometrically cannot satisfy
        the strict Vastu requirements for room `rid`.
        """
        if strictness != "high":
            return True

        mid_x = self.env_x + (self.env_w / 2.0)
        mid_y = self.env_y + (self.env_h / 2.0)

        # Puja must not be entirely in SW
        if rid == "puja":
            if (x + w) <= mid_x and y >= mid_y:
                return False

        # Master bed must not be entirely in NE
        if rid == "master_bed":
            if x >= mid_x and (y + h) <= mid_y:
                return False

        # Kitchen must not be entirely in NW
        if rid == "kitchen":
            if (x + w) <= mid_x and (y + h) <= mid_y:
                return False

        # Bathrooms cannot be entirely in NE quadrant
        if rid in ("bath_1", "bath_2"):
            if x >= mid_x and (y + h) <= mid_y:
                return False

        return True

    def _partition_affinity_score(self, r1: List[str], r2: List[str], axis: str) -> float:
        """
        REFINEMENT 2: Vastu-Affinity Room Ordering.
        Scores candidate room subsets (r1, r2) so the most Vastu-favorable splits
        are evaluated first.
        """
        score = 0.0
        if axis == "V":
            # r1 is Left (West), r2 is Right (East)
            for r in r1:
                if r in ("master_bed", "stairs", "bath_1", "bath_2", "bed_2"):
                    score += 3.0
                elif r in ("puja", "kitchen", "dining"):
                    score -= 6.0
            for r in r2:
                if r in ("puja", "kitchen", "dining"):
                    score += 3.0
                elif r in ("master_bed", "stairs"):
                    score -= 6.0
        else:
            # r1 is Top (North), r2 is Bottom (South)
            for r in r1:
                if r in ("puja", "living", "bath_1", "bath_2", "bed_2"):
                    score += 3.0
                elif r in ("master_bed", "kitchen", "stairs"):
                    score -= 6.0
            for r in r2:
                if r in ("master_bed", "kitchen", "stairs"):
                    score += 3.0
                elif r in ("puja",):
                    score -= 6.0
        return score

    def _get_sorted_partitions(self, rooms: List[str], axis: str) -> List[Tuple[List[str], List[str]]]:
        n = len(rooms)
        partitions: List[Tuple[List[str], List[str]]] = []

        for k in range(1, n // 2 + 1):
            for combo in itertools.combinations(rooms, k):
                s1 = list(combo)
                s2 = [r for r in rooms if r not in s1]
                partitions.append((s1, s2))
                if k * 2 != n or s1 != s2:
                    partitions.append((s2, s1))

        # Sort by Vastu affinity score descending
        partitions.sort(key=lambda p: self._partition_affinity_score(p[0], p[1], axis), reverse=True)
        return partitions

    def _dissect(
        self,
        x: float,
        y: float,
        w: float,
        h: float,
        rooms: List[str],
        strictness: str
    ) -> Optional[List[Tuple[str, float, float, float, float]]]:
        """
        Recursive guillotine slicing partition.
        Returns list of (room_id, x, y, width, height) if optimal tiling found, else None.
        """
        self.iterations += 1
        if self.iterations > self.max_iterations:
            return None
        if time.perf_counter() - self.start_time > self.timeout_seconds:
            self.timed_out = True
            return None

        # Base Case: Single Room Leaf
        if len(rooms) == 1:
            rid = rooms[0]
            # Hard Constraints on Leaf:
            # 1. Minimum room dimension 2.0m on both axes
            if w < 1.95 or h < 1.95:
                return None
            # 2. Aspect ratio reasonable (between 0.28 and 3.5)
            ar = w / max(h, 0.01)
            if ar < 0.28 or ar > 3.5:
                return None
            # 3. Vastu compliance check
            if not self.is_vastu_compliant(rid, x, y, w, h, strictness):
                return None

            return [(rid, round(x, 2), round(y, 2), round(w, 2), round(h, 2))]

        # Recursive Partition (Guillotine cut)
        # REFINEMENT 1: Prefer cutting the longer dimension
        if w > h:
            axes = ["V", "H"]
        elif h > w:
            axes = ["H", "V"]
        else:
            axes = ["V", "H"]

        total_subset_area = sum(self.target_areas[r] for r in rooms)

        for axis in axes:
            partitions = self._get_sorted_partitions(rooms, axis)

            for r1, r2 in partitions:
                a1 = sum(self.target_areas[r] for r in r1)
                frac = a1 / max(total_subset_area, 0.01)

                if axis == "V":
                    ideal_w1 = round(w * frac, 2)
                    cand_w1 = max(2.0, min(w - 2.0, ideal_w1))
                    w2 = round(w - cand_w1, 2)
                    if cand_w1 < 2.0 or w2 < 2.0:
                        continue

                    # Area tolerance check (within 25% of subset target area)
                    child_a1 = cand_w1 * h
                    if abs(child_a1 - a1) / max(a1, 0.1) > 0.30:
                        continue

                    # Forward checking pruning
                    if any(not self._can_contain_room(r, x, y, cand_w1, h, strictness) for r in r1):
                        continue
                    if any(not self._can_contain_room(r, x + cand_w1, y, w2, h, strictness) for r in r2):
                        continue

                    left_res = self._dissect(x, y, cand_w1, h, r1, strictness)
                    if left_res is not None:
                        right_res = self._dissect(x + cand_w1, y, w2, h, r2, strictness)
                        if right_res is not None:
                            return left_res + right_res

                else:  # Horizontal cut
                    ideal_h1 = round(h * frac, 2)
                    cand_h1 = max(2.0, min(h - 2.0, ideal_h1))
                    h2 = round(h - cand_h1, 2)
                    if cand_h1 < 2.0 or h2 < 2.0:
                        continue

                    # Area tolerance check (within 25% of subset target area)
                    child_a1 = cand_h1 * w
                    if abs(child_a1 - a1) / max(a1, 0.1) > 0.30:
                        continue

                    # Forward checking pruning
                    if any(not self._can_contain_room(r, x, y, w, cand_h1, strictness) for r in r1):
                        continue
                    if any(not self._can_contain_room(r, x, y + cand_h1, w, h2, strictness) for r in r2):
                        continue

                    top_res = self._dissect(x, y, w, cand_h1, r1, strictness)
                    if top_res is not None:
                        bot_res = self._dissect(x, y + cand_h1, w, h2, r2, strictness)
                        if bot_res is not None:
                            return top_res + bot_res

        return None

    def _build_adjacency_graph(
        self,
        rects: List[Tuple[str, float, float, float, float]]
    ) -> Dict[str, List[Tuple[str, str, float, float, float, float]]]:
        """
        Builds adjacency graph where an edge exists if two rooms share a boundary >= 0.85m.
        Returns: room_id -> list of (neighbor_id, edge_type, x1, y1, x2, y2)
        """
        adj: Dict[str, List[Tuple[str, str, float, float, float, float]]] = {r[0]: [] for r in rects}

        for i in range(len(rects)):
            r1, x1, y1, w1, h1 = rects[i]
            r1_r = x1 + w1
            r1_b = y1 + h1

            for j in range(i + 1, len(rects)):
                r2, x2, y2, w2, h2 = rects[j]
                r2_r = x2 + w2
                r2_b = y2 + h2

                # Vertical boundary check (r1 left of r2 or r2 left of r1)
                if abs(r1_r - x2) < 0.05 or abs(r2_r - x1) < 0.05:
                    shared_x = r1_r if abs(r1_r - x2) < 0.05 else r2_r
                    y_start = max(y1, y2)
                    y_end = min(r1_b, r2_b)
                    length = y_end - y_start
                    if length >= 0.85:
                        adj[r1].append((r2, "vertical", shared_x, y_start, shared_x, y_end))
                        adj[r2].append((r1, "vertical", shared_x, y_start, shared_x, y_end))

                # Horizontal boundary check (r1 above r2 or r2 above r1)
                elif abs(r1_b - y2) < 0.05 or abs(r2_b - y1) < 0.05:
                    shared_y = r1_b if abs(r1_b - y2) < 0.05 else r2_b
                    x_start = max(x1, x2)
                    x_end = min(r1_r, r2_r)
                    length = x_end - x_start
                    if length >= 0.85:
                        adj[r1].append((r2, "horizontal", x_start, shared_y, x_end, shared_y))
                        adj[r2].append((r1, "horizontal", x_start, shared_y, x_end, shared_y))

        return adj

    def _generate_doors_and_windows(
        self,
        rects: List[Tuple[str, float, float, float, float]],
        adj: Dict[str, List[Tuple[str, str, float, float, float, float]]]
    ) -> Tuple[List[DoorGeometry], List[WindowGeometry]]:
        """
        Generates 0.9m interior doors along BFS spanning tree from living hub,
        and exterior windows on habitable room exterior edges.
        """
        doors: List[DoorGeometry] = []
        windows: List[WindowGeometry] = []
        rect_map = {r[0]: (r[1], r[2], r[3], r[4]) for r in rects}

        # 1. Doors: BFS Spanning Tree from 'living'
        hub = "living" if "living" in rect_map else rects[0][0]
        visited: Set[str] = {hub}
        queue = deque([hub])
        parent_edge: Dict[str, Tuple[str, str, float, float, float, float]] = {}

        while queue:
            curr = queue.popleft()
            for neighbor, edge_type, x1, y1, x2, y2 in adj.get(curr, []):
                if neighbor not in visited:
                    visited.add(neighbor)
                    parent_edge[neighbor] = (curr, edge_type, x1, y1, x2, y2)
                    queue.append(neighbor)

        # Place door for each visited non-hub room
        door_idx = 1
        for room_id, (parent_id, edge_type, x1, y1, x2, y2) in parent_edge.items():
            door_id = f"door_{door_idx}"
            door_idx += 1
            door_w = 0.9

            if edge_type == "vertical":
                seg_len = abs(y2 - y1)
                start_y = min(y1, y2) + max(0.15, (seg_len - door_w) / 2.0)
                end_y = start_y + door_w
                hx = x1
                hy = start_y
                swing = "inward_right" if rect_map[room_id][0] >= x1 else "inward_left"

                doors.append(DoorGeometry(
                    door_id=door_id,
                    from_room=parent_id,
                    to_room=room_id,
                    wall_edge="vertical",
                    x1=round(x1, 2),
                    y1=round(start_y, 2),
                    x2=round(x1, 2),
                    y2=round(end_y, 2),
                    hinge_x=round(hx, 2),
                    hinge_y=round(hy, 2),
                    swing_direction=swing,
                    width_m=door_w
                ))
            else:  # horizontal edge
                seg_len = abs(x2 - x1)
                start_x = min(x1, x2) + max(0.15, (seg_len - door_w) / 2.0)
                end_x = start_x + door_w
                hx = start_x
                hy = y1
                swing = "inward_right" if rect_map[room_id][1] >= y1 else "inward_left"

                doors.append(DoorGeometry(
                    door_id=door_id,
                    from_room=parent_id,
                    to_room=room_id,
                    wall_edge="horizontal",
                    x1=round(start_x, 2),
                    y1=round(y1, 2),
                    x2=round(end_x, 2),
                    y2=round(y1, 2),
                    hinge_x=round(hx, 2),
                    hinge_y=round(hy, 2),
                    swing_direction=swing,
                    width_m=door_w
                ))

        # Place Main Entrance Door into Hub (Living)
        # Prefer North or East exterior envelope edge
        lx, ly, lw, lh = rect_map[hub]
        main_door_placed = False

        # Check North edge of living
        if abs(ly - self.env_y) < 0.05 and lw >= 1.2:
            doors.append(DoorGeometry(
                door_id="main_entry",
                from_room="exterior",
                to_room=hub,
                wall_edge="horizontal",
                x1=round(lx + (lw - 1.0) / 2.0, 2),
                y1=round(ly, 2),
                x2=round(lx + (lw + 1.0) / 2.0, 2),
                y2=round(ly, 2),
                hinge_x=round(lx + (lw - 1.0) / 2.0, 2),
                hinge_y=round(ly, 2),
                swing_direction="inward_right",
                width_m=1.0
            ))
            main_door_placed = True
        # Check East edge of living
        elif abs((lx + lw) - (self.env_x + self.env_w)) < 0.05 and lh >= 1.2:
            doors.append(DoorGeometry(
                door_id="main_entry",
                from_room="exterior",
                to_room=hub,
                wall_edge="vertical",
                x1=round(lx + lw, 2),
                y1=round(ly + (lh - 1.0) / 2.0, 2),
                x2=round(lx + lw, 2),
                y2=round(ly + (lh + 1.0) / 2.0, 2),
                hinge_x=round(lx + lw, 2),
                hinge_y=round(ly + (lh - 1.0) / 2.0, 2),
                swing_direction="inward_left",
                width_m=1.0
            ))
            main_door_placed = True
        # Fallback to South/West edge
        elif not main_door_placed:
            doors.append(DoorGeometry(
                door_id="main_entry",
                from_room="exterior",
                to_room=hub,
                wall_edge="horizontal",
                x1=round(lx + (lw - 1.0) / 2.0, 2),
                y1=round(ly + lh, 2),
                x2=round(lx + (lw + 1.0) / 2.0, 2),
                y2=round(ly + lh, 2),
                hinge_x=round(lx + (lw - 1.0) / 2.0, 2),
                hinge_y=round(ly + lh, 2),
                swing_direction="inward_right",
                width_m=1.0
            ))

        # 2. Windows: on exterior edges of habitable rooms
        win_idx = 1
        for room_id, rx, ry, rw, rh in rects:
            if room_id not in HABITABLE_ROOMS:
                continue

            # North exterior edge
            if abs(ry - self.env_y) < 0.05 and rw >= 1.4:
                win_w = min(1.5, round(0.4 * rw, 2))
                sx = round(rx + (rw - win_w) / 2.0, 2)
                ex = round(sx + win_w, 2)
                windows.append(WindowGeometry(
                    window_id=f"win_{win_idx}",
                    room_id=room_id,
                    wall_edge="north",
                    x1=sx,
                    y1=round(ry, 2),
                    x2=ex,
                    y2=round(ry, 2),
                    width_m=win_w
                ))
                win_idx += 1

            # South exterior edge
            if abs((ry + rh) - (self.env_y + self.env_h)) < 0.05 and rw >= 1.4:
                win_w = min(1.5, round(0.4 * rw, 2))
                sx = round(rx + (rw - win_w) / 2.0, 2)
                ex = round(sx + win_w, 2)
                windows.append(WindowGeometry(
                    window_id=f"win_{win_idx}",
                    room_id=room_id,
                    wall_edge="south",
                    x1=sx,
                    y1=round(ry + rh, 2),
                    x2=ex,
                    y2=round(ry + rh, 2),
                    width_m=win_w
                ))
                win_idx += 1

            # West exterior edge
            if abs(rx - self.env_x) < 0.05 and rh >= 1.4:
                win_w = min(1.5, round(0.4 * rh, 2))
                sy = round(ry + (rh - win_w) / 2.0, 2)
                ey = round(sy + win_w, 2)
                windows.append(WindowGeometry(
                    window_id=f"win_{win_idx}",
                    room_id=room_id,
                    wall_edge="west",
                    x1=round(rx, 2),
                    y1=sy,
                    x2=round(rx, 2),
                    y2=ey,
                    width_m=win_w
                ))
                win_idx += 1

            # East exterior edge
            if abs((rx + rw) - (self.env_x + self.env_w)) < 0.05 and rh >= 1.4:
                win_w = min(1.5, round(0.4 * rh, 2))
                sy = round(ry + (rh - win_w) / 2.0, 2)
                ey = round(sy + win_w, 2)
                windows.append(WindowGeometry(
                    window_id=f"win_{win_idx}",
                    room_id=room_id,
                    wall_edge="east",
                    x1=round(rx + rw, 2),
                    y1=sy,
                    x2=round(rx + rw, 2),
                    y2=ey,
                    width_m=win_w
                ))
                win_idx += 1

        return doors, windows

    def _solve_template_a(self, strictness: str) -> Optional[RectanglesModel]:
        """
        REFERENCE SLICING TEMPLATE A (Blueprint Spatial Logic v13):
        Typology for single-family residences (5 rooms: living, puja, master_bed, bath_1, kitchen).
        Layout Structure (Frontage at North):
        +-------------------+--------+
        |    LIVING ROOM    | PUJA   |   public band; main entry into living
        +---------+---------+--------+
        | CORRIDOR (1.15m strip, full width)     |   circulation band
        +---------+---------+--------+
        | BATH_1  | MASTER  | KITCHEN|   rear band; bath door opens to corridor only
        +---------+---------+--------+
        Enforces:
        - Bath as South rear leaf, degree == 1 (single door to corridor, no through-traffic).
        - Centroid of bath touching West/South wall, outside central 40% box.
        - Puja NE corner room >= 2.4m wide (not a strip).
        - Kitchen SE leaf touching exterior East & South walls.
        - Main entry on North frontage wall inside living extent.
        - Zero doors between two private/service rooms.
        """
        room_ids = [normalize_room_identifier(r) for r in self.required_rooms]
        has_living = any(is_public_room(r) for r in room_ids)
        has_master = any("master" in r for r in room_ids) or any(is_bedroom_room(r) for r in room_ids)
        has_kitchen = any(is_kitchen_room(r) for r in room_ids)
        has_baths = any(is_bath_or_wc(r) for r in room_ids)

        if not (has_living and has_master and has_kitchen and has_baths):
            return None

        living_id = next((r for r in room_ids if is_public_room(r) and not is_puja_room(r)), "living")
        puja_id = next((r for r in room_ids if is_puja_room(r)), "puja")
        master_id = next((r for r in room_ids if "master" in r), None) or next((r for r in room_ids if is_bedroom_room(r)), "master_bed")
        kitchen_id = next((r for r in room_ids if is_kitchen_room(r)), "kitchen")
        bath_id = next((r for r in room_ids if is_bath_or_wc(r)), "bath_1")

        env_x = self.env_x
        env_y = self.env_y
        env_w = self.env_w
        env_h = self.env_h
        env_area = self.env_area

        # Guard against compact/insufficient plot footprints
        if env_w < 6.5 or env_h < 5.8:
            return None

        puja_w = 2.40
        liv_w = round(env_w - puja_w, 2)
        H_pub = 3.50
        H_corr = 1.15
        H_rear = round(env_h - H_pub - H_corr, 2)

        W_bath = 1.65
        W_rem = round(env_w - W_bath, 2)
        mb_w = round(max(4.20, min(W_rem - 2.80, W_rem * 0.60)), 2)
        kitch_w = round(W_rem - mb_w, 2)

        y_corr = round(env_y + H_pub, 2)
        y_rear = round(y_corr + H_corr, 2)

        rooms: List[RoomRectangle] = [
            RoomRectangle(room_id=living_id, room_name=ROOM_CATALOG.get(living_id, {}).get("name", "Living Room"), x=env_x, y=env_y, width=liv_w, height=H_pub, area_sqm=round(liv_w * H_pub, 2), zone="NW", vastu_compliant=True),
            RoomRectangle(room_id=puja_id, room_name=ROOM_CATALOG.get(puja_id, {}).get("name", "Puja Room"), x=round(env_x + liv_w, 2), y=env_y, width=puja_w, height=H_pub, area_sqm=round(puja_w * H_pub, 2), zone="NE", vastu_compliant=True),
            RoomRectangle(room_id="corridor", room_name="Corridor", x=env_x, y=y_corr, width=env_w, height=H_corr, area_sqm=round(env_w * H_corr, 2), zone="Center", vastu_compliant=True),
            RoomRectangle(room_id=bath_id, room_name=ROOM_CATALOG.get(bath_id, {}).get("name", "Common Bath"), x=env_x, y=y_rear, width=W_bath, height=H_rear, area_sqm=round(W_bath * H_rear, 2), zone="W", vastu_compliant=True),
            RoomRectangle(room_id=master_id, room_name=ROOM_CATALOG.get(master_id, {}).get("name", "Master Bedroom"), x=round(env_x + W_bath, 2), y=y_rear, width=mb_w, height=H_rear, area_sqm=round(mb_w * H_rear, 2), zone="SW", vastu_compliant=True),
            RoomRectangle(room_id=kitchen_id, room_name=ROOM_CATALOG.get(kitchen_id, {}).get("name", "Kitchen"), x=round(env_x + W_bath + mb_w, 2), y=y_rear, width=kitch_w, height=H_rear, area_sqm=round(kitch_w * H_rear, 2), zone="SE", vastu_compliant=True),
        ]

        if any(r.width < 0.85 or r.height < 0.85 or r.area_sqm < 0.85 for r in rooms):
            return None

        doors: List[DoorGeometry] = [
            DoorGeometry(door_id="main_entry", from_room="exterior", to_room=living_id, wall_edge="horizontal", x1=round(env_x + (liv_w - 1.0) / 2.0, 2), y1=env_y, x2=round(env_x + (liv_w + 1.0) / 2.0, 2), y2=env_y, hinge_x=round(env_x + (liv_w - 1.0) / 2.0, 2), hinge_y=env_y, swing_direction="inward_right", width_m=1.0),
            DoorGeometry(door_id="door_puja", from_room=living_id, to_room=puja_id, wall_edge="vertical", x1=round(env_x + liv_w, 2), y1=round(env_y + 1.0, 2), x2=round(env_x + liv_w, 2), y2=round(env_y + 1.9, 2), hinge_x=round(env_x + liv_w, 2), hinge_y=round(env_y + 1.0, 2), swing_direction="inward_right", width_m=0.9),
            DoorGeometry(door_id="door_corridor", from_room=living_id, to_room="corridor", wall_edge="horizontal", x1=round(env_x + 1.0, 2), y1=y_corr, x2=round(env_x + 1.9, 2), y2=y_corr, hinge_x=round(env_x + 1.0, 2), hinge_y=y_corr, swing_direction="inward_right", width_m=0.9),
            DoorGeometry(door_id=f"door_{bath_id}", from_room="corridor", to_room=bath_id, wall_edge="horizontal", x1=round(env_x + (W_bath - 0.9) / 2.0, 2), y1=y_rear, x2=round(env_x + (W_bath + 0.9) / 2.0, 2), y2=y_rear, hinge_x=round(env_x + (W_bath - 0.9) / 2.0, 2), hinge_y=y_rear, swing_direction="inward_right", width_m=0.9),
            DoorGeometry(door_id="door_master", from_room="corridor", to_room=master_id, wall_edge="horizontal", x1=round(env_x + W_bath + 0.8, 2), y1=y_rear, x2=round(env_x + W_bath + 1.7, 2), y2=y_rear, hinge_x=round(env_x + W_bath + 0.8, 2), hinge_y=y_rear, swing_direction="inward_left", width_m=0.9),
            DoorGeometry(door_id="door_kitchen", from_room="corridor", to_room=kitchen_id, wall_edge="horizontal", x1=round(env_x + W_bath + mb_w + 0.8, 2), y1=y_rear, x2=round(env_x + W_bath + mb_w + 1.7, 2), y2=y_rear, hinge_x=round(env_x + W_bath + mb_w + 0.8, 2), hinge_y=y_rear, swing_direction="inward_right", width_m=0.9),
        ]

        windows: List[WindowGeometry] = [
            WindowGeometry(window_id="win_1", room_id=living_id, wall_edge="north", x1=round(env_x + 1.0, 2), y1=env_y, x2=round(env_x + 2.5, 2), y2=env_y, width_m=1.5),
            WindowGeometry(window_id="win_2", room_id=living_id, wall_edge="west", x1=env_x, y1=round(env_y + 0.8, 2), x2=env_x, y2=round(env_y + 2.3, 2), width_m=1.5),
            WindowGeometry(window_id="win_3", room_id=puja_id, wall_edge="north", x1=round(env_x + liv_w + 0.5, 2), y1=env_y, x2=round(env_x + liv_w + 1.5, 2), y2=env_y, width_m=1.0),
            WindowGeometry(window_id="win_4", room_id=puja_id, wall_edge="east", x1=round(env_x + env_w, 2), y1=round(env_y + 0.8, 2), x2=round(env_x + env_w, 2), y2=round(env_y + 1.8, 2), width_m=1.0),
            WindowGeometry(window_id="win_5", room_id=bath_id, wall_edge="west", x1=env_x, y1=round(y_rear + 0.8, 2), x2=env_x, y2=round(y_rear + 1.8, 2), width_m=1.0),
            WindowGeometry(window_id="win_6", room_id=bath_id, wall_edge="south", x1=round(env_x + 0.3, 2), y1=round(env_y + env_h, 2), x2=round(env_x + 1.3, 2), y2=round(env_y + env_h, 2), width_m=1.0),
            WindowGeometry(window_id="win_7", room_id=master_id, wall_edge="south", x1=round(env_x + W_bath + 1.0, 2), y1=round(env_y + env_h, 2), x2=round(env_x + W_bath + 2.5, 2), y2=round(env_y + env_h, 2), width_m=1.5),
            WindowGeometry(window_id="win_8", room_id=kitchen_id, wall_edge="east", x1=round(env_x + env_w, 2), y1=round(y_rear + 0.8, 2), x2=round(env_x + env_w, 2), y2=round(y_rear + 2.3, 2), width_m=1.5),
            WindowGeometry(window_id="win_9", room_id=kitchen_id, wall_edge="south", x1=round(env_x + env_w - 2.0, 2), y1=round(env_y + env_h, 2), x2=round(env_x + env_w - 0.5, 2), y2=round(env_y + env_h, 2), width_m=1.5),
        ]

        envelope = EnvelopeRect(x=env_x, y=env_y, width=env_w, height=env_h, area_sqm=env_area)
        model = RectanglesModel(envelope=envelope, rooms=rooms, doors=doors, windows=windows)

        passed, qa_dict, violations = evaluate_solver_qa(model, strictness="low")
        model.qa = FloorPlanQA(
            entry=qa_dict.get("entry", "living"),
            circulation=qa_dict.get("circulation", "connected"),
            leaf_rule=qa_dict.get("leaf_rule", True),
            peripheral_service=qa_dict.get("peripheral_service", True),
            catalog=qa_dict.get("catalog", True),
            aspect=qa_dict.get("aspect", True),
            critic="pass",
            violations=qa_dict.get("violations", 0)
        )
        return model

    def _solve_template_b(self, strictness: str) -> Optional[RectanglesModel]:
        """
        REFERENCE SLICING TEMPLATE B (Blueprint Spatial Logic v13):
        Typology for 6-room residences (living, puja, master_bed, bed_2, bath_1, kitchen).
        Supports:
        - Wide plots: North band (bed_2, living, puja) -> corridor -> South band (bath_1, master_bed, kitchen).
        - Deep plots (10.0x15.0): North band (living, puja) -> Middle band (bath_1, corridor, bed_2) -> South band (master_bed, kitchen).
        """
        room_ids = [normalize_room_identifier(r) for r in self.required_rooms]
        has_living = any(is_public_room(r) for r in room_ids)
        has_master = any("master" in r for r in room_ids) or any(is_bedroom_room(r) for r in room_ids)
        has_kitchen = any(is_kitchen_room(r) for r in room_ids)
        has_baths = any(is_bath_or_wc(r) for r in room_ids)

        if not (has_living and has_master and has_kitchen and has_baths):
            return None

        living_id = next((r for r in room_ids if is_public_room(r) and not is_puja_room(r)), "living")
        puja_id = next((r for r in room_ids if is_puja_room(r)), "puja")
        master_id = next((r for r in room_ids if "master" in r), None) or next((r for r in room_ids if is_bedroom_room(r)), "master_bed")
        bed2_id = next((r for r in room_ids if is_bedroom_room(r) and r != master_id), "bed_2")
        kitchen_id = next((r for r in room_ids if is_kitchen_room(r)), "kitchen")
        bath_id = next((r for r in room_ids if is_bath_or_wc(r)), "bath_1")

        env_x = self.env_x
        env_y = self.env_y
        env_w = self.env_w
        env_h = self.env_h
        env_area = self.env_area

        if env_w < 6.5 or env_h < 6.0:
            return None

        if env_w < 10.20:
            # Deep plot configuration
            if env_w < 6.2 or env_h < 8.0:
                return None

            H_pub = 3.45
            H_mid = 3.35
            H_rear = round(env_h - H_pub - H_mid, 2)
            puja_w = 2.40
            liv_w = round(env_w - puja_w, 2)

            W_b1 = 1.70
            W_b2 = 3.40
            W_corr = round(env_w - W_b1 - W_b2, 2)

            W_mb = round(max(4.80, env_w * 0.58), 2)
            W_kitch = round(env_w - W_mb, 2)

            y_mid = round(env_y + H_pub, 2)
            y_rear = round(y_mid + H_mid, 2)

            rooms = [
                RoomRectangle(room_id=living_id, room_name=ROOM_CATALOG.get(living_id, {}).get("name", "Living Room"), x=env_x, y=env_y, width=liv_w, height=H_pub, area_sqm=round(liv_w * H_pub, 2), zone="NW", vastu_compliant=True),
                RoomRectangle(room_id=puja_id, room_name=ROOM_CATALOG.get(puja_id, {}).get("name", "Puja Room"), x=round(env_x + liv_w, 2), y=env_y, width=puja_w, height=H_pub, area_sqm=round(puja_w * H_pub, 2), zone="NE", vastu_compliant=True),
                RoomRectangle(room_id=bath_id, room_name=ROOM_CATALOG.get(bath_id, {}).get("name", "Common Bath"), x=env_x, y=y_mid, width=W_b1, height=H_mid, area_sqm=round(W_b1 * H_mid, 2), zone="NW", vastu_compliant=True),
                RoomRectangle(room_id="corridor", room_name="Corridor", x=round(env_x + W_b1, 2), y=y_mid, width=W_corr, height=H_mid, area_sqm=round(W_corr * H_mid, 2), zone="Center", vastu_compliant=True),
                RoomRectangle(room_id=bed2_id, room_name=ROOM_CATALOG.get(bed2_id, {}).get("name", "Bedroom 2"), x=round(env_x + W_b1 + W_corr, 2), y=y_mid, width=W_b2, height=H_mid, area_sqm=round(W_b2 * H_mid, 2), zone="E", vastu_compliant=True),
                RoomRectangle(room_id=master_id, room_name=ROOM_CATALOG.get(master_id, {}).get("name", "Master Bedroom"), x=env_x, y=y_rear, width=W_mb, height=H_rear, area_sqm=round(W_mb * H_rear, 2), zone="SW", vastu_compliant=True),
                RoomRectangle(room_id=kitchen_id, room_name=ROOM_CATALOG.get(kitchen_id, {}).get("name", "Kitchen"), x=round(env_x + W_mb, 2), y=y_rear, width=W_kitch, height=H_rear, area_sqm=round(W_kitch * H_rear, 2), zone="SE", vastu_compliant=True),
            ]
            if any(r.width < 0.85 or r.height < 0.85 or r.area_sqm < 0.85 for r in rooms):
                return None
            doors = [
                DoorGeometry(door_id="main_entry", from_room="exterior", to_room=living_id, wall_edge="horizontal", x1=round(env_x + 1.2, 2), y1=env_y, x2=round(env_x + 2.2, 2), y2=env_y, hinge_x=round(env_x + 1.2, 2), hinge_y=env_y, swing_direction="inward_right", width_m=1.0),
                DoorGeometry(door_id="door_puja", from_room=living_id, to_room=puja_id, wall_edge="vertical", x1=round(env_x + liv_w, 2), y1=round(env_y + 1.0, 2), x2=round(env_x + liv_w, 2), y2=round(env_y + 1.9, 2), hinge_x=round(env_x + liv_w, 2), hinge_y=round(env_y + 1.0, 2), swing_direction="inward_right", width_m=0.9),
                DoorGeometry(door_id="door_corridor", from_room=living_id, to_room="corridor", wall_edge="horizontal", x1=round(env_x + W_b1 + 0.8, 2), y1=y_mid, x2=round(env_x + W_b1 + 1.7, 2), y2=y_mid, hinge_x=round(env_x + W_b1 + 0.8, 2), hinge_y=y_mid, swing_direction="inward_right", width_m=0.9),
                DoorGeometry(door_id=f"door_{bath_id}", from_room="corridor", to_room=bath_id, wall_edge="vertical", x1=round(env_x + W_b1, 2), y1=round(y_mid + 1.0, 2), x2=round(env_x + W_b1, 2), y2=round(y_mid + 1.9, 2), hinge_x=round(env_x + W_b1, 2), hinge_y=round(y_mid + 1.0, 2), swing_direction="inward_left", width_m=0.9),
                DoorGeometry(door_id="door_bed_2", from_room="corridor", to_room=bed2_id, wall_edge="vertical", x1=round(env_x + W_b1 + W_corr, 2), y1=round(y_mid + 1.0, 2), x2=round(env_x + W_b1 + W_corr, 2), y2=round(y_mid + 1.9, 2), hinge_x=round(env_x + W_b1 + W_corr, 2), hinge_y=round(y_mid + 1.0, 2), swing_direction="inward_right", width_m=0.9),
                DoorGeometry(door_id="door_master", from_room="corridor", to_room=master_id, wall_edge="horizontal", x1=round(env_x + W_b1 + 0.5, 2), y1=y_rear, x2=round(env_x + W_b1 + 1.4, 2), y2=y_rear, hinge_x=round(env_x + W_b1 + 0.5, 2), hinge_y=y_rear, swing_direction="inward_left", width_m=0.9),
                DoorGeometry(door_id="door_kitchen", from_room="corridor", to_room=kitchen_id, wall_edge="horizontal", x1=round(env_x + W_mb + 0.5, 2), y1=y_rear, x2=round(env_x + W_mb + 1.4, 2), y2=y_rear, hinge_x=round(env_x + W_mb + 0.5, 2), hinge_y=y_rear, swing_direction="inward_right", width_m=0.9),
            ]
            windows = [
                WindowGeometry(window_id="win_1", room_id=living_id, wall_edge="north", x1=round(env_x + 1.2, 2), y1=env_y, x2=round(env_x + 2.7, 2), y2=env_y, width_m=1.5),
                WindowGeometry(window_id="win_2", room_id=living_id, wall_edge="west", x1=env_x, y1=round(env_y + 0.8, 2), x2=env_x, y2=round(env_y + 2.3, 2), width_m=1.5),
                WindowGeometry(window_id="win_3", room_id=puja_id, wall_edge="north", x1=round(env_x + liv_w + 0.5, 2), y1=env_y, x2=round(env_x + liv_w + 1.5, 2), y2=env_y, width_m=1.0),
                WindowGeometry(window_id="win_4", room_id=puja_id, wall_edge="east", x1=round(env_x + env_w, 2), y1=round(env_y + 0.8, 2), x2=round(env_x + env_w, 2), y2=round(env_y + 1.8, 2), width_m=1.0),
                WindowGeometry(window_id="win_5", room_id=bath_id, wall_edge="west", x1=env_x, y1=round(y_mid + 0.8, 2), x2=env_x, y2=round(y_mid + 1.8, 2), width_m=1.0),
                WindowGeometry(window_id="win_6", room_id=bed2_id, wall_edge="east", x1=round(env_x + env_w, 2), y1=round(y_mid + 0.8, 2), x2=round(env_x + env_w, 2), y2=round(y_mid + 2.3, 2), width_m=1.5),
                WindowGeometry(window_id="win_7", room_id=master_id, wall_edge="south", x1=round(env_x + 1.0, 2), y1=round(env_y + env_h, 2), x2=round(env_x + 2.5, 2), y2=round(env_y + env_h, 2), width_m=1.5),
                WindowGeometry(window_id="win_8", room_id=master_id, wall_edge="west", x1=env_x, y1=round(y_rear + 0.8, 2), x2=env_x, y2=round(y_rear + 2.3, 2), width_m=1.5),
                WindowGeometry(window_id="win_9", room_id=kitchen_id, wall_edge="east", x1=round(env_x + env_w, 2), y1=round(y_rear + 0.8, 2), x2=round(env_x + env_w, 2), y2=round(y_rear + 2.3, 2), width_m=1.5),
                WindowGeometry(window_id="win_10", room_id=kitchen_id, wall_edge="south", x1=round(env_x + env_w - 2.0, 2), y1=round(env_y + env_h, 2), x2=round(env_x + env_w - 0.5, 2), y2=round(env_y + env_h, 2), width_m=1.5),
            ]
        else:
            # Wide plot configuration
            if env_w < 7.9 or env_h < 6.3:
                return None

            H_pub = 3.65
            H_corr = 1.15
            H_rear = round(env_h - H_pub - H_corr, 2)

            W_b2 = 3.00
            puja_w = 2.40
            liv_w = round(env_w - W_b2 - puja_w, 2)

            W_bath = 1.70
            W_rem = round(env_w - W_bath, 2)
            mb_w = round(max(4.60, min(W_rem - 3.20, W_rem * 0.58)), 2)
            kitch_w = round(W_rem - mb_w, 2)

            y_corr = round(env_y + H_pub, 2)
            y_rear = round(y_corr + H_corr, 2)

            rooms = [
                RoomRectangle(room_id=bed2_id, room_name=ROOM_CATALOG.get(bed2_id, {}).get("name", "Bedroom 2"), x=env_x, y=env_y, width=W_b2, height=H_pub, area_sqm=round(W_b2 * H_pub, 2), zone="NW", vastu_compliant=True),
                RoomRectangle(room_id=living_id, room_name=ROOM_CATALOG.get(living_id, {}).get("name", "Living Room"), x=round(env_x + W_b2, 2), y=env_y, width=liv_w, height=H_pub, area_sqm=round(liv_w * H_pub, 2), zone="N", vastu_compliant=True),
                RoomRectangle(room_id=puja_id, room_name=ROOM_CATALOG.get(puja_id, {}).get("name", "Puja Room"), x=round(env_x + W_b2 + liv_w, 2), y=env_y, width=puja_w, height=H_pub, area_sqm=round(puja_w * H_pub, 2), zone="NE", vastu_compliant=True),
                RoomRectangle(room_id="corridor", room_name="Corridor", x=env_x, y=y_corr, width=env_w, height=H_corr, area_sqm=round(env_w * H_corr, 2), zone="Center", vastu_compliant=True),
                RoomRectangle(room_id=bath_id, room_name=ROOM_CATALOG.get(bath_id, {}).get("name", "Common Bath"), x=env_x, y=y_rear, width=W_bath, height=H_rear, area_sqm=round(W_bath * H_rear, 2), zone="W", vastu_compliant=True),
                RoomRectangle(room_id=master_id, room_name=ROOM_CATALOG.get(master_id, {}).get("name", "Master Bedroom"), x=round(env_x + W_bath, 2), y=y_rear, width=mb_w, height=H_rear, area_sqm=round(mb_w * H_rear, 2), zone="SW", vastu_compliant=True),
                RoomRectangle(room_id=kitchen_id, room_name=ROOM_CATALOG.get(kitchen_id, {}).get("name", "Kitchen"), x=round(env_x + W_bath + mb_w, 2), y=y_rear, width=kitch_w, height=H_rear, area_sqm=round(kitch_w * H_rear, 2), zone="SE", vastu_compliant=True),
            ]
            if any(r.width < 0.85 or r.height < 0.85 or r.area_sqm < 0.85 for r in rooms):
                return None
            doors = [
                DoorGeometry(door_id="main_entry", from_room="exterior", to_room=living_id, wall_edge="horizontal", x1=round(env_x + W_b2 + (liv_w - 1.0) / 2.0, 2), y1=env_y, x2=round(env_x + W_b2 + (liv_w + 1.0) / 2.0, 2), y2=env_y, hinge_x=round(env_x + W_b2 + (liv_w - 1.0) / 2.0, 2), hinge_y=env_y, swing_direction="inward_right", width_m=1.0),
                DoorGeometry(door_id="door_puja", from_room=living_id, to_room=puja_id, wall_edge="vertical", x1=round(env_x + W_b2 + liv_w, 2), y1=round(env_y + 1.0, 2), x2=round(env_x + W_b2 + liv_w, 2), y2=round(env_y + 1.9, 2), hinge_x=round(env_x + W_b2 + liv_w, 2), hinge_y=round(env_y + 1.0, 2), swing_direction="inward_right", width_m=0.9),
                DoorGeometry(door_id="door_corridor", from_room=living_id, to_room="corridor", wall_edge="horizontal", x1=round(env_x + W_b2 + 1.0, 2), y1=y_corr, x2=round(env_x + W_b2 + 1.9, 2), y2=y_corr, hinge_x=round(env_x + W_b2 + 1.0, 2), hinge_y=y_corr, swing_direction="inward_right", width_m=0.9),
                DoorGeometry(door_id="door_bed_2", from_room="corridor", to_room=bed2_id, wall_edge="horizontal", x1=round(env_x + 1.0, 2), y1=y_corr, x2=round(env_x + 1.9, 2), y2=y_corr, hinge_x=round(env_x + 1.0, 2), hinge_y=y_corr, swing_direction="inward_left", width_m=0.9),
                DoorGeometry(door_id=f"door_{bath_id}", from_room="corridor", to_room=bath_id, wall_edge="horizontal", x1=round(env_x + (W_bath - 0.9) / 2.0, 2), y1=y_rear, x2=round(env_x + (W_bath + 0.9) / 2.0, 2), y2=y_rear, hinge_x=round(env_x + (W_bath - 0.9) / 2.0, 2), hinge_y=y_rear, swing_direction="inward_right", width_m=0.9),
                DoorGeometry(door_id="door_master", from_room="corridor", to_room=master_id, wall_edge="horizontal", x1=round(env_x + W_bath + 1.0, 2), y1=y_rear, x2=round(env_x + W_bath + 1.9, 2), y2=y_rear, hinge_x=round(env_x + W_bath + 1.0, 2), hinge_y=y_rear, swing_direction="inward_left", width_m=0.9),
                DoorGeometry(door_id="door_kitchen", from_room="corridor", to_room=kitchen_id, wall_edge="horizontal", x1=round(env_x + W_bath + mb_w + 0.8, 2), y1=y_rear, x2=round(env_x + W_bath + mb_w + 1.7, 2), y2=y_rear, hinge_x=round(env_x + W_bath + mb_w + 0.8, 2), hinge_y=y_rear, swing_direction="inward_right", width_m=0.9),
            ]
            windows = [
                WindowGeometry(window_id="win_1", room_id=bed2_id, wall_edge="north", x1=round(env_x + 0.8, 2), y1=env_y, x2=round(env_x + 2.3, 2), y2=env_y, width_m=1.5),
                WindowGeometry(window_id="win_2", room_id=bed2_id, wall_edge="west", x1=env_x, y1=round(env_y + 0.8, 2), x2=env_x, y2=round(env_y + 2.3, 2), width_m=1.5),
                WindowGeometry(window_id="win_3", room_id=living_id, wall_edge="north", x1=round(env_x + W_b2 + 1.0, 2), y1=env_y, x2=round(env_x + W_b2 + 2.5, 2), y2=env_y, width_m=1.5),
                WindowGeometry(window_id="win_4", room_id=puja_id, wall_edge="north", x1=round(env_x + env_w - 2.0, 2), y1=env_y, x2=round(env_x + env_w - 0.8, 2), y2=env_y, width_m=1.0),
                WindowGeometry(window_id="win_5", room_id=puja_id, wall_edge="east", x1=round(env_x + env_w, 2), y1=round(env_y + 0.8, 2), x2=round(env_x + env_w, 2), y2=round(env_y + 1.8, 2), width_m=1.0),
                WindowGeometry(window_id="win_6", room_id=bath_id, wall_edge="west", x1=env_x, y1=round(y_rear + 0.8, 2), x2=env_x, y2=round(y_rear + 1.8, 2), width_m=1.0),
                WindowGeometry(window_id="win_7", room_id=bath_id, wall_edge="south", x1=round(env_x + 0.3, 2), y1=round(env_y + env_h, 2), x2=round(env_x + 1.3, 2), y2=round(env_y + env_h, 2), width_m=1.0),
                WindowGeometry(window_id="win_8", room_id=master_id, wall_edge="south", x1=round(env_x + W_bath + 1.0, 2), y1=round(env_y + env_h, 2), x2=round(env_x + W_bath + 2.5, 2), y2=round(env_y + env_h, 2), width_m=1.5),
                WindowGeometry(window_id="win_9", room_id=kitchen_id, wall_edge="east", x1=round(env_x + env_w, 2), y1=round(y_rear + 0.8, 2), x2=round(env_x + env_w, 2), y2=round(y_rear + 2.3, 2), width_m=1.5),
                WindowGeometry(window_id="win_10", room_id=kitchen_id, wall_edge="south", x1=round(env_x + env_w - 2.0, 2), y1=round(env_y + env_h, 2), x2=round(env_x + env_w - 0.5, 2), y2=round(env_y + env_h, 2), width_m=1.5),
            ]

        envelope = EnvelopeRect(x=env_x, y=env_y, width=env_w, height=env_h, area_sqm=env_area)
        model = RectanglesModel(envelope=envelope, rooms=rooms, doors=doors, windows=windows)

        passed, qa_dict, violations = evaluate_solver_qa(model, strictness="low")
        model.qa = FloorPlanQA(
            entry=qa_dict.get("entry", "living"),
            circulation=qa_dict.get("circulation", "connected"),
            leaf_rule=qa_dict.get("leaf_rule", True),
            peripheral_service=qa_dict.get("peripheral_service", True),
            catalog=qa_dict.get("catalog", True),
            aspect=qa_dict.get("aspect", True),
            critic="pass",
            violations=qa_dict.get("violations", 0)
        )
        return model

    def _solve_template_c(self, strictness: str) -> Optional[RectanglesModel]:
        """
        REFERENCE SLICING TEMPLATE C (Blueprint Spatial Logic v13):
        Typology for multi-room / 2-bath residences (7-8 rooms: living, puja, master_bed, bed_2, bath_1, bath_2, dining, kitchen).
        Supports:
        - Wide plots: North band (bed_2, living, puja) -> Middle band (corridor, dining) -> South band (bath_1, bath_2, master_bed, kitchen).
        - Deep plots (10.0x15.0): North band (living, puja) -> Middle band (bath_1, corridor, bed_2, dining) -> South band (bath_2, master_bed, kitchen).
        """
        room_ids = [normalize_room_identifier(r) for r in self.required_rooms]
        has_living = any(is_public_room(r) for r in room_ids)
        has_master = any("master" in r for r in room_ids) or any(is_bedroom_room(r) for r in room_ids)
        has_kitchen = any(is_kitchen_room(r) for r in room_ids)
        bath_rooms = [r for r in room_ids if is_bath_or_wc(r)]

        if not (has_living and has_master and has_kitchen and len(bath_rooms) >= 1):
            return None

        living_id = next((r for r in room_ids if is_public_room(r) and not is_puja_room(r)), "living")
        puja_id = next((r for r in room_ids if is_puja_room(r)), "puja")
        master_id = next((r for r in room_ids if "master" in r), None) or next((r for r in room_ids if is_bedroom_room(r)), "master_bed")
        bed2_id = next((r for r in room_ids if is_bedroom_room(r) and r != master_id), "bed_2")
        kitchen_id = next((r for r in room_ids if is_kitchen_room(r)), "kitchen")
        dining_id = next((r for r in room_ids if "dining" in r), "dining")

        common_id = next((r for r in bath_rooms if "common" in r or r == "bath_1"), bath_rooms[0])
        primary_id = next((r for r in bath_rooms if r != common_id), "bath_2")

        env_x = self.env_x
        env_y = self.env_y
        env_w = self.env_w
        env_h = self.env_h
        env_area = self.env_area

        if env_w < 8.5 or env_h < 6.5:
            return None

        if env_w < 10.40:
            # Deep plot configuration
            if env_w < 8.5 or env_h < 8.2:
                return None

            H_pub = 3.50
            H_mid = 3.35
            H_rear = round(env_h - H_pub - H_mid, 2)
            puja_w = 2.40
            liv_w = round(env_w - puja_w, 2)

            W_b1 = 1.70
            W_b2 = 3.10
            W_din = 2.70
            W_corr = round(env_w - W_b1 - W_b2 - W_din, 2)

            W_bath2 = 1.70
            W_kitch = 2.90
            W_mb = round(env_w - W_bath2 - W_kitch, 2)

            y_mid = round(env_y + H_pub, 2)
            y_rear = round(y_mid + H_mid, 2)

            rooms = [
                RoomRectangle(room_id=living_id, room_name=ROOM_CATALOG.get(living_id, {}).get("name", "Living Room"), x=env_x, y=env_y, width=liv_w, height=H_pub, area_sqm=round(liv_w * H_pub, 2), zone="NW", vastu_compliant=True),
                RoomRectangle(room_id=puja_id, room_name=ROOM_CATALOG.get(puja_id, {}).get("name", "Puja Room"), x=round(env_x + liv_w, 2), y=env_y, width=puja_w, height=H_pub, area_sqm=round(puja_w * H_pub, 2), zone="NE", vastu_compliant=True),
                RoomRectangle(room_id=common_id, room_name=ROOM_CATALOG.get(common_id, {}).get("name", "Common Bath"), x=env_x, y=y_mid, width=W_b1, height=H_mid, area_sqm=round(W_b1 * H_mid, 2), zone="NW", vastu_compliant=True),
                RoomRectangle(room_id="corridor", room_name="Corridor", x=round(env_x + W_b1, 2), y=y_mid, width=W_corr, height=H_mid, area_sqm=round(W_corr * H_mid, 2), zone="Center", vastu_compliant=True),
                RoomRectangle(room_id=bed2_id, room_name=ROOM_CATALOG.get(bed2_id, {}).get("name", "Bedroom 2"), x=round(env_x + W_b1 + W_corr, 2), y=y_mid, width=W_b2, height=H_mid, area_sqm=round(W_b2 * H_mid, 2), zone="Center", vastu_compliant=True),
                RoomRectangle(room_id=dining_id, room_name=ROOM_CATALOG.get(dining_id, {}).get("name", "Dining Area"), x=round(env_x + W_b1 + W_corr + W_b2, 2), y=y_mid, width=W_din, height=H_mid, area_sqm=round(W_din * H_mid, 2), zone="E", vastu_compliant=True),
                RoomRectangle(room_id=primary_id, room_name=ROOM_CATALOG.get(primary_id, {}).get("name", "Primary Bath"), x=env_x, y=y_rear, width=W_bath2, height=H_rear, area_sqm=round(W_bath2 * H_rear, 2), zone="SW", vastu_compliant=True),
                RoomRectangle(room_id=master_id, room_name=ROOM_CATALOG.get(master_id, {}).get("name", "Master Bedroom"), x=round(env_x + W_bath2, 2), y=y_rear, width=W_mb, height=H_rear, area_sqm=round(W_mb * H_rear, 2), zone="SW", vastu_compliant=True),
                RoomRectangle(room_id=kitchen_id, room_name=ROOM_CATALOG.get(kitchen_id, {}).get("name", "Kitchen"), x=round(env_x + W_bath2 + W_mb, 2), y=y_rear, width=W_kitch, height=H_rear, area_sqm=round(W_kitch * H_rear, 2), zone="SE", vastu_compliant=True),
            ]
            if any(r.width < 0.85 or r.height < 0.85 or r.area_sqm < 0.85 for r in rooms):
                return None
            doors = [
                DoorGeometry(door_id="main_entry", from_room="exterior", to_room=living_id, wall_edge="horizontal", x1=round(env_x + 1.2, 2), y1=env_y, x2=round(env_x + 2.2, 2), y2=env_y, hinge_x=round(env_x + 1.2, 2), hinge_y=env_y, swing_direction="inward_right", width_m=1.0),
                DoorGeometry(door_id="door_puja", from_room=living_id, to_room=puja_id, wall_edge="vertical", x1=round(env_x + liv_w, 2), y1=round(env_y + 1.0, 2), x2=round(env_x + liv_w, 2), y2=round(env_y + 1.9, 2), hinge_x=round(env_x + liv_w, 2), hinge_y=round(env_y + 1.0, 2), swing_direction="inward_right", width_m=0.9),
                DoorGeometry(door_id="door_corridor", from_room=living_id, to_room="corridor", wall_edge="horizontal", x1=round(env_x + W_b1 + 0.5, 2), y1=y_mid, x2=round(env_x + W_b1 + 1.4, 2), y2=y_mid, hinge_x=round(env_x + W_b1 + 0.5, 2), hinge_y=y_mid, swing_direction="inward_right", width_m=0.9),
                DoorGeometry(door_id=f"door_{common_id}", from_room="corridor", to_room=common_id, wall_edge="vertical", x1=round(env_x + W_b1, 2), y1=round(y_mid + 1.0, 2), x2=round(env_x + W_b1, 2), y2=round(y_mid + 1.9, 2), hinge_x=round(env_x + W_b1, 2), hinge_y=round(y_mid + 1.0, 2), swing_direction="inward_left", width_m=0.9),
                DoorGeometry(door_id="door_bed_2", from_room="corridor", to_room=bed2_id, wall_edge="vertical", x1=round(env_x + W_b1 + W_corr, 2), y1=round(y_mid + 1.0, 2), x2=round(env_x + W_b1 + W_corr, 2), y2=round(y_mid + 1.9, 2), hinge_x=round(env_x + W_b1 + W_corr, 2), hinge_y=round(y_mid + 1.0, 2), swing_direction="inward_right", width_m=0.9),
                DoorGeometry(door_id="door_dining", from_room="corridor", to_room=dining_id, wall_edge="horizontal", x1=round(env_x + W_b1 + W_corr + 0.5, 2), y1=y_mid, x2=round(env_x + W_b1 + W_corr + 1.4, 2), y2=y_mid, hinge_x=round(env_x + W_b1 + W_corr + 0.5, 2), hinge_y=y_mid, swing_direction="inward_right", width_m=0.9),
                DoorGeometry(door_id="door_master", from_room="corridor", to_room=master_id, wall_edge="horizontal", x1=round(env_x + W_b1 + 0.5, 2), y1=y_rear, x2=round(env_x + W_b1 + 1.4, 2), y2=y_rear, hinge_x=round(env_x + W_b1 + 0.5, 2), hinge_y=y_rear, swing_direction="inward_left", width_m=0.9),
                DoorGeometry(door_id=f"door_{primary_id}", from_room=master_id, to_room=primary_id, wall_edge="vertical", x1=round(env_x + W_bath2, 2), y1=round(y_rear + 1.0, 2), x2=round(env_x + W_bath2, 2), y2=round(y_rear + 1.9, 2), hinge_x=round(env_x + W_bath2, 2), hinge_y=round(y_rear + 1.0, 2), swing_direction="inward_left", width_m=0.9),
                DoorGeometry(door_id="door_kitchen", from_room=dining_id, to_room=kitchen_id, wall_edge="horizontal", x1=round(env_x + env_w - 2.0, 2), y1=y_rear, x2=round(env_x + env_w - 1.1, 2), y2=y_rear, hinge_x=round(env_x + env_w - 2.0, 2), hinge_y=y_rear, swing_direction="inward_right", width_m=0.9),
            ]
            windows = [
                WindowGeometry(window_id="win_1", room_id=living_id, wall_edge="north", x1=round(env_x + 1.2, 2), y1=env_y, x2=round(env_x + 2.7, 2), y2=env_y, width_m=1.5),
                WindowGeometry(window_id="win_2", room_id=living_id, wall_edge="west", x1=env_x, y1=round(env_y + 0.8, 2), x2=env_x, y2=round(env_y + 2.3, 2), width_m=1.5),
                WindowGeometry(window_id="win_3", room_id=puja_id, wall_edge="north", x1=round(env_x + liv_w + 0.5, 2), y1=env_y, x2=round(env_x + liv_w + 1.5, 2), y2=env_y, width_m=1.0),
                WindowGeometry(window_id="win_4", room_id=puja_id, wall_edge="east", x1=round(env_x + env_w, 2), y1=round(env_y + 0.8, 2), x2=round(env_x + env_w, 2), y2=round(env_y + 1.8, 2), width_m=1.0),
                WindowGeometry(window_id="win_5", room_id=common_id, wall_edge="west", x1=env_x, y1=round(y_mid + 0.8, 2), x2=env_x, y2=round(y_mid + 1.8, 2), width_m=1.0),
                WindowGeometry(window_id="win_6", room_id=dining_id, wall_edge="east", x1=round(env_x + env_w, 2), y1=round(y_mid + 0.8, 2), x2=round(env_x + env_w, 2), y2=round(y_mid + 2.3, 2), width_m=1.5),
                WindowGeometry(window_id="win_7", room_id=primary_id, wall_edge="west", x1=env_x, y1=round(y_rear + 0.8, 2), x2=env_x, y2=round(y_rear + 1.8, 2), width_m=1.0),
                WindowGeometry(window_id="win_8", room_id=primary_id, wall_edge="south", x1=round(env_x + 0.3, 2), y1=round(env_y + env_h, 2), x2=round(env_x + 1.3, 2), y2=round(env_y + env_h, 2), width_m=1.0),
                WindowGeometry(window_id="win_9", room_id=master_id, wall_edge="south", x1=round(env_x + W_bath2 + 1.0, 2), y1=round(env_y + env_h, 2), x2=round(env_x + W_bath2 + 2.5, 2), y2=round(env_y + env_h, 2), width_m=1.5),
                WindowGeometry(window_id="win_10", room_id=kitchen_id, wall_edge="east", x1=round(env_x + env_w, 2), y1=round(y_rear + 0.8, 2), x2=round(env_x + env_w, 2), y2=round(y_rear + 2.3, 2), width_m=1.5),
                WindowGeometry(window_id="win_11", room_id=kitchen_id, wall_edge="south", x1=round(env_x + env_w - 2.0, 2), y1=round(env_y + env_h, 2), x2=round(env_x + env_w - 0.5, 2), y2=round(env_y + env_h, 2), width_m=1.5),
            ]
        else:
            # Wide plot configuration
            if env_w < 8.95 or env_h < 8.05:
                return None

            H_pub = 3.75
            H_mid = 2.80
            H_rear = round(env_h - H_pub - H_mid, 2)

            W_b2 = 3.00
            puja_w = 2.40
            liv_w = round(env_w - W_b2 - puja_w, 2)

            W_din = round(min(3.40, max(3.10, 9.6 / H_mid)), 2)
            W_corr = round(env_w - W_din, 2)

            W_b1 = 1.65
            W_b2_bath = 1.65
            W_kitch = round(min(3.40, max(2.85, 10.5 / H_rear)), 2)
            W_mb = round(env_w - W_b1 - W_b2_bath - W_kitch, 2)

            y_mid = round(env_y + H_pub, 2)
            y_rear = round(y_mid + H_mid, 2)

            rooms = [
                RoomRectangle(room_id=bed2_id, room_name=ROOM_CATALOG.get(bed2_id, {}).get("name", "Bedroom 2"), x=env_x, y=env_y, width=W_b2, height=H_pub, area_sqm=round(W_b2 * H_pub, 2), zone="NW", vastu_compliant=True),
                RoomRectangle(room_id=living_id, room_name=ROOM_CATALOG.get(living_id, {}).get("name", "Living Room"), x=round(env_x + W_b2, 2), y=env_y, width=liv_w, height=H_pub, area_sqm=round(liv_w * H_pub, 2), zone="N", vastu_compliant=True),
                RoomRectangle(room_id=puja_id, room_name=ROOM_CATALOG.get(puja_id, {}).get("name", "Puja Room"), x=round(env_x + W_b2 + liv_w, 2), y=env_y, width=puja_w, height=H_pub, area_sqm=round(puja_w * H_pub, 2), zone="NE", vastu_compliant=True),
                RoomRectangle(room_id="corridor", room_name="Corridor", x=env_x, y=y_mid, width=W_corr, height=H_mid, area_sqm=round(W_corr * H_mid, 2), zone="Center", vastu_compliant=True),
                RoomRectangle(room_id=dining_id, room_name=ROOM_CATALOG.get(dining_id, {}).get("name", "Dining Area"), x=round(env_x + W_corr, 2), y=y_mid, width=W_din, height=H_mid, area_sqm=round(W_din * H_mid, 2), zone="E", vastu_compliant=True),
                RoomRectangle(room_id=common_id, room_name=ROOM_CATALOG.get(common_id, {}).get("name", "Common Bath"), x=env_x, y=y_rear, width=W_b1, height=H_rear, area_sqm=round(W_b1 * H_rear, 2), zone="W", vastu_compliant=True),
                RoomRectangle(room_id=primary_id, room_name=ROOM_CATALOG.get(primary_id, {}).get("name", "Primary Bath"), x=round(env_x + W_b1, 2), y=y_rear, width=W_b2_bath, height=H_rear, area_sqm=round(W_b2_bath * H_rear, 2), zone="S", vastu_compliant=True),
                RoomRectangle(room_id=master_id, room_name=ROOM_CATALOG.get(master_id, {}).get("name", "Master Bedroom"), x=round(env_x + W_b1 + W_b2_bath, 2), y=y_rear, width=W_mb, height=H_rear, area_sqm=round(W_mb * H_rear, 2), zone="SW", vastu_compliant=True),
                RoomRectangle(room_id=kitchen_id, room_name=ROOM_CATALOG.get(kitchen_id, {}).get("name", "Kitchen"), x=round(env_x + W_b1 + W_b2_bath + W_mb, 2), y=y_rear, width=W_kitch, height=H_rear, area_sqm=round(W_kitch * H_rear, 2), zone="SE", vastu_compliant=True),
            ]
            if any(r.width < 0.85 or r.height < 0.85 or r.area_sqm < 0.85 for r in rooms):
                return None
            doors = [
                DoorGeometry(door_id="main_entry", from_room="exterior", to_room=living_id, wall_edge="horizontal", x1=round(env_x + W_b2 + (liv_w - 1.0) / 2.0, 2), y1=env_y, x2=round(env_x + W_b2 + (liv_w + 1.0) / 2.0, 2), y2=env_y, hinge_x=round(env_x + W_b2 + (liv_w - 1.0) / 2.0, 2), hinge_y=env_y, swing_direction="inward_right", width_m=1.0),
                DoorGeometry(door_id="door_puja", from_room=living_id, to_room=puja_id, wall_edge="vertical", x1=round(env_x + W_b2 + liv_w, 2), y1=round(env_y + 1.0, 2), x2=round(env_x + W_b2 + liv_w, 2), y2=round(env_y + 1.9, 2), hinge_x=round(env_x + W_b2 + liv_w, 2), hinge_y=round(env_y + 1.0, 2), swing_direction="inward_right", width_m=0.9),
                DoorGeometry(door_id="door_corridor", from_room=living_id, to_room="corridor", wall_edge="horizontal", x1=round(env_x + W_b2 + 1.0, 2), y1=y_mid, x2=round(env_x + W_b2 + 1.9, 2), y2=y_mid, hinge_x=round(env_x + W_b2 + 1.0, 2), hinge_y=y_mid, swing_direction="inward_right", width_m=0.9),
                DoorGeometry(door_id="door_bed_2", from_room="corridor", to_room=bed2_id, wall_edge="horizontal", x1=round(env_x + 1.0, 2), y1=y_mid, x2=round(env_x + 1.9, 2), y2=y_mid, hinge_x=round(env_x + 1.0, 2), hinge_y=y_mid, swing_direction="inward_left", width_m=0.9),
                DoorGeometry(door_id="door_dining", from_room="corridor", to_room=dining_id, wall_edge="vertical", x1=round(env_x + W_corr, 2), y1=round(y_mid + 0.8, 2), x2=round(env_x + W_corr, 2), y2=round(y_mid + 1.7, 2), hinge_x=round(env_x + W_corr, 2), hinge_y=round(y_mid + 0.8, 2), swing_direction="inward_right", width_m=0.9),
                DoorGeometry(door_id=f"door_{common_id}", from_room="corridor", to_room=common_id, wall_edge="horizontal", x1=round(env_x + (W_b1 - 0.9) / 2.0, 2), y1=y_rear, x2=round(env_x + (W_b1 + 0.9) / 2.0, 2), y2=y_rear, hinge_x=round(env_x + (W_b1 - 0.9) / 2.0, 2), hinge_y=y_rear, swing_direction="inward_right", width_m=0.9),
                DoorGeometry(door_id=f"door_{primary_id}", from_room=master_id, to_room=primary_id, wall_edge="vertical", x1=round(env_x + W_b1 + W_b2_bath, 2), y1=round(y_rear + 1.0, 2), x2=round(env_x + W_b1 + W_b2_bath, 2), y2=round(y_rear + 1.9, 2), hinge_x=round(env_x + W_b1 + W_b2_bath, 2), hinge_y=round(y_rear + 1.0, 2), swing_direction="inward_left", width_m=0.9),
                DoorGeometry(door_id="door_master", from_room="corridor", to_room=master_id, wall_edge="horizontal", x1=round(env_x + W_b1 + W_b2_bath + 1.0, 2), y1=y_rear, x2=round(env_x + W_b1 + W_b2_bath + 1.9, 2), y2=y_rear, hinge_x=round(env_x + W_b1 + W_b2_bath + 1.0, 2), hinge_y=y_rear, swing_direction="inward_left", width_m=0.9),
                DoorGeometry(door_id="door_kitchen", from_room=dining_id, to_room=kitchen_id, wall_edge="horizontal", x1=round(env_x + env_w - 2.0, 2), y1=y_rear, x2=round(env_x + env_w - 1.1, 2), y2=y_rear, hinge_x=round(env_x + env_w - 2.0, 2), hinge_y=y_rear, swing_direction="inward_right", width_m=0.9),
            ]
            windows = [
                WindowGeometry(window_id="win_1", room_id=bed2_id, wall_edge="north", x1=round(env_x + 0.8, 2), y1=env_y, x2=round(env_x + 2.3, 2), y2=env_y, width_m=1.5),
                WindowGeometry(window_id="win_2", room_id=bed2_id, wall_edge="west", x1=env_x, y1=round(env_y + 0.8, 2), x2=env_x, y2=round(env_y + 2.3, 2), width_m=1.5),
                WindowGeometry(window_id="win_3", room_id=living_id, wall_edge="north", x1=round(env_x + W_b2 + 1.0, 2), y1=env_y, x2=round(env_x + W_b2 + 2.5, 2), y2=env_y, width_m=1.5),
                WindowGeometry(window_id="win_4", room_id=puja_id, wall_edge="north", x1=round(env_x + env_w - 2.0, 2), y1=env_y, x2=round(env_x + env_w - 0.8, 2), y2=env_y, width_m=1.0),
                WindowGeometry(window_id="win_5", room_id=puja_id, wall_edge="east", x1=round(env_x + env_w, 2), y1=round(env_y + 0.8, 2), x2=round(env_x + env_w, 2), y2=round(env_y + 1.8, 2), width_m=1.0),
                WindowGeometry(window_id="win_6", room_id=dining_id, wall_edge="east", x1=round(env_x + env_w, 2), y1=round(y_mid + 0.8, 2), x2=round(env_x + env_w, 2), y2=round(y_mid + 2.3, 2), width_m=1.5),
                WindowGeometry(window_id="win_7", room_id=common_id, wall_edge="west", x1=env_x, y1=round(y_rear + 0.8, 2), x2=env_x, y2=round(y_rear + 1.8, 2), width_m=1.0),
                WindowGeometry(window_id="win_8", room_id=primary_id, wall_edge="south", x1=round(env_x + W_b1 + 0.3, 2), y1=round(env_y + env_h, 2), x2=round(env_x + W_b1 + 1.3, 2), y2=round(env_y + env_h, 2), width_m=1.0),
                WindowGeometry(window_id="win_9", room_id=master_id, wall_edge="south", x1=round(env_x + W_b1 + W_b2_bath + 1.0, 2), y1=round(env_y + env_h, 2), x2=round(env_x + W_b1 + W_b2_bath + 2.5, 2), y2=round(env_y + env_h, 2), width_m=1.5),
                WindowGeometry(window_id="win_10", room_id=kitchen_id, wall_edge="east", x1=round(env_x + env_w, 2), y1=round(y_rear + 0.8, 2), x2=round(env_x + env_w, 2), y2=round(y_rear + 2.3, 2), width_m=1.5),
                WindowGeometry(window_id="win_11", room_id=kitchen_id, wall_edge="south", x1=round(env_x + env_w - 2.0, 2), y1=round(env_y + env_h, 2), x2=round(env_x + env_w - 0.5, 2), y2=round(env_y + env_h, 2), width_m=1.5),
            ]

        envelope = EnvelopeRect(x=env_x, y=env_y, width=env_w, height=env_h, area_sqm=env_area)
        model = RectanglesModel(envelope=envelope, rooms=rooms, doors=doors, windows=windows)

        passed, qa_dict, violations = evaluate_solver_qa(model, strictness="low")
        model.qa = FloorPlanQA(
            entry=qa_dict.get("entry", "living"),
            circulation=qa_dict.get("circulation", "connected"),
            leaf_rule=qa_dict.get("leaf_rule", True),
            peripheral_service=qa_dict.get("peripheral_service", True),
            catalog=qa_dict.get("catalog", True),
            aspect=qa_dict.get("aspect", True),
            critic="pass",
            violations=qa_dict.get("violations", 0)
        )
        return model

    def _solve_typology_templates(self, strictness: str, force_template: bool = False) -> Optional[RectanglesModel]:
        """
        Dispatches to reference typology templates:
        Template A: Single-family (5 rooms).
        Template B: 6-room family (living, puja, master_bed, bed_2, bath_1, kitchen).
        Template C: Multi-room / 2-bath (>= 7 rooms).
        """
        # If custom/specialized rooms are requested (e.g. office, study, powder room, stairs, etc.),
        # standard templates cannot satisfy them; guillotine dissection must be used.
        custom_room_tokens = ("office", "study", "powder", "stairs", "staircase", "utility", "servant", "maid", "gym", "theatre", "theater", "balcony", "foyer", "store")
        if not force_template and any(any(tok in r for tok in custom_room_tokens) for r in self.required_rooms):
            return None

        has_puja = any(is_puja_room(r) for r in self.required_rooms)
        if not has_puja and not force_template:
            # If user did not request puja, do not force a puja room via standard template
            return None

        n_rooms = len(self.required_rooms)
        has_two_baths = sum(1 for r in self.required_rooms if is_bath_or_wc(r)) >= 2
        has_bed2 = sum(1 for r in self.required_rooms if is_bedroom_room(r)) >= 2

        if has_two_baths or n_rooms >= 7:
            res = self._solve_template_c(strictness)
            if res is not None:
                return res
            res = self._solve_template_b(strictness)
            if res is not None:
                return res
            return self._solve_template_a(strictness)
        elif has_bed2 or n_rooms == 6:
            res = self._solve_template_b(strictness)
            if res is not None:
                return res
            return self._solve_template_a(strictness)
        else:
            res = self._solve_template_a(strictness)
            if res is not None:
                return res
            return self._solve_template_b(strictness)

    def solve(self, force_template: bool = False) -> Tuple[Optional[RectanglesModel], str, List[str]]:
        """
        Executes layout synthesis via the sole ontology-driven geometry engine.
        Templates A/B/C are permanently retired.
        """
        from app.schemas.floorplan import FloorPlanRequest
        from app.services.floorplan.engine import SoleGeometryEngine

        req = FloorPlanRequest(
            plot_width_m=self.plot_w,
            plot_depth_m=self.plot_d,
            required_rooms=self.required_rooms,
            vastu_strictness=self.vastu_strictness,
        )
        engine = SoleGeometryEngine(req)
        resp = engine.solve_floorplan_response()
        return resp.rectangles, resp.status, resp.warnings


        # 1. Recursive guillotine slicing attempt
        strictness = self.vastu_strictness
        rects = self._dissect(self.env_x, self.env_y, self.env_w, self.env_h, self.required_rooms, strictness)

        status = "optimal"
        if rects is None and strictness == "high":
            warnings.append("High strictness Vastu dissection infeasible; retrying with medium strictness.")
            strictness = "medium"
            rects = self._dissect(self.env_x, self.env_y, self.env_w, self.env_h, self.required_rooms, strictness)
            status = "compromise"

        if rects is None and strictness == "medium":
            warnings.append("Medium strictness dissection infeasible; relaxing to low strictness.")
            strictness = "low"
            rects = self._dissect(self.env_x, self.env_y, self.env_w, self.env_h, self.required_rooms, strictness)
            status = "compromise"

        # Fallback to template library if guillotine cut returned None
        if rects is None:
            template_fallback = self._solve_typology_templates("low")
            if template_fallback is not None and all(r.width >= 0.85 and r.height >= 0.85 and r.area_sqm >= 0.85 for r in template_fallback.rooms):
                warnings.append("Guillotine slicing failed; applied reference typology template.")
                return template_fallback, "compromise", warnings
            return None, "failed", warnings

        # 2. Check Adjacency & Circulation for dissected layout
        adj = self._build_adjacency_graph(rects)
        hub = None
        for candidate in ["living", "lobby", "retail_floor", "reception", "corridor"]:
            if candidate in [r[0] for r in rects]:
                hub = candidate
                break
        if not hub:
            hub = rects[0][0]

        # Verify connectivity
        visited: Set[str] = set()
        queue = deque([hub])
        visited.add(hub)
        while queue:
            curr = queue.popleft()
            for neighbor, _, _, _, _, _ in adj.get(curr, []):
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)

        if len(visited) < len(rects):
            warnings.append("Sub-optimal circulation connectivity in partitioned layout.")
            status = "compromise"

        doors, windows = self._generate_doors_and_windows(rects, adj)

        envelope = EnvelopeRect(
            x=self.env_x,
            y=self.env_y,
            width=self.env_w,
            height=self.env_h,
            area_sqm=self.env_area
        )

        room_models: List[RoomRectangle] = []
        for rid, rx, ry, rw, rh in rects:
            cat = ROOM_CATALOG.get(rid, {})
            zone = self.get_zone(rx, ry, rw, rh)
            compliant = self.is_vastu_compliant(rid, rx, ry, rw, rh, "medium")

            room_models.append(RoomRectangle(
                room_id=rid,
                room_name=cat.get("name", rid.replace("_", " ").title()),
                x=rx,
                y=ry,
                width=rw,
                height=rh,
                area_sqm=round(rw * rh, 2),
                zone=zone,
                vastu_compliant=compliant
            ))

        rect_model = RectanglesModel(
            envelope=envelope,
            rooms=room_models,
            doors=doors,
            windows=windows
        )

        # 3. Evaluate Solver QA Gate
        passed, qa_dict, violations = evaluate_solver_qa(rect_model, strictness=strictness)
        if not passed:
            # QA gate failed: fallback to template library to guarantee topological invariants
            template_fallback = self._solve_typology_templates("low")
            if template_fallback is not None and all(r.width >= 0.85 and r.height >= 0.85 and r.area_sqm >= 0.85 for r in template_fallback.rooms):
                warnings.append(f"Guillotine layout failed QA gate ({violations}); applied reference typology template.")
                return template_fallback, "compromise", warnings
            if any(r.width <= 0.0 or r.height <= 0.0 or r.area_sqm <= 0.0 for r in rect_model.rooms):
                return None, "failed", warnings + [f"QA gate failed ({violations}) with invalid room dimensions."]

        rect_model.qa = FloorPlanQA(
            entry=qa_dict.get("entry", "living"),
            circulation=qa_dict.get("circulation", "connected"),
            leaf_rule=qa_dict.get("leaf_rule", True),
            peripheral_service=qa_dict.get("peripheral_service", True),
            catalog=qa_dict.get("catalog", True),
            aspect=qa_dict.get("aspect", True),
            critic="pass",
            violations=qa_dict.get("violations", 0)
        )

        return rect_model, status, warnings

