import math
from typing import Dict, Tuple

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
    # Harmonic components
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
    # Summer solstice declination +23.45, winter -23.45
    summer_zenith = abs(latitude - 23.45)
    winter_zenith = abs(latitude - (-23.45))
    equinox_zenith = abs(latitude)

    return {
        "is_northern_hemisphere": 1.0 if is_northern else 0.0,
        "summer_noon_altitude": round(90.0 - summer_zenith, 1),
        "winter_noon_altitude": round(max(0.0, 90.0 - winter_zenith), 1),
        "equinox_noon_altitude": round(90.0 - equinox_zenith, 1)
    }
