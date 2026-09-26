"""
Geocode (forward search) service for BuildWise.

Policy compliance:
- Nominatim: 1 req/s server-side throttle, identifying User-Agent, 3s timeout
  Ref: https://operations.osmfoundation.org/policies/nominatim/
- Photon: no explicit rate limit published; used only as fallback
  Ref: https://photon.komoot.io (Komoot, free)
- Both services are free; no API key required.
- Results cached server-side in an LRU TTL cache (max 512 entries, 24 h TTL)
  to minimise upstream calls and respect provider policies.
"""

import asyncio
import time
import logging
from collections import OrderedDict
from typing import Any, Dict, List, Optional, Tuple

import httpx

logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------- #
#  Constants                                                                   #
# --------------------------------------------------------------------------- #

_NOMINATIM_UA = "BuildWise-Civil-Engineering-Engine/1.1 (github.com/buildwise)"
_PHOTON_UA = "BuildWise-Civil-Engineering-Engine/1.1"
_TIMEOUT = 3.0          # seconds per upstream request
_RATE_INTERVAL = 1.0    # minimum seconds between Nominatim calls (policy: 1 req/s)
_MAX_RESULTS = 5


# --------------------------------------------------------------------------- #
#  Simple thread-safe LRU + TTL cache (no external dep)                       #
# --------------------------------------------------------------------------- #

class _LruTtlCache:
    """
    Bounded LRU cache with per-entry TTL.
    Thread-safety note: asyncio single-thread — no locking needed for coroutines.
    """

    def __init__(self, maxsize: int = 512, ttl: int = 86_400):
        self._maxsize = maxsize
        self._ttl = ttl
        self._store: OrderedDict[str, Tuple[float, Any]] = OrderedDict()

    def get(self, key: str) -> Optional[Any]:
        if key not in self._store:
            return None
        ts, value = self._store[key]
        if time.monotonic() - ts > self._ttl:
            del self._store[key]
            return None
        # Move to end (most-recently-used)
        self._store.move_to_end(key)
        return value

    def set(self, key: str, value: Any) -> None:
        if key in self._store:
            self._store.move_to_end(key)
        self._store[key] = (time.monotonic(), value)
        if len(self._store) > self._maxsize:
            self._store.popitem(last=False)   # evict LRU


_cache = _LruTtlCache(maxsize=512, ttl=86_400)


# --------------------------------------------------------------------------- #
#  Nominatim throttle: asyncio lock + timestamp                               #
# --------------------------------------------------------------------------- #

_nominatim_lock = asyncio.Lock()
_nominatim_last_call: float = 0.0


async def _nominatim_throttle() -> None:
    """Ensures at most 1 Nominatim call per second (policy requirement)."""
    global _nominatim_last_call
    async with _nominatim_lock:
        now = time.monotonic()
        wait = _RATE_INTERVAL - (now - _nominatim_last_call)
        if wait > 0:
            await asyncio.sleep(wait)
        _nominatim_last_call = time.monotonic()


# --------------------------------------------------------------------------- #
#  Result type                                                                 #
# --------------------------------------------------------------------------- #

class GeocodeResult:
    __slots__ = ("display_name", "lat", "lon", "source")

    def __init__(self, display_name: str, lat: float, lon: float, source: str):
        self.display_name = display_name
        self.lat = lat
        self.lon = lon
        self.source = source

    def to_dict(self) -> Dict[str, Any]:
        return {
            "display_name": self.display_name,
            "lat": self.lat,
            "lon": self.lon,
            "source": self.source,
        }


# --------------------------------------------------------------------------- #
#  Provider: Nominatim                                                         #
# --------------------------------------------------------------------------- #

async def _search_nominatim(query: str) -> List[GeocodeResult]:
    await _nominatim_throttle()
    params = {
        "format": "jsonv2",
        "limit": str(_MAX_RESULTS),
        "q": query,
        "addressdetails": "0",
    }
    headers = {"User-Agent": _NOMINATIM_UA}

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(
            "https://nominatim.openstreetmap.org/search",
            params=params,
            headers=headers,
        )
        resp.raise_for_status()
        items = resp.json()

    if not isinstance(items, list):
        return []

    results = []
    for item in items[:_MAX_RESULTS]:
        try:
            results.append(GeocodeResult(
                display_name=item.get("display_name", ""),
                lat=float(item["lat"]),
                lon=float(item["lon"]),
                source="nominatim",
            ))
        except (KeyError, ValueError, TypeError):
            continue
    return results


# --------------------------------------------------------------------------- #
#  Provider: Photon (fallback)                                                 #
# --------------------------------------------------------------------------- #

async def _search_photon(query: str) -> List[GeocodeResult]:
    params = {
        "q": query,
        "limit": str(_MAX_RESULTS),
        "lang": "en",
    }
    headers = {"User-Agent": _PHOTON_UA}

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(
            "https://photon.komoot.io/api/",
            params=params,
            headers=headers,
        )
        resp.raise_for_status()
        data = resp.json()

    if not isinstance(data, dict):
        return []

    results = []
    for feature in data.get("features", [])[:_MAX_RESULTS]:
        try:
            props = feature.get("properties", {})
            coords = feature["geometry"]["coordinates"]  # [lon, lat]
            name_parts = [
                p for p in [
                    props.get("name"),
                    props.get("city") or props.get("county"),
                    props.get("state"),
                    props.get("country"),
                ]
                if p
            ]
            display = ", ".join(name_parts) if name_parts else props.get("label", "")
            results.append(GeocodeResult(
                display_name=display,
                lat=float(coords[1]),
                lon=float(coords[0]),
                source="photon",
            ))
        except (KeyError, IndexError, ValueError, TypeError):
            continue
    return results


# --------------------------------------------------------------------------- #
#  Public entry point                                                          #
# --------------------------------------------------------------------------- #

async def geocode_search(query: str) -> Dict[str, Any]:
    """
    Forward-geocode *query* and return up to 5 suggestions.

    Response schema:
        {
          "results": [
            { "display_name": str, "lat": float, "lon": float, "source": str }
          ],
          "provider": "nominatim" | "photon",
          "cached": bool,
          "error": str | null
        }

    Never raises; always returns a structured dict.
    """
    q_key = query.strip().lower()
    if not q_key:
        return {
            "results": [],
            "provider": "none",
            "cached": True,
            "error": None,
        }

    cached = _cache.get(q_key)
    if cached is not None:
        return {**cached, "cached": True}

    # 1. Try Nominatim
    try:
        results = await _search_nominatim(query)
        if results:
            payload = {
                "results": [r.to_dict() for r in results],
                "provider": "nominatim",
                "cached": False,
                "error": None,
            }
            _cache.set(q_key, {**payload, "cached": False})
            return payload
    except Exception as exc:
        logger.warning("Nominatim geocode error: %s", exc)

    # 2. Fallback to Photon
    try:
        results = await _search_photon(query)
        payload = {
            "results": [r.to_dict() for r in results],
            "provider": "photon",
            "cached": False,
            "error": None,
        }
        if results:
            _cache.set(q_key, {**payload, "cached": False})
        return payload
    except Exception as exc:
        logger.warning("Photon geocode error: %s", exc)

    # 3. Both failed
    return {
        "results": [],
        "provider": "none",
        "cached": False,
        "error": "Geocoding services temporarily unavailable. Please enter coordinates manually.",
    }
