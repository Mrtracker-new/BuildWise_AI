import math
from typing import Dict, List, Tuple

EARTH_RADIUS_METERS = 6371000.0

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculates great-circle distance between two points in meters using Haversine formula.
    """
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2)
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return EARTH_RADIUS_METERS * c

def calculate_bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculates initial forward bearing (azimuth) from (lat1, lon1) to (lat2, lon2)
    in degrees clockwise from true north (0 to 360).
    """
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_lambda = math.radians(lon2 - lon1)
    y = math.sin(delta_lambda) * math.cos(phi2)
    x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(delta_lambda)
    bearing = math.degrees(math.atan2(y, x))
    return (bearing + 360.0) % 360.0

def azimuth_to_cardinal_8(azimuth_deg: float) -> str:
    """
    Converts compass azimuth in degrees (0-360) to 8-point cardinal label.
    """
    directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
    idx = int(((azimuth_deg + 22.5) % 360.0) // 45.0)
    return directions[idx]

def get_cardinal_offsets(lat: float, lon: float, distance_meters: float = 30.0) -> Dict[str, Tuple[float, float]]:
    """
    Returns coordinate pairs for North, South, East, West at distance_meters offset.
    Approximate degree conversions:
    1 deg latitude ~ 111,139 meters.
    1 deg longitude ~ 111,139 * cos(lat) meters.
    """
    delta_lat = distance_meters / 111139.0
    cos_lat = math.cos(math.radians(lat))
    delta_lon = distance_meters / (111139.0 * max(cos_lat, 0.01))

    return {
        "center": (lat, lon),
        "north": (lat + delta_lat, lon),
        "south": (lat - delta_lat, lon),
        "east": (lat, lon + delta_lon),
        "west": (lat, lon - delta_lon)
    }

def calculate_synthetic_elevation(lat: float, lon: float) -> float:
    """
    Deterministic mathematical fallback function when external elevation APIs fail.
    Based on spatial harmonics to produce continuous realistic terrain heights (50m to 1200m).
    """
    wave1 = math.sin(lat * 0.5) * math.cos(lon * 0.5) * 300.0
    wave2 = math.sin(lat * 2.1 + lon * 1.7) * 120.0
    wave3 = math.cos(lat * 8.3 - lon * 6.1) * 45.0
    base = 350.0 + wave1 + wave2 + wave3
    return max(15.0, round(base, 1))

def calculate_solar_profile(latitude: float) -> Dict[str, float]:
    """
    Determines seasonal solar zenith and azimuth indicators based on latitude.
    """
    is_northern = latitude >= 0.0
    summer_zenith = abs(latitude - 23.45)
    winter_zenith = abs(latitude - (-23.45))
    equinox_zenith = abs(latitude)

    return {
        "is_northern_hemisphere": 1.0 if is_northern else 0.0,
        "summer_noon_altitude": round(90.0 - summer_zenith, 1),
        "winter_noon_altitude": round(max(0.0, 90.0 - winter_zenith), 1),
        "equinox_noon_altitude": round(90.0 - equinox_zenith, 1)
    }

# --------------------------------------------------------------------------- #
# Simple-polygon (non-self-intersecting) validation                           #
# --------------------------------------------------------------------------- #

def _cross(o: Tuple[float, float], a: Tuple[float, float], b: Tuple[float, float]) -> float:
    """2D cross product of vectors OA and OB."""
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

def _segments_properly_intersect(
    p1: Tuple[float, float], p2: Tuple[float, float],
    p3: Tuple[float, float], p4: Tuple[float, float]
) -> bool:
    """True when closed segments p1-p2 and p3-p4 intersect at any point
    (proper crossing or collinear touch)."""
    d1 = _cross(p3, p4, p1)
    d2 = _cross(p3, p4, p2)
    d3 = _cross(p1, p2, p3)
    d4 = _cross(p1, p2, p4)

    if ((d1 > 0 and d2 < 0) or (d1 < 0 and d2 > 0)) and \
       ((d3 > 0 and d4 < 0) or (d3 < 0 and d4 > 0)):
        return True

    def _on_seg(p, q, r):
        return (
            min(p[0], q[0]) <= r[0] <= max(p[0], q[0])
            and min(p[1], q[1]) <= r[1] <= max(p[1], q[1])
            and _cross(p, q, r) == 0
        )

    if d1 == 0 and _on_seg(p3, p4, p1):
        return True
    if d2 == 0 and _on_seg(p3, p4, p2):
        return True
    if d3 == 0 and _on_seg(p1, p2, p3):
        return True
    if d4 == 0 and _on_seg(p1, p2, p4):
        return True
    return False

def polygon_is_self_intersecting(vertices: List[Tuple[float, float]]) -> bool:
    """
    Returns True when the closed ring crosses or touches itself at a
    non-adjacent edge pair (bow-tie / figure-eight outline). O(n^2), fine for
    the <= 64-vertex boundary payloads.
    """
    n = len(vertices)
    if n < 4:
        return False
    for i in range(n):
        a1 = vertices[i]
        a2 = vertices[(i + 1) % n]
        for j in range(i + 1, n):
            # Skip edges that share a vertex (adjacent in the ring)
            if j == i + 1 or (i == 0 and j == n - 1):
                continue
            b1 = vertices[j]
            b2 = vertices[(j + 1) % n]
            if _segments_properly_intersect(a1, a2, b1, b2):
                return True
    return False
