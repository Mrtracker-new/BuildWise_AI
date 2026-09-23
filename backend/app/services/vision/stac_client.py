import httpx
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional

ELEMENT84_STAC_URL = "https://earth-search.aws.element84.com/v1/search"
COLLECTION_NAME = "sentinel-2-l2a"
MAX_CLOUD_COVER_PCT = 20.0
STAC_SEARCH_TIMEOUT_SECONDS = 4.0

class StacClientError(Exception):
    """Base exception for STAC catalog queries."""
    pass

class StacTimeoutError(StacClientError):
    """Raised when STAC query exceeds timeout budget."""
    pass

class NoSceneFoundError(StacClientError):
    """Raised when no acceptable scene (cloud < 20% in last 12 months) covers coordinates."""
    pass

def parse_stac_item(feature: Dict[str, Any]) -> Dict[str, Any]:
    """
    Parses a single STAC feature into scene metadata and asset hrefs.
    Extracts B02, B03, B04, B08, B11 (swir16), and SCL.
    """
    scene_id = feature.get("id", "")
    properties = feature.get("properties", {})
    dt_str = properties.get("datetime", "")
    cloud_cover = float(properties.get("eo:cloud_cover", 0.0))

    assets = feature.get("assets", {})

    def get_href(*keys: str) -> Optional[str]:
        for k in keys:
            if k in assets and "href" in assets[k]:
                return assets[k]["href"]
        return None

    href_b02 = get_href("blue", "B02", "b02")
    href_b03 = get_href("green", "B03", "b03")
    href_b04 = get_href("red", "B04", "b04")
    href_b08 = get_href("nir", "B08", "b08")
    href_b11 = get_href("swir16", "B11", "b11")
    href_scl = get_href("scl", "SCL")
    href_visual = get_href("visual", "TCI")

    # Essential bands required for analysis
    if not (href_b02 and href_b03 and href_b04 and href_b08):
        raise StacClientError(f"Scene {scene_id} is missing essential optical bands (B02/B03/B04/B08).")

    return {
        "scene_id": scene_id,
        "datetime": dt_str,
        "cloud_cover_pct": round(cloud_cover, 2),
        "source": "Copernicus Sentinel-2",
        "assets": {
            "B02": href_b02,
            "B03": href_b03,
            "B04": href_b04,
            "B08": href_b08,
            "B11": href_b11,
            "SCL": href_scl,
            "visual": href_visual,
        }
    }

async def search_latest_sentinel_scene(
    lat: float,
    lon: float,
    max_cloud_cover: float = MAX_CLOUD_COVER_PCT,
    lookback_days: int = 365,
    client: Optional[httpx.AsyncClient] = None
) -> Dict[str, Any]:
    """
    Searches Earth Search STAC for the most recent Sentinel-2 L2A scene covering (lat, lon)
    with cloud cover < max_cloud_cover within lookback_days.
    4.0 second strict timeout.
    """
    now = datetime.now(timezone.utc)
    start_dt = now - timedelta(days=lookback_days)
    datetime_range = f"{start_dt.strftime('%Y-%m-%dT00:00:00Z')}/{now.strftime('%Y-%m-%dT%H:%M:%SZ')}"

    # Bounding box of ~1 km around target point
    d_deg = 0.005
    bbox = [
        round(lon - d_deg, 5),
        round(lat - d_deg, 5),
        round(lon + d_deg, 5),
        round(lat + d_deg, 5)
    ]

    payload = {
        "collections": [COLLECTION_NAME],
        "bbox": bbox,
        "datetime": datetime_range,
        "query": {
            "eo:cloud_cover": {"lt": max_cloud_cover}
        },
        "sortby": [
            {"field": "properties.datetime", "direction": "desc"}
        ],
        "limit": 1
    }

    own_client = False
    if client is None:
        client = httpx.AsyncClient(timeout=STAC_SEARCH_TIMEOUT_SECONDS)
        own_client = True

    try:
        response = await client.post(ELEMENT84_STAC_URL, json=payload)
        if response.status_code != 200:
            raise StacClientError(f"STAC search API returned status {response.status_code}: {response.text[:200]}")

        data = response.json()
        features = data.get("features", [])
        if not features:
            raise NoSceneFoundError(f"No Sentinel-2 scene with cloud cover < {max_cloud_cover}% found in past {lookback_days} days.")

        return parse_stac_item(features[0])

    except httpx.TimeoutException as exc:
        raise StacTimeoutError(f"STAC catalog search timed out after {STAC_SEARCH_TIMEOUT_SECONDS}s: {exc}") from exc
    except httpx.RequestError as exc:
        raise StacClientError(f"STAC catalog network request failed: {exc}") from exc
    finally:
        if own_client:
            await client.aclose()
