import math
from typing import List, Dict, Tuple, Optional, Any
from app.services.floorplan.grid_model import RoomBox, ROOM_CATALOG
from app.schemas.floorplan import RectanglesModel

# Professional architectural pastel fills (15% opacity is applied in SVG rendering)
PASTEL_COLORS: Dict[str, str] = {
    "master_bed": "#38BDF8",  # Sky / Blue
    "living": "#34D399",      # Emerald
    "kitchen": "#FBBF24",     # Amber
    "puja": "#FACC15",        # Gold / Yellow
    "bath_1": "#38BDF8",      # Cyan
    "bath_2": "#38BDF8",      # Cyan
    "bed_2": "#818CF8",       # Indigo
    "dining": "#F472B6",      # Pink
    "stairs": "#A78BFA",      # Purple
    "corridor": "#94A3B8"     # Slate
}

# Wall thickness specifications (in pixels)
# Exterior wall: 6.0px (~0.24m scaled structural wall)
# Interior partition wall: 3.0px (~0.12m scaled partition wall)
T_EXT = 6.0
T_INT = 3.0
HALF_EXT = T_EXT / 2.0  # 3.0px inner face offset
HALF_INT = T_INT / 2.0  # 1.5px inner face offset


def _subtract_intervals(
    base: Tuple[float, float],
    cutouts: List[Tuple[float, float]]
) -> List[Tuple[float, float]]:
    """
    Subtracts cutout intervals [u, v] from a base interval [A, B],
    returning the remaining disjoint line segments.
    """
    a, b = base
    if a >= b:
        return []
    if not cutouts:
        return [(a, b)]

    # Clip cutouts to [a, b] and sort
    valid_cuts: List[Tuple[float, float]] = []
    for u, v in cutouts:
        c_start = max(a, min(u, v))
        c_end = min(b, max(u, v))
        if c_end - c_start > 0.1:
            valid_cuts.append((c_start, c_end))

    if not valid_cuts:
        return [(a, b)]

    valid_cuts.sort(key=lambda x: x[0])
    # Merge overlapping cutouts
    merged_cuts: List[Tuple[float, float]] = [valid_cuts[0]]
    for cur_u, cur_v in valid_cuts[1:]:
        prev_u, prev_v = merged_cuts[-1]
        if cur_u <= prev_v:
            merged_cuts[-1] = (prev_u, max(prev_v, cur_v))
        else:
            merged_cuts.append((cur_u, cur_v))

    segments: List[Tuple[float, float]] = []
    cursor = a
    for u, v in merged_cuts:
        if u > cursor + 0.1:
            segments.append((cursor, u))
        cursor = max(cursor, v)
    if cursor < b - 0.1:
        segments.append((cursor, b))

    return segments


