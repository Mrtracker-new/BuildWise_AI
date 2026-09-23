import math
import numpy as np
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, Any, Tuple, Optional, List

from app.services.vision.indices import resample_to_shape

# Scene Classification Layer (SCL) classes to mask as cloud / shadow / defective
# 1: Saturated/defective, 2: Cast shadow, 3: Cloud shadow, 8: Medium prob cloud, 9: High prob cloud, 10: Cirrus, 11: Snow
SCL_MASKED_CLASSES = {1, 2, 3, 8, 9, 10, 11}

IMAGERY_FETCH_TIMEOUT_SECONDS = 8.0
WINDOW_SIZE_METERS = 240.0
TARGET_RESOLUTION_METERS = 10.0
EXPECTED_GRID_SIZE = int(WINDOW_SIZE_METERS / TARGET_RESOLUTION_METERS) # 24 pixels

class ImageryFetchError(Exception):
    """Base exception for satellite imagery retrieval and windowed reading."""
    pass

def _fetch_single_band_window(
    band_name: str,
    href: str,
    center_lon: float,
    center_lat: float,
    window_half_meters: float = 120.0
) -> Tuple[str, np.ndarray, Any, Any]:
    """
    Synchronous worker executing windowed COG read using rasterio over /vsicurl/.
    Converts (lat, lon) to dataset CRS (e.g. UTM), calculates window, and reads 1 band.
    """
    try:
        import rasterio
        from rasterio.warp import transform as warp_transform
        from rasterio.windows import from_bounds
    except ImportError as exc:
        raise ImageryFetchError(f"rasterio is required for satellite windowed COG reads: {exc}") from exc

    # Add /vsicurl/ prefix if standard https URL and not already prefixed
    url = href
    if not url.startswith("/vsicurl/") and (url.startswith("http://") or url.startswith("https://")):
        url = f"/vsicurl/{url}"

    env_opts = {
        "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
        "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif",
        "CPL_VSIL_CURL_CHUNK_SIZE": "65536",
        "GDAL_HTTP_TIMEOUT": "8",
        "VSI_CACHE": "TRUE"
    }

    with rasterio.Env(**env_opts):
        try:
            with rasterio.open(url) as src:
                # 1. Reproject center WGS84 point to raster native CRS (typically UTM)
                xs, ys = warp_transform("EPSG:4326", src.crs, [center_lon], [center_lat])
                x_center, y_center = xs[0], ys[0]

                # 2. Window bounds in native projection units (meters)
                left = x_center - window_half_meters
                right = x_center + window_half_meters
                bottom = y_center - window_half_meters
                top = y_center + window_half_meters

                window = from_bounds(left, bottom, right, top, transform=src.transform)
                # Read 1 band into 2D float32/int array
                data = src.read(1, window=window, boundless=True, fill_value=0)
                window_transform = rasterio.windows.transform(window, src.transform)

                return band_name, data, src.crs, window_transform
        except Exception as exc:
            raise ImageryFetchError(f"Failed to read window for band {band_name} from {href}: {exc}") from exc


