"""
site_geometry.py - Canonical Site Layer Geometry Engine
======================================================
Encapsulates all irregularity (non-rectangular plots, NBC inward setbacks,
maximal inscribed rectangle search, outdoor zone difference fragments,
site-level North-aligned Vastu, and survey dimensioning) in the SITE layer.

Contains all non-rectangular geometry entirely at the site boundary so that
the floor solver, wall graph, stacking, certificates, and floor sheets
receive ONLY the footprint rectangle and remain 100% rectangular.
"""

from __future__ import annotations

import math
from typing import List, Tuple, Dict, Any, Optional
import numpy as np

import shapely
import shapely.affinity
from shapely.geometry import Polygon, MultiPolygon, Point, box

from app.schemas.site_plan import (
    PlotPolygonModel,
    PlotVertex,
    SurveyEdge,
    OutdoorFragment,
    FootprintWing,
    CorridorLink,
    InscribedFootprint,
    SiteCertificate,
    SitePlanModel,
)

# Equatorial radius of Earth in meters (WGS-84)
R_EARTH = 6378137.0

# Statutory minimums
MIN_STATUTORY_EDGE_M = 1.0
MIN_STATUTORY_AREA_M2 = 36.0
MIN_HABITABLE_FOOTPRINT_M2 = 28.0


# =============================================================================
# 1. LOCAL TANGENT PLANE PROJECTION (E/N EQUIRECTANGULAR)
# =============================================================================

def project_lat_lon_to_meters(
    lat: float,
    lon: float,
    origin_lat: float,
    origin_lon: float
) -> Tuple[float, float]:
    """
    Projects WGS84 (latitude, longitude) into local metric tangent plane
    (+X East, +Y North) relative to origin (origin_lat, origin_lon)
    using equirectangular projection with cos(lat) scaling.
    """
    lat_rad = math.radians(origin_lat)
    x_m = math.radians(lon - origin_lon) * R_EARTH * math.cos(lat_rad)
    y_m = math.radians(lat - origin_lat) * R_EARTH
    return round(x_m, 3), round(y_m, 3)


def unproject_meters_to_lat_lon(
    x_m: float,
    y_m: float,
    origin_lat: float,
    origin_lon: float
) -> Tuple[float, float]:
    """
    Inverse projection from local metric tangent plane to WGS84 (lat, lon).
    """
    lat_rad = math.radians(origin_lat)
    lat = origin_lat + math.degrees(y_m / R_EARTH)
    lon = origin_lon + math.degrees(x_m / (R_EARTH * math.cos(lat_rad)))
    return round(lat, 7), round(lon, 7)


# =============================================================================
# 2. VALIDATION & CANONICALIZATION
# =============================================================================

def approximate_curvilinear_polygon(
    vertices: List[Tuple[float, float]],
    tolerance: float = 0.10,
    max_segment_length: float = 5.0
) -> Tuple[bool, List[str], List[Tuple[float, float]]]:
    """
    Phase 1: Auto-approximates curved boundary segments (arcs) or dense survey points into piecewise-linear polylines.
    - Uses Shapely's simplify(tolerance=tolerance, preserve_topology=True).
    - Enforces >= 95% area retention.
    - Validates simple polygon topology (no self-intersections).
    """
    if len(vertices) < 3:
        return False, ["Polygon must have at least 3 vertices."], vertices

    try:
        raw_poly = Polygon(vertices)
    except Exception as e:
        return False, [f"Failed to create polygon from coordinates: {str(e)}"], vertices

    if not raw_poly.is_valid:
        return False, [f"Curvilinear boundary topology invalid: {shapely.is_valid_reason(raw_poly)}"], vertices

    orig_area = raw_poly.area
    if orig_area <= 0.0:
        return False, ["Curvilinear boundary area is zero or negative."], vertices

    simp_poly = raw_poly.simplify(tolerance=tolerance, preserve_topology=True)
    if not simp_poly.is_valid or simp_poly.geom_type != "Polygon":
        return False, ["Simplification resulted in invalid non-polygonal topology."], vertices

    area_retention = simp_poly.area / orig_area
    if area_retention < 0.95:
        return False, [
            f"Curvilinear approximation rejected: Retained {area_retention*100.0:.1f}% of area "
            f"(statutory requirement: >= 95.0% retention)."
        ], vertices

    if max_segment_length > 0:
        try:
            simp_poly = shapely.segmentize(simp_poly, max_segment_length=max_segment_length)
        except Exception:
            pass

    simplified_coords = [(round(float(x), 2), round(float(y), 2)) for x, y in simp_poly.exterior.coords][:-1]
    return True, [], simplified_coords


