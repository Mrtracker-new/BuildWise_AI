import numpy as np
from typing import Tuple, Optional

# Classification thresholds based on remote sensing literature:
# Rouse et al. (1974); Carlson & Ripley (1997) for NDVI
TREE_NDVI_THRESHOLD: float = 0.35

# McFeeters (1996); Gao (1996) for NDWI
WATER_NDWI_THRESHOLD: float = 0.10

# Zha, Gao, & Ni (2003) for NDBI with NDVI upper-bound to reject sparse soil
BUILTUP_NDBI_THRESHOLD: float = 0.00
BUILTUP_NDVI_MAX: float = 0.20

# Epsilon denominator guard against divide-by-zero on dark/nodata pixels
EPSILON: float = 1e-7

def resample_to_shape(array: np.ndarray, target_shape: Tuple[int, int]) -> np.ndarray:
    """
    Upsamples or downsamples a 2D numpy array to target_shape (height, width).
    Uses scipy.ndimage.zoom when available; falls back to pure-numpy nearest/bilinear interpolation.
    Safely resolves spatial resolution mismatches (e.g., Sentinel-2 20m B11 to 10m B02/B03/B04/B08).
    """
    if array.shape == target_shape:
        return array.astype(np.float32)

    src_h, src_w = array.shape
    tgt_h, tgt_w = target_shape

    try:
        from scipy.ndimage import zoom
        zoom_y = tgt_h / float(src_h)
        zoom_x = tgt_w / float(src_w)
        resampled = zoom(array, (zoom_y, zoom_x), order=1)
        # Ensure exact shape match (rounding discrepancies)
        if resampled.shape != target_shape:
            resampled = resampled[:tgt_h, :tgt_w]
            if resampled.shape[0] < tgt_h or resampled.shape[1] < tgt_w:
                padded = np.zeros(target_shape, dtype=array.dtype)
                padded[:resampled.shape[0], :resampled.shape[1]] = resampled
                return padded.astype(np.float32)
        return resampled.astype(np.float32)
    except ImportError:
        # Pure numpy bilinear/nearest interpolation fallback
        y_indices = np.linspace(0, src_h - 1, tgt_h).astype(int)
        x_indices = np.linspace(0, src_w - 1, tgt_w).astype(int)
        return array[np.ix_(y_indices, x_indices)].astype(np.float32)


def calculate_ndvi(nir: np.ndarray, red: np.ndarray) -> np.ndarray:
    """
    Calculates Normalized Difference Vegetation Index (NDVI).
    Formula: (NIR - Red) / (NIR + Red + EPSILON)
    Range: [-1.0, 1.0]
    """
    nir_f = nir.astype(np.float32)
    red_f = red.astype(np.float32)
    denom = nir_f + red_f + EPSILON
    ndvi = (nir_f - red_f) / denom
    return np.clip(ndvi, -1.0, 1.0)


def calculate_ndwi(green: np.ndarray, nir: np.ndarray) -> np.ndarray:
    """
    Calculates Normalized Difference Water Index (NDWI) (McFeeters).
    Formula: (Green - NIR) / (Green + NIR + EPSILON)
    Range: [-1.0, 1.0]
    """
    green_f = green.astype(np.float32)
    nir_f = nir.astype(np.float32)
    denom = green_f + nir_f + EPSILON
    ndwi = (green_f - nir_f) / denom
    return np.clip(ndwi, -1.0, 1.0)


def calculate_ndbi(swir: np.ndarray, nir: np.ndarray) -> np.ndarray:
    """
    Calculates Normalized Difference Built-up Index (NDBI).
    Formula: (SWIR - NIR) / (SWIR + NIR + EPSILON)
    Range: [-1.0, 1.0]
    Automatically resamples SWIR (e.g. 20m B11) if shape differs from NIR (10m B08).
    """
    if swir.shape != nir.shape:
        swir = resample_to_shape(swir, nir.shape)

    swir_f = swir.astype(np.float32)
    nir_f = nir.astype(np.float32)
    denom = swir_f + nir_f + EPSILON
    ndbi = (swir_f - nir_f) / denom
    return np.clip(ndbi, -1.0, 1.0)


def classify_indices(
    ndvi: np.ndarray,
    ndwi: np.ndarray,
    ndbi: np.ndarray,
    valid_mask: Optional[np.ndarray] = None
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Applies documented thresholds to produce binary boolean masks for:
    - tree_mask: NDVI >= 0.35
    - water_mask: NDWI >= 0.10
    - built_up_mask: NDBI > 0.0 AND NDVI < 0.20
    Optionally masks out invalid/cloud/shadow pixels via valid_mask.
    """
    tree_mask = (ndvi >= TREE_NDVI_THRESHOLD)
    water_mask = (ndwi >= WATER_NDWI_THRESHOLD)
    built_up_mask = (ndbi > BUILTUP_NDBI_THRESHOLD) & (ndvi < BUILTUP_NDVI_MAX)

    if valid_mask is not None:
        tree_mask = tree_mask & valid_mask
        water_mask = water_mask & valid_mask
        built_up_mask = built_up_mask & valid_mask

    return tree_mask, water_mask, built_up_mask
