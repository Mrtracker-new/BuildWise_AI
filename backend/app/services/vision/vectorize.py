import math
import numpy as np
from typing import List, Dict, Any, Tuple, Optional

MIN_CLUSTER_AREA_SQM = 25.0
PIXEL_AREA_SQM = 100.0 # 10m x 10m pixel

def _label_connected_components(binary_mask: np.ndarray) -> Tuple[np.ndarray, int]:
    """
    Labels 8-connected components on a 2D boolean mask.
    Uses scipy.ndimage.label if available, with pure-numpy/BFS fallback.
    """
    try:
        from scipy.ndimage import label
        # 8-connectivity structure
        struct = np.ones((3, 3), dtype=int)
        labeled, num_features = label(binary_mask, structure=struct)
        return labeled, num_features
    except ImportError:
        # Pure Python BFS connected components fallback
        h, w = binary_mask.shape
        labeled = np.zeros((h, w), dtype=int)
        visited = np.zeros((h, w), dtype=bool)
        current_label = 0

        neighbors = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]

        for r in range(h):
            for c in range(w):
                if binary_mask[r, c] and not visited[r, c]:
                    current_label += 1
                    queue = [(r, c)]
                    visited[r, c] = True
                    labeled[r, c] = current_label

                    while queue:
                        curr_r, curr_c = queue.pop(0)
                        for dr, dc in neighbors:
                            nr, nc = curr_r + dr, curr_c + dc
                            if 0 <= nr < h and 0 <= nc < w:
                                if binary_mask[nr, nc] and not visited[nr, nc]:
                                    visited[nr, nc] = True
                                    labeled[nr, nc] = current_label
                                    queue.append((nr, nc))

        return labeled, current_label


def _pixel_to_latlon(
    col: float,
    row: float,
    center_lat: float,
    center_lon: float,
    grid_shape: Tuple[int, int] = (24, 24),
    pixel_size_m: float = 10.0,
    affine_transform: Any = None,
    crs: Optional[str] = None
) -> Tuple[float, float]:
    """
    Converts (col, row) pixel coordinate to (longitude, latitude) in WGS84.
    If affine_transform and rasterio are available, projects via dataset CRS.
    Otherwise uses high-precision geographic meter-to-degree geodesic conversion.
    """
    if affine_transform is not None and crs:
        try:
            from rasterio.warp import transform as warp_transform
            # affine_transform * (col, row) yields native CRS (e.g. UTM) coordinates
            x_native, y_native = affine_transform * (col, row)
            lons, lats = warp_transform(crs, "EPSG:4326", [x_native], [y_native])
            return round(lons[0], 6), round(lats[0], 6)
        except Exception:
            pass

    # High-precision geographic meter-to-degree geodesic conversion centered on (center_lat, center_lon)
    h, w = grid_shape
    center_c = (w - 1) / 2.0
    center_r = (h - 1) / 2.0

    delta_x_m = (col - center_c) * pixel_size_m
    delta_y_m = (center_r - row) * pixel_size_m # Y decreases as row increases

    lat_rad = math.radians(center_lat)
    delta_lat = delta_y_m / 110540.0
    delta_lon = delta_x_m / (111320.0 * max(math.cos(lat_rad), 0.01))

    return round(center_lon + delta_lon, 6), round(center_lat + delta_lat, 6)


