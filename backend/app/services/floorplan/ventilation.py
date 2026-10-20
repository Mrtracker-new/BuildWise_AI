"""Solve-time fresh-air provision for wet rooms.

The audit gate (L9) accepts a wet room only when a real opening or a shaft
serves it.  This pass runs after the openings are hosted and before the wall
graph, so the same duct schedule and drawing that leaves the solver is the one
the gate judges.  A room with a compliant external opening is left alone; a
room relying on an undersized opening or with no external wall receives a
dedicated exhaust riser inside its service corner.
"""

from __future__ import annotations

from typing import Any, Dict, List, Sequence

from app.schemas.multi_floor_plan import DuctShaftSpec

VENT_HEIGHT_SANITARY_M = 0.60
VENT_MIN_SANITARY_AREA_M2 = 0.37
VENT_SANITARY_RATIO = 0.10
SHAFT_SIZE_M = 0.45


def _open_area(room_id: str, windows: Sequence[Any]) -> float:
    total = 0.0
    for window in windows:
        if getattr(window, "room_id", None) != room_id:
            continue
        total += max(0.0, float(getattr(window, "width_m", 0.0) or 0.0)) * VENT_HEIGHT_SANITARY_M
    return total


def _shaft_serves(room_id: str, shafts: Sequence[DuctShaftSpec]) -> bool:
    rid = room_id.lower()
    for shaft in shafts:
        for served in (getattr(shaft, "servicing_rooms", None) or []):
            key = str(served).lower()
            if rid == key or key in rid:
                return True
    return False


def ensure_wet_room_ventilation(
    floor_index: int,
    rooms: Sequence[Any],
    windows: Sequence[Any],
    duct_shafts: List[DuctShaftSpec],
    envelope: Dict[str, float],
) -> List[str]:
    """Add a riser for every wet room not already served by opening or shaft."""
    warnings: List[str] = []
    env_w = float(envelope.get("width", 0.0) or 0.0)
    env_d = float(envelope.get("depth", 0.0) or 0.0)

    for room in rooms:
        identity = getattr(room, "identity", None)
        is_wet = bool(getattr(identity, "is_wet", False))
        if not is_wet:
            continue
        rid = str(getattr(room, "room_id", ""))
        area = float(getattr(room, "area_sqm", 0.0) or 0.0)
        required = max(VENT_MIN_SANITARY_AREA_M2, area * VENT_SANITARY_RATIO)
        if _open_area(rid, windows) >= required - 1e-6:
            continue
        if _shaft_serves(rid, duct_shafts):
            continue

        width = float(getattr(room, "width_m", 0.0) or 0.0)
        depth = float(getattr(room, "depth_m", 0.0) or 0.0)
        size = min(SHAFT_SIZE_M, width, depth)
        if size <= 0.10:
            continue
        x = round(float(getattr(room, "x", 0.0)) + width - size - 0.05, 2)
        y = round(float(getattr(room, "y", 0.0)) + 0.05, 2)
        x = max(0.0, min(x, env_w - size)) if env_w else x
        y = max(0.0, min(y, env_d - size)) if env_d else y

        shaft = DuctShaftSpec(
            shaft_id=f"duct_vent_F{floor_index}_{rid}",
            shaft_type="hvac_vent",
            x=x,
            y=y,
            width_m=round(size, 2),
            depth_m=round(size, 2),
            servicing_rooms=[rid],
        )
        duct_shafts.append(shaft)
        warnings.append(
            f"VENTILATION: dedicated exhaust riser {shaft.shaft_id} added inside "
            f"'{rid}' ({area:.1f} m²) because its opening provides "
            f"{_open_area(rid, windows):.2f} m² against {required:.2f} m² required."
        )
    return warnings
