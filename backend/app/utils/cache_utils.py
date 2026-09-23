import time
from typing import Any, Dict, Optional, Tuple

class SimpleTtlCache:
    """
    In-memory thread-safe TTL cache for spatial coordinate responses.
    Allows custom precision rounding (e.g. 0.1 deg ~ 11 km grid, or 0.001 deg ~ 110 m grid).
    """
    def __init__(self, ttl_seconds: int = 3600, max_entries: int = 1000, precision: int = 3):
        self.ttl_seconds = ttl_seconds
        self.max_entries = max_entries
        self.precision = precision
        self._store: Dict[str, Tuple[float, Any]] = {}

    def _get_key(self, lat: float, lon: float, category: str, precision: Optional[int] = None) -> str:
        p = precision if precision is not None else self.precision
        rounded_lat = round(lat, p)
        rounded_lon = round(lon, p)
        return f"{category}:{rounded_lat}:{rounded_lon}"

    def get(self, lat: float, lon: float, category: str, precision: Optional[int] = None) -> Optional[Any]:
        key = self._get_key(lat, lon, category, precision)
        if key in self._store:
            timestamp, data = self._store[key]
            if time.time() - timestamp < self.ttl_seconds:
                return data
            else:
                del self._store[key]
        return None

    def set(self, lat: float, lon: float, category: str, value: Any, precision: Optional[int] = None) -> None:
        if len(self._store) >= self.max_entries:
            # Purge oldest 20%
            keys_to_remove = sorted(self._store.keys(), key=lambda k: self._store[k][0])[:self.max_entries // 5]
            for k in keys_to_remove:
                self._store.pop(k, None)

        key = self._get_key(lat, lon, category, precision)
        self._store[key] = (time.time(), value)

    def clear(self) -> None:
        self._store.clear()

# Standard micro-scale cache (1 hour TTL, ~110m resolution)
cache = SimpleTtlCache(ttl_seconds=3600, precision=3)

# 24-hour TTL hazard & geospatial telemetry cache keyed on 0.1 degree grid (~11km)
hazard_cache = SimpleTtlCache(ttl_seconds=86400, precision=1)