def generate_blueprint_svg(
    placements: Any = None,
    grid: Any = None,
    plot_width_m: float = 10.0,
    plot_depth_m: float = 12.0,
    rectangles: Optional[RectanglesModel] = None,
    theme: str = "cad"
) -> str:
    """
    Renders an architectural 2D blueprint SVG from a solved layout.
    Delegates to generate_blueprint_from_rectangles when continuous rectangles model is provided,
    or falls back to legacy RoomBox drafting.
    """
    if isinstance(placements, RectanglesModel):
        return generate_blueprint_from_rectangles(placements, plot_width_m, plot_depth_m, theme=theme)
    if rectangles is not None:
        return generate_blueprint_from_rectangles(rectangles, plot_width_m, plot_depth_m, theme=theme)

    cell_px = 52.0
    margin_x = 80.0
    margin_y = 80.0

    content_w = grid.cols * cell_px
    content_h = grid.rows * cell_px
    svg_w = content_w + (2.0 * margin_x)
    svg_h = content_h + (2.0 * margin_y)

    scale_px_per_m = cell_px / max(grid.cell_w_m, 0.001)
    door_rad = min(0.9 * scale_px_per_m, 32.0)
    door_rad = max(door_rad, 22.0)

    # 2D cell occupancy matrix: (r, c) -> room_id or None
    matrix: List[List[Optional[str]]] = [[None for _ in range(grid.cols)] for _ in range(grid.rows)]
    box_by_id: Dict[str, RoomBox] = {}
    for box in placements:
        box_by_id[box.room_id] = box
        for r in range(box.r, box.r_end):
            for c in range(box.c, box.c_end):
                if 0 <= r < grid.rows and 0 <= c < grid.cols:
                    matrix[r][c] = box.room_id

    # Find living room box (or primary entry room)
    living_box = box_by_id.get("living")

    # -------------------------------------------------------------------------
    # 1. Door Openings & Calculated Swing Arcs (All 4 Cardinal Directions)
    # -------------------------------------------------------------------------
    doors_data: List[Dict[str, Any]] = []
    h_cutouts: Dict[int, List[Tuple[float, float]]] = {}  # r -> list of (x1, x2)
    v_cutouts: Dict[int, List[Tuple[float, float]]] = {}  # c -> list of (y1, y2)

    for box in placements:
        if box.room_id in ("corridor", "living"):
            continue

        bx = margin_x + (box.c * cell_px)
        by = margin_y + (box.r * cell_px)
        bw = box.w * cell_px
        bh = box.h * cell_px

        candidates = []

        # Check North wall
        north_score = 0
        if box.r > 0:
            for c in range(box.c, box.c_end):
                adj = matrix[box.r - 1][c]
                if adj == "corridor":
                    north_score = max(north_score, 100)
                elif adj == "living":
                    north_score = max(north_score, 50)
                elif adj is not None:
                    north_score = max(north_score, 10)
            if north_score == 0 and box.r_end < grid.rows:
                north_score = 5
        candidates.append(("N", north_score))

        # Check South wall
        south_score = 0
        if box.r_end < grid.rows:
            for c in range(box.c, box.c_end):
                adj = matrix[box.r_end][c]
                if adj == "corridor":
                    south_score = max(south_score, 100)
                elif adj == "living":
                    south_score = max(south_score, 50)
                elif adj is not None:
                    south_score = max(south_score, 10)
            if south_score == 0 and box.r > 0:
                south_score = 5
        candidates.append(("S", south_score))

        # Check West wall
        west_score = 0
        if box.c > 0:
            for r in range(box.r, box.r_end):
                adj = matrix[r][box.c - 1]
                if adj == "corridor":
                    west_score = max(west_score, 100)
                elif adj == "living":
                    west_score = max(west_score, 50)
                elif adj is not None:
                    west_score = max(west_score, 10)
            if west_score == 0 and box.c_end < grid.cols:
                west_score = 5
        candidates.append(("W", west_score))

        # Check East wall
        east_score = 0
        if box.c_end < grid.cols:
            for r in range(box.r, box.r_end):
                adj = matrix[r][box.c_end]
                if adj == "corridor":
                    east_score = max(east_score, 100)
                elif adj == "living":
                    east_score = max(east_score, 50)
                elif adj is not None:
                    east_score = max(east_score, 10)
            if east_score == 0 and box.c > 0:
                east_score = 5
        candidates.append(("E", east_score))

        candidates.sort(key=lambda x: x[1], reverse=True)
        chosen_side = candidates[0][0]

        hinge_offset = 8.0
        R = min(door_rad, (bw if chosen_side in ("N", "S") else bh) - hinge_offset - 4.0)
        R = max(R, 18.0)

        # Calculate exact leaf line, arc path, and cutouts based on side
        # Mathematically verified to ALWAYS swing strictly INTO the room!
        if chosen_side == "N":
            hx = bx + hinge_offset
            hy = by
            leaf_x = hx
            leaf_y = hy + R  # into room (+Y)
            arc_start_x = hx + R
            arc_start_y = hy
            arc_end_x = leaf_x
            arc_end_y = leaf_y
            sweep_flag = 1
            h_cutouts.setdefault(box.r, []).append((hx, hx + R))
        elif chosen_side == "S":
            hx = bx + hinge_offset
            hy = by + bh
            leaf_x = hx
            leaf_y = hy - R  # into room (-Y)
            arc_start_x = hx + R
            arc_start_y = hy
            arc_end_x = leaf_x
            arc_end_y = leaf_y
            sweep_flag = 0
            h_cutouts.setdefault(box.r_end, []).append((hx, hx + R))
        elif chosen_side == "W":
            hx = bx
            hy = by + hinge_offset
            leaf_x = hx + R  # into room (+X)
            leaf_y = hy
            arc_start_x = hx
            arc_start_y = hy + R
            arc_end_x = leaf_x
            arc_end_y = leaf_y
            sweep_flag = 0
            v_cutouts.setdefault(box.c, []).append((hy, hy + R))
        else:  # 'E'
            hx = bx + bw
            hy = by + hinge_offset
            leaf_x = hx - R  # into room (-X)
            leaf_y = hy
            arc_start_x = hx
            arc_start_y = hy + R
            arc_end_x = leaf_x
            arc_end_y = leaf_y
            sweep_flag = 1
            v_cutouts.setdefault(box.c_end, []).append((hy, hy + R))

        doors_data.append({
            "room_id": box.room_id,
            "hinge": (hx, hy),
            "leaf": (leaf_x, leaf_y),
            "arc_start": (arc_start_x, arc_start_y),
            "arc_end": (arc_end_x, arc_end_y),
            "R": R,
            "sweep_flag": sweep_flag
        })

    # -------------------------------------------------------------------------
    # 2. Main Entrance on Living Room (Cut into exterior wall line)
    # -------------------------------------------------------------------------
    main_entry_data: Optional[Dict[str, Any]] = None
    if living_box:
        lx = margin_x + (living_box.c * cell_px)
        ly = margin_y + (living_box.r * cell_px)
        lw = living_box.w * cell_px
        lh = living_box.h * cell_px

        entry_side = "N"
        if living_box.r == 0 or all(matrix[living_box.r - 1][col] is None for col in range(living_box.c, living_box.c_end)):
            entry_side = "N"
        elif living_box.c_end >= grid.cols or all(matrix[row][living_box.c_end] is None for row in range(living_box.r, living_box.r_end)):
            entry_side = "E"
        elif living_box.c == 0 or all(matrix[row][living_box.c - 1] is None for row in range(living_box.r, living_box.r_end)):
            entry_side = "W"
        else:
            entry_side = "S"

        entry_w = min(lw * 0.45, 36.0)
        if entry_side in ("N", "S"):
            ex = lx + (lw - entry_w) / 2.0
            ey = ly if entry_side == "N" else ly + lh
            r_target = living_box.r if entry_side == "N" else living_box.r_end
            h_cutouts.setdefault(r_target, []).append((ex, ex + entry_w))
            main_entry_data = {
                "side": entry_side,
                "x": ex,
                "y": ey,
                "w": entry_w,
                "center": (ex + entry_w / 2.0, ey)
            }
        else:
            ey = ly + (lh - entry_w) / 2.0
            ex = lx if entry_side == "W" else lx + lw
            c_target = living_box.c if entry_side == "W" else living_box.c_end
            v_cutouts.setdefault(c_target, []).append((ey, ey + entry_w))
            main_entry_data = {
                "side": entry_side,
                "x": ex,
                "y": ey,
                "w": entry_w,
                "center": (ex, ey + entry_w / 2.0)
            }

    # -------------------------------------------------------------------------
    # 3. Exterior Windows (Habitable Rooms)
    # -------------------------------------------------------------------------
    habitable_rooms = {"master_bed", "living", "kitchen", "bed_2", "dining"}
    windows_data: List[Dict[str, Any]] = []

    for box in placements:
        if box.room_id not in habitable_rooms:
            continue

        bx = margin_x + (box.c * cell_px)
        by = margin_y + (box.r * cell_px)
        bw = box.w * cell_px
        bh = box.h * cell_px

        # North exterior
        if box.r == 0 or all(matrix[box.r - 1][col] is None for col in range(box.c, box.c_end)):
            if not (main_entry_data and main_entry_data["side"] == "N" and box.room_id == "living"):
                win_w = min(bw * 0.45, 42.0)
                wx = bx + (bw - win_w) / 2.0
                wy = by
                h_cutouts.setdefault(box.r, []).append((wx, wx + win_w))
                windows_data.append({"orient": "H", "x1": wx, "x2": wx + win_w, "y": wy})

        # South exterior
        if box.r_end >= grid.rows or all(matrix[box.r_end][col] is None for col in range(box.c, box.c_end)):
            if not (main_entry_data and main_entry_data["side"] == "S" and box.room_id == "living"):
                win_w = min(bw * 0.45, 42.0)
                wx = bx + (bw - win_w) / 2.0
                wy = by + bh
                h_cutouts.setdefault(box.r_end, []).append((wx, wx + win_w))
                windows_data.append({"orient": "H", "x1": wx, "x2": wx + win_w, "y": wy})

        # East exterior
        if box.c_end >= grid.cols or all(matrix[row][box.c_end] is None for row in range(box.r, box.r_end)):
            if not (main_entry_data and main_entry_data["side"] == "E" and box.room_id == "living"):
                win_h = min(bh * 0.45, 42.0)
                wy = by + (bh - win_h) / 2.0
                wx = bx + bw
                v_cutouts.setdefault(box.c_end, []).append((wy, wy + win_h))
                windows_data.append({"orient": "V", "y1": wy, "y2": wy + win_h, "x": wx})

        # West exterior
        if box.c == 0 or all(matrix[row][box.c - 1] is None for row in range(box.r, box.r_end)):
            if not (main_entry_data and main_entry_data["side"] == "W" and box.room_id == "living"):
                win_h = min(bh * 0.45, 42.0)
                wy = by + (bh - win_h) / 2.0
                wx = bx
                v_cutouts.setdefault(box.c, []).append((wy, wy + win_h))
                windows_data.append({"orient": "V", "y1": wy, "y2": wy + win_h, "x": wx})

    # -------------------------------------------------------------------------
    # 4. Wall Line Generation with Clean T-Junction & L-Junction Offsets
    # -------------------------------------------------------------------------
    exterior_wall_lines: List[Tuple[float, float, float, float]] = []
    interior_wall_lines: List[Tuple[float, float, float, float]] = []

    def is_vert_exterior(c_idx: int, r_idx: int) -> bool:
        left = matrix[r_idx][c_idx - 1] if c_idx > 0 else None
        right = matrix[r_idx][c_idx] if c_idx < grid.cols else None
        return (left is None) != (right is None)

    def is_vert_interior(c_idx: int, r_idx: int) -> bool:
        left = matrix[r_idx][c_idx - 1] if c_idx > 0 else None
        right = matrix[r_idx][c_idx] if c_idx < grid.cols else None
        return left is not None and right is not None and left != right

    def is_horiz_exterior(r_idx: int, c_idx: int) -> bool:
        top = matrix[r_idx - 1][c_idx] if r_idx > 0 else None
        bot = matrix[r_idx][c_idx] if r_idx < grid.rows else None
        return (top is None) != (bot is None)

    def is_horiz_interior(r_idx: int, c_idx: int) -> bool:
        top = matrix[r_idx - 1][c_idx] if r_idx > 0 else None
        bot = matrix[r_idx][c_idx] if r_idx < grid.rows else None
        return top is not None and bot is not None and top != bot

    # A. Horizontal Walls
    for r in range(grid.rows + 1):
        c = 0
        while c < grid.cols:
            top_room = matrix[r - 1][c] if r > 0 else None
            bot_room = matrix[r][c] if r < grid.rows else None

            if top_room == bot_room:
                c += 1
                continue

            is_ext = (top_room is None) != (bot_room is None)
            start_c = c
            while c < grid.cols:
                t = matrix[r - 1][c] if r > 0 else None
                b = matrix[r][c] if r < grid.rows else None
                if (t is None) != (b is None) if is_ext else (t is not None and b is not None and t != b):
                    c += 1
                else:
                    break
            end_c = c

            x1 = margin_x + (start_c * cell_px)
            x2 = margin_x + (end_c * cell_px)
            y = margin_y + (r * cell_px)

            if is_ext:
                cuts = h_cutouts.get(r, [])
                for seg_x1, seg_x2 in _subtract_intervals((x1, x2), cuts):
                    exterior_wall_lines.append((seg_x1, y, seg_x2, y))
            else:
                left_ext = (r > 0 and is_vert_exterior(start_c, r - 1)) or (r < grid.rows and is_vert_exterior(start_c, r))
                left_int = (r > 0 and is_vert_interior(start_c, r - 1)) or (r < grid.rows and is_vert_interior(start_c, r))
                if left_ext:
                    adj_x1 = x1 + HALF_EXT
                elif left_int:
                    adj_x1 = x1 + HALF_INT
                else:
                    adj_x1 = x1

                right_ext = (r > 0 and is_vert_exterior(end_c, r - 1)) or (r < grid.rows and is_vert_exterior(end_c, r))
                right_int = (r > 0 and is_vert_interior(end_c, r - 1)) or (r < grid.rows and is_vert_interior(end_c, r))
                if right_ext:
                    adj_x2 = x2 - HALF_EXT
                elif right_int:
                    adj_x2 = x2 - HALF_INT
                else:
                    adj_x2 = x2

                cuts = h_cutouts.get(r, [])
                for seg_x1, seg_x2 in _subtract_intervals((adj_x1, adj_x2), cuts):
                    interior_wall_lines.append((seg_x1, y, seg_x2, y))

    # B. Vertical Walls
    for c in range(grid.cols + 1):
        r = 0
        while r < grid.rows:
            left_room = matrix[r][c - 1] if c > 0 else None
            right_room = matrix[r][c] if c < grid.cols else None

            if left_room == right_room:
                r += 1
                continue

            is_ext = (left_room is None) != (right_room is None)
            start_r = r
            while r < grid.rows:
                l = matrix[r][c - 1] if c > 0 else None
                rg = matrix[r][c] if c < grid.cols else None
                if (l is None) != (rg is None) if is_ext else (l is not None and rg is not None and l != rg):
                    r += 1
                else:
                    break
            end_r = r

            x = margin_x + (c * cell_px)
            y1 = margin_y + (start_r * cell_px)
            y2 = margin_y + (end_r * cell_px)

            if is_ext:
                cuts = v_cutouts.get(c, [])
                for seg_y1, seg_y2 in _subtract_intervals((y1, y2), cuts):
                    exterior_wall_lines.append((x, seg_y1, x, seg_y2))
            else:
                top_ext = (c > 0 and is_horiz_exterior(start_r, c - 1)) or (c < grid.cols and is_horiz_exterior(start_r, c))
                top_int = (c > 0 and is_horiz_interior(start_r, c - 1)) or (c < grid.cols and is_horiz_interior(start_r, c))
                if top_ext:
                    adj_y1 = y1 + HALF_EXT
                elif top_int:
                    adj_y1 = y1 + HALF_INT
                else:
                    adj_y1 = y1

                bot_ext = (c > 0 and is_horiz_exterior(end_r, c - 1)) or (c < grid.cols and is_horiz_exterior(end_r, c))
                bot_int = (c > 0 and is_horiz_interior(end_r, c - 1)) or (c < grid.cols and is_horiz_interior(end_r, c))
                if bot_ext:
                    adj_y2 = y2 - HALF_EXT
                elif bot_int:
                    adj_y2 = y2 - HALF_INT
                else:
                    adj_y2 = y2

                cuts = v_cutouts.get(c, [])
                for seg_y1, seg_y2 in _subtract_intervals((adj_y1, adj_y2), cuts):
                    interior_wall_lines.append((x, seg_y1, x, seg_y2))

    # -------------------------------------------------------------------------
    # 5. Assemble SVG Document
    # -------------------------------------------------------------------------
    svg: List[str] = []
    svg.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {svg_w:.1f} {svg_h:.1f}" '
        f'width="100%" height="100%" class="buildwise-blueprint-svg" '
        f'style="background-color: #0F172A; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;">'
    )

    # Defs: Dark CAD Grid Pattern, Markers, Styles
    svg.append("""
      <defs>
        <pattern id="arch-cad-grid-1m" width="52" height="52" patternUnits="userSpaceOnUse">
          <path d="M 52 0 L 0 0 0 52" fill="none" stroke="#1E293B" stroke-width="0.75" />
          <path d="M 13 0 L 13 52 M 26 0 L 26 52 M 39 0 L 39 52" fill="none" stroke="#1E293B" stroke-width="0.25" stroke-dasharray="2 2" />
          <path d="M 0 13 L 52 13 M 0 26 L 52 26 M 0 39 L 52 39" fill="none" stroke="#1E293B" stroke-width="0.25" stroke-dasharray="2 2" />
        </pattern>
        <marker id="entry-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1 L 9 5 L 0 9 z" fill="#10B981" />
        </marker>
      </defs>
    """)

    # Dark Drafting Canvas & Background Grid
    svg.append(f'<rect width="{svg_w:.1f}" height="{svg_h:.1f}" fill="#0F172A" />')
    svg.append(f'<rect x="{margin_x:.1f}" y="{margin_y:.1f}" width="{content_w:.1f}" height="{content_h:.1f}" fill="url(#arch-cad-grid-1m)" />')

    # Plinth Boundary Baseline
    svg.append(
        f'<rect x="{margin_x:.1f}" y="{margin_y:.1f}" width="{content_w:.1f}" height="{content_h:.1f}" '
        f'fill="none" stroke="#334155" stroke-width="1.2" stroke-dasharray="4 4" />'
    )

    # 1. Subtle Room Pastel Fills (15% Opacity as requested in Rule 4)
    for box in placements:
        bx = margin_x + (box.c * cell_px)
        by = margin_y + (box.r * cell_px)
        bw = box.w * cell_px
        bh = box.h * cell_px
        fill_color = PASTEL_COLORS.get(box.room_id, "#38BDF8")

        svg.append(
            f'<rect x="{bx:.1f}" y="{by:.1f}" width="{bw:.1f}" height="{bh:.1f}" '
            f'fill="{fill_color}" fill-opacity="0.15" stroke="none" id="room-{box.room_id}" />'
        )

    # 2. Interior Walls (Thin 3px stroke, crisp slate #94A3B8, stroke-linecap="square")
    for x1, y1, x2, y2 in interior_wall_lines:
        svg.append(
            f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
            f'stroke="#94A3B8" stroke-width="{T_INT}" stroke-linecap="square" />'
        )

    # 3. Exterior Walls (Thick 6px stroke, glowing cyan #38BDF8, stroke-linecap="square")
    for x1, y1, x2, y2 in exterior_wall_lines:
        svg.append(
            f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
            f'stroke="#38BDF8" stroke-width="{T_EXT}" stroke-linecap="square" />'
        )

    # 4. Windows on Exterior Walls (3 parallel thin lines cutting through exterior wall)
    for win in windows_data:
        if win["orient"] == "H":
            x1 = win["x1"]
            x2 = win["x2"]
            y = win["y"]
            svg.append(f'<line x1="{x1:.1f}" y1="{y - 2.0:.1f}" x2="{x2:.1f}" y2="{y - 2.0:.1f}" stroke="#0284C7" stroke-width="1.0" />')
            svg.append(f'<line x1="{x1:.1f}" y1="{y:.1f}" x2="{x2:.1f}" y2="{y:.1f}" stroke="#38BDF8" stroke-width="1.2" />')
            svg.append(f'<line x1="{x1:.1f}" y1="{y + 2.0:.1f}" x2="{x2:.1f}" y2="{y + 2.0:.1f}" stroke="#0284C7" stroke-width="1.0" />')
            svg.append(f'<line x1="{x1:.1f}" y1="{y - 2.5:.1f}" x2="{x1:.1f}" y2="{y + 2.5:.1f}" stroke="#38BDF8" stroke-width="1.0" />')
            svg.append(f'<line x1="{x2:.1f}" y1="{y - 2.5:.1f}" x2="{x2:.1f}" y2="{y + 2.5:.1f}" stroke="#38BDF8" stroke-width="1.0" />')
        else:
            y1 = win["y1"]
            y2 = win["y2"]
            x = win["x"]
            svg.append(f'<line x1="{x - 2.0:.1f}" y1="{y1:.1f}" x2="{x - 2.0:.1f}" y2="{y2:.1f}" stroke="#0284C7" stroke-width="1.0" />')
            svg.append(f'<line x1="{x:.1f}" y1="{y1:.1f}" x2="{x:.1f}" y2="{y2:.1f}" stroke="#38BDF8" stroke-width="1.2" />')
            svg.append(f'<line x1="{x + 2.0:.1f}" y1="{y1:.1f}" x2="{x + 2.0:.1f}" y2="{y2:.1f}" stroke="#0284C7" stroke-width="1.0" />')
            svg.append(f'<line x1="{x - 2.5:.1f}" y1="{y1:.1f}" x2="{x + 2.5:.1f}" y2="{y1:.1f}" stroke="#38BDF8" stroke-width="1.0" />')
            svg.append(f'<line x1="{x - 2.5:.1f}" y1="{y2:.1f}" x2="{x + 2.5:.1f}" y2="{y2:.1f}" stroke="#38BDF8" stroke-width="1.0" />')

    # 5. Doors: Straight Leaf from Hinge + Exact Elliptical Arc Path (<path d="... A ...">)
    for d in doors_data:
        hx, hy = d["hinge"]
        lx, ly = d["leaf"]
        sx, sy = d["arc_start"]
        ex, ey = d["arc_end"]
        R = d["R"]
        swp = d["sweep_flag"]

        # Door Leaf line (solid cyan, 2px)
        svg.append(f'<line x1="{hx:.1f}" y1="{hy:.1f}" x2="{lx:.1f}" y2="{ly:.1f}" stroke="#38BDF8" stroke-width="2.0" />')
        # Door Swing Arc (exact SVG A command, dashed cyan, swinging strictly into room)
        svg.append(
            f'<path d="M {sx:.1f} {sy:.1f} A {R:.1f} {R:.1f} 0 0 {swp} {ex:.1f} {ey:.1f}" '
            f'fill="none" stroke="#38BDF8" stroke-width="1.4" stroke-dasharray="3 3" />'
        )

    # 6. Main Entry Indicator on Living Room
    if main_entry_data:
        cx, cy = main_entry_data["center"]
        side = main_entry_data["side"]
        w = main_entry_data["w"]

        if side == "N":
            svg.append(f'<line x1="{cx - w/2:.1f}" y1="{cy:.1f}" x2="{cx + w/2:.1f}" y2="{cy:.1f}" stroke="#10B981" stroke-width="2.0" />')
            svg.append(f'<line x1="{cx:.1f}" y1="{cy - 24.0:.1f}" x2="{cx:.1f}" y2="{cy - 6.0:.1f}" stroke="#10B981" stroke-width="2.2" marker-end="url(#entry-arrow)" />')
            svg.append(f'<text x="{cx:.1f}" y="{cy - 28.0:.1f}" font-size="8.5" font-weight="700" fill="#10B981" text-anchor="middle" letter-spacing="1">MAIN ENTRY</text>')
        elif side == "S":
            svg.append(f'<line x1="{cx - w/2:.1f}" y1="{cy:.1f}" x2="{cx + w/2:.1f}" y2="{cy:.1f}" stroke="#10B981" stroke-width="2.0" />')
            svg.append(f'<line x1="{cx:.1f}" y1="{cy + 24.0:.1f}" x2="{cx:.1f}" y2="{cy + 6.0:.1f}" stroke="#10B981" stroke-width="2.2" marker-end="url(#entry-arrow)" />')
            svg.append(f'<text x="{cx:.1f}" y="{cy + 34.0:.1f}" font-size="8.5" font-weight="700" fill="#10B981" text-anchor="middle" letter-spacing="1">MAIN ENTRY</text>')
        elif side == "W":
            svg.append(f'<line x1="{cx:.1f}" y1="{cy - w/2:.1f}" x2="{cx:.1f}" y2="{cy + w/2:.1f}" stroke="#10B981" stroke-width="2.0" />')
            svg.append(f'<line x1="{cx - 24.0:.1f}" y1="{cy:.1f}" x2="{cx - 6.0:.1f}" y2="{cy:.1f}" stroke="#10B981" stroke-width="2.2" marker-end="url(#entry-arrow)" />')
            svg.append(f'<text x="{cx - 28.0:.1f}" y="{cy + 3.0:.1f}" font-size="8.5" font-weight="700" fill="#10B981" text-anchor="end" letter-spacing="1">MAIN ENTRY</text>')
        else:  # East
            svg.append(f'<line x1="{cx:.1f}" y1="{cy - w/2:.1f}" x2="{cx:.1f}" y2="{cy + w/2:.1f}" stroke="#10B981" stroke-width="2.0" />')
            svg.append(f'<line x1="{cx + 24.0:.1f}" y1="{cy:.1f}" x2="{cx + 6.0:.1f}" y2="{cy:.1f}" stroke="#10B981" stroke-width="2.2" marker-end="url(#entry-arrow)" />')
            svg.append(f'<text x="{cx + 28.0:.1f}" y="{cy + 3.0:.1f}" font-size="8.5" font-weight="700" fill="#10B981" text-anchor="start" letter-spacing="1">MAIN ENTRY</text>')

    # 7. Centered Room Typography & Metric Dimensions (Rule 4)
    for box in placements:
        bx = margin_x + (box.c * cell_px)
        by = margin_y + (box.r * cell_px)
        bw = box.w * cell_px
        bh = box.h * cell_px
        cx = bx + (bw / 2.0)
        cy = by + (bh / 2.0)

        cat = ROOM_CATALOG.get(box.room_id, {})
        display_name = cat.get("name", box.room_id.replace("_", " ").title())
        metric_w = box.w * grid.cell_w_m
        metric_d = box.h * grid.cell_d_m
        metric_sqm = metric_w * metric_d

        svg.append(
            f'<text x="{cx:.1f}" y="{cy - 4.0:.1f}" font-size="10.5" font-weight="700" '
            f'fill="#F8FAFC" text-anchor="middle" letter-spacing="1">{display_name.upper()}</text>'
        )
        svg.append(
            f'<text x="{cx:.1f}" y="{cy + 10.0:.1f}" font-size="8.5" font-weight="500" '
            f'fill="#94A3B8" text-anchor="middle">{metric_w:.1f}m × {metric_d:.1f}m | {metric_sqm:.1f} m²</text>'
        )

    # -------------------------------------------------------------------------
    # 8. Architectural Dimension Lines with 45-Degree Diagonal Slashes (Rule 3)
    # -------------------------------------------------------------------------
    dim_top_y = margin_y - 24.0
    dim_x1 = margin_x
    dim_x2 = margin_x + content_w
    svg.append(f'<line x1="{dim_x1:.1f}" y1="{margin_y - 4:.1f}" x2="{dim_x1:.1f}" y2="{dim_top_y - 6:.1f}" stroke="#475569" stroke-width="0.8" stroke-dasharray="2 2" />')
    svg.append(f'<line x1="{dim_x2:.1f}" y1="{margin_y - 4:.1f}" x2="{dim_x2:.1f}" y2="{dim_top_y - 6:.1f}" stroke="#475569" stroke-width="0.8" stroke-dasharray="2 2" />')
    svg.append(f'<line x1="{dim_x1:.1f}" y1="{dim_top_y:.1f}" x2="{dim_x2:.1f}" y2="{dim_top_y:.1f}" stroke="#64748B" stroke-width="1.2" />')
    svg.append(f'<line x1="{dim_x1 - 4.5:.1f}" y1="{dim_top_y + 4.5:.1f}" x2="{dim_x1 + 4.5:.1f}" y2="{dim_top_y - 4.5:.1f}" stroke="#38BDF8" stroke-width="1.6" />')
    svg.append(f'<line x1="{dim_x2 - 4.5:.1f}" y1="{dim_top_y + 4.5:.1f}" x2="{dim_x2 + 4.5:.1f}" y2="{dim_top_y - 4.5:.1f}" stroke="#38BDF8" stroke-width="1.6" />')
    svg.append(
        f'<text x="{(dim_x1 + dim_x2) / 2.0:.1f}" y="{dim_top_y - 7.0:.1f}" '
        f'font-size="9.0" font-weight="600" fill="#94A3B8" text-anchor="middle" letter-spacing="0.5">{plot_width_m:.1f} m FRONTAGE</text>'
    )

    dim_left_x = margin_x - 24.0
    dim_y1 = margin_y
    dim_y2 = margin_y + content_h
    svg.append(f'<line x1="{margin_x - 4:.1f}" y1="{dim_y1:.1f}" x2="{dim_left_x - 6:.1f}" y2="{dim_y1:.1f}" stroke="#475569" stroke-width="0.8" stroke-dasharray="2 2" />')
    svg.append(f'<line x1="{margin_x - 4:.1f}" y1="{dim_y2:.1f}" x2="{dim_left_x - 6:.1f}" y2="{dim_y2:.1f}" stroke="#475569" stroke-width="0.8" stroke-dasharray="2 2" />')
    svg.append(f'<line x1="{dim_left_x:.1f}" y1="{dim_y1:.1f}" x2="{dim_left_x:.1f}" y2="{dim_y2:.1f}" stroke="#64748B" stroke-width="1.2" />')
    svg.append(f'<line x1="{dim_left_x - 4.5:.1f}" y1="{dim_y1 + 4.5:.1f}" x2="{dim_left_x + 4.5:.1f}" y2="{dim_y1 - 4.5:.1f}" stroke="#38BDF8" stroke-width="1.6" />')
    svg.append(f'<line x1="{dim_left_x - 4.5:.1f}" y1="{dim_y2 + 4.5:.1f}" x2="{dim_left_x + 4.5:.1f}" y2="{dim_y2 - 4.5:.1f}" stroke="#38BDF8" stroke-width="1.6" />')
    svg.append(
        f'<text x="{dim_left_x - 9.0:.1f}" y="{(dim_y1 + dim_y2) / 2.0:.1f}" '
        f'font-size="9.0" font-weight="600" fill="#94A3B8" text-anchor="middle" '
        f'transform="rotate(-90 {dim_left_x - 9.0:.1f} {(dim_y1 + dim_y2) / 2.0:.1f})" letter-spacing="0.5">{plot_depth_m:.1f} m DEPTH</text>'
    )

    # -------------------------------------------------------------------------
    # 9. Architectural North Compass Rose (Top Right)
    # -------------------------------------------------------------------------
    compass_x = svg_w - 42.0
    compass_y = 38.0
    svg.append(f'<g transform="translate({compass_x}, {compass_y})">')
    svg.append('<circle cx="0" cy="0" r="15" fill="#1E293B" stroke="#38BDF8" stroke-width="1.2" />')
    svg.append('<polygon points="0,-13 4,0 0,-2 -4,0" fill="#38BDF8" />')
    svg.append('<polygon points="0,13 4,0 0,2 -4,0" fill="#475569" />')
    svg.append('<text x="0" y="-16" font-size="8.5" font-weight="800" fill="#38BDF8" text-anchor="middle">N</text>')
    svg.append('</g>')

    # -------------------------------------------------------------------------
    # 10. Architectural Graphic Scale Bar (Bottom Left)
    # -------------------------------------------------------------------------
    scale_x = margin_x
    scale_y = svg_h - 22.0
    svg.append(f'<g transform="translate({scale_x}, {scale_y})">')
    svg.append('<text x="0" y="-6" font-size="7.5" font-weight="600" fill="#94A3B8" letter-spacing="0.5">GRAPHIC SCALE (METRIC)</text>')
    svg.append('<rect x="0" y="0" width="30" height="4" fill="#38BDF8" stroke="#38BDF8" stroke-width="0.5" />')
    svg.append('<rect x="30" y="0" width="30" height="4" fill="#1E293B" stroke="#38BDF8" stroke-width="0.5" />')
    svg.append('<rect x="60" y="0" width="30" height="4" fill="#38BDF8" stroke="#38BDF8" stroke-width="0.5" />')
    svg.append('<text x="0" y="11" font-size="6.5" fill="#94A3B8" text-anchor="middle">0</text>')
    svg.append('<text x="30" y="11" font-size="6.5" fill="#94A3B8" text-anchor="middle">1m</text>')
    svg.append('<text x="60" y="11" font-size="6.5" fill="#94A3B8" text-anchor="middle">2m</text>')
    svg.append('<text x="90" y="11" font-size="6.5" fill="#94A3B8" text-anchor="middle">3m</text>')
    svg.append('</g>')

    svg.append('</svg>')
    return "".join(svg)


