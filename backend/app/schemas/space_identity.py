"""Canonical ontology identity attached to every placed room.

The identity object is the single source for the room's display name, semantic
zone, function/hygiene class, clear-area basis and statutory minimums.  Room
rows keep ``room_name``/``zone_category`` as denormalized display fields so the
schema stays backward compatible, but every label, schedule, legend and service
classification reads the identity first.
"""

from __future__ import annotations

from typing import List, Literal

from pydantic import BaseModel, Field


class SpaceIdentity(BaseModel):
    """Resolved ontology identity for one placed room."""

    space_type_id: str
    name: str
    zone: str = "public"  # public | private | service | circulation | ...
    function: str = ""
    hygiene_class: str = "dry"
    clear_area_basis: Literal["clear_face", "carpet", "gross"] = "clear_face"
    min_area_sqm: float = 0.0
    min_width_m: float = 0.0
    max_aspect_ratio: float = 2.0
    citation: str = ""
    ventilation_req: str = "natural"
    daylight_req: bool = True
    is_wet: bool = False
    orientation_preference: List[str] = Field(default_factory=list)
    orientation_avoid: List[str] = Field(default_factory=list)
    source: Literal["ontology", "fallback"] = "ontology"
