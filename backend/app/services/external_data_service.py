import httpx
from typing import Dict, Any, Tuple, List, Optional
from app.utils.geo_utils import get_cardinal_offsets, calculate_synthetic_elevation
from app.utils.cache_utils import cache

USER_AGENT = "BuildWiseAI/1.0 (CivilEngineeringPlanningSystem; Contact: buildwise@example.org)"
DEFAULT_TIMEOUT_SECONDS = 3.5

async def fetch_reverse_geocode(lat: float, lon: float) -> Tuple[str, bool]:
    """
    Retrieves human-readable address from OpenStreetMap Nominatim.
    Returns (address_string, is_fallback).
    """
    cached = cache.get(lat, lon, "geocode")
    if cached:
        return cached, False

    url = f"https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lon}&format=json&zoom=14&addressdetails=1"
    headers = {"User-Agent": USER_AGENT}

    try:
        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SECONDS) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                display_name = data.get("display_name")
                if display_name:
                    # Clean up and shorten address
                    parts = [p.strip() for p in display_name.split(",")]
                    shortened = ", ".join(parts[:4]) if len(parts) > 4 else display_name
                    cache.set(lat, lon, "geocode", shortened)
                    return shortened, False
    except Exception:
        pass

    fallback_name = f"Site Location ({abs(lat):.4f}{'N' if lat>=0 else 'S'}, {abs(lon):.4f}{'E' if lon>=0 else 'W'})"
    return fallback_name, True

async def fetch_elevation_and_slope(lat: float, lon: float) -> Tuple[float, float, bool]:
    """
    Fetches elevation for center and 4 cardinal offset points (30m distance)
    to calculate true topographic slope.
    Returns (center_elevation_m, slope_percentage, is_fallback).
    """
    cached = cache.get(lat, lon, "elevation_slope")
    if cached:
        return cached[0], cached[1], False

    offsets = get_cardinal_offsets(lat, lon, distance_meters=33.0)
    lats = [offsets["center"][0], offsets["north"][0], offsets["south"][0], offsets["east"][0], offsets["west"][0]]
    lons = [offsets["center"][1], offsets["north"][1], offsets["south"][1], offsets["east"][1], offsets["west"][1]]

    lat_str = ",".join(f"{coord:.5f}" for coord in lats)
    lon_str = ",".join(f"{coord:.5f}" for coord in lons)
    url = f"https://api.open-meteo.com/v1/elevation?latitude={lat_str}&longitude={lon_str}"

    try:
        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SECONDS) as client:
            resp = await client.get(url, headers={"User-Agent": USER_AGENT})
            if resp.status_code == 200:
                elevations = resp.json().get("elevation", [])
                if len(elevations) == 5:
                    h0 = float(elevations[0])
                    h_n = float(elevations[1])
                    h_s = float(elevations[2])
                    h_e = float(elevations[3])
                    h_w = float(elevations[4])

                    max_dh = max(abs(h_n - h0), abs(h_s - h0), abs(h_e - h0), abs(h_w - h0))
                    # Slope percentage = (rise / run) * 100
                    slope_pct = round((max_dh / 33.0) * 100.0, 2)
                    cache.set(lat, lon, "elevation_slope", (h0, slope_pct))
                    return h0, slope_pct, False
    except Exception:
        pass

    # Mathematical synthetic fallback
    h0 = calculate_synthetic_elevation(lat, lon)
    h_n = calculate_synthetic_elevation(offsets["north"][0], offsets["north"][1])
    h_s = calculate_synthetic_elevation(offsets["south"][0], offsets["south"][1])
    h_e = calculate_synthetic_elevation(offsets["east"][0], offsets["east"][1])
    h_w = calculate_synthetic_elevation(offsets["west"][0], offsets["west"][1])

    max_dh = max(abs(h_n - h0), abs(h_s - h0), abs(h_e - h0), abs(h_w - h0))
    slope_pct = round((max_dh / 33.0) * 100.0, 2)
    return h0, slope_pct, True

async def fetch_climate_data(lat: float, lon: float) -> Tuple[Dict[str, float], bool]:
    """
    Fetches microclimate metrics: temperature, prevailing wind direction, wind speed, precipitation.
    Returns (climate_dict, is_fallback).
    """
    cached = cache.get(lat, lon, "climate")
    if cached:
        return cached, False

    url = (
        f"https://api.open-meteo.com/v1/forecast?latitude={lat:.4f}&longitude={lon:.4f}"
        "&current=temperature_2m,wind_speed_10m,wind_direction_10m"
        "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum"
        "&timezone=auto"
    )

    try:
        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SECONDS) as client:
            resp = await client.get(url, headers={"User-Agent": USER_AGENT})
            if resp.status_code == 200:
                data = resp.json()
                current = data.get("current", {})
                daily = data.get("daily", {})

                wind_dir = float(current.get("wind_direction_10m", 240.0))
                wind_speed = float(current.get("wind_speed_10m", 12.0))
                temp_now = float(current.get("temperature_2m", 28.0))

                max_temps = daily.get("temperature_2m_max", [32.0])
                min_temps = daily.get("temperature_2m_min", [20.0])
                precips = daily.get("precipitation_sum", [5.0])

                avg_max = sum(max_temps) / max(len(max_temps), 1)
                avg_min = sum(min_temps) / max(len(min_temps), 1)
                est_annual_precip = sum(precips) * 52.0  # approximate annual mm

                climate = {
                    "temperature_current_c": round(temp_now, 1),
                    "temperature_max_c": round(avg_max, 1),
                    "temperature_min_c": round(avg_min, 1),
                    "wind_direction_deg": round(wind_dir, 1),
                    "wind_speed_kmh": round(wind_speed, 1),
                    "annual_precipitation_mm": round(est_annual_precip, 1)
                }
                cache.set(lat, lon, "climate", climate)
                return climate, False
    except Exception:
        pass

    # Latitudinal synthetic fallback
    # Approximate tropical/subtropical Indian climate base
    lat_factor = abs(lat) / 90.0
    fallback_climate = {
        "temperature_current_c": round(32.0 - lat_factor * 20.0, 1),
        "temperature_max_c": round(36.0 - lat_factor * 18.0, 1),
        "temperature_min_c": round(22.0 - lat_factor * 22.0, 1),
        "wind_direction_deg": 240.0,  # Southwest monsoon baseline for India
        "wind_speed_kmh": 14.5,
        "annual_precipitation_mm": 950.0
    }
    return fallback_climate, True