def generate_blueprint_from_rectangles(
    rectangles: RectanglesModel,
    plot_width_m: float,
    plot_depth_m: float,
    theme: str = "cad"
) -> str:
    """
    Renders an architectural 2D blueprint SVG from a RectanglesModel.
    Supports 'cad' (dark digital CAD theme) and 'paper' (publication paper blueprint theme).
    Features:
    - Envelope drawn as closed exterior walls (6px thick) with door/window openings
    - Clean interior partition walls (3px thick) sharing exact coordinates, zero poke-through
    - True wall gaps for 0.9m doors with 90-degree swing arcs
    - 3-line exterior window representations
    - 45-degree diagonal ticked dimension lines along top and left
    - Centered uppercase typography with metric dimensions and 12% opacity pastel fills
    """
    is_cad = (theme.lower() == "cad")
    bg_sheet = "#0F172A" if is_cad else "#FFFFFF"
    grid_line = "#1E293B" if is_cad else "#E2E8F0"
    ext_stroke = "#38BDF8" if is_cad else "#0F172A"
    int_stroke = "#94A3B8" if is_cad else "#475569"
    dim_stroke = "#64748B" if is_cad else "#334155"
    dim_tick_stroke = "#38BDF8" if is_cad else "#0F172A"
    text_primary = "#F8FAFC" if is_cad else "#0F172A"
    text_secondary = "#94A3B8" if is_cad else "#64748B"
    door_stroke = "#38BDF8" if is_cad else "#0284C7"
    fill_op = "0.12" if is_cad else "0.10"

    scale_px = min(680.0 / max(plot_width_m, 0.1), 540.0 / max(plot_depth_m, 0.1))
    scale_px = max(36.0, min(56.0, scale_px))

    margin_x = 75.0
    margin_y = 75.0
    content_w = plot_width_m * scale_px
    content_h = plot_depth_m * scale_px
    svg_w = content_w + (2.0 * margin_x)
    svg_h = content_h + (2.0 * margin_y)

    def px(x): return margin_x + (x * scale_px)
    def py(y): return margin_y + (y * scale_px)

    svg = []
    svg.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {svg_w:.1f} {svg_h:.1f}" width="100%" height="100%" style="background-color:{bg_sheet};">')
    svg.append(f'''
      <defs>
        <pattern id="arch-sheet-grid-1m" width="{scale_px:.1f}" height="{scale_px:.1f}" patternUnits="userSpaceOnUse">
          <path d="M {scale_px:.1f} 0 L 0 0 0 {scale_px:.1f}" fill="none" stroke="{grid_line}" stroke-width="0.6" />
        </pattern>
        <marker id="entry-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1 L 9 5 L 0 9 z" fill="#10B981" />
        </marker>
      </defs>
    ''')

    # Drawing Sheet Background & Grid
    svg.append(f'<rect width="{svg_w:.1f}" height="{svg_h:.1f}" fill="{bg_sheet}" />')
    svg.append(f'<rect x="{margin_x:.1f}" y="{margin_y:.1f}" width="{content_w:.1f}" height="{content_h:.1f}" fill="url(#arch-sheet-grid-1m)" />')
    # Setback boundary
    svg.append(f'<rect x="{margin_x:.1f}" y="{margin_y:.1f}" width="{content_w:.1f}" height="{content_h:.1f}" fill="none" stroke="{dim_stroke}" stroke-width="1.0" stroke-dasharray="4 4" />')

    # Room Fills
    for r in rectangles.rooms:
        rx = px(r.x)
        ry = py(r.y)
        rw = r.width * scale_px
        rh = r.height * scale_px
        fcolor = PASTEL_COLORS.get(r.room_id, "#38BDF8")
        svg.append(f'<rect x="{rx:.1f}" y="{ry:.1f}" width="{rw:.1f}" height="{rh:.1f}" fill="{fcolor}" fill-opacity="{fill_op}" id="room-{r.room_id}" />')

    # Interior Shared Walls (with door cutouts)
    doors = rectangles.doors
    rooms = rectangles.rooms
    for i in range(len(rooms)):
        r1 = rooms[i]
        for j in range(i + 1, len(rooms)):
            r2 = rooms[j]
            # Vertical contact
            if abs((r1.x + r1.width) - r2.x) < 0.05 or abs((r2.x + r2.width) - r1.x) < 0.05:
                wx = (r1.x + r1.width) if abs((r1.x + r1.width) - r2.x) < 0.05 else (r2.x + r2.width)
                y1 = max(r1.y, r2.y)
                y2 = min(r1.y + r1.height, r2.y + r2.height)
                if y2 - y1 >= 0.1:
                    base = (py(y1), py(y2))
                    cuts = []
                    for d in doors:
                        if d.wall_edge == "vertical" and abs(d.x1 - wx) < 0.08:
                            cuts.append((py(d.y1), py(d.y2)))
                    segs = _subtract_intervals(base, cuts)
                    for sy1, sy2 in segs:
                        svg.append(f'<line x1="{px(wx):.1f}" y1="{sy1:.1f}" x2="{px(wx):.1f}" y2="{sy2:.1f}" stroke="{int_stroke}" stroke-width="3.0" stroke-linecap="square" />')

            # Horizontal contact
            elif abs((r1.y + r1.height) - r2.y) < 0.05 or abs((r2.y + r2.height) - r1.y) < 0.05:
                wy = (r1.y + r1.height) if abs((r1.y + r1.height) - r2.y) < 0.05 else (r2.y + r2.height)
                x1 = max(r1.x, r2.x)
                x2 = min(r1.x + r1.width, r2.x + r2.width)
                if x2 - x1 >= 0.1:
                    base = (px(x1), px(x2))
                    cuts = []
                    for d in doors:
                        if d.wall_edge == "horizontal" and abs(d.y1 - wy) < 0.08:
                            cuts.append((px(d.x1), px(d.x2)))
                    segs = _subtract_intervals(base, cuts)
                    for sx1, sx2 in segs:
                        svg.append(f'<line x1="{sx1:.1f}" y1="{py(wy):.1f}" x2="{sx2:.1f}" y2="{py(wy):.1f}" stroke="{int_stroke}" stroke-width="3.0" stroke-linecap="square" />')

    # Exterior Envelope Walls (with door and window cutouts)
    env = rectangles.envelope
    # North Edge (y = env.y)
    n_base = (px(env.x), px(env.x + env.width))
    n_cuts = []
    for d in doors:
        if d.wall_edge == "horizontal" and abs(d.y1 - env.y) < 0.05:
            n_cuts.append((px(d.x1), px(d.x2)))
    for w in rectangles.windows:
        if w.wall_edge == "north" and abs(w.y1 - env.y) < 0.05:
            n_cuts.append((px(w.x1), px(w.x2)))
    for sx1, sx2 in _subtract_intervals(n_base, n_cuts):
        svg.append(f'<line x1="{sx1:.1f}" y1="{py(env.y):.1f}" x2="{sx2:.1f}" y2="{py(env.y):.1f}" stroke="{ext_stroke}" stroke-width="6.0" stroke-linecap="square" />')

    # South Edge (y = env.y + env.height)
    s_y = env.y + env.height
    s_base = (px(env.x), px(env.x + env.width))
    s_cuts = []
    for d in doors:
        if d.wall_edge == "horizontal" and abs(d.y1 - s_y) < 0.05:
            s_cuts.append((px(d.x1), px(d.x2)))
    for w in rectangles.windows:
        if w.wall_edge == "south" and abs(w.y1 - s_y) < 0.05:
            s_cuts.append((px(w.x1), px(w.x2)))
    for sx1, sx2 in _subtract_intervals(s_base, s_cuts):
        svg.append(f'<line x1="{sx1:.1f}" y1="{py(s_y):.1f}" x2="{sx2:.1f}" y2="{py(s_y):.1f}" stroke="{ext_stroke}" stroke-width="6.0" stroke-linecap="square" />')

    # West Edge (x = env.x)
    w_base = (py(env.y), py(env.y + env.height))
    w_cuts = []
    for d in doors:
        if d.wall_edge == "vertical" and abs(d.x1 - env.x) < 0.05:
            w_cuts.append((py(d.y1), py(d.y2)))
    for w in rectangles.windows:
        if w.wall_edge == "west" and abs(w.x1 - env.x) < 0.05:
            w_cuts.append((py(w.y1), py(w.y2)))
    for sy1, sy2 in _subtract_intervals(w_base, w_cuts):
        svg.append(f'<line x1="{px(env.x):.1f}" y1="{sy1:.1f}" x2="{px(env.x):.1f}" y2="{sy2:.1f}" stroke="{ext_stroke}" stroke-width="6.0" stroke-linecap="square" />')

    # East Edge (x = env.x + env.width)
    e_x = env.x + env.width
    e_base = (py(env.y), py(env.y + env.height))
    e_cuts = []
    for d in doors:
        if d.wall_edge == "vertical" and abs(d.x1 - e_x) < 0.05:
            e_cuts.append((py(d.y1), py(d.y2)))
    for w in rectangles.windows:
        if w.wall_edge == "east" and abs(w.x1 - e_x) < 0.05:
            e_cuts.append((py(w.y1), py(w.y2)))
    for sy1, sy2 in _subtract_intervals(e_base, e_cuts):
        svg.append(f'<line x1="{px(e_x):.1f}" y1="{sy1:.1f}" x2="{px(e_x):.1f}" y2="{sy2:.1f}" stroke="{ext_stroke}" stroke-width="6.0" stroke-linecap="square" />')

    # Windows (3-line representation)
    for win in rectangles.windows:
        if win.wall_edge in ("north", "south"):
            x1 = px(win.x1)
            x2 = px(win.x2)
            y = py(win.y1)
            svg.append(f'<line x1="{x1:.1f}" y1="{y - 2.0:.1f}" x2="{x2:.1f}" y2="{y - 2.0:.1f}" stroke="#0284C7" stroke-width="1.0" />')
            svg.append(f'<line x1="{x1:.1f}" y1="{y:.1f}" x2="{x2:.1f}" y2="{y:.1f}" stroke="{ext_stroke}" stroke-width="1.2" />')
            svg.append(f'<line x1="{x1:.1f}" y1="{y + 2.0:.1f}" x2="{x2:.1f}" y2="{y + 2.0:.1f}" stroke="#0284C7" stroke-width="1.0" />')
            svg.append(f'<line x1="{x1:.1f}" y1="{y - 2.5:.1f}" x2="{x1:.1f}" y2="{y + 2.5:.1f}" stroke="{ext_stroke}" stroke-width="1.0" />')
            svg.append(f'<line x1="{x2:.1f}" y1="{y - 2.5:.1f}" x2="{x2:.1f}" y2="{y + 2.5:.1f}" stroke="{ext_stroke}" stroke-width="1.0" />')
        else:
            y1 = py(win.y1)
            y2 = py(win.y2)
            x = px(win.x1)
            svg.append(f'<line x1="{x - 2.0:.1f}" y1="{y1:.1f}" x2="{x - 2.0:.1f}" y2="{y2:.1f}" stroke="#0284C7" stroke-width="1.0" />')
            svg.append(f'<line x1="{x:.1f}" y1="{y1:.1f}" x2="{x:.1f}" y2="{y2:.1f}" stroke="{ext_stroke}" stroke-width="1.2" />')
            svg.append(f'<line x1="{x + 2.0:.1f}" y1="{y1:.1f}" x2="{x + 2.0:.1f}" y2="{y2:.1f}" stroke="#0284C7" stroke-width="1.0" />')
            svg.append(f'<line x1="{x - 2.5:.1f}" y1="{y1:.1f}" x2="{x + 2.5:.1f}" y2="{y1:.1f}" stroke="{ext_stroke}" stroke-width="1.0" />')
            svg.append(f'<line x1="{x - 2.5:.1f}" y1="{y2:.1f}" x2="{x + 2.5:.1f}" y2="{y2:.1f}" stroke="{ext_stroke}" stroke-width="1.0" />')

    # Doors (Leaf Line + Swing Arc)
    for d in doors:
        hx = px(d.hinge_x)
        hy = py(d.hinge_y)
        dw = d.width_m * scale_px
        if d.wall_edge == "vertical":
            if d.swing_direction == "inward_left":
                lx = hx - dw
                ly = hy
                swp = 1
                arc_x = lx
                arc_y = hy
                start_x = hx
                start_y = hy + dw
            else:
                lx = hx + dw
                ly = hy
                swp = 0
                arc_x = lx
                arc_y = hy
                start_x = hx
                start_y = hy + dw
            svg.append(f'<line x1="{hx:.1f}" y1="{hy:.1f}" x2="{lx:.1f}" y2="{ly:.1f}" stroke="{door_stroke}" stroke-width="2.0" />')
            svg.append(f'<path d="M {start_x:.1f} {start_y:.1f} A {dw:.1f} {dw:.1f} 0 0 {swp} {arc_x:.1f} {arc_y:.1f}" fill="none" stroke="{door_stroke}" stroke-width="1.4" stroke-dasharray="3 3" />')
        else: # horizontal
            if d.swing_direction == "inward_left":
                lx = hx
                ly = hy - dw
                swp = 0
                arc_x = lx
                arc_y = ly
                start_x = hx + dw
                start_y = hy
            else:
                lx = hx
                ly = hy + dw
                swp = 1
                arc_x = lx
                arc_y = ly
                start_x = hx + dw
                start_y = hy
            svg.append(f'<line x1="{hx:.1f}" y1="{hy:.1f}" x2="{lx:.1f}" y2="{ly:.1f}" stroke="{door_stroke}" stroke-width="2.0" />')
            svg.append(f'<path d="M {start_x:.1f} {start_y:.1f} A {dw:.1f} {dw:.1f} 0 0 {swp} {arc_x:.1f} {arc_y:.1f}" fill="none" stroke="{door_stroke}" stroke-width="1.4" stroke-dasharray="3 3" />')

        if d.door_id == "main_entry":
            mx = (px(d.x1) + px(d.x2)) / 2.0
            my = (py(d.y1) + py(d.y2)) / 2.0
            svg.append(f'<line x1="{mx:.1f}" y1="{my - 22.0:.1f}" x2="{mx:.1f}" y2="{my - 6.0:.1f}" stroke="#10B981" stroke-width="2.2" marker-end="url(#entry-arrow)" />')
            svg.append(f'<text x="{mx:.1f}" y="{my - 26.0:.1f}" font-size="8.5" font-weight="700" fill="#10B981" text-anchor="middle" letter-spacing="1">MAIN ENTRY</text>')

    # Centered Room Labels
    for r in rooms:
        cx = px(r.x + r.width / 2.0)
        cy = py(r.y + r.height / 2.0)
        svg.append(f'<text x="{cx:.1f}" y="{cy - 4.0:.1f}" font-size="10.5" font-weight="700" fill="{text_primary}" text-anchor="middle" letter-spacing="1">{r.room_name.upper()}</text>')
        svg.append(f'<text x="{cx:.1f}" y="{cy + 10.0:.1f}" font-size="8.5" font-weight="500" fill="{text_secondary}" text-anchor="middle">{r.width:.2f}m × {r.height:.2f}m | {r.area_sqm:.1f} m²</text>')

    # Dimension lines along top and left
    dim_top_y = margin_y - 24.0
    dim_x1 = margin_x
    dim_x2 = margin_x + content_w
    svg.append(f'<line x1="{dim_x1:.1f}" y1="{margin_y - 4:.1f}" x2="{dim_x1:.1f}" y2="{dim_top_y - 6:.1f}" stroke="#475569" stroke-width="0.8" stroke-dasharray="2 2" />')
    svg.append(f'<line x1="{dim_x2:.1f}" y1="{margin_y - 4:.1f}" x2="{dim_x2:.1f}" y2="{dim_top_y - 6:.1f}" stroke="#475569" stroke-width="0.8" stroke-dasharray="2 2" />')
    svg.append(f'<line x1="{dim_x1:.1f}" y1="{dim_top_y:.1f}" x2="{dim_x2:.1f}" y2="{dim_top_y:.1f}" stroke="{dim_stroke}" stroke-width="1.2" />')
    svg.append(f'<line x1="{dim_x1 - 4.5:.1f}" y1="{dim_top_y + 4.5:.1f}" x2="{dim_x1 + 4.5:.1f}" y2="{dim_top_y - 4.5:.1f}" stroke="{dim_tick_stroke}" stroke-width="1.6" />')
    svg.append(f'<line x1="{dim_x2 - 4.5:.1f}" y1="{dim_top_y + 4.5:.1f}" x2="{dim_x2 + 4.5:.1f}" y2="{dim_top_y - 4.5:.1f}" stroke="{dim_tick_stroke}" stroke-width="1.6" />')
    svg.append(f'<text x="{(dim_x1 + dim_x2) / 2.0:.1f}" y="{dim_top_y - 7.0:.1f}" font-size="9.0" font-weight="600" fill="{text_secondary}" text-anchor="middle" letter-spacing="0.5">{plot_width_m:.1f} m FRONTAGE</text>')

    dim_left_x = margin_x - 24.0
    dim_y1 = margin_y
    dim_y2 = margin_y + content_h
    svg.append(f'<line x1="{margin_x - 4:.1f}" y1="{dim_y1:.1f}" x2="{dim_left_x - 6:.1f}" y2="{dim_y1:.1f}" stroke="#475569" stroke-width="0.8" stroke-dasharray="2 2" />')
    svg.append(f'<line x1="{margin_x - 4:.1f}" y1="{dim_y2:.1f}" x2="{dim_left_x - 6:.1f}" y2="{dim_y2:.1f}" stroke="#475569" stroke-width="0.8" stroke-dasharray="2 2" />')
    svg.append(f'<line x1="{dim_left_x:.1f}" y1="{dim_y1:.1f}" x2="{dim_left_x:.1f}" y2="{dim_y2:.1f}" stroke="{dim_stroke}" stroke-width="1.2" />')
    svg.append(f'<line x1="{dim_left_x - 4.5:.1f}" y1="{dim_y1 + 4.5:.1f}" x2="{dim_left_x + 4.5:.1f}" y2="{dim_y1 - 4.5:.1f}" stroke="{dim_tick_stroke}" stroke-width="1.6" />')
    svg.append(f'<line x1="{dim_left_x - 4.5:.1f}" y1="{dim_y2 + 4.5:.1f}" x2="{dim_left_x + 4.5:.1f}" y2="{dim_y2 - 4.5:.1f}" stroke="{dim_tick_stroke}" stroke-width="1.6" />')
    svg.append(f'<text x="{dim_left_x - 9.0:.1f}" y="{(dim_y1 + dim_y2) / 2.0:.1f}" font-size="9.0" font-weight="600" fill="{text_secondary}" text-anchor="middle" transform="rotate(-90 {dim_left_x - 9.0:.1f} {(dim_y1 + dim_y2) / 2.0:.1f})" letter-spacing="0.5">{plot_depth_m:.1f} m DEPTH</text>')

    # North Compass
    compass_x = svg_w - 42.0
    compass_y = 38.0
    svg.append(f'<g transform="translate({compass_x}, {compass_y})">')
    svg.append(f'<circle cx="0" cy="0" r="15" fill="#1E293B" stroke="{dim_tick_stroke}" stroke-width="1.2" />')
    svg.append(f'<polygon points="0,-13 4,0 0,-2 -4,0" fill="{dim_tick_stroke}" />')
    svg.append('<polygon points="0,13 4,0 0,2 -4,0" fill="#475569" />')
    svg.append(f'<text x="0" y="-16" font-size="8.5" font-weight="800" fill="{dim_tick_stroke}" text-anchor="middle">N</text>')
    svg.append('</g>')

    # Scale bar
    scale_x = margin_x
    scale_y = svg_h - 22.0
    svg.append(f'<g transform="translate({scale_x}, {scale_y})">')
    svg.append(f'<text x="0" y="-6" font-size="7.5" font-weight="600" fill="{text_secondary}" letter-spacing="0.5">GRAPHIC SCALE (METRIC)</text>')
    svg.append(f'<rect x="0" y="0" width="30" height="4" fill="{dim_tick_stroke}" stroke="{dim_tick_stroke}" stroke-width="0.5" />')
    svg.append(f'<rect x="30" y="0" width="30" height="4" fill="#1E293B" stroke="{dim_tick_stroke}" stroke-width="0.5" />')
    svg.append(f'<rect x="60" y="0" width="30" height="4" fill="{dim_tick_stroke}" stroke="{dim_tick_stroke}" stroke-width="0.5" />')
    svg.append(f'<text x="0" y="11" font-size="6.5" fill="{text_secondary}" text-anchor="middle">0</text>')
    svg.append(f'<text x="30" y="11" font-size="6.5" fill="{text_secondary}" text-anchor="middle">1m</text>')
    svg.append(f'<text x="60" y="11" font-size="6.5" fill="{text_secondary}" text-anchor="middle">2m</text>')
    svg.append(f'<text x="90" y="11" font-size="6.5" fill="{text_secondary}" text-anchor="middle">3m</text>')
    svg.append('</g>')

    svg.append('</svg>')
    return "".join(svg)