def validate_and_canonicalize_polygon(
    vertices: List[Tuple[float, float]]
) -> Tuple[bool, List[str], List[Tuple[float, float]], str]:
    """
    Validates polygon geometry:
    - >= 3 vertices
    - Closes ring automatically
    - Shapely simple polygon validity (no self-intersection)
    - Minimum edge length (>= 1.0m)
    - Consistent winding: auto-fixes clockwise winding to counter-clockwise (CCW)
    - Minimum plot area (>= 36 m²)
    Returns: (is_valid, diagnostics, clean_vertices, shape_type)
    """
    diagnostics: List[str] = []
    if not vertices or len(vertices) < 3:
        return False, [f"Plot polygon must contain at least 3 vertices (found {len(vertices) if vertices else 0})."], vertices, "invalid"

    # Remove consecutive identical points and trailing closure duplicate
    deduped: List[Tuple[float, float]] = []
    for pt in vertices:
        x, y = float(pt[0]), float(pt[1])
        if not deduped or (abs(x - deduped[-1][0]) > 1e-4 or abs(y - deduped[-1][1]) > 1e-4):
            deduped.append((x, y))

    if len(deduped) > 1 and abs(deduped[0][0] - deduped[-1][0]) < 1e-4 and abs(deduped[0][1] - deduped[-1][1]) < 1e-4:
        deduped.pop()

    if len(deduped) < 3:
        return False, ["Plot polygon vertices collapse to fewer than 3 distinct points."], vertices, "invalid"

    # Phase 1: Curvilinear boundary approximation for dense survey / arc inputs
    has_sub_edge = any(
        math.hypot(deduped[(i+1)%len(deduped)][0] - deduped[i][0], deduped[(i+1)%len(deduped)][1] - deduped[i][1]) < MIN_STATUTORY_EDGE_M
        for i in range(len(deduped))
    )
    if len(deduped) > 8 or has_sub_edge:
        ok_simp, _, simp_coords = approximate_curvilinear_polygon(deduped, tolerance=0.10)
        if ok_simp and len(simp_coords) >= 3:
            deduped = simp_coords

    # Edge length check
    n_pts = len(deduped)
    for i in range(n_pts):
        p1 = deduped[i]
        p2 = deduped[(i + 1) % n_pts]
        dist = math.hypot(p2[0] - p1[0], p2[1] - p1[1])
        if dist < MIN_STATUTORY_EDGE_M:
            diagnostics.append(
                f"EC-01: Boundary edge P{i+1}→P{((i+1)%n_pts)+1} length ({dist:.2f}m) is below statutory minimum ({MIN_STATUTORY_EDGE_M:.1f}m)."
            )
            return False, diagnostics, vertices, "invalid"

    # Construct shapely polygon
    try:
        poly = Polygon(deduped)
    except Exception as e:
        return False, [f"EC-02: Failed to construct polygon geometry: {str(e)}"], vertices, "invalid"

    if not poly.is_valid:
        reason = shapely.is_valid_reason(poly)
        diagnostics.append(f"EC-02: Self-intersecting or invalid plot boundary: {reason}")
        return False, diagnostics, vertices, "invalid"

    # Ensure counter-clockwise (CCW) winding
    if not poly.exterior.is_ccw:
        deduped = list(reversed(deduped))
        poly = Polygon(deduped)

    # Minimum area check
    area = poly.area
    if area < MIN_STATUTORY_AREA_M2:
        diagnostics.append(
            f"EC-03: Plot area ({area:.1f} m²) is below statutory minimum threshold ({MIN_STATUTORY_AREA_M2:.1f} m²)."
        )
        return False, diagnostics, vertices, "invalid"

    # Detect geometric typology
    shape_type = _detect_shape_type(poly, deduped)

    return True, [], deduped, shape_type


def _detect_shape_type(poly: Polygon, coords: List[Tuple[float, float]]) -> str:
    """Classifies polygon into standard architectural typologies."""
    n = len(coords)
    if n == 4:
        # Check if rectangle (4 right angles, axis-aligned or rotated)
        minx, miny, maxx, maxy = poly.bounds
        bbox_area = (maxx - minx) * (maxy - miny)
        if abs(poly.area - bbox_area) < 0.1 and abs(poly.minimum_rotated_rectangle.area - poly.area) < 0.1:
            return "rectangle"
        # Check if trapezoid (one pair of parallel edges)
        return "trapezoid"
    elif n == 5:
        return "pentagon"
    elif n >= 6:
        # If concave (convex hull area > poly area + 2%), classify as L-shaped or stepped
        hull_area = poly.convex_hull.area
        if hull_area > poly.area * 1.02:
            return "l_shape"
        return "irregular"
    return "irregular"


# =============================================================================
# 3. SURVEY EDGES & BEARINGS
# =============================================================================

def compute_survey_edges(coords: List[Tuple[float, float]]) -> List[SurveyEdge]:
    """Computes survey length and quadrant bearing for each boundary edge."""
    edges: List[SurveyEdge] = []
    n = len(coords)
    for i in range(n):
        p1 = coords[i]
        p2 = coords[(i + 1) % n]
        dx = p2[0] - p1[0]
        dy = p2[1] - p1[1]
        length = round(math.hypot(dx, dy), 2)

        # Azimuth from North clockwise: 0° = N, 90° = E, 180° = S, 270° = W
        azimuth = math.degrees(math.atan2(dx, dy)) % 360.0
        bearing_dms = _format_quadrant_bearing(azimuth)

        edges.append(SurveyEdge(
            edge_index=i + 1,
            from_vertex=f"P{i+1}",
            to_vertex=f"P{((i+1)%n)+1}",
            length_m=length,
            bearing_deg=round(azimuth, 2),
            bearing_dms=bearing_dms
        ))
    return edges


def _format_quadrant_bearing(azimuth: float) -> str:
    """Formats azimuth into surveyor quadrant format, e.g. 'N 45° 12' E'."""
    if azimuth <= 90.0:
        quad = "N"
        angle = azimuth
        sub = "E"
    elif azimuth <= 180.0:
        quad = "S"
        angle = 180.0 - azimuth
        sub = "E"
    elif azimuth <= 270.0:
        quad = "S"
        angle = azimuth - 180.0
        sub = "W"
    else:
        quad = "N"
        angle = 360.0 - azimuth
        sub = "W"

    deg = int(angle)
    mins = int(round((angle - deg) * 60.0))
    if mins == 60:
        deg += 1
        mins = 0
    return f"{quad} {deg}° {mins:02d}' {sub}"


# =============================================================================
# 4. NBC INWARD SETBACK BUFFER & COLLAPSE RECOVERY
# =============================================================================

