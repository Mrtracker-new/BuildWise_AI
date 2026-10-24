import time

import numpy as np
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, Optional, Tuple

from app.services.vision.indices import resample_to_shape

# Scene Classification Layer (SCL) classes to mask as cloud / shadow / defective
# 1: Saturated/defective, 2: Cast shadow, 3: Cloud shadow, 8: Medium prob cloud, 9: High prob cloud, 10: Cirrus, 11: Snow
SCL_MASKED_CLASSES = {1, 2, 3, 8, 9, 10, 11}

# The windowed COG read is a cold HTTP range read against the Copernicus COGs.
# Sentinel-2 L2A stores 1024x1024 deflate tiles of ~1 MB, and a 240 m window
# still lands across three or four of them per band: measured 8-18 s per band on
# a residential connection.  The old 8 s budget was BELOW that floor, so a
# healthy scene failed with "timed out after 8.0s" on a cold cache and the whole
# ecological layer of the report degraded to "unavailable".  This budget was
# then measured against whole six-band fetches (22.8-27 s when the link is
# behaving) with room for one band retry, and it no longer blocks the server
# (the caller runs this in a worker thread).
IMAGERY_FETCH_TIMEOUT_SECONDS = 35.0
# GDAL's own per-request ceiling.  It must stay under the budget above so a
# single stalled range read fails and is retried inside the window.
_GDAL_HTTP_TIMEOUT_S = 20
# Whole-band read attempts and the pause between them (see _fetch_single_band_window).
_BAND_READ_ATTEMPTS = 2
_BAND_READ_BACKOFF_S = 1.0
# HOW MANY BANDS READ AT ONCE.  Six simultaneous COG reads saturate a
# residential link: measured on one scene, 6 workers gave truncated tile bodies
# ("got 384801 bytes, expected 1185193") on B03/B04/B08, while the same bands read
# cleanly one at a time.  Three workers keep the pipe busy without thrashing it,
# and the required optical bands are prioritised so they are read first.
_MAX_PARALLEL_BAND_READS = 3

WINDOW_SIZE_METERS = 240.0
TARGET_RESOLUTION_METERS = 10.0
EXPECTED_GRID_SIZE = int(WINDOW_SIZE_METERS / TARGET_RESOLUTION_METERS) # 24 pixels

# B03/B04/B08 carry NDVI, NDWI and NDBI - every index on the site sheet needs
# them.  B02 only feeds optional SegFormer inference, B11 only NDBI's built-up
# term (synthesised from red/NIR when absent) and SCL only cloud masking, so a
# failure in those is a quieter analysis, not a missing report.
_REQUIRED_BANDS = ("B03", "B04", "B08")
_OPTIONAL_BANDS = ("B02", "B11", "SCL")


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
        # A truncated range response ("got 384801 bytes, expected 1185193")
        # used to abort the whole band; with retries GDAL re-requests the range
        # instead of losing the entire ecological layer to one bad tile.
        "GDAL_HTTP_MAX_RETRY": "3",
        "GDAL_HTTP_RETRY_DELAY": "0.5",
        "GDAL_HTTP_TIMEOUT": str(_GDAL_HTTP_TIMEOUT_S),
        "VSI_CACHE": "TRUE",
    }

    # RETRY THE WHOLE BAND READ.  The failure mode here is not an HTTP error
    # GDAL can retry itself: a range response arrives TRUNCATED ("got 384801
    # bytes, expected 1185193"), the TIFF layer rejects the tile, and
    # GDAL_HTTP_MAX_RETRY never sees an error status.  On a residential link
    # this happened on roughly one band in three, sinking the entire ecological
    # layer.  Re-opening and re-reading the band usually lands a clean response,
    # so that is what is retried here.
    last_exc: Optional[Exception] = None
    for attempt in range(1, _BAND_READ_ATTEMPTS + 1):
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
            except Exception as exc:  # noqa: BLE001 - retried below, then raised
                last_exc = exc
                if attempt < _BAND_READ_ATTEMPTS:
                    time.sleep(_BAND_READ_BACKOFF_S * attempt)

    raise ImageryFetchError(
        f"Failed to read window for band {band_name} from {href} "
        f"after {_BAND_READ_ATTEMPTS} attempts: {last_exc}"
    ) from last_exc