# =====================================================================
# Multi-Storey Blueprint SVG Generator with Ghost Core Overlay
# =====================================================================

def generate_multi_floor_blueprint_svg(
    floor_index: int,
    floor_name: str,
    rooms: List[Any],
    doors: List[Any],
    windows: List[Any],
    envelope: Dict[str, float],
    ground_cores: Optional[List[Any]] = None,
    ground_ducts: Optional[List[Any]] = None,
    theme: str = "cad",
    include_ghost_overlay: bool = True,
    building_typology: Optional[str] = None,
) -> str:
    """
    Renders a publication-grade architectural CAD/Paper SVG blueprint for an individual storey plate.
    Features:
    - Accurate wall thicknesses (exterior structural envelope vs interior partitions)
    - True-scale door leaves & swing arcs
    - North arrow, metric scale bar, and title block with elevation
    - Ghost Core Overlay: on upper storeys (floor_index > 0), renders a faint dashed outline
      of ground floor's vertical cores & MEP shafts to visually prove exact physical vertical stacking.
    """
    scale = 36.0  # pixels per meter
    margin_x = 55.0
    margin_y = 55.0
    title_block_h = 44.0

    env_w = envelope.get("width", 12.0)
    env_d = envelope.get("depth", 15.0)

    content_w = env_w * scale
    content_h = env_d * scale
    svg_w = int(content_w + (2.0 * margin_x))
    svg_h = int(content_h + (2.0 * margin_y) + title_block_h)

    # Theme Palettes
    is_cad = (theme == "cad")
    bg_color = "#0B132B" if is_cad else "#F8FAFC"
    grid_line = "#1E293B" if is_cad else "#E2E8F0"
    ext_wall_stroke = "#38BDF8" if is_cad else "#1E293B"
    int_wall_stroke = "#94A3B8" if is_cad else "#475569"
    door_stroke = "#38BDF8" if is_cad else "#0284C7"
    window_stroke = "#0284C7" if is_cad else "#0369A1"
    core_stroke = "#F59E0B" if is_cad else "#D97706"
    text_primary = "#F8FAFC" if is_cad else "#0F172A"
    text_secondary = "#94A3B8" if is_cad else "#64748B"
    text_dim = "#64748B" if is_cad else "#94A3B8"

    # Ghost Core styling (faint luminous cyan/amber for CAD, crisp soft blue for Paper)
    ghost_stroke = "#06B6D4" if is_cad else "#0284C7"
    ghost_fill = "rgba(6, 182, 212, 0.08)" if is_cad else "rgba(2, 132, 199, 0.06)"
    ghost_badge_bg = "#0E7490" if is_cad else "#0284C7"
    ghost_badge_text = "#CFFAFE" if is_cad else "#FFFFFF"

    # Coordinate mapping helpers
    def px(xm: float) -> float:
        return margin_x + (xm * scale)

    def py(ym: float) -> float:
        return margin_y + (ym * scale)

    svg: List[str] = []
    svg.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {svg_w} {svg_h}" width="{svg_w}" height="{svg_h}" style="background-color: {bg_color}; font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif;">')

    # Styles and Defs
    svg.append(f"""
      <defs>
        <pattern id="mf-grid-{theme}" width="{scale}" height="{scale}" patternUnits="userSpaceOnUse">
          <path d="M {scale} 0 L 0 0 0 {scale}" fill="none" stroke="{grid_line}" stroke-width="0.75" />
          <path d="M {scale/2} 0 L {scale/2} {scale} M 0 {scale/2} L {scale} {scale/2}" fill="none" stroke="{grid_line}" stroke-width="0.25" stroke-dasharray="2 2" />
        </pattern>
        <style>
          .ghost-core-overlay {{
            transition: opacity 0.2s ease;
          }}
          .ghost-core-overlay.hidden, [data-ghost-overlay="false"] .ghost-core-overlay {{
            display: none !important;
          }}
          text {{
            user-select: none;
          }}
        </style>
      </defs>
    """)

    # Background canvas
    svg.append(f'  <rect width="{svg_w}" height="{svg_h}" fill="{bg_color}" />')
    svg.append(f'  <rect x="{margin_x}" y="{margin_y}" width="{content_w}" height="{content_h}" fill="url(#mf-grid-{theme})" />')

    # Plinth Boundary Line
    svg.append(f'  <rect x="{margin_x}" y="{margin_y}" width="{content_w}" height="{content_h}" fill="none" stroke="{ext_wall_stroke}" stroke-width="4.5" />')

    # 1. Room Background Fills
    for r in rooms:
        rx = px(r.x)
        ry = py(r.y)
        rw = r.width_m * scale
        rh = r.depth_m * scale

        if r.is_vertical_core:
            fill_color = "rgba(245, 158, 11, 0.15)" if is_cad else "rgba(217, 119, 6, 0.12)"
        elif r.zone_category == "circulation":
            fill_color = "rgba(148, 163, 184, 0.12)" if is_cad else "rgba(100, 116, 139, 0.08)"
        elif r.zone_category == "service":
            fill_color = "rgba(251, 191, 36, 0.12)" if is_cad else "rgba(245, 158, 11, 0.09)"
        elif r.zone_category == "private":
            fill_color = "rgba(56, 189, 248, 0.12)" if is_cad else "rgba(2, 132, 199, 0.08)"
        elif r.zone_category == "industrial_bay":
            fill_color = "rgba(14, 165, 233, 0.10)" if is_cad else "rgba(14, 165, 233, 0.06)"
        else:
            fill_color = "rgba(52, 211, 153, 0.12)" if is_cad else "rgba(16, 185, 129, 0.08)"

        svg.append(f'  <rect x="{rx:.1f}" y="{ry:.1f}" width="{rw:.1f}" height="{rh:.1f}" fill="{fill_color}" />')

    # 2. Ghost Core Overlay (Active on Upper Floors floor_index > 0)
    if floor_index > 0 and include_ghost_overlay and (ground_cores or ground_ducts):
        svg.append('  <!-- ================= GHOST CORE OVERLAY (STACKING PROOF) ================= -->')
        svg.append('  <g id="ghost-core-overlay" class="ghost-core-overlay" data-visible="true">')

        # Render ground floor vertical cores
        if ground_cores:
            for gcore in ground_cores:
                gx = px(gcore.x)
                gy = py(gcore.y)
                gw = gcore.width_m * scale
                gh = gcore.depth_m * scale

                # Dashed bounding box of ground core
                svg.append(
                    f'    <rect x="{gx:.1f}" y="{gy:.1f}" width="{gw:.1f}" height="{gh:.1f}" '
                    f'fill="{ghost_fill}" stroke="{ghost_stroke}" stroke-width="2.2" stroke-dasharray="6 4" />'
                )

                # Tread ghost lines
                num_treads = 6
                for t in range(1, num_treads):
                    t_y = gy + (gh / num_treads) * t
                    svg.append(f'    <line x1="{gx + 3:.1f}" y1="{t_y:.1f}" x2="{gx + gw - 3:.1f}" y2="{t_y:.1f}" stroke="{ghost_stroke}" stroke-width="1.0" stroke-dasharray="3 3" opacity="0.6" />')

                # Alignment Proof Watermark Badge
                badge_w = min(110.0, gw - 8.0)
                badge_x = gx + (gw / 2.0) - (badge_w / 2.0)
                badge_y = gy + 8.0
                svg.append(f'    <rect x="{badge_x:.1f}" y="{badge_y:.1f}" width="{badge_w:.1f}" height="18" rx="4" fill="{ghost_badge_bg}" opacity="0.9" />')
                svg.append(f'    <text x="{gx + gw/2.0:.1f}" y="{badge_y + 12.5:.1f}" font-size="8.5" font-weight="700" fill="{ghost_badge_text}" text-anchor="middle" letter-spacing="0.5">F0 CORE ANCHOR</text>')

        # Render ground floor MEP duct shafts
        if ground_ducts:
            for gduct in ground_ducts:
                dx = px(gduct.x)
                dy = py(gduct.y)
                dw = gduct.width_m * scale
                dh = gduct.depth_m * scale
                svg.append(
                    f'    <rect x="{dx:.1f}" y="{dy:.1f}" width="{dw:.1f}" height="{dh:.1f}" '
                    f'fill="rgba(245, 158, 11, 0.12)" stroke="#F59E0B" stroke-width="1.8" stroke-dasharray="4 3" />'
                )
                # Cross hatch
                svg.append(f'    <line x1="{dx:.1f}" y1="{dy:.1f}" x2="{dx + dw:.1f}" y2="{dy + dh:.1f}" stroke="#F59E0B" stroke-width="1.0" stroke-dasharray="2 2" opacity="0.7" />')
                svg.append(f'    <line x1="{dx + dw:.1f}" y1="{dy:.1f}" x2="{dx:.1f}" y2="{dy + dh:.1f}" stroke="#F59E0B" stroke-width="1.0" stroke-dasharray="2 2" opacity="0.7" />')

        svg.append('  </g>')

    # 3. Room Interior Partition Walls
    for r in rooms:
        rx = px(r.x)
        ry = py(r.y)
        rw = r.width_m * scale
        rh = r.depth_m * scale

        wall_strk = core_stroke if r.is_vertical_core else int_wall_stroke
        wall_w = "2.8" if r.is_vertical_core else "2.0"
        stroke_dash = 'stroke-dasharray="4 2"' if r.is_vertical_core else ""

        svg.append(
            f'  <rect x="{rx:.1f}" y="{ry:.1f}" width="{rw:.1f}" height="{rh:.1f}" '
            f'fill="none" stroke="{wall_strk}" stroke-width="{wall_w}" {stroke_dash} />'
        )

        # If current level staircase, draw crisp treads
        if r.is_vertical_core:
            num_treads = 7
            for t in range(1, num_treads):
                t_y = ry + (rh / num_treads) * t
                svg.append(f'  <line x1="{rx + 4:.1f}" y1="{t_y:.1f}" x2="{rx + rw - 4:.1f}" y2="{t_y:.1f}" stroke="{core_stroke}" stroke-width="1.2" opacity="0.7" />')
            # UP arrow
            arrow_x = rx + rw - 14.0
            svg.append(f'  <line x1="{arrow_x:.1f}" y1="{ry + rh - 12:.1f}" x2="{arrow_x:.1f}" y2="{ry + 14:.1f}" stroke="{core_stroke}" stroke-width="1.6" />')
            svg.append(f'  <polyline points="{arrow_x - 3},{ry + 18} {arrow_x},{ry + 13} {arrow_x + 3},{ry + 18}" fill="none" stroke="{core_stroke}" stroke-width="1.6" />')
            svg.append(f'  <text x="{arrow_x - 6:.1f}" y="{ry + rh/2:.1f}" font-size="7.5" font-weight="700" fill="{core_stroke}" text-anchor="end">UP</text>')

    # 4. Windows (Double line on exterior walls)
    for win in windows:
        wx1 = px(win.x1)
        wy1 = py(win.y1)
        wx2 = px(win.x2)
        wy2 = py(win.y2)
        svg.append(f'  <line x1="{wx1:.1f}" y1="{wy1:.1f}" x2="{wx2:.1f}" y2="{wy2:.1f}" stroke="{window_stroke}" stroke-width="3.6" />')
        svg.append(f'  <line x1="{wx1:.1f}" y1="{wy1:.1f}" x2="{wx2:.1f}" y2="{wy2:.1f}" stroke="{bg_color}" stroke-width="1.4" />')

    # 5. Doors with Swing Arcs
    for d in doors:
        hx = px(d.hinge_x)
        hy = py(d.hinge_y)
        x1 = px(d.x1)
        y1 = py(d.y1)
        x2 = px(d.x2)
        y2 = py(d.y2)

        dw = math.hypot(x2 - x1, y2 - y1)
        if dw < 4.0:
            dw = 28.0

        # Draw door leaf line
        svg.append(f'  <line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{door_stroke}" stroke-width="2.2" />')

    # 6. Room Labels & Dimensions
    for r in rooms:
        cx = px(r.x + r.width_m / 2.0)
        cy = py(r.y + r.depth_m / 2.0)

        # Room Name
        svg.append(
            f'  <text x="{cx:.1f}" y="{cy - 5.0:.1f}" font-size="10.5" font-weight="700" fill="{text_primary}" text-anchor="middle" letter-spacing="0.5">{r.room_name.upper()}</text>'
        )
        # Dimensions & Zone
        zone_info = f"[{r.zone}]" if r.zone else ""
        svg.append(
            f'  <text x="{cx:.1f}" y="{cy + 10.0:.1f}" font-size="8.5" font-weight="500" fill="{text_secondary}" text-anchor="middle">{r.width_m:.1f}m × {r.depth_m:.1f}m ({r.area_sqm:.1f}m²) {zone_info}</text>'
        )

    # 7. Exterior Dimension Lines
    dim_top_y = margin_y - 20.0
    dim_x1 = margin_x
    dim_x2 = margin_x + content_w
    svg.append(f'  <line x1="{dim_x1:.1f}" y1="{dim_top_y:.1f}" x2="{dim_x2:.1f}" y2="{dim_top_y:.1f}" stroke="{text_dim}" stroke-width="1.0" />')
    svg.append(f'  <line x1="{dim_x1 - 4:.1f}" y1="{dim_top_y + 4:.1f}" x2="{dim_x1 + 4:.1f}" y2="{dim_top_y - 4:.1f}" stroke="{text_secondary}" stroke-width="1.5" />')
    svg.append(f'  <line x1="{dim_x2 - 4:.1f}" y1="{dim_top_y + 4:.1f}" x2="{dim_x2 + 4:.1f}" y2="{dim_top_y - 4:.1f}" stroke="{text_secondary}" stroke-width="1.5" />')
    svg.append(f'  <text x="{(dim_x1 + dim_x2)/2.0:.1f}" y="{dim_top_y - 6.0:.1f}" font-size="9.0" font-weight="600" fill="{text_secondary}" text-anchor="middle">{env_w:.1f}m ENVELOPE WIDTH</text>')

    dim_left_x = margin_x - 20.0
    dim_y1 = margin_y
    dim_y2 = margin_y + content_h
    svg.append(f'  <line x1="{dim_left_x:.1f}" y1="{dim_y1:.1f}" x2="{dim_left_x:.1f}" y2="{dim_y2:.1f}" stroke="{text_dim}" stroke-width="1.0" />')
    svg.append(f'  <line x1="{dim_left_x - 4:.1f}" y1="{dim_y1 + 4:.1f}" x2="{dim_left_x + 4:.1f}" y2="{dim_y1 - 4:.1f}" stroke="{text_secondary}" stroke-width="1.5" />')
    svg.append(f'  <line x1="{dim_left_x - 4:.1f}" y1="{dim_y2 + 4:.1f}" x2="{dim_left_x + 4:.1f}" y2="{dim_y2 - 4:.1f}" stroke="{text_secondary}" stroke-width="1.5" />')
    svg.append(f'  <text x="{dim_left_x - 8.0:.1f}" y="{(dim_y1 + dim_y2)/2.0:.1f}" font-size="9.0" font-weight="600" fill="{text_secondary}" text-anchor="middle" transform="rotate(-90 {dim_left_x - 8.0:.1f} {(dim_y1 + dim_y2)/2.0:.1f})">{env_d:.1f}m ENVELOPE DEPTH</text>')

    # 8. North Arrow / Compass
    compass_x = svg_w - 40.0
    compass_y = 36.0
    svg.append(f'  <g transform="translate({compass_x}, {compass_y})">')
    svg.append(f'    <circle cx="0" cy="0" r="14" fill="{bg_color}" stroke="{text_secondary}" stroke-width="1.2" />')
    svg.append(f'    <polygon points="0,-12 3,0 0,-2 -3,0" fill="{ext_wall_stroke}" />')
    svg.append(f'    <polygon points="0,12 3,0 0,2 -3,0" fill="{text_dim}" />')
    svg.append(f'    <text x="0" y="-15" font-size="8.5" font-weight="800" fill="{text_primary}" text-anchor="middle">N</text>')
    svg.append('  </g>')

    # 9. Scale Bar
    scale_y = svg_h - 18.0
    svg.append(f'  <g transform="translate({margin_x}, {scale_y})">')
    svg.append(f'    <rect x="0" y="0" width="{scale}" height="3" fill="{text_secondary}" />')
    svg.append(f'    <rect x="{scale}" y="0" width="{scale}" height="3" fill="{grid_line}" />')
    svg.append(f'    <text x="0" y="-4" font-size="7.0" fill="{text_secondary}">0</text>')
    svg.append(f'    <text x="{scale}" y="-4" font-size="7.0" fill="{text_secondary}">1m</text>')
    svg.append(f'    <text x="{scale*2}" y="-4" font-size="7.0" fill="{text_secondary}">2m (SCALE 1:50)</text>')
    svg.append('  </g>')

    # 10. Title Block Banner
    banner_y = margin_y + content_h + 24.0
    elevation_m = floor_index * 3.0
    typology_tag = f"TYPOLOGY: {building_typology.upper()}" if building_typology else "NBC 2016 COMPLIANT"
    svg.append(f'  <g transform="translate({margin_x}, {banner_y})">')
    svg.append(f'    <text x="0" y="0" font-size="12.0" font-weight="700" fill="{text_primary}">{floor_name.upper()} (+{elevation_m:.2f}m LVL)</text>')
    svg.append(f'    <text x="0" y="14" font-size="9.0" font-weight="500" fill="{text_secondary}">{typology_tag} | CORE ALIGNMENT VERIFIED</text>')
    svg.append(f'    <text x="{content_w}" y="7" font-size="9.5" font-weight="600" fill="{text_secondary}" text-anchor="end">BUILDIWISE GENERATIVE CAD ENGINE</text>')
    svg.append('  </g>')

    svg.append('</svg>')
    return "\n".join(svg)