def compute_buildable_polygon(
    plot_poly: Polygon,
    nominal_setback_m: float
) -> Tuple[Optional[Polygon], float, bool, List[str]]:
    """
    Computes buildable boundary via inward offset buffer(-d, mitre) per NBC rules.
    If offset collapses (area < 28 m²), applies graceful reduced-setback path.
    Returns: (buildable_poly, actual_setback_m, reduced_applied, warnings)
    """
    warnings: List[str] = []

    # Attempt nominal setback
    buf = plot_poly.buffer(-nominal_setback_m, join_style="mitre", mitre_limit=2.5)

    # If MultiPolygon, select largest ring
    if isinstance(buf, MultiPolygon):
        buf = max(buf.geoms, key=lambda g: g.area)

    if buf.is_valid and not buf.is_empty and buf.area >= MIN_HABITABLE_FOOTPRINT_M2:
        return buf, nominal_setback_m, False, warnings

    # Reduced setback recovery ladder
    reduced_ladder = [nominal_setback_m * 0.75, nominal_setback_m * 0.50, 1.20, 1.00]
    for d_red in reduced_ladder:
        if d_red >= nominal_setback_m:
            continue
        cand = plot_poly.buffer(-d_red, join_style="mitre", mitre_limit=2.5)
        if isinstance(cand, MultiPolygon):
            cand = max(cand.geoms, key=lambda g: g.area)
        if cand.is_valid and not cand.is_empty and cand.area >= MIN_HABITABLE_FOOTPRINT_M2:
            warnings.append(
                f"Degradation Level 2: Reduced setback applied ({d_red:.2f}m vs nominal {nominal_setback_m:.2f}m) "
                f"to prevent geometry collapse on compact irregular boundary."
            )
            return cand, round(d_red, 2), True, warnings

    # Graceful failure
    warnings.append(
        f"EC-04: Setback buffer collapse: plot shape leaves insufficient buildable area "
        f"(< {MIN_HABITABLE_FOOTPRINT_M2} m²) after NBC inward boundary offsets."
    )
    return None, nominal_setback_m, False, warnings


# =============================================================================
# 5. DISCRETIZED MAXIMAL INSCRIBED RECTANGLE SEARCH
# =============================================================================

def find_largest_inscribed_rectangle(
    buildable_poly: Polygon,
    grid_step: float = 0.25,
    min_aspect: float = 0.40,
    max_aspect: float = 2.50,
    candidate_orientations: Optional[List[float]] = None,
) -> Optional[Dict[str, Any]]:
    """
    Finds the largest inscribed rectangle within the buildable polygon
    via discretized maximal-rectangle search over deterministic candidate orientations
    (North axis 0° + unique boundary edge directions).
    Runs in deterministic O(R x C) time per candidate orientation.
    """
    if candidate_orientations is not None:
        candidate_angles = sorted(list(set(candidate_orientations)))
    else:
        coords = list(buildable_poly.exterior.coords)[:-1]
        angles = [0.0]
        for i in range(len(coords)):
            p1 = coords[i]
            p2 = coords[(i + 1) % len(coords)]
            dx = p2[0] - p1[0]
            dy = p2[1] - p1[1]
            deg = math.degrees(math.atan2(dy, dx)) % 90.0
            angles.append(round(deg, 1))

        # Dedup and sort angles
        candidate_angles = sorted(list(set(angles)))

    best_rect: Optional[Dict[str, Any]] = None
    best_area = 0.0
    cx, cy = buildable_poly.centroid.x, buildable_poly.centroid.y

    for theta in candidate_angles:
        rot_poly = shapely.affinity.rotate(buildable_poly, -theta, origin=(cx, cy))
        minx, miny, maxx, maxy = rot_poly.bounds

        cols = int(math.ceil((maxx - minx) / grid_step))
        rows = int(math.ceil((maxy - miny) / grid_step))
        if cols <= 0 or rows <= 0:
            continue

        shapely.prepare(rot_poly)
        grid = np.zeros((rows, cols), dtype=bool)

        x_centers = minx + (np.arange(cols) + 0.5) * grid_step
        y_centers = miny + (np.arange(rows) + 0.5) * grid_step

        for r in range(rows):
            yc = float(y_centers[r])
            for c in range(cols):
                xc = float(x_centers[c])
                cell_box = box(xc - grid_step * 0.49, yc - grid_step * 0.49, xc + grid_step * 0.49, yc + grid_step * 0.49)
                if rot_poly.contains(cell_box):
                    grid[r, c] = True

        heights = np.zeros(cols, dtype=int)
        for r in range(rows):
            for c in range(cols):
                if grid[r, c]:
                    heights[c] += 1
                else:
                    heights[c] = 0

            stack: List[Tuple[int, int]] = []
            for i, h in enumerate(heights):
                start = i
                while stack and stack[-1][1] > h:
                    idx, prev_h = stack.pop()
                    w_cells = i - idx
                    area_sqm = (w_cells * grid_step) * (prev_h * grid_step)
                    w_m = w_cells * grid_step
                    h_m = prev_h * grid_step
                    aspect = w_m / h_m if h_m > 0 else 0
                    if min_aspect <= aspect <= max_aspect and area_sqm > best_area:
                        rect_minx = minx + idx * grid_step
                        rect_miny = miny + (r - prev_h + 1) * grid_step
                        best_area = area_sqm
                        best_rect = {
                            "angle": theta,
                            "width_m": round(float(w_m), 2),
                            "depth_m": round(float(h_m), 2),
                            "area_sqm": round(float(area_sqm), 2),
                            "rot_bounds": (rect_minx, rect_miny, rect_minx + w_m, rect_miny + h_m),
                            "center_rot": (rect_minx + w_m / 2.0, rect_miny + h_m / 2.0),
                            "origin": (cx, cy)
                        }
                    start = idx
                stack.append((start, int(h)))

            for idx, prev_h in stack:
                w_cells = cols - idx
                area_sqm = (w_cells * grid_step) * (prev_h * grid_step)
                w_m = w_cells * grid_step
                h_m = prev_h * grid_step
                aspect = w_m / h_m if h_m > 0 else 0
                if min_aspect <= aspect <= max_aspect and area_sqm > best_area:
                    rect_minx = minx + idx * grid_step
                    rect_miny = miny + (r - prev_h + 1) * grid_step
                    best_area = area_sqm
                    best_rect = {
                        "angle": theta,
                        "width_m": round(float(w_m), 2),
                        "depth_m": round(float(h_m), 2),
                        "area_sqm": round(float(area_sqm), 2),
                        "rot_bounds": (rect_minx, rect_miny, rect_minx + w_m, rect_miny + h_m),
                        "center_rot": (rect_minx + w_m / 2.0, rect_miny + h_m / 2.0),
                        "origin": (cx, cy)
                    }

    return best_rect


