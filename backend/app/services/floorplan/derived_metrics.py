"""Derived sustainability metrics (audit F04).

The engine used to print constants where measurements belong:

    vastu_score_pct      = 90.0 if strictness == "high" else 82.0
    plumbing_stack_alignment_pct = 100.0
    space_utilization_pct = 100.0
    circulation_efficiency_pct = 100.0

Every number below is computed from the placed rectangles, the ontology
identity carried by each room, and the storey stack. Nothing here reads a
tolerance, a strictness label or a profile; a value that cannot be measured is
reported as ``None`` and rendered as “not evaluated” by the callers that print
it, never as a pass.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

#: Two rectangles count as sharing a wall when their edges are within this
#: distance. Wall centre-lines can land a few millimetres apart after rounding.
ADJACENCY_TOL_M = 0.06

#: Share of a room's floor area that must sit over a room below before the
#: stack is called aligned.
STACK_OVERLAP_MIN = 0.50


def _rect(room: Any) -> Tuple[float, float, float, float]:
    return (
        float(getattr(room, "x", 0.0) or 0.0),
        float(getattr(room, "y", 0.0) or 0.0),
        float(getattr(room, "width_m", 0.0) or 0.0),
        float(getattr(room, "depth_m", 0.0) or 0.0),
    )


def _adjacent(a: Any, b: Any, tol: float = ADJACENCY_TOL_M) -> bool:
    """True when ``a`` and ``b`` share a wall (not merely a corner)."""
    ax, ay, aw, ad = _rect(a)
    bx, by, bw, bd = _rect(b)
    x_overlap = min(ax + aw, bx + bw) - max(ax, bx)
    y_overlap = min(ay + ad, by + bd) - max(ay, by)
    vertical = x_overlap > tol and (abs(ay + ad - by) <= tol or abs(by + bd - ay) <= tol)
    horizontal = y_overlap > tol and (abs(ax + aw - bx) <= tol or abs(bx + bw - ax) <= tol)
    return bool(vertical or horizontal)


def _overlap_ratio(room: Any, below: Any) -> float:
    area = max(1e-9, float(getattr(room, "area_sqm", 0.0) or 0.0))
    ax, ay, aw, ad = _rect(room)
    bx, by, bw, bd = _rect(below)
    ox = max(0.0, min(ax + aw, bx + bw) - max(ax, bx))
    oy = max(0.0, min(ay + ad, by + bd) - max(ay, by))
    return (ox * oy) / area


def _identity(room: Any) -> Any:
    return getattr(room, "identity", None)


def is_wet(room: Any) -> bool:
    ident = _identity(room)
    if ident is not None:
        return str(getattr(ident, "hygiene_class", "") or "").lower() == "wet"
    # Legacy rectangles without an identity: fall back to the zone category,
    # never to a name prefix (a name is not a hygiene contract).
    return str(getattr(room, "zone_category", "")) == "service"


def vastu_status(room: Any) -> Optional[bool]:
    """Whether a room's orientation satisfies its ontology preference.

    ``None`` means the ontology has no orientation contract for this space, so
    it is excluded from the denominator instead of being counted as a pass.
    """
    ident = _identity(room)
    if ident is None:
        return None
    preferred = [str(z).upper() for z in (getattr(ident, "orientation_preference", None) or [])]
    avoid = [str(z).upper() for z in (getattr(ident, "orientation_avoid", None) or [])]
    if not preferred and not avoid:
        return None
    zone = str(getattr(room, "zone", "") or "").upper()
    if zone in avoid:
        return False
    if preferred:
        return zone in preferred
    return True


def vastu_pct(rooms: Iterable[Any]) -> Optional[float]:
    measured = [vastu_status(r) for r in rooms]
    measured = [m for m in measured if m is not None]
    if not measured:
        return None
    return round(100.0 * sum(1 for m in measured if m) / len(measured), 1)


def wet_riser_pct_by_floor(floors: Sequence[Any]) -> List[Optional[float]]:
    """Share of each floor's wet rooms that reach a plumbing riser.

    Ground floor: a wet room qualifies when it shares a wall with a circulation
    room (the riser column runs there) or with another wet room. An upper floor
    qualifies a wet room when at least half of it sits over a qualified wet
    room on the storey below. ``None`` when the floor has no wet room: there is
    nothing to align, and printing 100 % would invent a measurement.
    """
    out: List[Optional[float]] = []
    qualified: set[str] = set()
    for idx, floor in enumerate(floors):
        rooms = list(getattr(floor, "rooms", None) or [])
        wet = [r for r in rooms if is_wet(r)]
        if not wet:
            out.append(None)
            qualified = set()
            continue
        ok: set[str] = set()
        if idx == 0:
            circulation = [r for r in rooms
                           if str(getattr(r, "zone_category", "")) == "circulation"]
            for room in wet:
                if any(_adjacent(room, c) for c in circulation) or any(
                    _adjacent(room, other) for other in wet if other is not room
                ):
                    ok.add(room.room_id)
        else:
            below = {r.room_id: r for r in (floors[idx - 1].rooms or [])}
            for room in wet:
                if any(_overlap_ratio(room, below[q]) >= STACK_OVERLAP_MIN
                       for q in qualified if q in below):
                    ok.add(room.room_id)
        qualified = ok
        out.append(round(100.0 * len(ok) / len(wet), 1))
    return out


def circulation_efficiency_pct(rooms: Iterable[Any]) -> Optional[float]:
    """Usable area over usable + circulation area, measured on the plan."""
    usable = 0.0
    circulation = 0.0
    for room in rooms:
        if str(getattr(room, "zone_category", "")) == "terrace":
            continue
        area = float(getattr(room, "area_sqm", 0.0) or 0.0)
        if str(getattr(room, "zone_category", "")) == "circulation":
            circulation += area
        else:
            usable += area
    total = usable + circulation
    if total <= 0.0:
        return None
    return round(100.0 * usable / total, 1)


def building_wet_riser_pct(floors: Sequence[Any]) -> Optional[float]:
    """Building-level share of wet rooms that reach a riser (None if none)."""
    per_floor = wet_riser_pct_by_floor(floors)
    counts = []
    for floor, pct in zip(floors, per_floor):
        wet = [r for r in (getattr(floor, "rooms", None) or []) if is_wet(r)]
        if pct is not None and wet:
            counts.append((pct, len(wet)))
    total = sum(n for _pct, n in counts)
    if total <= 0:
        return None
    return round(sum(pct * n for pct, n in counts) / total, 1)


def apply_to_building(building: Any) -> Dict[str, Optional[float]]:
    """Stamp derived per-floor values and return the building-level metrics."""
    floors = list(getattr(building, "floors", None) or [])
    riser = wet_riser_pct_by_floor(floors)
    for floor, pct in zip(floors, riser):
        floor.plumbing_stack_alignment_pct = pct
        for room in (floor.rooms or []):
            # The per-room flag was stamped True at construction. Make it agree
            # with the orientation contract the score is measured against.
            status = vastu_status(room)
            if status is not None:
                room.vastu_compliant = status
        floor.vastu_score_pct = vastu_pct(floor.rooms or [])
        floor.vastu_compliance_pct = floor.vastu_score_pct
    all_rooms = [r for f in floors for r in (f.rooms or [])]
    return {
        "vastu_compliance_pct": vastu_pct(all_rooms),
        "plumbing_adjacency_score": building_wet_riser_pct(floors),
        "circulation_efficiency_pct": circulation_efficiency_pct(all_rooms),
        "space_utilization_pct": (
            # Capped at 100: land absorption may label a wedge outside the
            # rectangle envelope as enclosed storage, so the raw ratio can
            # exceed the envelope. A utilisation percentage cannot.
            min(100.0, round(
                100.0
                * sum(float(getattr(f, "built_up_area_sqm", 0.0) or 0.0) for f in floors)
                / max(1e-9, sum(
                    float((getattr(f, "envelope", None) or {}).get("area_sqm", 0.0) or 0.0)
                    for f in floors
                )),
                1,
            ))
            if floors else None
        ),
    }
