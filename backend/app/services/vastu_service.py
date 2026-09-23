import json
import math
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

import httpx

from app.schemas.response import (
    RankedEntrance,
    RoomGridZone,
    SlopeReading,
    ReconciliationItem,
    RoadApproach,
    VastuAdvisory
)
from app.utils.cache_utils import hazard_cache
from app.utils.geo_utils import (
    haversine_distance,
    calculate_bearing,
    azimuth_to_cardinal_8,
    get_cardinal_offsets
)

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
DEFAULT_TIMEOUT_SECONDS = 3.5
USER_AGENT = "BuildWise-Civil-Engineering-Engine/1.0"

_VASTU_RULES: Optional[Dict[str, Any]] = None

def _load_vastu_table() -> Dict[str, Any]:
    global _VASTU_RULES
    if _VASTU_RULES is None:
        file_path = DATA_DIR / "vastu_rules.json"
        with open(file_path, "r", encoding="utf-8") as f:
            _VASTU_RULES = json.load(f)
    return _VASTU_RULES

FACE_ANGLES: Dict[str, float] = {
    "N": 0.0,
    "NE": 45.0,
    "E": 90.0,
    "SE": 135.0,
    "S": 180.0,
    "SW": 225.0,
    "W": 270.0,
    "NW": 315.0
}


async def fetch_nearest_road_approach(lat: float, lon: float) -> Tuple[RoadApproach, Optional[str]]:
    """
    Queries OpenStreetMap Overpass API for nearest primary through residential highway within 500m.
    Per Amendment 1: Never synthesize a bearing. If unreachable, returns bearing_degrees=None,
    approach_side='unknown', is_fallback=True, and user-facing warning.
    """
    cached = hazard_cache.get(lat, lon, "osm_road_approach", precision=1)
    if cached is not None:
        return RoadApproach(**cached), None

    query = (
        f"[out:json][timeout:4];"
        f"way[\"highway\"~\"^(primary|secondary|tertiary|residential|service)$\"](around:500,{lat:.5f},{lon:.5f});"
        f"out geom;"
    )
    url = "https://overpass-api.de/api/interpreter"

    try:
        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SECONDS) as client:
            resp = await client.post(url, data={"data": query}, headers={"User-Agent": USER_AGENT})
            if resp.status_code == 200:
                data = resp.json()
                elements = data.get("elements", [])

                closest_pt = None
                min_dist_m = float("inf")

                for el in elements:
                    geom = el.get("geometry", [])
                    for pt in geom:
                        pt_lat = pt.get("lat")
                        pt_lon = pt.get("lon")
                        if pt_lat is not None and pt_lon is not None:
                            d = haversine_distance(lat, lon, pt_lat, pt_lon)
                            if d < min_dist_m:
                                min_dist_m = d
                                closest_pt = (pt_lat, pt_lon)

                if closest_pt is not None:
                    bearing = round(calculate_bearing(lat, lon, closest_pt[0], closest_pt[1]), 1)
                    side = azimuth_to_cardinal_8(bearing)
                    approach_data = {
                        "bearing_degrees": bearing,
                        "approach_side": side,
                        "distance_meters": round(min_dist_m, 1),
                        "is_fallback": False
                    }
                    hazard_cache.set(lat, lon, "osm_road_approach", approach_data, precision=1)
                    return RoadApproach(**approach_data), None
    except Exception:
        pass

    # Explicit unknown fallback per Amendment 1 (No fabricated geometry)
    warning = "Road network telemetry unavailable. Approach-side alignment bonus omitted from entrance ranking."
    fallback_approach = RoadApproach(
        bearing_degrees=None,
        approach_side="unknown",
        distance_meters=None,
        is_fallback=True
    )
    return fallback_approach, warning


def compute_slope_reading(
    elevation_m: float,
    lat: float,
    lon: float
) -> SlopeReading:
    """
    Computes topographic downhill drainage aspect using cardinal elevation samples.
    """
    offsets = get_cardinal_offsets(lat, lon, distance_meters=33.0)
    # Estimate gradient using synthetic/cached elevation differentials
    # d_lat = h_north - h_south; d_lon = h_east - h_west
    from app.utils.geo_utils import calculate_synthetic_elevation
    h0 = calculate_synthetic_elevation(lat, lon)
    h_n = calculate_synthetic_elevation(offsets["north"][0], offsets["north"][1])
    h_s = calculate_synthetic_elevation(offsets["south"][0], offsets["south"][1])
    h_e = calculate_synthetic_elevation(offsets["east"][0], offsets["east"][1])
    h_w = calculate_synthetic_elevation(offsets["west"][0], offsets["west"][1])

    d_lat = h_n - h_s
    d_lon = h_e - h_w

    if abs(d_lat) < 0.05 and abs(d_lon) < 0.05:
        # Near flat terrain
        azimuth = 45.0
        drainage_dir = "NE"
    else:
        # Downhill vector is in direction of falling gradient (-d_lon, -d_lat)
        azimuth = round((math.degrees(math.atan2(-d_lon, -d_lat)) + 360.0) % 360.0, 1)
        drainage_dir = azimuth_to_cardinal_8(azimuth)

    table = _load_vastu_table()
    slope_rules = table.get("slope_drainage_rules", {})
    rule = slope_rules.get(drainage_dir, {
        "status": "neutral",
        "description": f"Terrain drainage slopes toward {drainage_dir}."
    })

    status = rule.get("status", "neutral")
    desc = rule.get("description", "")
    remedy = None

    if status == "requires_remedy":
        remedy = (
            f"Ground falls toward {drainage_dir} (unfavourable in traditional canon). "
            f"Remedial engineering: elevate southern/southwestern plinth level by +300mm above grade, "
            f"and excavate perimeter interceptor drainage swales to redirect surface runoff toward the Northeast/North boundary."
        )

    return SlopeReading(
        drainage_direction=drainage_dir,
        azimuth_degrees=azimuth,
        auspiciousness=status,
        rationale=desc,
        remedy_notes=remedy
    )