# =============================================================================
# 5b. WING DECOMPOSITION & ADVANCED FOOTPRINT TOPOLOGIES
# =============================================================================

def decompose_buildable_into_wings(
    buildable_poly: Polygon,
    shape_type: str,
    plot_w: float,
    plot_d: float,
    coverage: float,
    typology: str = "T1_SINGLE_FAMILY",
    is_rect: bool = False,
    inscribed_override: Optional[Dict[str, float]] = None,
    program_needed_area_m2: Optional[float] = None,
) -> InscribedFootprint:
    """
    Phase 2: Rectangle Packing / Wing Decomposition for Advanced Footprint Topologies.
    - Rectangle Equivalence: Simple non-elongated rectangles produce exactly 1 Wing (single_rectangle)
      matching legacy behavior down to the millimeter.
    - Courtyard Typology: Subtracts central rectangular void (>= 3.5x3.5m) to create Central Courtyard
      outdoor fragment and surrounding perimeter wings.
    - Multi-Wing & L-Shapes: Grid-based maximal rectangle decomposition. Finds Wing A (Public),
      subtracts Wing A, finds Wing B (Private) in remaining space, bridges with a min 1.5m link corridor.
    """
    aspect = max(plot_w, plot_d) / max(min(plot_w, plot_d), 0.1)
    is_courtyard = ("courtyard" in typology.lower()) or ("courtyard" in str(shape_type).lower())
    is_l_shape = (shape_type == "l_shape") or (buildable_poly.convex_hull.area > buildable_poly.area * 1.02)
    is_extreme_aspect = (aspect > 3.0) and (min(plot_w, plot_d) >= 10.0)

    # 1. Single Rectangle Path (Strict Rectangle-Equivalence)
    if is_rect and not is_courtyard and not is_extreme_aspect and buildable_poly.area <= 400.0:
        if inscribed_override:
            env_w = round(inscribed_override["width"], 2)
            env_d = round(inscribed_override["depth"], 2)
            env_area = round(inscribed_override.get("area_sqm", env_w * env_d), 2)
            footprint_x = round(inscribed_override["x"], 2)
            footprint_y = round(inscribed_override["y"], 2)
        else:
            front_setback = max(1.8, min(3.5, plot_d * 0.15))
            rear_setback = max(1.2, min(2.5, plot_d * 0.10))
            side_setback = max(1.0, min(2.0, plot_w * 0.10))
            avail_w = max(4.0, plot_w - 2 * side_setback)
            avail_d = max(4.0, plot_d - front_setback - rear_setback)
            avail_area = avail_w * avail_d
            target_footprint = plot_w * plot_d * coverage
            footprint_area = min(avail_area, target_footprint)
            asp = avail_w / avail_d if avail_d > 0 else 1.0
            asp = max(0.5, min(2.0, asp))
            env_d = math.sqrt(footprint_area / asp)
            env_w = footprint_area / env_d if env_d > 0 else avail_w
            env_w = min(avail_w, env_w)
            env_d = min(avail_d, env_d)
            env_w = round(max(4.0, env_w), 2)
            env_d = round(max(4.0, env_d), 2)
            env_area = round(env_w * env_d, 2)
            footprint_x = round(side_setback, 2)
            footprint_y = round(front_setback, 2)

        corners = [
            (footprint_x, footprint_y),
            (footprint_x + env_w, footprint_y),
            (footprint_x + env_w, footprint_y + env_d),
            (footprint_x, footprint_y + env_d),
        ]
        wing_a = FootprintWing(
            wing_id="WING_A",
            label="Wing A (Main)",
            zone_type="public",
            x=footprint_x,
            y=footprint_y,
            width_m=env_w,
            depth_m=env_d,
            area_sqm=env_area,
            corner_vertices=corners,
        )
        return InscribedFootprint(
            x=footprint_x,
            y=footprint_y,
            width_m=env_w,
            depth_m=env_d,
            area_sqm=env_area,
            rotation_angle_deg=0.0,
            center_x=round(footprint_x + env_w / 2.0, 2),
            center_y=round(footprint_y + env_d / 2.0, 2),
            corner_vertices=corners,
            topology_type="single_rectangle",
            wings=[wing_a],
            corridors=[],
            courtyard_void=None,
        )

    # 2. Courtyard Typology (Central Void Subtraction)
    if is_courtyard or (buildable_poly.area >= 400.0 and "courtyard" in typology.lower()):
        minx, miny, maxx, maxy = buildable_poly.bounds
        b_w = round(maxx - minx, 2)
        b_d = round(maxy - miny, 2)

        void_w = round(max(3.5, min(8.0, b_w * 0.32)), 2)
        void_d = round(max(3.5, min(8.0, b_d * 0.32)), 2)
        cx = round(minx + b_w / 2.0, 2)
        cy = round(miny + b_d / 2.0, 2)
        vx1 = round(cx - void_w / 2.0, 2)
        vy1 = round(cy - void_d / 2.0, 2)
        vx2 = round(cx + void_w / 2.0, 2)
        vy2 = round(cy + void_d / 2.0, 2)

        courtyard_frag = OutdoorFragment(
            fragment_id="COURTYARD_CENTRAL",
            name="Central Courtyard",
            area_sqm=round(void_w * void_d, 2),
            centroid=(cx, cy),
            polygon_coords=[(vx1, vy1), (vx2, vy1), (vx2, vy2), (vx1, vy2)],
        )

        w_a_x = round(minx + 0.5, 2)
        w_a_y = round(miny + 0.5, 2)
        w_a_w = round(b_w - 1.0, 2)
        w_a_d = round(max(5.0, vy1 - miny - 0.5), 2)

        w_b_x = round(minx + 0.5, 2)
        w_b_y = round(vy1, 2)
        w_b_w = round(max(4.5, vx1 - minx - 0.5), 2)
        w_b_d = round(max(6.0, maxy - 0.5 - vy1), 2)

        wing_a = FootprintWing(
            wing_id="WING_A",
            label="Wing A (Public)",
            zone_type="public",
            x=w_a_x,
            y=w_a_y,
            width_m=w_a_w,
            depth_m=w_a_d,
            area_sqm=round(w_a_w * w_a_d, 2),
            corner_vertices=[(w_a_x, w_a_y), (w_a_x + w_a_w, w_a_y), (w_a_x + w_a_w, w_a_y + w_a_d), (w_a_x, w_a_y + w_a_d)],
        )
        wing_b = FootprintWing(
            wing_id="WING_B",
            label="Wing B (Private)",
            zone_type="private",
            x=w_b_x,
            y=w_b_y,
            width_m=w_b_w,
            depth_m=w_b_d,
            area_sqm=round(w_b_w * w_b_d, 2),
            corner_vertices=[(w_b_x, w_b_y), (w_b_x + w_b_w, w_b_y), (w_b_x + w_b_w, w_b_y + w_b_d), (w_b_x, w_b_y + w_b_d)],
        )

        core_d = round(max(3.5, w_a_d * 0.45), 2)
        corr_x = w_b_x
        corr_y = round(w_a_y + core_d, 2)
        corr_w = min(3.0, w_b_w)
        corr_d = round(w_a_d - core_d, 2)
        corr_link = CorridorLink(
            link_id="CORR_01",
            from_wing_id="WING_A",
            to_wing_id="WING_B",
            x=corr_x,
            y=corr_y,
            width_m=corr_w,
            depth_m=corr_d,
            area_sqm=round(corr_w * corr_d, 2),
            polygon_coords=[(corr_x, corr_y), (corr_x + corr_w, corr_y), (corr_x + corr_w, corr_y + corr_d), (corr_x, corr_y + corr_d)],
        )

        tot_w = round(b_w - 1.0, 2)
        tot_d = round(b_d - 1.0, 2)
        tot_area = round(wing_a.area_sqm + wing_b.area_sqm, 2)

        return InscribedFootprint(
            x=w_a_x,
            y=w_a_y,
            width_m=tot_w,
            depth_m=tot_d,
            area_sqm=tot_area,
            rotation_angle_deg=0.0,
            center_x=cx,
            center_y=cy,
            corner_vertices=[(w_a_x, w_a_y), (w_a_x + tot_w, w_a_y), (w_a_x + tot_w, w_a_y + tot_d), (w_a_x, w_a_y + tot_d)],
            topology_type="courtyard",
            wings=[wing_a, wing_b],
            corridors=[corr_link],
            courtyard_void=courtyard_frag,
        )

    # 3. L-Shape / Concave / Multi-Wing Decomposition
    rect_a = find_largest_inscribed_rectangle(buildable_poly, grid_step=0.5, candidate_orientations=[0.0])
    if not rect_a:
        rect_a = find_largest_inscribed_rectangle(buildable_poly, grid_step=0.25)

    if not rect_a:
        minx, miny, maxx, maxy = buildable_poly.bounds
        w = round(max(4.0, (maxx - minx) * 0.8), 2)
        d = round(max(4.0, (maxy - miny) * 0.8), 2)
        wing_a = FootprintWing(
            wing_id="WING_A",
            label="Wing A (Main)",
            zone_type="public",
            x=round(minx, 2),
            y=round(miny, 2),
            width_m=w,
            depth_m=d,
            area_sqm=round(w * d, 2),
            corner_vertices=[(minx, miny), (minx + w, miny), (minx + w, miny + d), (minx, miny + d)],
        )
        return InscribedFootprint(
            x=round(minx, 2),
            y=round(miny, 2),
            width_m=w,
            depth_m=d,
            area_sqm=round(w * d, 2),
            topology_type="single_rectangle",
            wings=[wing_a],
            corridors=[],
            courtyard_void=None,
        )

    w_a_w = rect_a["width_m"]
    w_a_d = rect_a["depth_m"]
    rcx, rcy = rect_a["center_rot"]
    w_a_x = round(rcx - w_a_w / 2.0, 2)
    w_a_y = round(rcy - w_a_d / 2.0, 2)
    wing_a_box = box(w_a_x, w_a_y, w_a_x + w_a_w, w_a_y + w_a_d)

    wing_a = FootprintWing(
        wing_id="WING_A",
        label="Wing A (Public)",
        zone_type="public",
        x=w_a_x,
        y=w_a_y,
        width_m=w_a_w,
        depth_m=w_a_d,
        area_sqm=round(w_a_w * w_a_d, 2),
        corner_vertices=[(w_a_x, w_a_y), (w_a_x + w_a_w, w_a_y), (w_a_x + w_a_w, w_a_y + w_a_d), (w_a_x, w_a_y + w_a_d)],
    )

    # Subtract Wing A from buildable polygon
    rem_geom = buildable_poly.difference(wing_a_box)
    rem_polys = [g for g in (rem_geom.geoms if isinstance(rem_geom, MultiPolygon) else [rem_geom]) if g.area >= 15.0]

    wing_b: Optional[FootprintWing] = None
    if rem_polys and (is_l_shape or is_extreme_aspect):
        rem_polys.sort(key=lambda p: p.area, reverse=True)
        best_rem = rem_polys[0]
        rect_b = find_largest_inscribed_rectangle(best_rem, grid_step=0.5, candidate_orientations=[0.0])
        if rect_b and rect_b["width_m"] >= 3.0 and rect_b["depth_m"] >= 3.0 and rect_b["area_sqm"] >= 15.0:
            w_b_w = rect_b["width_m"]
            w_b_d = rect_b["depth_m"]
            bcx, bcy = rect_b["center_rot"]
            w_b_x = round(bcx - w_b_w / 2.0, 2)
            w_b_y = round(bcy - w_b_d / 2.0, 2)
            wing_b = FootprintWing(
                wing_id="WING_B",
                label="Wing B (Private)",
                zone_type="private",
                x=w_b_x,
                y=w_b_y,
                width_m=w_b_w,
                depth_m=w_b_d,
                area_sqm=round(w_b_w * w_b_d, 2),
                corner_vertices=[(w_b_x, w_b_y), (w_b_x + w_b_w, w_b_y), (w_b_x + w_b_w, w_b_y + w_b_d), (w_b_x, w_b_y + w_b_d)],
            )

    if wing_b is not None:
        # Step C: Link corridor bridging Wing A and Wing B
        y_touch_1 = abs((wing_a.y + wing_a.depth_m) - wing_b.y) < 0.6
        y_touch_2 = abs((wing_b.y + wing_b.depth_m) - wing_a.y) < 0.6
        x_touch_1 = abs((wing_a.x + wing_a.width_m) - wing_b.x) < 0.6
        x_touch_2 = abs((wing_b.x + wing_b.width_m) - wing_a.x) < 0.6

        if y_touch_1 or y_touch_2:
            shared_y = wing_b.y if y_touch_1 else wing_a.y
            overlap_min_x = max(wing_a.x, wing_b.x)
            overlap_max_x = min(wing_a.x + wing_a.width_m, wing_b.x + wing_b.width_m)
            corr_w = round(max(1.8, min(3.0, overlap_max_x - overlap_min_x)), 2)
            corr_x = overlap_min_x
            if y_touch_1:
                core_d = round(max(3.5, wing_a.depth_m * 0.45), 2)
                corr_y = round(wing_a.y + core_d, 2)
                corr_d = round(wing_a.depth_m - core_d, 2)
            else:
                core_d = round(max(3.5, wing_b.depth_m * 0.45), 2)
                corr_y = round(wing_b.y + core_d, 2)
                corr_d = round(wing_b.depth_m - core_d, 2)
        else:
            shared_x = wing_b.x if x_touch_1 else wing_a.x
            overlap_min_y = max(wing_a.y, wing_b.y)
            overlap_max_y = min(wing_a.y + wing_a.depth_m, wing_b.y + wing_b.depth_m)
            corr_d = round(max(1.8, min(3.0, overlap_max_y - overlap_min_y)), 2)
            corr_y = overlap_min_y
            if x_touch_1:
                core_w = round(max(3.5, wing_a.width_m * 0.45), 2)
                corr_x = round(wing_a.x + core_w, 2)
                corr_w = round(wing_a.width_m - core_w, 2)
            else:
                core_w = round(max(3.5, wing_b.width_m * 0.45), 2)
                corr_x = round(wing_b.x + core_w, 2)
                corr_w = round(wing_b.width_m - core_w, 2)

        corr_link = CorridorLink(
            link_id="CORR_01",
            from_wing_id="WING_A",
            to_wing_id="WING_B",
            x=corr_x,
            y=corr_y,
            width_m=corr_w,
            depth_m=corr_d,
            area_sqm=round(corr_w * corr_d, 2),
            polygon_coords=[(corr_x, corr_y), (corr_x + corr_w, corr_y), (corr_x + corr_w, corr_y + corr_d), (corr_x, corr_y + corr_d)],
        )

        min_fp_x = min(wing_a.x, wing_b.x)
        min_fp_y = min(wing_a.y, wing_b.y)
        max_fp_x = max(wing_a.x + wing_a.width_m, wing_b.x + wing_b.width_m)
        max_fp_y = max(wing_a.y + wing_a.depth_m, wing_b.y + wing_b.depth_m)
        tot_w = round(max_fp_x - min_fp_x, 2)
        tot_d = round(max_fp_y - min_fp_y, 2)
        tot_area = round(wing_a.area_sqm + wing_b.area_sqm, 2)

        return InscribedFootprint(
            x=min_fp_x,
            y=min_fp_y,
            width_m=tot_w,
            depth_m=tot_d,
            area_sqm=tot_area,
            rotation_angle_deg=0.0,
            center_x=round(min_fp_x + tot_w / 2.0, 2),
            center_y=round(min_fp_y + tot_d / 2.0, 2),
            corner_vertices=[(min_fp_x, min_fp_y), (min_fp_x + tot_w, min_fp_y), (min_fp_x + tot_w, min_fp_y + tot_d), (min_fp_x, min_fp_y + tot_d)],
            topology_type="l_shape",
            wings=[wing_a, wing_b],
            corridors=[corr_link],
            courtyard_void=None,
        )

    # Single wing fallback
    return InscribedFootprint(
        x=wing_a.x,
        y=wing_a.y,
        width_m=wing_a.width_m,
        depth_m=wing_a.depth_m,
        area_sqm=wing_a.area_sqm,
        rotation_angle_deg=0.0,
        center_x=round(wing_a.x + wing_a.width_m / 2.0, 2),
        center_y=round(wing_a.y + wing_a.depth_m / 2.0, 2),
        corner_vertices=wing_a.corner_vertices,
        topology_type="single_rectangle",
        wings=[wing_a],
        corridors=[],
        courtyard_void=None,
    )


