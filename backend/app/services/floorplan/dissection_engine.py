import time
import math
import itertools
from typing import List, Dict, Tuple, Optional, Any, Set
from collections import deque

from app.schemas.floorplan import (
    EnvelopeRect,
    RoomRectangle,
    DoorGeometry,
    WindowGeometry,
    RectanglesModel
)
from app.services.floorplan.grid_model import ROOM_CATALOG

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

        # 1. Building Envelope: plot minus setbacks (front 1.5m, sides 1.0m each, rear 1.0m)
        # Clamped to minimum 6.0m x 6.0m
        self.env_x = 1.0
        self.env_y = 1.0  # rear setback
        self.env_w = max(6.0, round(self.plot_w - 2.0, 2))
        self.env_h = max(6.0, round(self.plot_d - 2.5, 2))
        self.env_area = round(self.env_w * self.env_h, 2)

        # 2. Target area per room scaled proportionally with minimum 4.0 sqm (2.0m x 2.0m min dimension)
        raw_targets: Dict[str, float] = {}
        total_w = sum(ROOM_WEIGHTS.get(r, 6.0) for r in self.required_rooms)
        for r in self.required_rooms:
            w = ROOM_WEIGHTS.get(r, 6.0)
            nominal = self.env_area * (w / total_w)
            raw_targets[r] = max(4.0, nominal)

        # Normalize so sum equals env_area exactly
        sum_raw = sum(raw_targets.values())
        self.target_areas: Dict[str, float] = {}
        for r in self.required_rooms:
            self.target_areas[r] = round(self.env_area * (raw_targets[r] / sum_raw), 2)

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

    def solve(self) -> Tuple[Optional[RectanglesModel], str, List[str]]:
        """
        Executes envelope-first slicing tree rectangular dissection.
        Attempts high strictness -> retries medium strictness -> falls back if needed.
        """
        self.start_time = time.perf_counter()
        self.iterations = 0
        self.timed_out = False
        warnings: List[str] = []

        # 1. Attempt with requested strictness
        strictness = self.vastu_strictness
        rects = self._dissect(self.env_x, self.env_y, self.env_w, self.env_h, self.required_rooms, strictness)

        # 2. Retry at medium strictness if high strictness failed
        status = "optimal"
        if rects is None and strictness == "high":
            warnings.append("High strictness Vastu dissection infeasible; retrying with medium strictness.")
            strictness = "medium"
            rects = self._dissect(self.env_x, self.env_y, self.env_w, self.env_h, self.required_rooms, strictness)
            status = "compromise"

        # 3. Retry at low strictness if medium failed
        if rects is None and strictness == "medium":
            warnings.append("Medium strictness dissection infeasible; relaxing to low strictness.")
            strictness = "low"
            rects = self._dissect(self.env_x, self.env_y, self.env_w, self.env_h, self.required_rooms, strictness)
            status = "compromise"

        if rects is None:
            return None, "failed", warnings

        # 4. Check Adjacency & Circulation
        adj = self._build_adjacency_graph(rects)
        hub = "living" if "living" in [r[0] for r in rects] else rects[0][0]

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

        # Check wet room clustering (kitchen, bath_1, bath_2)
        wet_rooms = [r[0] for r in rects if ROOM_CATALOG.get(r[0], {}).get("wet", False)]
        if len(wet_rooms) >= 2:
            wet_adj = False
            for w1 in wet_rooms:
                for neighbor, _, _, _, _, _ in adj.get(w1, []):
                    if neighbor in wet_rooms:
                        wet_adj = True
                        break
                if wet_adj:
                    break
            if not wet_adj:
                warnings.append("Wet rooms are not directly adjacent; separate plumbing stacks required.")

        # 5. Build structured geometry
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

        return rect_model, status, warnings