def fetch_site_imagery(
    asset_urls: Dict[str, str],
    center_lat: float,
    center_lon: float,
    timeout_seconds: float = IMAGERY_FETCH_TIMEOUT_SECONDS
) -> Dict[str, Any]:
    """
    Fetches windowed 240m x 240m arrays for Sentinel-2 bands B02, B03, B04, B08, and optionally B11 & SCL.
    Executes in parallel using ThreadPoolExecutor within timeout budget.
    Ensures all 10m bands produce a 24x24 grid, upsamples B11/SCL (20m) to match 24x24.
    Returns:
        bands: Dict[str, np.ndarray]
        valid_mask: np.ndarray (bool)
        affine_transform: rasterio.Affine
        crs: str
        shape: Tuple[int, int]
    """
    # Essential bands required for analysis
    required_bands = ["B02", "B03", "B04", "B08"]
    for b in required_bands:
        if b not in asset_urls or not asset_urls[b]:
            raise ImageryFetchError(f"Missing asset URL for required band: {b}")

    bands_to_fetch = ["B02", "B03", "B04", "B08"]
    if asset_urls.get("B11"):
        bands_to_fetch.append("B11")
    if asset_urls.get("SCL"):
        bands_to_fetch.append("SCL")

    raw_results = {}
    master_crs = None
    master_transform = None

    with ThreadPoolExecutor(max_workers=len(bands_to_fetch)) as executor:
        future_to_band = {
            executor.submit(
                _fetch_single_band_window,
                band_name,
                asset_urls[band_name],
                center_lon,
                center_lat,
                120.0
            ): band_name
            for band_name in bands_to_fetch
        }

        try:
            for future in as_completed(future_to_band, timeout=timeout_seconds):
                band_name = future_to_band[future]
                b_name, data, crs, transform = future.result()
                raw_results[b_name] = data
                if master_crs is None:
                    master_crs = crs
                    master_transform = transform
        except TimeoutError as exc:
            raise ImageryFetchError(f"Satellite band retrieval timed out after {timeout_seconds}s") from exc
        except Exception as exc:
            raise ImageryFetchError(f"Satellite band retrieval failed: {exc}") from exc

    # Verify essential optical bands exist
    for b in required_bands:
        if b not in raw_results:
            raise ImageryFetchError(f"Band {b} was not retrieved from satellite catalog.")

    # Target shape is from 10m optical band (e.g. B08), or fallback to (24, 24)
    target_shape = raw_results["B08"].shape
    if target_shape[0] == 0 or target_shape[1] == 0:
        target_shape = (EXPECTED_GRID_SIZE, EXPECTED_GRID_SIZE)

    # Standardize all optical bands to target shape
    processed_bands: Dict[str, np.ndarray] = {}
    for b in ["B02", "B03", "B04", "B08"]:
        arr = raw_results[b]
        if arr.shape != target_shape:
            arr = resample_to_shape(arr, target_shape)
        processed_bands[b] = arr

    # Amendment 1: Upsample B11 (20m) to match 10m grid shape before NDBI
    if "B11" in raw_results:
        b11_raw = raw_results["B11"]
        if b11_raw.shape != target_shape:
            processed_bands["B11"] = resample_to_shape(b11_raw, target_shape)
        else:
            processed_bands["B11"] = b11_raw.astype(np.float32)
    else:
        # Synthetic substitute if B11 asset unavailable: estimate from red/nir
        processed_bands["B11"] = (processed_bands["B04"] * 0.5 + processed_bands["B08"] * 0.5).astype(np.float32)

    # Handle SCL (Scene Classification Layer) for cloud & shadow masking
    if "SCL" in raw_results:
        scl_raw = raw_results["SCL"]
        if scl_raw.shape != target_shape:
            # Nearest neighbor for categorical classes
            scl_upsampled = resample_to_shape(scl_raw, target_shape)
            scl_clean = np.round(scl_upsampled).astype(int)
        else:
            scl_clean = scl_raw.astype(int)

        # Mask pixels belonging to cloud/shadow/saturation classes
        valid_mask = ~np.isin(scl_clean, list(SCL_MASKED_CLASSES))
    else:
        # Default all pixels valid if SCL unavailable
        valid_mask = np.ones(target_shape, dtype=bool)

    # Exclude nodata / zero pixels across bands
    nodata_mask = (processed_bands["B02"] > 0) & (processed_bands["B04"] > 0) & (processed_bands["B08"] > 0)
    valid_mask = valid_mask & nodata_mask

    # Guard: If SCL cloud/shadow masking eliminated >= 90% of the scene, fall back to optical band positivity
    if np.count_nonzero(valid_mask) < (0.1 * valid_mask.size) and np.count_nonzero(nodata_mask) > 0:
        valid_mask = nodata_mask

    return {
        "bands": processed_bands,
        "valid_mask": valid_mask,
        "affine_transform": master_transform,
        "crs": str(master_crs),
        "shape": target_shape
    }