# =============================================================================
# 6. OUTDOOR DIFFERENCE FRAGMENTS & VASTU
# =============================================================================

def extract_outdoor_fragments(
    buildable_poly: Polygon,
    footprint_poly: Polygon
) -> List[OutdoorFragment]:
    """
    Decomposes (buildable minus footprint) into labelled spatial fragments with areas.
    """
    diff = buildable_poly.difference(footprint_poly)
    fragments: List[OutdoorFragment] = []

    geoms = diff.geoms if isinstance(diff, MultiPolygon) else [diff]
    fx, fy = footprint_poly.centroid.x, footprint_poly.centroid.y

    idx = 1
    for g in geoms:
        if not isinstance(g, Polygon) or g.area < 1.0:
            continue
        gx, gy = g.centroid.x, g.centroid.y
        dx = gx - fx
        dy = gy - fy
        angle = (math.degrees(math.atan2(dx, dy)) + 360.0) % 360.0

        if 315.0 <= angle or angle < 45.0:
            name = f"North Yard {idx}"
        elif 45.0 <= angle < 135.0:
            name = f"East Court {idx}"
        elif 135.0 <= angle < 225.0:
            name = f"South Forecourt {idx}"
        else:
            name = f"West Yard {idx}"

        fragments.append(OutdoorFragment(
            fragment_id=f"OUT-{idx:02d}",
            name=name,
            area_sqm=round(g.area, 2),
            centroid=(round(gx, 2), round(gy, 2)),
            polygon_coords=[(round(x, 2), round(y, 2)) for x, y in g.exterior.coords]
        ))
        idx += 1

    return fragments


