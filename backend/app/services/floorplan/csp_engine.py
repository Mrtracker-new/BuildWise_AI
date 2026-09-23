import time
from typing import List, Dict, Tuple, Optional, Any
from app.services.floorplan.grid_model import RoomBox, SpatialGrid, ROOM_CATALOG
from app.services.floorplan.constraints import (
    is_placement_consistent,
    is_valid_vastu_placement,
    evaluate_vastu_compliance,
    evaluate_plumbing_adjacency
)


class CSPEngine:
    """
    Recursive Backtracking CSP Solver for Architectural Room Layout with
    Minimum Remaining Values (MRV) heuristic and Forward Checking (FC).
    """

    def __init__(
        self,
        grid: SpatialGrid,
        required_rooms: List[str],
        vastu_strictness: str = "high",
        timeout_seconds: float = 3.0,
        max_iterations: int = 50000
    ):
        self.grid = grid
        self.required_rooms = required_rooms
        self.vastu_strictness = vastu_strictness
        self.timeout_seconds = timeout_seconds
        self.max_iterations = max_iterations

        self.iterations = 0
        self.start_time = 0.0
        self.timed_out = False
        self.hit_max_iterations = False

        self.best_assignment: List[RoomBox] = []
        self.best_score: float = -1.0

    def generate_initial_domains(self, strictness: str) -> Dict[str, List[RoomBox]]:
        """
        Pre-computes all geometrically and Vastu-valid placements for each requested room.
        """
        domains: Dict[str, List[RoomBox]] = {}

        for room_id in self.required_rooms:
            cat = ROOM_CATALOG.get(room_id, {
                "name": room_id.replace("_", " ").title(),
                "area_cells": 6,
                "shapes": [(3, 2), (2, 3)],
                "canonical_zone": "Center",
                "allowed_secondary": ["N", "S", "E", "W"],
                "prohibited": [],
                "wet": False
            })

            valid_boxes: List[RoomBox] = []
            for w, h in cat["shapes"]:
                for r in range(self.grid.rows - h + 1):
                    for c in range(self.grid.cols - w + 1):
                        box = RoomBox(room_id=room_id, r=r, c=c, w=w, h=h)
                        if is_valid_vastu_placement(box, self.grid, strictness):
                            valid_boxes.append(box)

            domains[room_id] = valid_boxes

        return domains

    def order_domain_values(
        self,
        room_id: str,
        candidates: List[RoomBox],
        current_assignment: List[RoomBox]
    ) -> List[RoomBox]:
        """
        Sorts candidate placements using soft constraint heuristics:
        1. Vastu zone alignment (canonical quadrant first)
        2. Plumbing adjacency for wet rooms
        3. Compactness and central alignment for living/corridor
        """
        wet_assigned = [b for b in current_assignment if ROOM_CATALOG.get(b.room_id, {}).get("wet", False)]
        is_wet = ROOM_CATALOG.get(room_id, {}).get("wet", False)

        def score_candidate(box: RoomBox) -> float:
            score = 50.0
            zone = self.grid.get_zone(box)

            # 1. Vastu preference: strictly prioritize canonical corners
            if room_id == "kitchen":
                if zone == "SE":
                    score += 150.0 + (box.r * 5.0) + (box.c * 5.0)
                elif self.grid.is_in_se_quadrant(box):
                    score += 80.0 + (box.r * 2.0) + (box.c * 2.0)
            elif room_id == "puja":
                if zone == "NE":
                    score += 150.0 + ((self.grid.rows - box.r) * 5.0) + (box.c * 5.0)
                elif self.grid.is_in_ne_quadrant(box):
                    score += 80.0
            elif room_id == "master_bed":
                if zone == "SW":
                    score += 150.0 + (box.r * 5.0) + ((self.grid.cols - box.c) * 5.0)
                elif self.grid.is_in_sw_quadrant(box):
                    score += 80.0
            elif room_id == "living" and zone in ("Center", "N", "E"):
                score += 50.0

            # 2. Plumbing adjacency preference
            if is_wet and wet_assigned:
                min_dist = min(box.manhattan_distance_to(w) for w in wet_assigned)
                if min_dist == 0:
                    score += 40.0  # Common wall
                elif min_dist <= 2:
                    score += 20.0
                else:
                    score -= min_dist * 5.0

            return score

        return sorted(candidates, key=score_candidate, reverse=True)

    def evaluate_partial_score(self, assignment: List[RoomBox]) -> float:
        """
        Evaluates heuristic fitness of a partial assignment to retain the best fallback.
        """
        if not assignment:
            return 0.0

        # Number of placed rooms dominates
        placed_ratio = len(assignment) / float(len(self.required_rooms))
        vastu_pct, _ = evaluate_vastu_compliance(assignment, self.grid)
        plumbing_score = evaluate_plumbing_adjacency(assignment)

        # 70% room count, 20% Vastu, 10% plumbing
        return (placed_ratio * 1000.0) + (vastu_pct * 2.0) + plumbing_score

    def solve(self) -> Tuple[List[RoomBox], str, List[str]]:
        """
        Executes CSP search. Returns (placements, status, warnings).
        Status is one of: "optimal", "compromise", "failed".
        """
        self.start_time = time.perf_counter()
        self.iterations = 0
        self.timed_out = False
        self.hit_max_iterations = False
        self.best_assignment = []
        self.best_score = -1.0
        warnings: List[str] = []

        # Attempt 1: Search with requested strictness
        domains = self.generate_initial_domains(self.vastu_strictness)
        result = self._backtrack([], domains, strictness=self.vastu_strictness)

        # Attempt 2: If high strictness failed to find full solution and didn't time out, try medium fallback
        if (result is None or len(result) < len(self.required_rooms)) and not self.timed_out and self.vastu_strictness == "high":
            warnings.append("Relaxed high Vastu strictness to medium to accommodate all requested room sizes.")
            relaxed_domains = self.generate_initial_domains("medium")
            result = self._backtrack([], relaxed_domains, strictness="medium")

        if result is not None and len(result) == len(self.required_rooms):
            status = "optimal" if self.vastu_strictness == "high" and not warnings else "compromise"
            return result, status, warnings

        # Fallback to best partial solution
        if self.timed_out:
            warnings.append(f"Solver reached timeout limit ({self.timeout_seconds}s). Best effort layout returned.")
        elif self.hit_max_iterations:
            warnings.append(f"Solver reached iteration cap ({self.max_iterations} steps). Best effort layout returned.")
        else:
            missing_rooms = [r for r in self.required_rooms if r not in [b.room_id for b in self.best_assignment]]
            warnings.append(f"Could not fit all rooms within plot envelope. Unplaced: {', '.join(missing_rooms)}.")

        status = "compromise" if len(self.best_assignment) >= len(self.required_rooms) - 1 else "failed"
        return self.best_assignment, status, warnings

    def _backtrack(
        self,
        current_assignment: List[RoomBox],
        current_domains: Dict[str, List[RoomBox]],
        strictness: str
    ) -> Optional[List[RoomBox]]:
        self.iterations += 1

        # Check guardrails
        elapsed = time.perf_counter() - self.start_time
        if elapsed > self.timeout_seconds:
            self.timed_out = True
            return None

        if self.iterations > self.max_iterations:
            self.hit_max_iterations = True
            return None

        # Update best partial assignment
        partial_score = self.evaluate_partial_score(current_assignment)
        if partial_score > self.best_score:
            self.best_score = partial_score
            self.best_assignment = list(current_assignment)

        # Base case: all requested rooms placed
        if len(current_assignment) == len(self.required_rooms):
            return current_assignment

        # MRV Heuristic: Choose unassigned room with smallest remaining domain
        assigned_ids = {b.room_id for b in current_assignment}
        unassigned_ids = [rid for rid in self.required_rooms if rid not in assigned_ids]

        # Sort unassigned by: (domain_size, -area_cells) -> tie-break by degree/area
        selected_room_id = min(
            unassigned_ids,
            key=lambda rid: (
                len(current_domains.get(rid, [])),
                -ROOM_CATALOG.get(rid, {}).get("area_cells", 4)
            )
        )

        domain_values = current_domains.get(selected_room_id, [])
        if not domain_values:
            return None  # Dead end, backtrack

        ordered_candidates = self.order_domain_values(selected_room_id, domain_values, current_assignment)

        for candidate in ordered_candidates:
            # Check hard constraints
            if not is_placement_consistent(candidate, current_assignment, self.grid, strictness):
                continue

            # Forward Checking: prune overlapping placements for all remaining unassigned rooms
            pruned_domains: Dict[str, List[RoomBox]] = {}
            wiped_out = False

            for other_id in unassigned_ids:
                if other_id == selected_room_id:
                    continue
                surviving = [v for v in current_domains.get(other_id, []) if not candidate.overlaps(v)]
                if not surviving:
                    wiped_out = True
                    break
                pruned_domains[other_id] = surviving

            if not wiped_out:
                next_assignment = current_assignment + [candidate]
                next_domains = {**current_domains, **pruned_domains}

                result = self._backtrack(next_assignment, next_domains, strictness)
                if result is not None:
                    return result

            if self.timed_out or self.hit_max_iterations:
                return None

        return None
