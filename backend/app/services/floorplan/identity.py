"""Resolved identity per placed room.

The ontology owns the semantics; this module turns a solver room (id, area,
unit) into a :class:`SpaceIdentity` and stamps it onto the room.  Every
downstream surface (SVG labels, room schedules, PDF legend, service layers)
reads that object instead of re-deriving meaning from ids or display names.

Naming rules that are *not* pure ontology data (the L5 Master Suite threshold)
run before this pass; the resolver honours the certified class so a demoted
suite never keeps a suite identity.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional

from app.schemas.space_identity import SpaceIdentity
from app.services.floorplan.ontology import (
    FunctionType,
    HygieneClass,
    ONTOLOGY,
    SpaceTypeSpec,
)

# Spaces whose display label is unit-scoped ("Unit A Bedroom").
UNIT_SCOPED_SPACE_IDS = {
    "unit_living",
    "unit_kitchen",
    "unit_bed",
    "unit_bath",
    "unit_balcony",
    "unit_utility",
}

# Identity zone is the canonical four-way zone.  Room.zone_category keeps its
# report buckets (industrial_bay / terrace) for backward compatibility.
_ZONE_TO_CATEGORY = {
    "public": "public",
    "private": "private",
    "service": "service",
    "circulation": "circulation",
}


def _value(obj: Any, key: str, default: Any = None) -> Any:
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def _unit_label(unit_id: Optional[str]) -> Optional[str]:
    if not unit_id:
        return None
    text = str(unit_id).strip()
    for prefix in ("Unit_", "Unit ", "UNIT_", "UNIT "):
        if text.startswith(prefix):
            text = text[len(prefix):]
    return text or None


def _base_room_id(room_id: str) -> str:
    rid = str(room_id or "").strip().lower()
    head, sep, tail = rid.rpartition("_f")
    return head if sep and tail.isdigit() else rid


def _identity_name(
    spec: SpaceTypeSpec,
    room_id: str,
    typology: Optional[str],
    unit_id: Optional[str],
) -> str:
    base_id = _base_room_id(room_id)
    override = ONTOLOGY.ROOM_ID_LABEL_OVERRIDES.get(base_id)
    if not override and typology:
        canonical = ONTOLOGY.get_typology_profile(typology).canonical
        override = ONTOLOGY.ROOM_ID_LABEL_OVERRIDES_BY_TYPOLOGY.get(canonical, {}).get(base_id)
    base = override or spec.name
    label = _unit_label(unit_id)
    if label and spec.id in UNIT_SCOPED_SPACE_IDS:
        return f"Unit {label} {base}"
    return base


def _fallback_identity(
    room_id: str,
    existing_name: Optional[str],
    existing_zone_category: Optional[str],
) -> SpaceIdentity:
    category = str(existing_zone_category or "public")
    zone = category if category in _ZONE_TO_CATEGORY else "service"
    return SpaceIdentity(
        space_type_id=f"unresolved:{room_id}",
        name=str(existing_name or room_id.replace("_", " ").title() or "Room"),
        zone=zone,
        function="",
        hygiene_class="dry",
        clear_area_basis="gross",
        source="fallback",
    )


def resolve_space_identity(
    room_id: str,
    typology: Optional[str],
    *,
    area_sqm: Optional[float] = None,
    unit_id: Optional[str] = None,
    existing_name: Optional[str] = None,
    existing_zone_category: Optional[str] = None,
    suite_certified: bool = False,
) -> SpaceIdentity:
    """Resolve the canonical identity for a solver room.

    Returns a fallback identity (``source="fallback"``) rather than dropping a
    room when its id is not registered.  A fallback still carries the room's
    existing label so every surface can render, and identity-coverage metrics
    make the gap explicit.
    """
    sid = ONTOLOGY.resolve_space_id(room_id, typology)
    spec = ONTOLOGY.get_space(sid) if sid else None

    # L5 threshold: only promote to Master Suite when the naming pass certified
    # the class and the room actually clears the 14.0 m² threshold.
    if spec is not None and spec.id == "master_bed" and suite_certified and (area_sqm or 0.0) >= 14.0:
        suite = ONTOLOGY.get_space("master_suite")
        if suite is not None:
            spec = suite

    # A client/room-program "powder room" is a distinct WC+basin type, not the
    # generic common bath the solver id (bath_2) would otherwise resolve to.
    if spec is not None and spec.id in ("bath_1", "bath_2") and "powder" in str(existing_name or "").lower():
        powder = ONTOLOGY.get_space("powder_room")
        if powder is not None:
            spec = powder

    if spec is None:
        return _fallback_identity(room_id, existing_name, existing_zone_category)

    return SpaceIdentity(
        space_type_id=spec.id,
        name=_identity_name(spec, room_id, typology, unit_id),
        zone=spec.zone.value,
        function=spec.function.value,
        hygiene_class=spec.hygiene_class.value if isinstance(spec.hygiene_class, HygieneClass) else str(spec.hygiene_class),
        clear_area_basis=spec.clear_area_basis,
        min_area_sqm=float(spec.min_area_sqm),
        min_width_m=float(spec.min_width_m),
        max_aspect_ratio=float(spec.max_aspect_ratio),
        citation=spec.citation,
        ventilation_req=spec.ventilation_req,
        daylight_req=bool(spec.daylight_req),
        is_wet=bool(spec.is_wet),
        orientation_preference=list(spec.orientation_preference or []),
        orientation_avoid=list(spec.orientation_avoid or []),
        source="ontology",
    )


def apply_room_identity(room: Any, typology: Optional[str]) -> SpaceIdentity:
    """Stamp ``room.identity`` / ``space_type_id`` and return the identity."""
    existing_name = str(_value(room, "room_name", "") or "")
    threshold = str(_value(room, "naming_threshold_used", "") or "")
    suite_certified = "Certified" in threshold or "suite" in existing_name.lower()
    identity = resolve_space_identity(
        str(_value(room, "room_id", "") or ""),
        typology,
        area_sqm=float(_value(room, "area_sqm", 0.0) or 0.0),
        unit_id=_value(room, "unit_id", None),
        existing_name=existing_name,
        existing_zone_category=_value(room, "zone_category", None),
        suite_certified=suite_certified,
    )
    if isinstance(room, dict):
        room["identity"] = identity.model_dump()
        room["space_type_id"] = identity.space_type_id
        room["room_name"] = identity.name
    else:
        room.identity = identity
        room.space_type_id = identity.space_type_id
        room.room_name = identity.name
    return identity


def apply_space_identities(rooms: Iterable[Any], typology: Optional[str]) -> Dict[str, Any]:
    """Apply identities to a floor's rooms and return a coverage summary."""
    total = 0
    resolved = 0
    fallback: List[str] = []
    for room in rooms:
        total += 1
        identity = apply_room_identity(room, typology)
        if identity.source == "ontology":
            resolved += 1
        else:
            fallback.append(str(_value(room, "room_id", "") or ""))
    return {
        "rooms": total,
        "resolved": resolved,
        "fallback": fallback,
        "coverage_pct": round((resolved / total) * 100.0, 1) if total else 100.0,
    }


