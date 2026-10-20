"""Placement-time furniture catalog.

The catalog is deliberately geometry-first: every item is placed inside the
room rectangle at solve time, so the width allocator can ask for the smallest
room that actually holds the ontology's minimum furniture set.  A room is only
reported as furnished when every item fits inside its walls; there is no
"nominal set" that is counted as satisfied without being placed.

Item dimensions are drawn from Architectural Graphic Standards / NKBA practice
already cited by ``living_quality``.  The layout engine below is intentionally
small and deterministic: bed/living/dining rooms get orientation-aware layouts,
while the remaining catalog sets use a wall-run packer.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Iterable, List, Optional, Sequence, Tuple

from app.services.floorplan.ontology import ONTOLOGY

WALL_GAP_M = 0.05
COMPACT_SIDE_M = 0.15
COMPACT_FOOT_M = 0.35


@dataclass(frozen=True)
class CatalogItem:
    item_type: str
    width_m: float
    depth_m: float
    clearance_m: float


@dataclass
class PlacedItem:
    item_type: str
    x: float
    y: float
    width_m: float
    depth_m: float
    clearance_m: float
    satisfied: bool = True


@dataclass
class LayoutResult:
    items: List[PlacedItem]
    satisfied: bool
    reason: str = ""

    @property
    def clearance_score(self) -> float:
        return sum(max(0.0, item.clearance_m) for item in self.items)


CATALOG: dict[str, CatalogItem] = {
    "bed_king": CatalogItem("bed_king", 1.80, 2.00, 0.50),
    "bed_queen": CatalogItem("bed_queen", 1.50, 2.00, 0.45),
    "bedside_table": CatalogItem("bedside_table", 0.45, 0.40, 0.30),
    "wardrobe": CatalogItem("wardrobe", 1.20, 0.60, 0.60),
    "sofa_3seater": CatalogItem("sofa_3seater", 2.20, 0.90, 0.60),
    "coffee_table": CatalogItem("coffee_table", 1.00, 0.60, 0.60),
    "dining_table_6p": CatalogItem("dining_table_6p", 1.50, 0.90, 0.90),
    "kitchen_cooktop": CatalogItem("kitchen_cooktop", 0.75, 0.60, 0.90),
    "kitchen_sink": CatalogItem("kitchen_sink", 0.80, 0.55, 0.90),
    "kitchen_fridge": CatalogItem("kitchen_fridge", 0.80, 0.70, 0.90),
    "desk": CatalogItem("desk", 1.20, 0.60, 0.75),
    "task_chair": CatalogItem("task_chair", 0.50, 0.50, 0.60),
    "bookshelf": CatalogItem("bookshelf", 0.90, 0.35, 0.60),
    "credenza": CatalogItem("credenza", 1.40, 0.45, 0.60),
    "meeting_table": CatalogItem("meeting_table", 2.40, 1.20, 0.90),
    "reception_desk": CatalogItem("reception_desk", 1.60, 0.70, 0.90),
    "lounge_chair": CatalogItem("lounge_chair", 0.70, 0.70, 0.60),
    "mandir": CatalogItem("mandir", 0.60, 0.50, 0.45),
    "washing_machine": CatalogItem("washing_machine", 0.60, 0.60, 0.60),
    "locker": CatalogItem("locker", 0.40, 0.50, 0.45),
    "bench": CatalogItem("bench", 1.20, 0.40, 0.45),
    "server_rack": CatalogItem("server_rack", 0.60, 1.00, 0.75),
    "panel_board": CatalogItem("panel_board", 0.80, 0.20, 0.75),
    "outdoor_chair": CatalogItem("outdoor_chair", 0.60, 0.60, 0.45),
    "outdoor_table": CatalogItem("outdoor_table", 0.80, 0.80, 0.45),
}


# The certificate admits room proportions up to 1.30x the ontology bound at
# degradation level 0 (see SoleGeometryEngine: ar_tolerance).  Placement uses
# the same bound so a solved room is never born outside the audited limit.
PLACEMENT_ASPECT_TOLERANCE = 1.30
# A frontage repair may spend at most 50% more width than a room already has to
# fix its proportion.  Beyond that the band is not repairable by re-slicing
# (a 23 m-deep wing containing a bathroom sliver) and the honest answer is a
# warning, not silently consuming the rest of the row.
PLACEMENT_ASPECT_WIDTH_CAP = 1.50


def furniture_set_for(space_id: Optional[str], room_id: str = "") -> List[str]:
    """Return the ontology minimum set, resolved exactly-first."""
    sid = space_id or ONTOLOGY.resolve_space_id(room_id)
    if sid:
        spec = ONTOLOGY.get_space(sid)
        if spec is not None and spec.id == sid and spec.furniture_set:
            return [item for item in spec.furniture_set if item in CATALOG]
    return []


def _inside(width: float, depth: float, x: float, y: float, w: float, d: float) -> bool:
    return (
        x >= -1e-6
        and y >= -1e-6
        and x + w <= width + 1e-6
        and y + d <= depth + 1e-6
    )


def _overlap(a: PlacedItem, b: PlacedItem) -> bool:
    return not (
        a.x + a.width_m <= b.x + 1e-6
        or b.x + b.width_m <= a.x + 1e-6
        or a.y + a.depth_m <= b.y + 1e-6
        or b.y + b.depth_m <= a.y + 1e-6
    )


def _valid(items: Sequence[PlacedItem], width: float, depth: float) -> bool:
    for i, item in enumerate(items):
        if not _inside(width, depth, item.x, item.y, item.width_m, item.depth_m):
            return False
        for other in items[i + 1:]:
            if _overlap(item, other):
                return False
    return True


def _result(items: List[PlacedItem], width: float, depth: float, reason: str = "") -> LayoutResult:
    squeezed = _valid(items, width, depth)
    return LayoutResult(items=items, satisfied=squeezed, reason=reason if not squeezed else "")


def _pack_along_walls(width: float, depth: float, types: Sequence[str]) -> Optional[LayoutResult]:
    """Place a generic item set on successive wall runs.

    Items are packed left-to-right on the south wall, then the north wall, then
    the west/east returns.  The catalogue sets are small, so this deterministic
    shelf packer is enough and never produces overlapping envelopes.
    """
    if not types:
        return LayoutResult(items=[], satisfied=True)
    items: List[PlacedItem] = []
    runs = [
        (WALL_GAP_M, WALL_GAP_M, width - 2 * WALL_GAP_M, "h"),
        (WALL_GAP_M, depth - WALL_GAP_M, width - 2 * WALL_GAP_M, "h"),
        (WALL_GAP_M, WALL_GAP_M, depth - 2 * WALL_GAP_M, "v"),
        (width - WALL_GAP_M, WALL_GAP_M, depth - 2 * WALL_GAP_M, "v"),
    ]
    for item_type in types:
        spec = CATALOG[item_type]
        placed = False
        for start, fixed, run, axis in runs:
            cursor = start
            while cursor + (spec.width_m if axis == "h" else spec.depth_m) <= start + run + 1e-6:
                if axis == "h":
                    x = cursor
                    y = fixed if fixed <= WALL_GAP_M + 1e-6 else fixed - spec.depth_m
                    w, d = spec.width_m, spec.depth_m
                else:
                    x = fixed if fixed <= WALL_GAP_M + 1e-6 else fixed - spec.width_m
                    y = cursor
                    w, d = spec.width_m, spec.depth_m
                candidate = PlacedItem(item_type, x, y, w, d, spec.clearance_m)
                if _inside(width, depth, x, y, w, d) and not any(
                    _overlap(candidate, existing) for existing in items
                ):
                    items.append(candidate)
                    placed = True
                    break
                cursor += 0.10
            if placed:
                break
        if not placed:
            return None
    return _result(items, width, depth)


def _bed_layout(width: float, depth: float, set_types: Sequence[str]) -> LayoutResult:
    bed_type = "bed_king" if "bed_king" in set_types else "bed_queen"
    bed = CATALOG[bed_type]
    wardrobe = CATALOG["wardrobe"] if "wardrobe" in set_types else None
    bedside = CATALOG["bedside_table"] if "bedside_table" in set_types else None
    candidates: List[LayoutResult] = []

    for bw, bd in ((bed.width_m, bed.depth_m), (bed.depth_m, bed.width_m)):
        if bw + 2 * WALL_GAP_M > width + 1e-6 or bd + 2 * WALL_GAP_M > depth + 1e-6:
            continue
        bed_item = PlacedItem(
            bed_type, WALL_GAP_M, WALL_GAP_M, bw, bd,
            max(0.0, min(width - bw - 2 * WALL_GAP_M, depth - bd - 2 * WALL_GAP_M)),
        )
        items = [bed_item]
        bedside_placed = False

        if bedside is not None:
            side_x = WALL_GAP_M + bw + 0.05
            side_y = WALL_GAP_M
            if _inside(width, depth, side_x, side_y, bedside.width_m, bedside.depth_m):
                items.append(PlacedItem(
                    "bedside_table", side_x, side_y,
                    bedside.width_m, bedside.depth_m, 0.05,
                ))
                bedside_placed = True

        wardrobe_placed = False
        if wardrobe is not None:
            options = [
                # Foot wall, across the room.
                (WALL_GAP_M, depth - WALL_GAP_M - wardrobe.depth_m,
                 min(wardrobe.width_m, width - 2 * WALL_GAP_M), wardrobe.depth_m),
                # East return, rotated against the long wall.
                (width - WALL_GAP_M - wardrobe.depth_m, WALL_GAP_M,
                 wardrobe.depth_m, min(wardrobe.width_m, depth - 2 * WALL_GAP_M)),
                # North-east corner, across the short wall.
                (max(WALL_GAP_M, width - WALL_GAP_M - wardrobe.width_m),
                 depth - WALL_GAP_M - wardrobe.depth_m,
                 min(wardrobe.width_m, width - 2 * WALL_GAP_M), wardrobe.depth_m),
            ]
            chosen = None
            for wx, wy, ww, wd in options:
                if ww <= 0.2 or wd <= 0.2:
                    continue
                candidate = PlacedItem("wardrobe", wx, wy, ww, wd, 0.60)
                if _inside(width, depth, wx, wy, ww, wd) and not any(
                    _overlap(candidate, item) for item in items
                ):
                    chosen = candidate
                    break
            if chosen is None:
                continue
            items.append(chosen)
            wardrobe_placed = True

        # The ontology set is a minimum: never call a partially placed set
        # satisfied just because the bed itself fits.
        if bedside is not None and not bedside_placed:
            continue
        if wardrobe is not None and not wardrobe_placed:
            continue

        # A bed needs usable access on at least one side/foot.  A wardrobe on the
        # foot wall counts as storage, so only the side gap is then required.
        side_gap = width - bw - 2 * WALL_GAP_M
        foot_gap = depth - bd - 2 * WALL_GAP_M
        bed_item.clearance_m = round(max(side_gap, foot_gap), 2)
        if bed_item.clearance_m + 1e-6 < COMPACT_SIDE_M:
            continue
        candidates.append(_result(items, width, depth))

    if not candidates:
        # Keep the primary bed visible even when the room cannot hold the full
        # set; the caller marks it unsatisfied rather than silently dropping it.
        bw = min(bed.width_m, max(0.0, width - 2 * WALL_GAP_M))
        bd = min(bed.depth_m, max(0.0, depth - 2 * WALL_GAP_M))
        if bw <= 0 or bd <= 0:
            return LayoutResult(items=[], satisfied=False, reason="room too small for bed")
        item = PlacedItem(bed_type, WALL_GAP_M, WALL_GAP_M, bw, bd, 0.0, satisfied=False)
        return LayoutResult(items=[item], satisfied=False, reason="bedroom set does not fit")
    return max(candidates, key=lambda result: (result.satisfied, result.clearance_score))


def _living_layout(width: float, depth: float) -> LayoutResult:
    sofa = CATALOG["sofa_3seater"]
    coffee = CATALOG["coffee_table"]
    candidates: List[LayoutResult] = []

    for sx, sy, sw, sd, cx, cy, cw, cd in (
        (WALL_GAP_M, WALL_GAP_M, min(sofa.width_m, width - 2 * WALL_GAP_M), sofa.depth_m,
         WALL_GAP_M + 0.20, WALL_GAP_M + sofa.depth_m + 0.45, coffee.width_m, coffee.depth_m),
        (WALL_GAP_M, WALL_GAP_M, sofa.depth_m, min(sofa.width_m, depth - 2 * WALL_GAP_M),
         WALL_GAP_M + sofa.depth_m + 0.45, WALL_GAP_M + 0.20, coffee.depth_m, coffee.width_m),
    ):
        sofa_item = PlacedItem("sofa_3seater", sx, sy, sw, sd, 0.0)
        coffee_item = PlacedItem("coffee_table", cx, cy, cw, cd, 0.60)
        if not _valid([sofa_item, coffee_item], width, depth):
            continue
        front_gap = cy - (sy + sd) if sy == WALL_GAP_M and sw > sd else cx - (sx + sw)
        sofa_item.clearance_m = round(max(0.0, front_gap), 2)
        if sofa_item.clearance_m + 1e-6 < COMPACT_SIDE_M:
            continue
        candidates.append(_result([sofa_item, coffee_item], width, depth))
    if candidates:
        return max(candidates, key=lambda result: result.clearance_score)
    return LayoutResult(items=[], satisfied=False, reason="living set does not fit")


def _dining_layout(width: float, depth: float) -> LayoutResult:
    table = CATALOG["dining_table_6p"]
    candidates: List[LayoutResult] = []
    for tw, td in ((table.width_m, table.depth_m), (table.depth_m, table.width_m)):
        if tw + 2 * WALL_GAP_M > width or td + 2 * WALL_GAP_M > depth:
            continue
        # Table against the long wall; pull-out is measured on the open side.
        x, y = WALL_GAP_M, WALL_GAP_M
        item = PlacedItem("dining_table_6p", x, y, tw, td, 0.0)
        pullout = depth - td - 2 * WALL_GAP_M
        if pullout + 1e-6 < 0.60:
            continue
        item.clearance_m = round(pullout, 2)
        candidates.append(_result([item], width, depth))
    if candidates:
        return max(candidates, key=lambda result: result.clearance_score)
    return LayoutResult(items=[], satisfied=False, reason="dining table does not fit")


def _kitchen_layout(width: float, depth: float) -> LayoutResult:
    import math

    cooktop = CATALOG["kitchen_cooktop"]
    sink = CATALOG["kitchen_sink"]
    fridge = CATALOG["kitchen_fridge"]
    if width < max(cooktop.width_m, sink.width_m, fridge.width_m) + 2 * WALL_GAP_M:
        return LayoutResult(items=[], satisfied=False, reason="kitchen too narrow")
    if depth < 2.20:
        return LayoutResult(items=[], satisfied=False, reason="kitchen too shallow")

    # Cooktop and sink share the hot worktop run, anchored to opposite ends of
    # the room so neither appliance leaves the envelope on a narrow plan.
    cooktop_x = WALL_GAP_M
    sink_x = round(width - WALL_GAP_M - sink.width_m, 2)
    l1 = abs(sink_x - cooktop_x)
    if l1 > 2.70:
        sink_x = round(cooktop_x + 2.70, 2)
        l1 = 2.70
    if l1 < 1.20:
        return LayoutResult(items=[], satisfied=False, reason="kitchen worktop run too short")
    mid_x = (cooktop_x + sink_x) / 2.0
    half = l1 / 2.0
    work_y = round(depth - 0.60, 2)
    vert = math.sqrt(max(0.0, 2.565 ** 2 - half ** 2))
    fridge_y = round(work_y - vert, 2)
    if fridge_y < 0.30:
        fridge_y = 0.30
    fridge_x = round(mid_x, 2)

    items = [
        PlacedItem("kitchen_cooktop", cooktop_x, work_y,
                   cooktop.width_m, cooktop.depth_m, 0.90),
        PlacedItem("kitchen_sink", sink_x, work_y,
                   sink.width_m, sink.depth_m, 0.90),
        PlacedItem("kitchen_fridge", fridge_x, fridge_y,
                   fridge.width_m, fridge.depth_m, 0.90),
    ]
    if not _valid(items, width, depth):
        return LayoutResult(items=[], satisfied=False, reason="kitchen work triangle does not fit")

    legs = (
        math.hypot(cooktop_x - sink_x, 0.0),
        math.hypot(sink_x - fridge_x, work_y - fridge_y),
        math.hypot(fridge_x - cooktop_x, fridge_y - work_y),
    )
    if not all(1.20 - 0.01 <= leg <= 2.70 + 0.01 for leg in legs):
        return LayoutResult(items=items, satisfied=False, reason="kitchen triangle leg out of bounds")
    if not (3.60 <= sum(legs) <= 7.90 + 0.02):
        return LayoutResult(items=items, satisfied=False, reason="kitchen triangle sum out of bounds")
    return _result(items, width, depth)


def layout_room(width: float, depth: float, item_types: Sequence[str]) -> LayoutResult:
    """Place a furniture set in a room rectangle (origin at 0,0)."""
    if not item_types:
        return LayoutResult(items=[], satisfied=True)
    types = list(dict.fromkeys(item_types))
    primary = types[0]
    if primary in ("bed_king", "bed_queen"):
        return _bed_layout(width, depth, types)
    if primary == "sofa_3seater":
        return _living_layout(width, depth)
    if primary == "dining_table_6p":
        return _dining_layout(width, depth)
    if primary in ("kitchen_cooktop", "kitchen_sink", "kitchen_fridge"):
        return _kitchen_layout(width, depth)
    packed = _pack_along_walls(width, depth, types)
    if packed is not None:
        return packed
    return LayoutResult(items=[], satisfied=False, reason="catalog set does not fit")


@lru_cache(maxsize=4096)
def minimum_width_for_set(item_types: Tuple[str, ...], depth: float) -> Optional[float]:
    """Smallest width that holds the set at this depth, or ``None``."""
    if not item_types:
        return 0.0
    d = round(float(depth), 2)
    w = 1.00
    while w <= 8.00 + 1e-9:
        if layout_room(round(w, 2), d, item_types).satisfied:
            return round(w, 2)
        w += 0.05
    return None


def minimum_width_for_room(space_id: Optional[str], room_id: str, depth: float) -> Optional[float]:
    items = furniture_set_for(space_id, room_id)
    if not items:
        return 0.0
    return minimum_width_for_set(tuple(items), depth)


def minimum_depth_for_set(item_types: Sequence[str], width: float) -> Optional[float]:
    if not item_types:
        return 0.0
    w = round(float(width), 2)
    d = 1.00
    while d <= 8.00 + 1e-9:
        if layout_room(w, round(d, 2), item_types).satisfied:
            return round(d, 2)
        d += 0.05
    return None


def repair_room_envelopes_for_furniture(rooms: Sequence[object]) -> List[str]:
    """Widen narrow rooms within their existing row before openings are hosted.

    A band/row is the natural allocation unit: the sum of room widths is fixed
    by the plate, so a bedroom that is 0.4 m too narrow for its bed can borrow
    that frontage from a bathroom or living room that has surplus.  No room is
    shrunk below its ontology minimum or its own furniture demand, and rooms in
    other rows are untouched.  If the row physically cannot satisfy the demand,
    the failure is returned as an explicit warning rather than hidden.
    """
    warnings: List[str] = []
    proportion_shortfalls: List[str] = []
    rows: dict[Tuple[float, float], List[object]] = {}
    for room in rooms:
        if getattr(room, "zone_category", "") in ("circulation", "terrace"):
            continue
        if getattr(room, "is_vertical_core", False):
            continue
        if float(getattr(room, "width_m", 0.0)) <= 0.01 or float(getattr(room, "depth_m", 0.0)) <= 0.01:
            continue
        key = (round(float(getattr(room, "y", 0.0)), 2), round(float(getattr(room, "depth_m", 0.0)), 2))
        rows.setdefault(key, []).append(room)

    for _key, row in rows.items():
        if len(row) < 2:
            continue
        row.sort(key=lambda item: float(getattr(item, "x", 0.0)))
        total = round(sum(float(getattr(item, "width_m", 0.0)) for item in row), 2)
        hard_mins: List[float] = []
        soft_mins: List[float] = []
        furniture_widths: List[float] = []
        width_floors: List[float] = []
        for room in row:
            depth = float(getattr(room, "depth_m", 0.0))
            sid = getattr(room, "space_type_id", None)
            rid = str(getattr(room, "room_id", ""))
            if not sid:
                sid = ONTOLOGY.resolve_space_id(rid)
            spec = ONTOLOGY.get_space(sid) if sid else None
            area_floor = 0.0
            width_floor = 0.0
            aspect_floor = 0.0
            aspect_capped = False
            if spec is not None:
                width_floor = float(spec.min_width_m)
                if depth > 0.05:
                    area_floor = float(spec.min_area_sqm) / depth
                    # A room is only as wide as its share of the row frontage,
                    # so a deep band can produce a slot 1:2.6 even when every
                    # statutory minimum holds.  The width that keeps
                    # depth/width inside the audited proportion is part of the
                    # demand too, but capped so an unrepairable band cannot
                    # swallow the row.
                    if getattr(room, "zone_category", "") != "industrial_bay":
                        max_aspect = float(getattr(spec, "max_aspect_ratio", 0.0) or 0.0)
                        if max_aspect > 0.0:
                            wanted = depth / (max_aspect * PLACEMENT_ASPECT_TOLERANCE)
                            limit = PLACEMENT_ASPECT_WIDTH_CAP * max(
                                width_floor, area_floor, float(getattr(room, "width_m", 0.0))
                            )
                            aspect_floor = min(wanted, limit)
                            aspect_capped = wanted > limit + 1e-9
            furniture_width = minimum_width_for_room(sid, rid, depth)
            if furniture_width is None:
                furniture_width = width_floor or 1.5
            furniture_widths.append(round(max(0.0, furniture_width), 2))
            width_floors.append(round(max(0.0, width_floor), 2))
            hard = round(max(0.0, furniture_width, width_floor, area_floor), 2)
            soft = round(max(hard, aspect_floor), 2)
            hard_mins.append(hard)
            soft_mins.append(soft)
            if aspect_capped:
                proportion_shortfalls.append(str(rid))

        fallback = False
        if sum(hard_mins) <= total + 0.01:
            # Statutory and furniture floors are hard; proportion is spent only
            # from genuine spare frontage.  A compact plate must never lose a
            # living room's area minimum to make the kitchen look squarer.
            needs = list(hard_mins)
            spare = round(total - sum(needs), 2)
            for idx in sorted(
                range(len(row)), key=lambda i: (-(soft_mins[i] - needs[i]), i)
            ):
                gap = max(0.0, soft_mins[idx] - needs[idx])
                add = min(gap, spare)
                if add <= 0.0:
                    continue
                needs[idx] = round(needs[idx] + add, 2)
                spare = round(spare - add, 2)
                if spare <= 0.005:
                    break
        elif sum(max(f, wf) for f, wf in zip(furniture_widths, width_floors)) <= total + 0.01:
            # The row is already over-programmed (the trapezoid's 6.0 m wing
            # cannot hold three code-width rooms).  A code-width floor is
            # NEVER traded away for a furniture envelope: use
            # max(furniture, width floor), then spend spare frontage on the
            # audited width floors.  Area minima that cannot fit are reported,
            # never silently ignored.
            needs = [round(max(f, wf), 2) for f, wf in zip(furniture_widths, width_floors)]
            spare = total - sum(needs)
            for idx in sorted(range(len(row)), key=lambda i: (-(width_floors[i] - needs[i]), i)):
                gap = max(0.0, width_floors[idx] - needs[idx])
                add = min(gap, spare)
                needs[idx] = round(needs[idx] + add, 2)
                spare = round(spare - add, 2)
                if spare <= 0.005:
                    break
            fallback = True
        else:
            warnings.append(
                f"Furniture frontage: row at y={_key[0]:.2f}m needs "
                f"{sum(furniture_widths):.2f}m for its catalogue sets but only "
                f"{total:.2f}m is available; one or more rooms remain below "
                "their minimum set."
            )
            continue

        deficits = sum(
            max(0.0, need - float(getattr(room, "width_m", 0.0)))
            for room, need in zip(row, needs)
        )
        if deficits <= 0.005:
            continue

        extra = total - sum(needs)
        weights = [max(0.01, float(getattr(room, "width_m", 0.0)) - need)
                   for room, need in zip(row, needs)]
        wsum = sum(weights) or 1.0
        widths = [round(need + extra * weight / wsum, 2)
                  for need, weight in zip(needs, weights)]
        delta = round(total - sum(widths), 2)
        if widths:
            widths[-1] = round(widths[-1] + delta, 2)
        if abs(sum(widths) - total) > 0.02:
            continue

        cursor = float(getattr(row[0], "x", 0.0))
        for room, width in zip(row, widths):
            room.x = round(cursor, 2)
            room.width_m = round(width, 2)
            room.area_sqm = round(width * float(getattr(room, "depth_m", 0.0)), 2)
            depth = float(getattr(room, "depth_m", 1.0)) or 1.0
            if width > 0.01:
                room.aspect_ratio = round(max(width / depth, depth / width), 2)
            cursor += width
        warnings.append(
            f"Furniture frontage rebalanced in row y={_key[0]:.2f}m "
            f"(total {total:.2f}m) to place every catalogue set at solve time."
            + (" Statutory area minima could not all be held; room width "
               "floors were preserved over furniture envelopes." if fallback else "")
        )
    if proportion_shortfalls:
        warnings.append(
            "Room proportion: "
            + ", ".join(proportion_shortfalls)
            + " remain outside the audited proportion tolerance; the band "
            "needs restructuring, not a wider slot (frontage widening capped at "
            f"{PLACEMENT_ASPECT_WIDTH_CAP:.2f}x)."
        )
    return warnings
