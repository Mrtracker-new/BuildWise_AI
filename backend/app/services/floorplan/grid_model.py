from dataclasses import dataclass
from typing import List, Tuple, Dict, Any, Optional

@dataclass(frozen=True)
class RoomBox:
    room_id: str
    r: int
    c: int
    w: int
    h: int

    @property
    def r_end(self) -> int:
        return self.r + self.h

    @property
    def c_end(self) -> int:
        return self.c + self.w

    @property
    def area(self) -> int:
        return self.w * self.h

    @property
    def centroid(self) -> Tuple[float, float]:
        return (self.r + self.h / 2.0, self.c + self.w / 2.0)

    def overlaps(self, other: "RoomBox") -> bool:
        if self.r_end <= other.r or other.r_end <= self.r:
            return False
        if self.c_end <= other.c or other.c_end <= self.c:
            return False
        return True

    def shares_wall_with(self, other: "RoomBox") -> bool:
        # Check horizontal adjacency (touching along vertical wall)
        if self.c_end == other.c or other.c_end == self.c:
            overlap_h = max(0, min(self.r_end, other.r_end) - max(self.r, other.r))
            if overlap_h > 0:
                return True
        # Check vertical adjacency (touching along horizontal wall)
        if self.r_end == other.r or other.r_end == self.r:
            overlap_w = max(0, min(self.c_end, other.c_end) - max(self.c, other.c))
            if overlap_w > 0:
                return True
        return False

    def manhattan_distance_to(self, other: "RoomBox") -> int:
        # Distance between bounding boxes (0 if touching/sharing wall)
        dr = 0
        if self.r_end < other.r:
            dr = other.r - self.r_end
        elif other.r_end < self.r:
            dr = self.r - other.r_end

        dc = 0
        if self.c_end < other.c:
            dc = other.c - self.c_end
        elif other.c_end < self.c:
            dc = self.c - other.c_end

        return dr + dc


ROOM_CATALOG: Dict[str, Dict[str, Any]] = {
    "master_bed": {
        "name": "Master Bedroom",
        "area_cells": 12,
        "shapes": [(4, 3), (3, 4)],  # (w, h)
        "canonical_zone": "SW",
        "allowed_secondary": ["S", "W"],
        "prohibited": ["NE"],
        "wet": False
    },
    "living": {
        "name": "Living Room",
        "area_cells": 15,
        "shapes": [(5, 3), (3, 5), (4, 4)],
        "canonical_zone": "Center",
        "allowed_secondary": ["N", "E"],
        "prohibited": [],
        "wet": False
    },
    "kitchen": {
        "name": "Kitchen",
        "area_cells": 8,
        "shapes": [(4, 2), (2, 4), (3, 3)],
        "canonical_zone": "SE",
        "allowed_secondary": ["NW", "E"],
        "prohibited": ["NE", "SW"],
        "wet": True
    },
    "puja": {
        "name": "Puja Room",
        "area_cells": 4,
        "shapes": [(2, 2), (2, 1), (1, 2)],
        "canonical_zone": "NE",
        "allowed_secondary": ["N", "E"],
        "prohibited": ["S", "SW"],
        "wet": False
    },
    "bath_1": {
        "name": "Primary Bath",
        "area_cells": 4,
        "shapes": [(2, 2), (1, 3), (3, 1)],
        "canonical_zone": "NW",
        "allowed_secondary": ["W", "S", "SE"],
        "prohibited": ["NE"],
        "wet": True
    },
    "bath_2": {
        "name": "Common Bath",
        "area_cells": 4,
        "shapes": [(2, 2), (1, 3)],
        "canonical_zone": "NW",
        "allowed_secondary": ["W", "S", "SE"],
        "prohibited": ["NE"],
        "wet": True
    },
    "bed_2": {
        "name": "Bedroom 2",
        "area_cells": 9,
        "shapes": [(3, 3), (4, 3), (3, 4)],
        "canonical_zone": "W",
        "allowed_secondary": ["NW", "S"],
        "prohibited": ["NE"],
        "wet": False
    },
    "dining": {
        "name": "Dining Area",
        "area_cells": 8,
        "shapes": [(4, 2), (2, 4), (3, 2)],
        "canonical_zone": "W",
        "allowed_secondary": ["Center", "E", "SE"],
        "prohibited": [],
        "wet": False
    },
    "stairs": {
        "name": "Staircase",
        "area_cells": 6,
        "shapes": [(3, 2), (2, 3), (2, 2)],
        "canonical_zone": "SW",
        "allowed_secondary": ["W", "S", "NW"],
        "prohibited": ["NE"],
        "wet": False
    },
    "corridor": {
        "name": "Circulation Foyer",
        "area_cells": 6,
        "shapes": [(3, 2), (2, 3), (4, 1), (1, 4)],
        "canonical_zone": "Center",
        "allowed_secondary": ["N", "S", "E", "W"],
        "prohibited": [],
        "wet": False
    }
}