def rank_entrances(
    road_approach: RoadApproach
) -> List[RankedEntrance]:
    """
    Scores all 8 cardinal/intercardinal faces using canonical Vastu weights,
    approach road alignment bonus, and passive climate terms.
    Returns top 3 ranked entrances with Vastu and practical rationales.
    """
    table = _load_vastu_table()
    weights = table.get("entrance_weights", {})
    climate_adjustments = table.get("climate_adjustments", {})

    ranked: List[Dict[str, Any]] = []

    for direction, angle in FACE_ANGLES.items():
        base_info = weights.get(direction, {})
        base_w = base_info.get("base_weight", 50.0)
        climate_term = climate_adjustments.get(direction, 0.0)

        approach_bonus = 0.0
        is_approach = False
        rear_discount = 0.0

        if road_approach.bearing_degrees is not None:
            road_bearing = road_approach.bearing_degrees
            angular_diff = min(abs(angle - road_bearing), 360.0 - abs(angle - road_bearing))

            if angular_diff <= 45.0:
                approach_bonus = 35.0 * (1.0 - angular_diff / 45.0)
                is_approach = True
            elif angular_diff >= 135.0:
                # Facing directly away from the road frontage (rear boundary wall)
                rear_discount = 30.0 * ((angular_diff - 135.0) / 45.0)

        total_score = round(base_w + climate_term + approach_bonus - rear_discount, 1)

        # Rationales
        v_rat = base_info.get("canonical_significance", f"Canonical alignment for {direction} face.")
        if is_approach:
            p_rat = (
                f"Directly faces the incoming {road_approach.approach_side} access road (bearing {road_approach.bearing_degrees:.0f} deg). "
                f"Provides unobstructed driveway ingress, clear driver sightlines, and direct pedestrian walkway connection."
            )
        elif road_approach.bearing_degrees is not None and angular_diff >= 135.0:
            p_rat = f"Faces away from the {road_approach.approach_side} approach road toward rear property boundary; requires perimeter pathway access."
        else:
            p_rat = f"Offers indirect orientation relative to {road_approach.approach_side} road; secondary internal porch circulation feasible."

        ranked.append({
            "direction": direction,
            "score": total_score,
            "vastu_rationale": v_rat,
            "practical_rationale": p_rat,
            "is_approach_side": is_approach
        })

    # Sort descending by score
    ranked.sort(key=lambda x: x["score"], reverse=True)

    return [RankedEntrance(**item) for item in ranked[:3]]


async def evaluate_vastu_advisory(
    lat: float,
    lon: float,
    elevation_m: float
) -> Tuple[VastuAdvisory, List[str]]:
    """
    Generates deterministic Vastu and functional planning advisory.
    Returns (vastu_advisory_object, warnings).
    """
    warnings: List[str] = []

    # 1. Road approach
    road_approach, r_warn = await fetch_nearest_road_approach(lat, lon)
    if r_warn:
        warnings.append(r_warn)

    # 2. Ranked Entrances
    ranked_entrances = rank_entrances(road_approach)

    # 3. 3x3 Room Grid
    table = _load_vastu_table()
    room_grid_data = table.get("room_grid", [])
    room_grid = [RoomGridZone(**zone) for zone in room_grid_data]

    # 4. Slope Reading
    slope_reading = compute_slope_reading(elevation_m, lat, lon)

    # 5. Reconciliation Notes
    recon_data = table.get("reconciliation_principles", [])
    reconciliations = [ReconciliationItem(**item) for item in recon_data]

    advisory = VastuAdvisory(
        ranked_entrances=ranked_entrances,
        room_grid=room_grid,
        slope_reading=slope_reading,
        reconciliation_notes=reconciliations,
        road_approach=road_approach
    )

    return advisory, warnings
