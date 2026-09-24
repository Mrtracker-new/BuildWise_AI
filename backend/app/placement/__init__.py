# BuildWise AI - Architect Placement Engine (v13)
# Knowledge-base-driven architectural room placement package

from app.placement.kb import (
    RoomPlacementRule,
    PLACEMENT_KB,
    get_placement_rule,
    get_kb_default_placement,
    normalize_room_type,
)
from app.placement.validator import (
    validate_and_repair_placement,
    ValidatedPlacementResult,
)

__all__ = [
    "RoomPlacementRule",
    "PLACEMENT_KB",
    "get_placement_rule",
    "get_kb_default_placement",
    "normalize_room_type",
    "validate_and_repair_placement",
    "ValidatedPlacementResult",
]