class SpatialGrid:
    """
    Represents the discretized building envelope on a 2D integer coordinate system.
    """
    def __init__(self, plot_width_m: float, plot_depth_m: float):
        self.plot_width_m = float(plot_width_m)
        self.plot_depth_m = float(plot_depth_m)
        ar = self.plot_width_m / max(self.plot_depth_m, 0.1)

        # Discretize grid dimension R x C (rows = North-South, cols = West-East)
        if 0.85 <= ar <= 1.15:
            self.rows = 10
            self.cols = 10
        elif ar > 1.15:
            self.rows = 10
            self.cols = min(14, max(8, round(10.0 * ar)))
        else:
            self.cols = 10
            self.rows = min(14, max(8, round(10.0 / ar)))

        self.cell_w_m = self.plot_width_m / self.cols
        self.cell_d_m = self.plot_depth_m / self.rows

    def get_zone(self, box: RoomBox) -> str:
        cr, cc = box.centroid
        r_third = self.rows / 3.0
        c_third = self.cols / 3.0

        if cr < r_third:
            row_pos = "N"
        elif cr < 2.0 * r_third:
            row_pos = "M"
        else:
            row_pos = "S"

        if cc < c_third:
            col_pos = "W"
        elif cc < 2.0 * c_third:
            col_pos = "M"
        else:
            col_pos = "E"

        if row_pos == "N" and col_pos == "W":
            return "NW"
        elif row_pos == "N" and col_pos == "M":
            return "N"
        elif row_pos == "N" and col_pos == "E":
            return "NE"
        elif row_pos == "M" and col_pos == "W":
            return "W"
        elif row_pos == "M" and col_pos == "M":
            return "Center"
        elif row_pos == "M" and col_pos == "E":
            return "E"
        elif row_pos == "S" and col_pos == "W":
            return "SW"
        elif row_pos == "S" and col_pos == "M":
            return "S"
        else:
            return "SE"

    def is_in_zone(self, box: RoomBox, target_zone: str) -> bool:
        return self.get_zone(box) == target_zone

    def is_in_se_quadrant(self, box: RoomBox) -> bool:
        cr, cc = box.centroid
        return cr >= (self.rows / 2.0) and cc >= (self.cols / 2.0)

    def is_in_ne_quadrant(self, box: RoomBox) -> bool:
        cr, cc = box.centroid
        return cr < (self.rows / 2.0) and cc >= (self.cols / 2.0)

    def is_in_sw_quadrant(self, box: RoomBox) -> bool:
        cr, cc = box.centroid
        return cr >= (self.rows / 2.0) and cc < (self.cols / 2.0)

    def is_in_nw_quadrant(self, box: RoomBox) -> bool:
        cr, cc = box.centroid
        return cr < (self.rows / 2.0) and cc < (self.cols / 2.0)