def vectorize_mask(
    binary_mask: np.ndarray,
    feature_type_prefix: str,
    center_lat: float,
    center_lon: float,
    affine_transform: Any = None,
    crs: Optional[str] = None,
    metric_grid: Optional[np.ndarray] = None,
    min_area_sqm: float = MIN_CLUSTER_AREA_SQM,
    tolerance: float = 0.2
) -> List[Dict[str, Any]]:
    """
    Converts binary 2D mask into a list of GeoJSON Features:
    1. Runs connected-component labeling.
    2. Filters components below min_area_sqm (default 25 sqm).
    3. Merges pixel geometry and simplifies with Douglas-Peucker.
    4. Converts coordinates to WGS84 (lon, lat).
    5. Computes centroid, area_sqm, and mean metric value (e.g. NDVI).
    """
    if not np.any(binary_mask):
        return []

    labeled, num_features = _label_connected_components(binary_mask)
    if num_features == 0:
        return []

    features: List[Dict[str, Any]] = []

    try:
        from shapely.geometry import box, Polygon, MultiPolygon
        from shapely.ops import unary_union
        has_shapely = True
    except ImportError:
        has_shapely = False

    grid_h, grid_w = binary_mask.shape

    for label_id in range(1, num_features + 1):
        pixel_indices = np.argwhere(labeled == label_id)
        pixel_count = len(pixel_indices)
        area_sqm = float(pixel_count * PIXEL_AREA_SQM)

        # Minimum cluster area filter
        if area_sqm < min_area_sqm:
            continue

        cluster_id = f"{feature_type_prefix}-{label_id}"

        # Centroid in pixel space
        mean_r = float(np.mean(pixel_indices[:, 0]))
        mean_c = float(np.mean(pixel_indices[:, 1]))
        centroid_lon, centroid_lat = _pixel_to_latlon(
            mean_c, mean_r, center_lat, center_lon, (grid_h, grid_w), 10.0, affine_transform, crs
        )

        # Mean metric value (e.g. mean NDVI for tree canopy)
        mean_metric = 0.0
        if metric_grid is not None:
            vals = metric_grid[labeled == label_id]
            mean_metric = round(float(np.mean(vals)), 3)

        # Polygon vector extraction
        geometry = None

        if has_shapely:
            # Create a 1x1 box for each pixel in pixel coordinates
            pixel_boxes = [
                box(float(c), float(r), float(c + 1), float(r + 1))
                for r, c in pixel_indices
            ]
            merged_poly = unary_union(pixel_boxes)

            # Simplify contour with Douglas-Peucker
            simplified = merged_poly.simplify(tolerance=tolerance, preserve_topology=True)

            # Handle both Polygon and MultiPolygon
            polys = [simplified] if isinstance(simplified, Polygon) else (
                list(simplified.geoms) if isinstance(simplified, MultiPolygon) else []
            )

            polys = [p for p in polys if not p.is_empty]
            if len(polys) == 1:
                p = polys[0]
                rings = [
                    [
                        _pixel_to_latlon(x, y, center_lat, center_lon, (grid_h, grid_w), 10.0, affine_transform, crs)
                        for x, y in p.exterior.coords
                    ]
                ]
                for interior in p.interiors:
                    rings.append([
                        _pixel_to_latlon(x, y, center_lat, center_lon, (grid_h, grid_w), 10.0, affine_transform, crs)
                        for x, y in interior.coords
                    ])
                geometry = {
                    "type": "Polygon",
                    "coordinates": rings
                }
            elif len(polys) > 1:
                multi_coords = []
                for p in polys:
                    rings = [
                        [
                            _pixel_to_latlon(x, y, center_lat, center_lon, (grid_h, grid_w), 10.0, affine_transform, crs)
                            for x, y in p.exterior.coords
                        ]
                    ]
                    for interior in p.interiors:
                        rings.append([
                            _pixel_to_latlon(x, y, center_lat, center_lon, (grid_h, grid_w), 10.0, affine_transform, crs)
                            for x, y in interior.coords
                        ])
                    multi_coords.append(rings)
                geometry = {
                    "type": "MultiPolygon",
                    "coordinates": multi_coords
                }

        # Fallback bounding box polygon if shapely is missing or simplification produced empty polys
        if geometry is None:
            min_r = int(np.min(pixel_indices[:, 0]))
            max_r = int(np.max(pixel_indices[:, 0]))
            min_c = int(np.min(pixel_indices[:, 1]))
            max_c = int(np.max(pixel_indices[:, 1]))

            corners = [
                (min_c, min_r),
                (max_c + 1, min_r),
                (max_c + 1, max_r + 1),
                (min_c, max_r + 1),
                (min_c, min_r)
            ]
            ext_coords = [
                _pixel_to_latlon(c, r, center_lat, center_lon, (grid_h, grid_w), 10.0, affine_transform, crs)
                for c, r in corners
            ]
            geometry = {
                "type": "Polygon",
                "coordinates": [ext_coords]
            }

        if geometry is None:
            continue

        properties = {
            "cluster_id": cluster_id,
            "area_sqm": round(area_sqm, 1),
            "centroid": [centroid_lon, centroid_lat],
            "mean_ndvi": mean_metric,
            "preservation_rank": "context"
        }

        features.append({
            "type": "Feature",
            "geometry": geometry,
            "properties": properties
        })

    return features