def compute_site_vastu_overlay(bounds: Tuple[float, float, float, float]) -> Dict[str, Dict[str, Any]]:
    """
    Generates a site-level 9-zone Vastu Shastra overlay aligned to true North.
    Grid divides plot bounding box into a 3x3 matrix.
    """
    minx, miny, maxx, maxy = bounds
    w = (maxx - minx) / 3.0
    d = (maxy - miny) / 3.0

    zones: Dict[str, Dict[str, Any]] = {}
    row_names = ["South", "Center", "North"]
    col_names = ["West", "Center", "East"]

    zone_map = {
        (2, 0): ("NW", "Vayu (North-West) - Air & Movement"),
        (2, 1): ("N", "Kuber (North) - Wealth & Prosperity"),
        (2, 2): ("NE", "Ishanya (North-East) - Spiritual Source"),
        (1, 0): ("W", "Varuna (West) - Water & Stability"),
        (1, 1): ("BRAHMASTHANA", "Central Sacred Core"),
        (1, 2): ("E", "Indra/Surya (East) - Solar Energy"),
        (0, 0): ("SW", "Nairrutya (South-West) - Earth & Heaviness"),
        (0, 1): ("S", "Yama (South) - Rest & Defense"),
        (0, 2): ("SE", "Agni (South-East) - Fire & Energy"),
    }

    for r in range(3):
        for c in range(3):
            zid, zdesc = zone_map[(r, c)]
            zx1 = round(minx + c * w, 2)
            zy1 = round(miny + r * d, 2)
            zx2 = round(zx1 + w, 2)
            zy2 = round(zy1 + d, 2)
            zones[zid] = {
                "name": zdesc,
                "bounds": [zx1, zy1, zx2, zy2],
                "area_sqm": round(w * d, 2)
            }
    return zones


