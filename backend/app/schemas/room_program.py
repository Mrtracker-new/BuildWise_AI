from enum import Enum
from typing import List, Optional, Any, Set
from pydantic import BaseModel, Field, model_validator, field_validator


class VastuZone(str, Enum):
    N = "N"
    NE = "NE"
    E = "E"
    SE = "SE"
    S = "S"
    SW = "SW"
    W = "W"
    NW = "NW"
    CENTER = "CENTER"


class SolverHints(BaseModel):
    target_utilization: float = Field(default=0.95, ge=0.5, le=1.0, description="Target spatial floor envelope utilization ratio")
    allow_corridors: bool = Field(default=True, description="Whether internal circulation foyers/corridors are permitted")


class RoomSpec(BaseModel):
    name: str = Field(..., description="Human-readable room identifier, e.g. Living Room, Home Office, Kitchen")
    min_area_pct: float = Field(..., ge=1.0, le=100.0, description="Minimum percentage of habitable built-up footprint")
    max_area_pct: float = Field(..., ge=1.0, le=100.0, description="Maximum percentage of habitable built-up footprint")
    vastu_zone: VastuZone = Field(..., description="Canonical Vastu zone for room placement")
    adjacency: List[str] = Field(default_factory=list, description="Names of preferred adjacent rooms")
    requires_plumbing: bool = Field(default=False, description="Whether room requires wet wall plumbing stack")
    priority: int = Field(default=1, ge=1, le=10, description="Relative placement priority (1 = highest)")

    @field_validator("vastu_zone", mode="before")
    @classmethod
    def normalize_zone(cls, v: Any) -> Any:
        if isinstance(v, str):
            clean = v.strip().upper()
            if clean in ("CENTRE", "CENTER", "BRAHMASTHANA", "M"):
                return VastuZone.CENTER
            return clean
        return v

    @model_validator(mode="after")
    def ensure_bounds(self) -> "RoomSpec":
        if self.min_area_pct > self.max_area_pct:
            self.max_area_pct = self.min_area_pct
        return self


class RoomProgram(BaseModel):
    rooms: List[RoomSpec] = Field(..., min_length=1, description="List of room specifications")
    design_intent: str = Field(
        default="Custom architectural space program optimized for functional circulation, daylighting, and Vastu zoning.",
        description="2-3 sentence architectural design brief"
    )
    solver_hints: SolverHints = Field(default_factory=SolverHints)

    @model_validator(mode="before")
    @classmethod
    def normalize_program_payload(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data

        # Unwrap nested wrappers: e.g. {"room_program": {...}} or {"program": {...}}
        if "rooms" not in data:
            for k in ("room_program", "program", "data", "result", "payload"):
                if isinstance(data.get(k), dict) and "rooms" in data[k]:
                    data = dict(data[k])
                    break

        # Map alternative naming conventions for design_intent
        if not data.get("design_intent"):
            for alt_key in ("design_brief", "brief", "intent", "description", "summary", "notes", "concept"):
                if data.get(alt_key) and isinstance(data[alt_key], str) and data[alt_key].strip():
                    data["design_intent"] = data[alt_key].strip()
                    break

        if not data.get("design_intent") or not str(data["design_intent"]).strip():
            room_list = data.get("rooms", [])
            if isinstance(room_list, list) and room_list:
                room_names = [
                    r.get("name") if isinstance(r, dict) else getattr(r, "name", None)
                    for r in room_list
                ]
                valid_names = [n for n in room_names if n]
                if valid_names:
                    names_str = ", ".join(valid_names[:4])
                    data["design_intent"] = f"Architectural layout program featuring {names_str}, tailored for optimal spatial flow, solar orientation, and Vastu compliance."
                else:
                    data["design_intent"] = "Space plan optimized for functional circulation, daylighting, and Vastu zoning."
            else:
                data["design_intent"] = "Space plan optimized for functional circulation, daylighting, and Vastu zoning."

        return data

    @model_validator(mode="after")
    def validate_room_program(self) -> "RoomProgram":
        min_sum = sum(r.min_area_pct for r in self.rooms)
        if min_sum > 95.0 + 1e-4:
            raise ValueError(f"sum(min_area_pct) must be <= 95 (got {min_sum:.1f})")

        max_sum = sum(r.max_area_pct for r in self.rooms)
        if max_sum < 100.0 - 1e-4:
            raise ValueError(f"sum(max_area_pct) must be >= 100 (got {max_sum:.1f})")

        # Unique names (case-insensitive check)
        seen_keys: Set[str] = set()
        for r in self.rooms:
            norm = r.name.strip().lower()
            if not norm:
                raise ValueError("Room name cannot be empty")
            if norm in seen_keys:
                raise ValueError(f"Duplicate room name in program: '{r.name}'")
            seen_keys.add(norm)

        # Adjacency references must exist in the list of rooms
        for r in self.rooms:
            for adj in r.adjacency:
                adj_norm = adj.strip().lower()
                # Accept exact match, or slug-normalized match
                match_found = False
                for sk in seen_keys:
                    if adj_norm == sk or adj_norm.replace("_", " ") == sk.replace("_", " "):
                        match_found = True
                        break
                if not match_found:
                    raise ValueError(
                        f"Adjacency reference '{adj}' in room '{r.name}' does not match any room in program"
                    )

        return self
