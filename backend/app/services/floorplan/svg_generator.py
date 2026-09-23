import math
from typing import List, Dict, Tuple, Optional, Any
from app.services.floorplan.grid_model import RoomBox, SpatialGrid, ROOM_CATALOG

PASTEL_COLORS: Dict[str, str] = {
    "master_bed": "#F1F5F9",  # slate-100
    "living": "#F0FDF4",      # emerald-50
    "kitchen": "#FEF3C7",     # amber-100
    "puja": "#FEF9C3",        # yellow-100
    "bath_1": "#E0F2FE",      # sky-100
    "bath_2": "#E0F2FE",      # sky-100
    "bed_2": "#F8FAFC",       # slate-50
    "dining": "#FDF2F8",      # pink-50
    "stairs": "#F5F3FF",      # purple-50
    "corridor": "#FFFFFF"     # pure white
}


def generate_blueprint_svg(
    placements: List[RoomBox],
    grid: SpatialGrid,
    plot_width_m: float,
    plot_depth_m: float
) -> str:
    """
    Renders an architectural 2D blueprint SVG from a solved RoomBox layout.
    Generates clean walls, 90-degree door swing arcs, windows, labels,
    exterior dimension ticks, and an architectural North compass.
    """
    cell_px = 52.0
    margin_x = 75.0
    margin_y = 75.0

    content_w = grid.cols * cell_px
    content_h = grid.rows * cell_px
    svg_w = content_w + (2.0 * margin_x)
    svg_h = content_h + (2.0 * margin_y)

    # 2D cell occupancy matrix: (r, c) -> room_id or None
    matrix: List[List[Optional[str]]] = [[None for _ in range(grid.cols)] for _ in range(grid.rows)]
    for box in placements:
        for r in range(box.r, box.r_end):
            for c in range(box.c, box.c_end):
                if 0 <= r < grid.rows and 0 <= c < grid.cols:
                    matrix[r][c] = box.room_id

    svg_parts: List[str] = []
    svg_parts.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {svg_w:.1f} {svg_h:.1f}" '
        f'width="100%" height="100%" class="buildwise-blueprint-svg" '
        f'style="background-color: #FFFFFF; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;">'
    )

    # Defs: Architectural markers and grid pattern
    svg_parts.append("""
      <defs>
        <pattern id="arch-grid" width="13" height="13" patternUnits="userSpaceOnUse">
          <path d="M 13 0 L 0 0 0 13" fill="none" stroke="#F1F5F9" stroke-width="0.75" />
        </pattern>
        <marker id="dim-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748B" />
        </marker>
        <marker id="entry-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1 L 9 5 L 0 9 z" fill="#059669" />
        </marker>
      </defs>
    """)

    # Background canvas and subtle technical drafting grid
    svg_parts.append(f'<rect width="{svg_w}" height="{svg_h}" fill="#FFFFFF" />')
    svg_parts.append(f'<rect x="{margin_x}" y="{margin_y}" width="{content_w}" height="{content_h}" fill="url(#arch-grid)" />')

    # Plinth boundary baseline
    svg_parts.append(
        f'<rect x="{margin_x}" y="{margin_y}" width="{content_w}" height="{content_h}" '
        f'fill="none" stroke="#E2E8F0" stroke-width="1" stroke-dasharray="4 4" />'
    )

    # 1. Room Fills
    for box in placements:
        bx = margin_x + (box.c * cell_px)
        by = margin_y + (box.r * cell_px)
        bw = box.w * cell_px
        bh = box.h * cell_px
        fill_color = PASTEL_COLORS.get(box.room_id, "#F8FAFC")

        svg_parts.append(
            f'<rect x="{bx:.1f}" y="{by:.1f}" width="{bw:.1f}" height="{bh:.1f}" '
            f'fill="{fill_color}" stroke="none" id="room-{box.room_id}" />'
        )

    # 2. Wall Generation via Edge Boundary Analysis
    # Differentiates exterior (thick stroke) vs interior (medium stroke)
    exterior_walls: List[Tuple[float, float, float, float]] = []
    interior_walls: List[Tuple[float, float, float, float]] = []

    # Horizontal edges: (r, c) to (r, c+1) where r in 0..grid.rows
    for r in range(grid.rows + 1):
        for c in range(grid.cols):
            top_room = matrix[r - 1][c] if r > 0 else None
            bot_room = matrix[r][c] if r < grid.rows else None

            if top_room == bot_room:
                continue  # Continuous room interior, no wall

            x1 = margin_x + (c * cell_px)
            x2 = x1 + cell_px
            y = margin_y + (r * cell_px)

            if top_room is None or bot_room is None:
                # Boundary between room and outside -> Exterior wall
                exterior_walls.append((x1, y, x2, y))
            else:
                # Boundary between two distinct rooms -> Interior wall
                interior_walls.append((x1, y, x2, y))

    # Vertical edges: (r, c) to (r+1, c) where c in 0..grid.cols
    for c in range(grid.cols + 1):
        for r in range(grid.rows):
            left_room = matrix[r][c - 1] if c > 0 else None
            right_room = matrix[r][c] if c < grid.cols else None

            if left_room == right_room:
                continue

            x = margin_x + (c * cell_px)
            y1 = margin_y + (r * cell_px)
            y2 = y1 + cell_px

            if left_room is None or right_room is None:
                exterior_walls.append((x, y1, x, y2))
            else:
                interior_walls.append((x, y1, x, y2))

    # Render Interior Walls first (thin/medium stroke)
    for x1, y1, x2, y2 in interior_walls:
        svg_parts.append(
            f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
            f'stroke="#475569" stroke-width="2.5" stroke-linecap="square" />'
        )

    # Render Exterior Walls (thick structural stroke)
    for x1, y1, x2, y2 in exterior_walls:
        svg_parts.append(
            f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
            f'stroke="#0F172A" stroke-width="4.5" stroke-linecap="square" />'
        )

    # 3. Windows on Exterior Walls (Double thin lines with blue tint)
    habitable_rooms = {"master_bed", "living", "kitchen", "bed_2", "dining"}
    for box in placements:
        if box.room_id not in habitable_rooms:
            continue

        bx = margin_x + (box.c * cell_px)
        by = margin_y + (box.r * cell_px)
        bw = box.w * cell_px
        bh = box.h * cell_px

        # Check North exterior wall
        if box.r == 0 or all(matrix[box.r - 1][col] is None for col in range(box.c, box.c_end)):
            win_w = min(bw * 0.5, 36.0)
            wx = bx + (bw - win_w) / 2.0
            svg_parts.append(
                f'<rect x="{wx:.1f}" y="{by - 2.5:.1f}" width="{win_w:.1f}" height="5" '
                f'fill="#FFFFFF" stroke="#0284C7" stroke-width="1.2" />'
            )
            svg_parts.append(f'<line x1="{wx:.1f}" y1="{by:.1f}" x2="{wx + win_w:.1f}" y2="{by:.1f}" stroke="#0284C7" stroke-width="1" />')

        # Check South exterior wall
        if box.r_end >= grid.rows or all(matrix[box.r_end][col] is None for col in range(box.c, box.c_end)):
            win_w = min(bw * 0.5, 36.0)
            wx = bx + (bw - win_w) / 2.0
            wy = by + bh
            svg_parts.append(
                f'<rect x="{wx:.1f}" y="{wy - 2.5:.1f}" width="{win_w:.1f}" height="5" '
                f'fill="#FFFFFF" stroke="#0284C7" stroke-width="1.2" />'
            )
            svg_parts.append(f'<line x1="{wx:.1f}" y1="{wy:.1f}" x2="{wx + win_w:.1f}" y2="{wy:.1f}" stroke="#0284C7" stroke-width="1" />')

        # Check East exterior wall
        if box.c_end >= grid.cols or all(matrix[row][box.c_end] is None for row in range(box.r, box.r_end)):
            win_h = min(bh * 0.5, 36.0)
            wy = by + (bh - win_h) / 2.0
            wx = bx + bw
            svg_parts.append(
                f'<rect x="{wx - 2.5:.1f}" y="{wy:.1f}" width="5" height="{win_h:.1f}" '
                f'fill="#FFFFFF" stroke="#0284C7" stroke-width="1.2" />'
            )
            svg_parts.append(f'<line x1="{wx:.1f}" y1="{wy:.1f}" x2="{wx:.1f}" y2="{wy + win_h:.1f}" stroke="#0284C7" stroke-width="1" />')

        # Check West exterior wall
        if box.c == 0 or all(matrix[row][box.c - 1] is None for row in range(box.r, box.r_end)):
            win_h = min(bh * 0.5, 36.0)
            wy = by + (bh - win_h) / 2.0
            svg_parts.append(
                f'<rect x="{bx - 2.5:.1f}" y="{wy:.1f}" width="5" height="{win_h:.1f}" '
                f'fill="#FFFFFF" stroke="#0284C7" stroke-width="1.2" />'
            )
            svg_parts.append(f'<line x1="{bx:.1f}" y1="{wy:.1f}" x2="{bx:.1f}" y2="{wy + win_h:.1f}" stroke="#0284C7" stroke-width="1" />')

    # 4. Doors & Swings (Architectural Standard 90-degree Swing Arcs)
    door_rad = 22.0
    living_box = next((b for b in placements if b.room_id == "living"), None)

    for box in placements:
        if box.room_id in ("corridor", "living"):
            continue

        bx = margin_x + (box.c * cell_px)
        by = margin_y + (box.r * cell_px)
        bw = box.w * cell_px
        bh = box.h * cell_px

        # Determine door location along interior wall connecting to circulation or center
        # If room sits at top North boundary (r == 0) and has an interior South wall, place door on South wall
        if box.r == 0 and box.r_end < grid.rows:
            hx = bx + 8.0
            hy = by + bh
            leaf_x = hx
            leaf_y = hy - door_rad
            arc_end_x = hx + door_rad
            arc_end_y = hy

            svg_parts.append(f'<rect x="{hx - 2:.1f}" y="{hy - 3:.1f}" width="{door_rad + 4:.1f}" height="6" fill="{PASTEL_COLORS.get(box.room_id, "#FFF")}" stroke="none" />')
            svg_parts.append(f'<line x1="{hx:.1f}" y1="{hy:.1f}" x2="{leaf_x:.1f}" y2="{leaf_y:.1f}" stroke="#0F172A" stroke-width="2.0" />')
            svg_parts.append(
                f'<path d="M {arc_end_x:.1f} {arc_end_y:.1f} A {door_rad:.1f} {door_rad:.1f} 0 0 0 {leaf_x:.1f} {leaf_y:.1f}" '
                f'fill="none" stroke="#64748B" stroke-width="1.2" stroke-dasharray="2 2" />'
            )
        else:
            hx = bx + 8.0
            hy = by
            leaf_x = hx
            leaf_y = hy + door_rad
            arc_end_x = hx + door_rad
            arc_end_y = hy

            svg_parts.append(f'<rect x="{hx - 2:.1f}" y="{hy - 3:.1f}" width="{door_rad + 4:.1f}" height="6" fill="{PASTEL_COLORS.get(box.room_id, "#FFF")}" stroke="none" />')
            svg_parts.append(f'<line x1="{hx:.1f}" y1="{hy:.1f}" x2="{leaf_x:.1f}" y2="{leaf_y:.1f}" stroke="#0F172A" stroke-width="2.0" />')
            svg_parts.append(
                f'<path d="M {arc_end_x:.1f} {arc_end_y:.1f} A {door_rad:.1f} {door_rad:.1f} 0 0 1 {leaf_x:.1f} {leaf_y:.1f}" '
                f'fill="none" stroke="#64748B" stroke-width="1.2" stroke-dasharray="2 2" />'
            )

    # 5. Main Entrance Marker on Living Room
    if living_box:
        lx = margin_x + (living_box.c * cell_px)
        ly = margin_y + (living_box.r * cell_px)
        lw = living_box.w * cell_px

        entry_x = lx + (lw / 2.0)
        entry_y = ly

        # Main double entrance door
        svg_parts.append(f'<rect x="{entry_x - 18:.1f}" y="{entry_y - 4:.1f}" width="36" height="8" fill="#FFFFFF" stroke="#0F172A" stroke-width="1.5" />')
        svg_parts.append(f'<line x1="{entry_x:.1f}" y1="{entry_y - 4:.1f}" x2="{entry_x:.1f}" y2="{entry_y + 4:.1f}" stroke="#0F172A" stroke-width="1" />')
        # Entry Arrow marker pointing in
        svg_parts.append(f'<line x1="{entry_x:.1f}" y1="{entry_y - 28:.1f}" x2="{entry_x:.1f}" y2="{entry_y - 8:.1f}" stroke="#059669" stroke-width="2" marker-end="url(#entry-arrow)" />')
        svg_parts.append(f'<text x="{entry_x:.1f}" y="{entry_y - 32:.1f}" font-size="8.5" font-weight="700" fill="#059669" text-anchor="middle" letter-spacing="1">MAIN ENTRY</text>')

    # 6. Room Labels and Metric Dimensions
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

        svg_parts.append(
            f'<text x="{cx:.1f}" y="{cy - 5:.1f}" font-size="10.5" font-weight="700" '
            f'fill="#0F172A" text-anchor="middle" letter-spacing="0.5">{display_name.upper()}</text>'
        )
        svg_parts.append(
            f'<text x="{cx:.1f}" y="{cy + 10:.1f}" font-size="8.5" font-weight="500" '
            f'fill="#64748B" text-anchor="middle">{metric_w:.1f}m × {metric_d:.1f}m ({metric_sqm:.1f} m²)</text>'
        )

    # 7. Dimension Strings on Margins
    # Top width dimension line
    dim_top_y = margin_y - 20.0
    svg_parts.append(f'<line x1="{margin_x:.1f}" y1="{dim_top_y:.1f}" x2="{margin_x + content_w:.1f}" y2="{dim_top_y:.1f}" stroke="#64748B" stroke-width="1.2" />')
    svg_parts.append(f'<line x1="{margin_x:.1f}" y1="{dim_top_y - 5:.1f}" x2="{margin_x:.1f}" y2="{dim_top_y + 5:.1f}" stroke="#64748B" stroke-width="1.2" />')
    svg_parts.append(f'<line x1="{margin_x + content_w:.1f}" y1="{dim_top_y - 5:.1f}" x2="{margin_x + content_w:.1f}" y2="{dim_top_y + 5:.1f}" stroke="#64748B" stroke-width="1.2" />')
    svg_parts.append(
        f'<text x="{margin_x + (content_w / 2.0):.1f}" y="{dim_top_y - 6:.1f}" '
        f'font-size="9" font-weight="600" fill="#475569" text-anchor="middle">{plot_width_m:.1f} m FRONTAGE</text>'
    )

    # Left depth dimension line
    dim_left_x = margin_x - 20.0
    svg_parts.append(f'<line x1="{dim_left_x:.1f}" y1="{margin_y:.1f}" x2="{dim_left_x:.1f}" y2="{margin_y + content_h:.1f}" stroke="#64748B" stroke-width="1.2" />')
    svg_parts.append(f'<line x1="{dim_left_x - 5:.1f}" y1="{margin_y:.1f}" x2="{dim_left_x + 5:.1f}" y2="{margin_y:.1f}" stroke="#64748B" stroke-width="1.2" />')
    svg_parts.append(f'<line x1="{dim_left_x - 5:.1f}" y1="{margin_y + content_h:.1f}" x2="{dim_left_x + 5:.1f}" y2="{margin_y + content_h:.1f}" stroke="#64748B" stroke-width="1.2" />')
    svg_parts.append(
        f'<text x="{dim_left_x - 8:.1f}" y="{margin_y + (content_h / 2.0):.1f}" '
        f'font-size="9" font-weight="600" fill="#475569" text-anchor="middle" transform="rotate(-90 {dim_left_x - 8:.1f} {margin_y + (content_h / 2.0):.1f})">{plot_depth_m:.1f} m DEPTH</text>'
    )

    # 8. Architectural North Compass Rose (Top Right)
    compass_x = svg_w - 42.0
    compass_y = 36.0
    svg_parts.append(f'<g transform="translate({compass_x}, {compass_y})">')
    svg_parts.append('<circle cx="0" cy="0" r="14" fill="#FFFFFF" stroke="#0F172A" stroke-width="1.2" />')
    svg_parts.append('<polygon points="0,-12 3.5,0 0,-2 -3.5,0" fill="#0F172A" />')
    svg_parts.append('<polygon points="0,12 3.5,0 0,2 -3.5,0" fill="#94A3B8" />')
    svg_parts.append('<text x="0" y="-15" font-size="8.5" font-weight="800" fill="#0F172A" text-anchor="middle">N</text>')
    svg_parts.append('</g>')

    # 9. Architectural Graphic Scale Bar (Bottom Left)
    scale_x = margin_x
    scale_y = svg_h - 22.0
    svg_parts.append(f'<g transform="translate({scale_x}, {scale_y})">')
    svg_parts.append('<text x="0" y="-6" font-size="7.5" font-weight="600" fill="#64748B">GRAPHIC SCALE (METRIC)</text>')
    svg_parts.append('<rect x="0" y="0" width="30" height="4" fill="#0F172A" stroke="#0F172A" stroke-width="0.5" />')
    svg_parts.append('<rect x="30" y="0" width="30" height="4" fill="#FFFFFF" stroke="#0F172A" stroke-width="0.5" />')
    svg_parts.append('<rect x="60" y="0" width="30" height="4" fill="#0F172A" stroke="#0F172A" stroke-width="0.5" />')
    svg_parts.append('<text x="0" y="11" font-size="6.5" fill="#64748B" text-anchor="middle">0</text>')
    svg_parts.append('<text x="30" y="11" font-size="6.5" fill="#64748B" text-anchor="middle">1m</text>')
    svg_parts.append('<text x="60" y="11" font-size="6.5" fill="#64748B" text-anchor="middle">2m</text>')
    svg_parts.append('<text x="90" y="11" font-size="6.5" fill="#64748B" text-anchor="middle">3m</text>')
    svg_parts.append('</g>')

    svg_parts.append('</svg>')
    return "".join(svg_parts)