def identity_dict(room_or_raw: Any) -> Dict[str, Any]:
    """Read a room's identity as a plain dict (Pydantic or dict payloads)."""
    value = _value(room_or_raw, "identity", None)
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    dump = getattr(value, "model_dump", None)
    return dump() if callable(dump) else {}


def identity_name(room_or_raw: Any, fallback: str = "") -> str:
    data = identity_dict(room_or_raw)
    if data.get("name"):
        return str(data["name"])
    return str(_value(room_or_raw, "room_name", fallback) or fallback)


def identity_is_outdoor(room_or_raw: Any) -> bool:
    data = identity_dict(room_or_raw)
    if data.get("function"):
        return str(data["function"]) == FunctionType.OUTDOOR.value
    # Legacy payloads without identity: keep the previous heuristic.
    rid = str(_value(room_or_raw, "room_id", "") or "").lower()
    return "terrace" in rid or str(_value(room_or_raw, "zone_category", "") or "").lower() == "terrace"


def identity_is_wet(room_or_raw: Any) -> bool:
    data = identity_dict(room_or_raw)
    if "is_wet" in data:
        return bool(data["is_wet"])
    return any(
        token in (str(_value(room_or_raw, "room_id", "") or "") + " " + str(_value(room_or_raw, "room_name", "") or "")).lower()
        for token in ("bath", "toilet", "wc", "wash", "kitchen", "utility")
    )


def identity_zone_category(room_or_raw: Any) -> str:
    """Canonical zone bucket for legends, without changing legacy metrics."""
    data = identity_dict(room_or_raw)
    zone = str(data.get("zone", "") or "")
    if zone in _ZONE_TO_CATEGORY:
        return _ZONE_TO_CATEGORY[zone]
    return str(_value(room_or_raw, "zone_category", "") or "public")


def identity_area_basis(room_or_raw: Any) -> str:
    return str(identity_dict(room_or_raw).get("clear_area_basis") or "gross")


def summarize_identities(rooms: Iterable[Any]) -> Dict[str, Any]:
    """Coverage + duplicate-name audit for provenance (no name dedupe)."""
    total = 0
    resolved = 0
    names: Dict[str, List[str]] = {}
    fallback: List[str] = []
    for room in rooms:
        total += 1
        data = identity_dict(room)
        rid = str(_value(room, "room_id", "") or "")
        if data.get("source") == "ontology":
            resolved += 1
        else:
            fallback.append(rid)
        name = str(data.get("name") or _value(room, "room_name", "") or "")
        names.setdefault(name, []).append(rid)
    return {
        "rooms": total,
        "resolved": resolved,
        "fallback": fallback,
        "coverage_pct": round((resolved / total) * 100.0, 1) if total else 100.0,
        "shared_display_names": {
            name: ids for name, ids in names.items() if name and len(ids) > 1
        },
    }