def fetch_site_imagery(
    asset_urls: Dict[str, str],
    center_lat: float,
    center_lon: float,
    timeout_seconds: float = IMAGERY_FETCH_TIMEOUT_SECONDS
) -> Dict[str, Any]:
    """
    Fetches windowed 240m x 240m arrays for Sentinel-2 bands B03, B04, B08, and
    optionally B02, B11 & SCL.
    Executes in parallel using ThreadPoolExecutor within timeout budget.
    Ensures all 10m bands produce a 24x24 grid, upsamples B11/SCL (20m) to match 24x24.
    Only B03/B04/B08 are required; an unavailable optional band is omitted and
    handled by the caller (B11 falls back to a red/NIR estimate, SCL to no cloud
    masking, B02 to index-only inference).
    Returns:
        bands: Dict[str, np.ndarray]
        valid_mask: np.ndarray (bool)
        affine_transform: rasterio.Affine
        crs: str
        shape: Tuple[int, int]
    """
    missing_assets = [b for b in _REQUIRED_BANDS if not asset_urls.get(b)]
    if missing_assets:
        raise ImageryFetchError(f"Missing asset URL for required band: {missing_assets[0]}")

    bands_to_fetch = list(_REQUIRED_BANDS)
    for optional in _OPTIONAL_BANDS:
        if asset_urls.get(optional):
            bands_to_fetch.append(optional)

    raw_results: Dict[str, np.ndarray] = {}
    failures: Dict[str, str] = {}
    master_crs = None
    master_transform = None

    # Explicit executor (not a `with` block): leaving the `with` on timeout joins
    # every still-running GDAL read, so an 8 s budget could block the request for
    # 12 s and - while this ran on the event loop - stall unrelated endpoints.
    executor = ThreadPoolExecutor(max_workers=min(_MAX_PARALLEL_BAND_READS, len(bands_to_fetch)))
    future_to_band = {
        executor.submit(
            _fetch_single_band_window,
            band_name,
            asset_urls[band_name],
            center_lon,
            center_lat,
            120.0,
        ): band_name
        for band_name in bands_to_fetch
    }
    timed_out = False
    try:
        for future in as_completed(future_to_band, timeout=timeout_seconds):
            band_name = future_to_band[future]
            try:
                b_name, data, crs, transform = future.result()
            except Exception as exc:  # optional bands must not sink the analysis
                failures[band_name] = str(exc)
                continue
            raw_results[b_name] = data
            if master_crs is None:
                master_crs = crs
                master_transform = transform
    except TimeoutError:
        timed_out = True
        for future, band_name in future_to_band.items():
            if not future.done():
                failures.setdefault(band_name, f"not returned within {timeout_seconds:.0f}s")
    finally:
        # Do not wait for abandoned reads: their threads finish and discard.
        executor.shutdown(wait=False, cancel_futures=True)

    missing_required = [b for b in _REQUIRED_BANDS if b not in raw_results]
    if missing_required:
        detail = "; ".join(f"{b}: {failures.get(b, 'no result')}" for b in missing_required)
        reason = "timed out after %.0fs" % timeout_seconds if timed_out else "retrieval failed"
        raise ImageryFetchError(f"Satellite band retrieval {reason} (required: {detail})")

    # Verify essential optical bands exist
    for b in _REQUIRED_BANDS:
        if b not in raw_results:
            raise ImageryFetchError(f"Band {b} was not retrieved from satellite catalog.")

    # Target shape is from 10m optical band (e.g. B08), or fallback to (24, 24)
    target_shape = raw_results["B08"].shape
    if target_shape[0] == 0 or target_shape[1] == 0:
        target_shape = (EXPECTED_GRID_SIZE, EXPECTED_GRID_SIZE)

    # Standardize all optical bands to target shape
    processed_bands: Dict[str, np.ndarray] = {}
    for b in ("B03", "B04", "B08"):
        arr = raw_results[b]
        if arr.shape != target_shape:
            arr = resample_to_shape(arr, target_shape)
        processed_bands[b] = arr

    # B02 is only SegFormer's blue channel: keep it when it arrived, omit it
    # otherwise so the caller can fall back to index-only inference.
    if "B02" in raw_results:
        b02 = raw_results["B02"]
        if b02.shape != target_shape:
            b02 = resample_to_shape(b02, target_shape)
        processed_bands["B02"] = b02

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

    # Exclude nodata / zero pixels across bands.  B02 joins the test only when it
    # was fetched, so a scene that lost the optional blue band keeps the same
    # valid-pixel set it would have had with it.
    nodata_mask = (processed_bands["B04"] > 0) & (processed_bands["B08"] > 0)
    if "B02" in processed_bands:
        nodata_mask = nodata_mask & (processed_bands["B02"] > 0)
    valid_mask = valid_mask & nodata_mask

    # Guard: If SCL cloud/shadow masking eliminated >= 90% of the scene, fall back to optical band positivity
    if np.count_nonzero(valid_mask) < (0.1 * valid_mask.size) and np.count_nonzero(nodata_mask) > 0:
        valid_mask = nodata_mask

    return {
        "bands": processed_bands,
        "valid_mask": valid_mask,
        "affine_transform": master_transform,
        "crs": str(master_crs),
        "shape": target_shape,
        "failures": failures,
    }
