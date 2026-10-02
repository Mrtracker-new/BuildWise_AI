"""
Road service — shared Overpass nearest-road capability.
================================================================
Extracted from vastu_service (defect D3): the Overpass query, cache,
rate-limit, and honest offline fallback now live in ONE place so both the
vastu advisory and the public /api/nearest-road proxy consume the same
implementation.

Policy compliance (mirrors geocode_service):
- Overpass API: server-side <=1 req/s throttle, identifying User-Agent, 3.5s
  timeout. Ref: https://operations.osmfoundation.org/policies/overpass/ (be
  nice: cache aggressively; this service answers from cache when possible).
- Results cached in the 24h hazard cache keyed on a rounded coordinate grid
  (category/precision chosen by the caller).
- AMENDMENT 1 (no fabricated geometry): when Overpass is unreachable or
  returns nothing usable, the fallback NEVER synthesizes a bearing. It
  returns is_fallback=True, bearing_degrees=None, approach_side='unknown'
  and provenance annotation 'ASSUMED' with a user-facing warning.
- Attribution: OpenStreetMap contributors (ODbL), via Overpass API.
"""

import asyncio
import time
import logging
from typing import Any, Dict, Optional, Tuple

import httpx

from app.utils.cache_utils import hazard_cache
from app.utils.geo_utils import (
    haversine_distance,
    calculate_bearing,
    azimuth_to_cardinal_8,
)

logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------- #
#  Constants                                                                   #
# --------------------------------------------------------------------------- #

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
_OVERPASS_UA = "BuildWise-Civil-Engineering-Engine/1.2"
_TIMEOUT_SECONDS = 3.5
_RATE_INTERVAL = 1.0     # minimum seconds between Overpass calls (<=1 req/s)
_QUERY_RADIUS_M = 500
_HIGHWAY_PATTERN = "^(primary|secondary|tertiary|residential|service)$"

# Cache categories:
# - vastu path preserves its historical 0.1-deg (~11 km) grid behaviour;
# - the /api/nearest-road proxy uses a 1e-4 deg (~11 m) grid so neighbouring
#   pins get honest per-location answers instead of an 11 km-shared guess.
VASTU_CACHE_CATEGORY = "osm_road_approach"
VASTU_CACHE_PRECISION = 1
PROXY_CACHE_CATEGORY = "nearest_road"
PROXY_CACHE_PRECISION = 4


# --------------------------------------------------------------------------- #
#  Overpass throttle: asyncio lock + timestamp (1 req/s)                      #
# --------------------------------------------------------------------------- #

_overpass_lock = asyncio.Lock()
_overpass_last_call: float = 0.0


async def _overpass_throttle() -> None:
    """Ensures at most 1 Overpass call per second (shared across the app)."""
    global _overpass_last_call
    async with _overpass_lock:
        now = time.monotonic()
        wait = _RATE_INTERVAL - (now - _overpass_last_call)
        if wait > 0:
            await asyncio.sleep(wait)
        _overpass_last_call = time.monotonic()


# --------------------------------------------------------------------------- #
#  Core query                                                                  #
# --------------------------------------------------------------------------- #

def _build_query(lat: float, lon: float) -> str:
    return (
        f"[out:json][timeout:4];"
        f"way[\"highway\"~\"{_HIGHWAY_PATTERN}\"](around:{_QUERY_RADIUS_M},{lat:.5f},{lon:.5f});"
        f"out geom;"
    )


def _fallback_result(warning: str) -> Dict[str, Any]:
    """AMENDMENT 1: explicit unknown fallback - never a synthesized bearing."""
    return {
        "bearing_degrees": None,
        "approach_side": "unknown",
        "distance_meters": None,
        "nearest_point": None,
        "highway_class": None,
        "road_name": None,
        "is_fallback": True,
        "source": "assumed_fallback",
        "annotation": "ASSUMED",
        "warning": warning,
    }


def _parse_overpass_elements(data: Dict[str, Any], lat: float, lon: float) -> Optional[Dict[str, Any]]:
    """Finds the closest highway geometry vertex; None when nothing usable."""
    closest_pt = None
    min_dist_m = float("inf")
    closest_tags: Dict[str, Any] = {}

    for el in data.get("elements", []):
        tags = el.get("tags", {}) or {}
        for pt in el.get("geometry", []) or []:
            pt_lat = pt.get("lat")
            pt_lon = pt.get("lon")
            if pt_lat is None or pt_lon is None:
                continue
            d = haversine_distance(lat, lon, pt_lat, pt_lon)
            if d < min_dist_m:
                min_dist_m = d
                closest_pt = (pt_lat, pt_lon)
                closest_tags = tags

    if closest_pt is None:
        return None

    bearing = round(calculate_bearing(lat, lon, closest_pt[0], closest_pt[1]), 1)
    return {
        "bearing_degrees": bearing,
        "approach_side": azimuth_to_cardinal_8(bearing),
        "distance_meters": round(min_dist_m, 1),
        "nearest_point": {"lat": round(closest_pt[0], 6), "lon": round(closest_pt[1], 6)},
        "highway_class": closest_tags.get("highway"),
        "road_name": closest_tags.get("name"),
        "is_fallback": False,
        "source": "osm_overpass",
        "annotation": "VERIFIED",
        "warning": None,
    }


async def fetch_nearest_road(
    lat: float,
    lon: float,
    *,
    cache_category: str = PROXY_CACHE_CATEGORY,
    cache_precision: int = PROXY_CACHE_PRECISION,
) -> Tuple[Dict[str, Any], bool, Optional[str]]:
    """
    Nearest OSM road within the query radius, honouring cache + rate policy.

    Returns (result, cache_hit, warning) where *result* is a plain dict with
    keys: bearing_degrees, approach_side, distance_meters, nearest_point,
    highway_class, road_name, is_fallback, source, annotation, warning.
    Never raises; unreachable upstream degrades to the ASSUMED fallback.
    """
    cached = hazard_cache.get(lat, lon, cache_category, precision=cache_precision)
    if cached is not None:
        return dict(cached), True, None

    query = _build_query(lat, lon)
    try:
        await _overpass_throttle()
        async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
            resp = await client.post(
                OVERPASS_URL,
                data={"data": query},
                headers={"User-Agent": _OVERPASS_UA},
            )
            if resp.status_code == 200:
                parsed = _parse_overpass_elements(resp.json(), lat, lon)
                if parsed is not None:
                    hazard_cache.set(lat, lon, cache_category, parsed, precision=cache_precision)
                    return parsed, False, None
                # Reachable but no highway in radius: honest empty answer.
                warning = (
                    f"No mapped road within {_QUERY_RADIUS_M} m in OpenStreetMap. "
                    "Confirm the frontage edge manually."
                )
                fallback = _fallback_result(warning)
                hazard_cache.set(lat, lon, cache_category, fallback, precision=cache_precision)
                return fallback, False, warning
    except Exception as exc:  # noqa: BLE001 - degrade, never raise
        logger.warning("Overpass nearest-road query failed: %s", exc)

    warning = (
        "Road network telemetry unavailable. Confirm the frontage edge manually - "
        "no bearing has been assumed."
    )
    return _fallback_result(warning), False, warning
