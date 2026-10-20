"""Backward-compatible room-programme identifiers.

The frontend catalogs and older saved requests used display IDs (for example
``apt_a_living`` or ``loading_dock``) that predate the canonical ontology space
types.  The engine only understands ontology IDs, so unresolved legacy IDs were
reported as "not part of the program" even though the typology itself was
solved correctly.

This module is deliberately dependency-light: the canonical catalog is imported
lazily so the request schema can normalize its programme without importing the
solver stack.
"""

from __future__ import annotations

from typing import Dict, Iterable, List

from .typologies import normalize_typology

LEGACY_ROOM_ALIASES: Dict[str, Dict[str, str]] = {
    "T1_SINGLE_FAMILY": {
        "stairs": "t1_stair",
        "staircase": "t1_stair",
    },
    "T2_FAMILY_APARTMENT": {
        "staircase_core": "shared_stair",
        "stair_core": "shared_stair",
        "lobby": "floor_lobby",
        "apt_a_living": "unit_living",
        "apt_b_living": "unit_living",
        "apt_a_kitchen": "unit_kitchen",
        "apt_b_kitchen": "unit_kitchen",
        "apt_a_bed": "unit_bed",
        "apt_b_bed": "unit_bed",
        "apt_a_bath": "unit_bath",
        "apt_b_bath": "unit_bath",
        "apt_balcony": "unit_balcony",
    },
    "T3_LARGE_COMPLEX": {
        "fire_stair_1": "primary_stair",
        "fire_stair_2": "secondary_stair",
        "lift_bank": "lift_lobby",
        "corridor": "spine_corridor",
        "commercial_suite_a": "commercial_suite",
        "commercial_suite_b": "commercial_suite",
        "commercial_suite_c": "commercial_suite",
        "restroom_block": "sanitary_block",
    },
    "T4_WAREHOUSE": {
        "loading_dock": "dock_bay",
        "dispatch_buffer": "dispatch",
        "staff_amenities": "worker_amenity",
        "steel_stair": "ind_stair",
        "mezzanine_office": "admin_office",
        "conference_room": "conf_room",
        "catwalk": "admin_catwalk",
    },
}


def resolve_room_id(typology: str, room_id: str) -> str:
    """Resolve a requested room ID to its canonical ontology ID.

    Canonical IDs pass through unchanged.  Unknown IDs also pass through, so a
    genuine typology/programme mismatch is still reported as unmet rather than
    silently dropped.
    """
    canonical = normalize_typology(typology)
    clean = (room_id or "").strip().lower()
    return LEGACY_ROOM_ALIASES.get(canonical, {}).get(clean, clean)


def normalize_room_ids(typology: str, room_ids: Iterable[str]) -> List[str]:
    """Resolve and de-duplicate a requested programme while preserving order."""
    seen: set[str] = set()
    resolved: List[str] = []
    for room_id in room_ids:
        canonical = resolve_room_id(typology, room_id)
        if canonical and canonical not in seen:
            seen.add(canonical)
            resolved.append(canonical)
    return resolved


def canonical_room_ids(typology: str) -> List[str]:
    """Return the canonical ontology IDs available for a typology."""
    from .typologies import get_typology_catalog

    return list(get_typology_catalog(typology))