# =============================================================================
# 7. PRIMARY SITE PLAN SYNTHESIS (CANONICAL PIPELINE)
# =============================================================================

def compute_canonical_site_plan(
    plot_width_m: float,
    plot_depth_m: float,
    coverage: float = 0.60,
    plot_polygon: Optional[PlotPolygonModel] = None,
    program_needed_area_m2: Optional[float] = None,
    inscribed_override: Optional[Dict[str, float]] = None,
    typology: str = "T1_SINGLE_FAMILY",
) -> Tuple[bool, Optional[SitePlanModel], List[str]]:
    """
    Primary canonical site plan synthesis. Consumes PlotPolygon or auto-generates
    4-vertex rectangle from plot_width_m / plot_depth_m.
    Guarantees:
    - 100% BYTE-IDENTICAL rectangle behavior for rectangular plots.
    - Advanced footprint topologies (L-Shapes, Courtyards, Multi-Wing) via wing decomposition.
    """
    warnings: List[str] = []

    # 1. Resolve canonical PlotPolygon
    if plot_polygon is None or not plot_polygon.vertices:
        # Auto-generate 4-vertex rectangle in CCW order starting SW
        coords = [
            (0.0, 0.0),
            (round(plot_width_m, 2), 0.0),
            (round(plot_width_m, 2), round(plot_depth_m, 2)),
            (0.0, round(plot_depth_m, 2)),
        ]
        is_rect = True
        shape_type = "rectangle"
    else:
        is_valid, diags, coords, shape_type = validate_and_canonicalize_polygon(plot_polygon.vertices)
        if not is_valid:
            return False, None, diags
        is_rect = (shape_type == "rectangle")

    poly = Polygon(coords)
    plot_area = round(poly.area, 2)
    perimeter = round(poly.length, 2)
    minx, miny, maxx, maxy = poly.bounds
    bbox_w = round(maxx - minx, 2)
    bbox_d = round(maxy - miny, 2)

    poly_model = PlotPolygonModel(
        vertices=[(round(x, 2), round(y, 2)) for x, y in coords],
        origin_lat=plot_polygon.origin_lat if plot_polygon else None,
        origin_lon=plot_polygon.origin_lon if plot_polygon else None,
        shape_type=shape_type,
        area_sqm=plot_area,
        perimeter_m=perimeter,
        bounding_box=(round(minx, 2), round(miny, 2), round(maxx, 2), round(maxy, 2)),
    )

    # 2. Compute NBC Setbacks & Buildable Polygon
    if is_rect:
        # Exact legacy rectangle setback formula for 100% byte-identical regression
        front_setback = max(1.8, min(3.5, bbox_d * 0.15))
        rear_setback = max(1.2, min(2.5, bbox_d * 0.10))
        side_setback = max(1.0, min(2.0, bbox_w * 0.10))
        nominal_setback = (front_setback + rear_setback + 2 * side_setback) / 4.0

        avail_w = max(4.0, bbox_w - 2 * side_setback)
        avail_d = max(4.0, bbox_d - front_setback - rear_setback)
        avail_area = avail_w * avail_d

        buildable_coords = [
            (round(side_setback, 2), round(front_setback, 2)),
            (round(side_setback + avail_w, 2), round(front_setback, 2)),
            (round(side_setback + avail_w, 2), round(front_setback + avail_d, 2)),
            (round(side_setback, 2), round(front_setback + avail_d, 2)),
        ]
        buildable_poly = Polygon(buildable_coords)
        buildable_area = round(buildable_poly.area, 2)
        reduced_applied = False
    else:
        # Inward buffer for irregular plots
        nominal_setback = max(1.5, min(3.0, min(bbox_w, bbox_d) * 0.12))
        res_poly, act_setback, reduced_applied, buf_warns = compute_buildable_polygon(poly, nominal_setback)
        warnings.extend(buf_warns)
        if res_poly is None:
            return False, None, warnings
        buildable_poly = res_poly
        nominal_setback = act_setback
        buildable_coords = [(round(x, 2), round(y, 2)) for x, y in buildable_poly.exterior.coords]
        buildable_area = round(buildable_poly.area, 2)

    # 3. Footprint synthesis via decomposition
    inscribed_footprint = decompose_buildable_into_wings(
        buildable_poly=buildable_poly,
        shape_type=shape_type,
        plot_w=plot_width_m,
        plot_d=plot_depth_m,
        coverage=coverage,
        typology=typology or "T1_SINGLE_FAMILY",
        is_rect=is_rect,
        inscribed_override=inscribed_override,
        program_needed_area_m2=program_needed_area_m2,
    )

    env_w = inscribed_footprint.width_m
    env_d = inscribed_footprint.depth_m
    env_area = inscribed_footprint.area_sqm

    if inscribed_footprint.wings:
        wing_boxes = [box(w.x, w.y, w.x + w.width_m, w.y + w.depth_m) for w in inscribed_footprint.wings]
        footprint_poly = shapely.unary_union(wing_boxes)
    else:
        footprint_poly = box(
            inscribed_footprint.x,
            inscribed_footprint.y,
            inscribed_footprint.x + inscribed_footprint.width_m,
            inscribed_footprint.y + inscribed_footprint.depth_m
        )

    # 4. Outdoor Difference Fragments & Setback Band
    outdoor_fragments = extract_outdoor_fragments(buildable_poly, footprint_poly)
    setback_band_area = round(max(0.0, plot_area - buildable_area), 2)

    # 5. Survey Edges & Vertex Table
    survey_edges = compute_survey_edges(coords)
    vertex_table = [
        PlotVertex(id=f"P{i+1}", x_m=round(coords[i][0], 2), y_m=round(coords[i][1], 2))
        for i in range(len(coords))
    ]

    # 6. Site-Level Vastu Overlay
    site_vastu = compute_site_vastu_overlay((minx, miny, maxx, maxy))

    # 7. Site Mathematical Certificate
    # Verify footprint containment
    is_contained = buildable_poly.contains(footprint_poly) or footprint_poly.within(buildable_poly.buffer(0.05))
    min_dist_to_boundary = round(footprint_poly.distance(poly.exterior), 2)
    cov_actual = round((env_area / plot_area * 100.0), 1)

    site_cert = SiteCertificate(
        footprint_contained_in_buildable=bool(is_contained),
        setback_distance_satisfied=bool(min_dist_to_boundary >= nominal_setback - 0.10),
        min_setback_achieved_m=min_dist_to_boundary,
        required_setback_m=nominal_setback,
        ground_coverage_actual_pct=cov_actual,
        ground_coverage_limit_pct=coverage * 100.0,
        far_actual=round(env_area * 2 / plot_area, 2),  # Default 2-floor projection
        far_limit=2.5,
        is_valid=bool(is_contained and env_area >= MIN_HABITABLE_FOOTPRINT_M2),
        diagnostics=[] if is_contained else ["Footprint boundary exceeds buildable setback envelope."]
    )

    site_plan = SitePlanModel(
        plot_polygon=poly_model,
        buildable_polygon_coords=buildable_coords,
        buildable_area_sqm=buildable_area,
        nominal_setback_m=nominal_setback,
        reduced_setback_applied=reduced_applied,
        footprint=inscribed_footprint,
        outdoor_zones=outdoor_fragments,
        setback_band_area_sqm=setback_band_area,
        edges=survey_edges,
        vertex_table=vertex_table,
        site_vastu_zones=site_vastu,
        certificate=site_cert,
    )

    return True, site_plan, warnings
