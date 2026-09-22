import time
from typing import Any, Dict, Optional, Tuple

class SimpleTtlCache:
    """
    In-memory thread-safe TTL cache for spatial coordinate responses.
    Keys are coordinate hashes rounded to 3 decimal places (~110m).
    """
    def __init__(self, ttl_seconds: int = 3600, max_entries: int = 500):
        self.ttl_seconds = ttl_seconds
        self.max_entries = max_entries
        self._store: Dict[str, Tuple[float, Any]] = {}

    def _get_key(self, lat: float, lon: float, category: str) -> str:
        rounded_lat = round(lat, 3)
        rounded_lon = round(lon, 3)
        return f"{category}:{rounded_lat}:{rounded_lon}"

    def get(self, lat: float, lon: float, category: str) -> Optional[Any]:
        key = self._get_key(lat, lon, category)
        if key in self._store:
            timestamp, data = self._store[key]
            if time.time() - timestamp < self.ttl_seconds:
                return data
            else:
                del self._store[key]
        return None

    def set(self, lat: float, lon: float, category: str, value: Any) -> None:
        if len(self._store) >= self.max_entries:
            # Purge oldest 20%
            keys_to_remove = sorted(self._store.keys(), key=lambda k: self._store[k][0])[:self.max_entries // 5]
            for k in keys_to_remove:
                self._store.pop(k, None)

        key = self._get_key(lat, lon, category)
        self._store[key] = (time.time(), value)

    def clear(self) -> None:
        self._store.clear()

cache = SimpleTtlCache()
