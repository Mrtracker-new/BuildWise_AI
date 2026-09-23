import io
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple

from app.schemas.request import ReportRequest

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether, HRFlowable
)
from reportlab.pdfgen import canvas
from reportlab.graphics.shapes import Drawing, Rect, Line, String, Group, ArcPath


class NumberedCanvas(canvas.Canvas):
    """
    Two-pass canvas to dynamically compute and stamp total page numbers and engineering headers.
    """
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count: int):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748B"))

        # Running Header
        self.drawString(36, A4[1] - 25, "BuildWise AI | Comprehensive Engineering Feasibility & Site Advisory")
        self.drawRightString(A4[0] - 36, A4[1] - 25, "ISO / CPWD / IS 1893 Benchmark Assessment")
        self.setStrokeColor(colors.HexColor("#CBD5E1"))
        self.setLineWidth(0.5)
        self.line(36, A4[1] - 28, A4[0] - 36, A4[1] - 28)

        # Running Footer
        self.line(36, 32, A4[0] - 36, 32)
        self.drawString(36, 22, "Confidential - For Preliminary Civil Engineering & Architectural Planning Only")
        self.drawRightString(A4[0] - 36, 22, f"Page {self._pageNumber} of {page_count}")
        self.restoreState()


def _subtract_intervals_rl(
    base: Tuple[float, float],
    cutouts: List[Tuple[float, float]]
) -> List[Tuple[float, float]]:
    """
    Subtracts cutout intervals [u, v] from a base interval [A, B] for ReportLab lines.
    """
    a, b = base
    if a >= b:
        return []
    if not cutouts:
        return [(a, b)]

    valid_cuts: List[Tuple[float, float]] = []
    for u, v in cutouts:
        c_start = max(a, min(u, v))
        c_end = min(b, max(u, v))
        if c_end - c_start > 0.1:
            valid_cuts.append((c_start, c_end))

    if not valid_cuts:
        return [(a, b)]

    valid_cuts.sort(key=lambda x: x[0])
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


def _draw_rectangles_reportlab(
    rectangles: Any,
    width: float = 520.0,
    height: float = 220.0
) -> Drawing:
    """
    Renders a continuous envelope RectanglesModel into native ReportLab vector
    drawing shapes (Line, Rect, String, ArcPath) in Paper Blueprint theme.
    """
    def _get(obj: Any, key: str, default: Any = None) -> Any:
        if hasattr(obj, key):
            return getattr(obj, key)
        if isinstance(obj, dict):
            return obj.get(key, default)
        return default

    env = _get(rectangles, "envelope")
    env_x = float(_get(env, "x", 1.0))
    env_y = float(_get(env, "y", 1.0))
    env_w = float(_get(env, "width", 8.0))
    env_h = float(_get(env, "height", 8.0))

    rooms_data = _get(rectangles, "rooms", []) or []
    doors_data = _get(rectangles, "doors", []) or []
    windows_data = _get(rectangles, "windows", []) or []

    # Determine plot dimensions
    max_x = max([env_x + env_w] + [float(_get(r, "x", 0)) + float(_get(r, "width", 0)) for r in rooms_data])
    max_y = max([env_y + env_h] + [float(_get(r, "y", 0)) + float(_get(r, "height", 0)) for r in rooms_data])
    plot_w = max_x + 1.0
    plot_d = max_y + 1.5

    pad_x = 35.0
    pad_y = 25.0
    avail_w = width - (2.0 * pad_x)
    avail_h = height - (2.0 * pad_y)
    scale = min(avail_w / max(plot_w, 0.1), avail_h / max(plot_d, 0.1))
    draw_w = plot_w * scale
    draw_h = plot_d * scale
    offset_x = (width - draw_w) / 2.0
    offset_y = (height - draw_h) / 2.0

    def x_pt(xm: float) -> float:
        return offset_x + (xm * scale)

    def y_pt(ym: float) -> float:
        return offset_y + ((plot_d - ym) * scale)

    drawing = Drawing(width, height)
    # Sheet background and setback line
    drawing.add(Rect(0, 0, width, height, fillColor=colors.HexColor("#FFFFFF"), strokeColor=colors.HexColor("#CBD5E1"), strokeWidth=0.5))
    drawing.add(Rect(offset_x, offset_y, draw_w, draw_h, fillColor=None, strokeColor=colors.HexColor("#CBD5E1"), strokeWidth=0.75, strokeDashArray=[3, 3]))

    # Architectural pastel room fills
    color_map = {
        "master_bed": colors.HexColor("#F1F5F9"),
        "living": colors.HexColor("#F0FDF4"),
        "kitchen": colors.HexColor("#FEF3C7"),
        "puja": colors.HexColor("#FEF9C3"),
        "bath_1": colors.HexColor("#E0F2FE"),
        "bath_2": colors.HexColor("#E0F2FE"),
        "bed_2": colors.HexColor("#F8FAFC"),
        "dining": colors.HexColor("#FDF2F8"),
        "stairs": colors.HexColor("#F5F3FF"),
        "corridor": colors.white
    }

    parsed_rooms = []
    for r in rooms_data:
        rid = _get(r, "room_id", "")
        rx = float(_get(r, "x", 0.0))
        ry = float(_get(r, "y", 0.0))
        rw = float(_get(r, "width", 0.0))
        rh = float(_get(r, "height", 0.0))
        fc = color_map.get(rid, colors.HexColor("#F8FAFC"))
        drawing.add(Rect(x_pt(rx), y_pt(ry + rh), rw * scale, rh * scale, fillColor=fc, strokeColor=None, strokeWidth=0))
        parsed_rooms.append({
            "id": rid,
            "name": str(_get(r, "room_name", rid.replace("_", " ").title())),
            "x": rx,
            "y": ry,
            "w": rw,
            "h": rh,
            "area": float(_get(r, "area_sqm", rw * rh)),
            "zone": str(_get(r, "zone", "")),
            "vastu": bool(_get(r, "vastu_compliant", False))
        })

    parsed_doors = []
    for d in doors_data:
        parsed_doors.append({
            "id": str(_get(d, "door_id", "")),
            "edge": str(_get(d, "wall_edge", "")),
            "x1": float(_get(d, "x1", 0.0)),
            "y1": float(_get(d, "y1", 0.0)),
            "x2": float(_get(d, "x2", 0.0)),
            "y2": float(_get(d, "y2", 0.0)),
            "hx": float(_get(d, "hinge_x", 0.0)),
            "hy": float(_get(d, "hinge_y", 0.0)),
            "swing": str(_get(d, "swing_direction", "inward_right")),
            "w_m": float(_get(d, "width_m", 0.9))
        })

    parsed_windows = []
    for w in windows_data:
        parsed_windows.append({
            "id": str(_get(w, "window_id", "")),
            "edge": str(_get(w, "wall_edge", "")),
            "x1": float(_get(w, "x1", 0.0)),
            "y1": float(_get(w, "y1", 0.0)),
            "x2": float(_get(w, "x2", 0.0)),
            "y2": float(_get(w, "y2", 0.0)),
            "w_m": float(_get(w, "width_m", 1.2))
        })

    # Interior Shared Partition Walls (thin 1.2pt navy)
    for i in range(len(parsed_rooms)):
        r1 = parsed_rooms[i]
        for j in range(i + 1, len(parsed_rooms)):
            r2 = parsed_rooms[j]
            # Vertical shared wall
            if abs((r1["x"] + r1["w"]) - r2["x"]) < 0.05 or abs((r2["x"] + r2["w"]) - r1["x"]) < 0.05:
                wx = (r1["x"] + r1["w"]) if abs((r1["x"] + r1["w"]) - r2["x"]) < 0.05 else (r2["x"] + r2["w"])
                y1 = max(r1["y"], r2["y"])
                y2 = min(r1["y"] + r1["h"], r2["y"] + r2["h"])
                if y2 - y1 >= 0.1:
                    base = (y1, y2)
                    cuts = []
                    for d in parsed_doors:
                        if d["edge"] == "vertical" and abs(d["x1"] - wx) < 0.08:
                            cuts.append((min(d["y1"], d["y2"]), max(d["y1"], d["y2"])))
                    segs = _subtract_intervals_rl(base, cuts)
                    for sy1, sy2 in segs:
                        drawing.add(Line(x_pt(wx), y_pt(sy1), x_pt(wx), y_pt(sy2), strokeColor=colors.HexColor("#475569"), strokeWidth=1.2))

            # Horizontal shared wall
            elif abs((r1["y"] + r1["h"]) - r2["y"]) < 0.05 or abs((r2["y"] + r2["h"]) - r1["y"]) < 0.05:
                wy = (r1["y"] + r1["h"]) if abs((r1["y"] + r1["h"]) - r2["y"]) < 0.05 else (r2["y"] + r2["h"])
                x1 = max(r1["x"], r2["x"])
                x2 = min(r1["x"] + r1["w"], r2["x"] + r2["w"])
                if x2 - x1 >= 0.1:
                    base = (x1, x2)
                    cuts = []
                    for d in parsed_doors:
                        if d["edge"] == "horizontal" and abs(d["y1"] - wy) < 0.08:
                            cuts.append((min(d["x1"], d["x2"]), max(d["x1"], d["x2"])))
                    segs = _subtract_intervals_rl(base, cuts)
                    for sx1, sx2 in segs:
                        drawing.add(Line(x_pt(sx1), y_pt(wy), x_pt(sx2), y_pt(wy), strokeColor=colors.HexColor("#475569"), strokeWidth=1.2))

    # Exterior Envelope Walls (thick 2.4pt dark navy)
    # North
    n_cuts = []
    for d in parsed_doors:
        if d["edge"] == "horizontal" and abs(d["y1"] - env_y) < 0.05:
            n_cuts.append((min(d["x1"], d["x2"]), max(d["x1"], d["x2"])))
    for w in parsed_windows:
        if w["edge"] == "north" and abs(w["y1"] - env_y) < 0.05:
            n_cuts.append((min(w["x1"], w["x2"]), max(w["x1"], w["x2"])))
    for sx1, sx2 in _subtract_intervals_rl((env_x, env_x + env_w), n_cuts):
        drawing.add(Line(x_pt(sx1), y_pt(env_y), x_pt(sx2), y_pt(env_y), strokeColor=colors.HexColor("#0F172A"), strokeWidth=2.4))

    # South
    s_y = env_y + env_h
    s_cuts = []
    for d in parsed_doors:
        if d["edge"] == "horizontal" and abs(d["y1"] - s_y) < 0.05:
            s_cuts.append((min(d["x1"], d["x2"]), max(d["x1"], d["x2"])))
    for w in parsed_windows:
        if w["edge"] == "south" and abs(w["y1"] - s_y) < 0.05:
            s_cuts.append((min(w["x1"], w["x2"]), max(w["x1"], w["x2"])))
    for sx1, sx2 in _subtract_intervals_rl((env_x, env_x + env_w), s_cuts):
        drawing.add(Line(x_pt(sx1), y_pt(s_y), x_pt(sx2), y_pt(s_y), strokeColor=colors.HexColor("#0F172A"), strokeWidth=2.4))

    # West
    w_cuts = []
    for d in parsed_doors:
        if d["edge"] == "vertical" and abs(d["x1"] - env_x) < 0.05:
            w_cuts.append((min(d["y1"], d["y2"]), max(d["y1"], d["y2"])))
    for w in parsed_windows:
        if w["edge"] == "west" and abs(w["x1"] - env_x) < 0.05:
            w_cuts.append((min(w["y1"], w["y2"]), max(w["y1"], w["y2"])))
    for sy1, sy2 in _subtract_intervals_rl((env_y, env_y + env_h), w_cuts):
        drawing.add(Line(x_pt(env_x), y_pt(sy1), x_pt(env_x), y_pt(sy2), strokeColor=colors.HexColor("#0F172A"), strokeWidth=2.4))

    # East
    e_x = env_x + env_w
    e_cuts = []
    for d in parsed_doors:
        if d["edge"] == "vertical" and abs(d["x1"] - e_x) < 0.05:
            e_cuts.append((min(d["y1"], d["y2"]), max(d["y1"], d["y2"])))
    for w in parsed_windows:
        if w["edge"] == "east" and abs(w["x1"] - e_x) < 0.05:
            e_cuts.append((min(w["y1"], w["y2"]), max(w["y1"], w["y2"])))
    for sy1, sy2 in _subtract_intervals_rl((env_y, env_y + env_h), e_cuts):
        drawing.add(Line(x_pt(e_x), y_pt(sy1), x_pt(e_x), y_pt(sy2), strokeColor=colors.HexColor("#0F172A"), strokeWidth=2.4))

    # Windows (3-line representation with cyan tint)
    for win in parsed_windows:
        if win["edge"] in ("north", "south"):
            wx1 = x_pt(win["x1"])
            wx2 = x_pt(win["x2"])
            wy = y_pt(win["y1"])
            drawing.add(Line(wx1, wy - 1.5, wx2, wy - 1.5, strokeColor=colors.HexColor("#0284C7"), strokeWidth=0.8))
            drawing.add(Line(wx1, wy, wx2, wy, strokeColor=colors.HexColor("#0F172A"), strokeWidth=1.0))
            drawing.add(Line(wx1, wy + 1.5, wx2, wy + 1.5, strokeColor=colors.HexColor("#0284C7"), strokeWidth=0.8))
            drawing.add(Line(wx1, wy - 2.0, wx1, wy + 2.0, strokeColor=colors.HexColor("#0F172A"), strokeWidth=0.8))
            drawing.add(Line(wx2, wy - 2.0, wx2, wy + 2.0, strokeColor=colors.HexColor("#0F172A"), strokeWidth=0.8))
        else:
            wy1 = y_pt(win["y1"])
            wy2 = y_pt(win["y2"])
            wx = x_pt(win["x1"])
            drawing.add(Line(wx - 1.5, wy1, wx - 1.5, wy2, strokeColor=colors.HexColor("#0284C7"), strokeWidth=0.8))
            drawing.add(Line(wx, wy1, wx, wy2, strokeColor=colors.HexColor("#0F172A"), strokeWidth=1.0))
            drawing.add(Line(wx + 1.5, wy1, wx + 1.5, wy2, strokeColor=colors.HexColor("#0284C7"), strokeWidth=0.8))
            drawing.add(Line(wx - 2.0, wy1, wx + 2.0, wy1, strokeColor=colors.HexColor("#0F172A"), strokeWidth=0.8))
            drawing.add(Line(wx - 2.0, wy2, wx + 2.0, wy2, strokeColor=colors.HexColor("#0F172A"), strokeWidth=0.8))

    # Doors (Leaf Line + Swing Arc)
    for d in parsed_doors:
        hx = x_pt(d["hx"])
        hy = y_pt(d["hy"])
        R = d["w_m"] * scale
        if d["edge"] == "vertical":
            if d["swing"] == "inward_left":
                leaf_x = hx - R
                leaf_y = hy
                start_ang, end_ang = 270, 360
            else:
                leaf_x = hx + R
                leaf_y = hy
                start_ang, end_ang = 180, 270
        else:
            if d["swing"] == "inward_left":
                leaf_x = hx
                leaf_y = hy + R
                start_ang, end_ang = 0, 90
            else:
                leaf_x = hx
                leaf_y = hy - R
                start_ang, end_ang = 270, 360
        drawing.add(Line(hx, hy, leaf_x, leaf_y, strokeColor=colors.HexColor("#0284C7"), strokeWidth=1.2))
        arc = ArcPath(strokeColor=colors.HexColor("#0284C7"), strokeWidth=0.8, strokeDashArray=[2, 2], fillColor=None)
        arc.addArc(hx, hy, R, start_ang, end_ang)
        drawing.add(arc)

    # Centered Room Typography
    for r in parsed_rooms:
        cx = x_pt(r["x"] + r["w"] / 2.0)
        cy = y_pt(r["y"] + r["h"] / 2.0)
        drawing.add(String(cx, cy + 3.0, r["name"].upper(), textAnchor="middle", fontSize=6.5, fontName="Helvetica-Bold", fillColor=colors.HexColor("#0F172A")))
        drawing.add(String(cx, cy - 6.0, f"{r['w']:.1f}m × {r['h']:.1f}m | {r['area']:.1f} m²", textAnchor="middle", fontSize=5.0, fontName="Helvetica", fillColor=colors.HexColor("#475569")))
        drawing.add(String(cx, cy - 13.0, f"[{r['zone']}]", textAnchor="middle", fontSize=4.5, fontName="Helvetica", fillColor=colors.HexColor("#16A34A" if r["vastu"] else "#94A3B8")))

    # Metric Dimension Lines
    dim_top_y = y_pt(0.0) + 12.0
    dim_x1 = x_pt(0.0)
    dim_x2 = x_pt(plot_w)
    drawing.add(Line(dim_x1, dim_top_y, dim_x2, dim_top_y, strokeColor=colors.HexColor("#334155"), strokeWidth=0.8))
    drawing.add(Line(dim_x1 - 3, dim_top_y + 3, dim_x1 + 3, dim_top_y - 3, strokeColor=colors.HexColor("#0F172A"), strokeWidth=1.2))
    drawing.add(Line(dim_x2 - 3, dim_top_y + 3, dim_x2 + 3, dim_top_y - 3, strokeColor=colors.HexColor("#0F172A"), strokeWidth=1.2))
    drawing.add(String((dim_x1 + dim_x2) / 2.0, dim_top_y + 3.0, f"{plot_w:.1f}m FRONTAGE", textAnchor="middle", fontSize=5.5, fontName="Helvetica-Bold", fillColor=colors.HexColor("#475569")))

    dim_left_x = x_pt(0.0) - 14.0
    dim_y1 = y_pt(0.0)
    dim_y2 = y_pt(plot_d)
    drawing.add(Line(dim_left_x, dim_y1, dim_left_x, dim_y2, strokeColor=colors.HexColor("#334155"), strokeWidth=0.8))
    drawing.add(Line(dim_left_x - 3, dim_y1 + 3, dim_left_x + 3, dim_y1 - 3, strokeColor=colors.HexColor("#0F172A"), strokeWidth=1.2))
    drawing.add(Line(dim_left_x - 3, dim_y2 + 3, dim_left_x + 3, dim_y2 - 3, strokeColor=colors.HexColor("#0F172A"), strokeWidth=1.2))

    return drawing


def draw_floorplan_reportlab(
    placements: Any,
    grid_matrix: Any,
    width: float = 520.0,
    height: float = 220.0,
    rectangles: Any = None
) -> Drawing:
    """
    Translates solved room placements and grid matrix into native ReportLab
    vector drawing shapes (Line, Rect, String, ArcPath, Group).
    Ensures crisp, publication-grade vector rendering in PDF reports.
    Delegates to _draw_rectangles_reportlab when continuous RectanglesModel is provided.
    """
    if rectangles is not None:
        return _draw_rectangles_reportlab(rectangles, width=width, height=height)

    drawing = Drawing(width, height)

    # 1. Normalize placements into standard dictionaries
    norm_placements: List[Dict[str, Any]] = []
    if isinstance(placements, (list, tuple)):
        for p in placements:
            if isinstance(p, dict):
                rid = p.get("room_id", "")
                r = int(p.get("row", p.get("r", 0)))
                c = int(p.get("col", p.get("c", 0)))
                w = int(p.get("width", p.get("w", 1)))
                h = int(p.get("height", p.get("h", 1)))
                name = str(p.get("room_name", p.get("name", rid.replace("_", " ").title())))
                area = float(p.get("area_sqm", p.get("area", 0.0)))
            else:
                rid = getattr(p, "room_id", "")
                r = int(getattr(p, "row", getattr(p, "r", 0)))
                c = int(getattr(p, "col", getattr(p, "c", 0)))
                w = int(getattr(p, "width", getattr(p, "w", 1)))
                h = int(getattr(p, "height", getattr(p, "h", 1)))
                name = str(getattr(p, "room_name", getattr(p, "name", rid.replace("_", " ").title())))
                area = float(getattr(p, "area_sqm", getattr(p, "area", 0.0)))

            norm_placements.append({
                "room_id": rid,
                "row": r,
                "col": c,
                "width": w,
                "height": h,
                "name": name,
                "area": area
            })

    # 2. Reconstruct matrix
    rows = len(grid_matrix) if grid_matrix else (max((p["row"] + p["height"] for p in norm_placements), default=10))
    cols = len(grid_matrix[0]) if grid_matrix and grid_matrix[0] else (max((p["col"] + p["width"] for p in norm_placements), default=10))
    rows = max(rows, 1)
    cols = max(cols, 1)

    matrix: List[List[Optional[str]]] = [[None for _ in range(cols)] for _ in range(rows)]
    if grid_matrix:
        for r in range(min(rows, len(grid_matrix))):
            for c in range(min(cols, len(grid_matrix[r]))):
                val = grid_matrix[r][c]
                matrix[r][c] = None if val in (None, "", "empty") else val
    else:
        for p in norm_placements:
            for r in range(p["row"], p["row"] + p["height"]):
                for c in range(p["col"], p["col"] + p["width"]):
                    if 0 <= r < rows and 0 <= c < cols:
                        matrix[r][c] = p["room_id"]

    # 3. Canvas background and dimensions
    drawing.add(Rect(0, 0, width, height, fillColor=colors.HexColor("#FFFFFF"), strokeColor=colors.HexColor("#CBD5E1"), strokeWidth=0.5))

    pad_x = 35.0
    pad_y = 25.0
    avail_w = width - (2.0 * pad_x)
    avail_h = height - (2.0 * pad_y)

    cell_size = min(avail_w / cols, avail_h / rows)
    draw_w = cols * cell_size
    draw_h = rows * cell_size
    offset_x = (width - draw_w) / 2.0
    offset_y = (height - draw_h) / 2.0

    # Plinth boundary
    drawing.add(Rect(offset_x, offset_y, draw_w, draw_h, fillColor=None, strokeColor=colors.HexColor("#CBD5E1"), strokeWidth=0.75, strokeDashArray=[3, 3]))

    # Room fills
    color_map = {
        "master_bed": colors.HexColor("#F1F5F9"),
        "living": colors.HexColor("#F0FDF4"),
        "kitchen": colors.HexColor("#FEF3C7"),
        "puja": colors.HexColor("#FEF9C3"),
        "bath_1": colors.HexColor("#E0F2FE"),
        "bath_2": colors.HexColor("#E0F2FE"),
        "bed_2": colors.HexColor("#F8FAFC"),
        "dining": colors.HexColor("#FDF2F8"),
        "stairs": colors.HexColor("#F5F3FF"),
        "corridor": colors.white
    }

    for p in norm_placements:
        rx = offset_x + (p["col"] * cell_size)
        ry = offset_y + ((rows - (p["row"] + p["height"])) * cell_size)
        rw = p["width"] * cell_size
        rh = p["height"] * cell_size
        fcolor = color_map.get(p["room_id"], colors.HexColor("#F8FAFC"))
        drawing.add(Rect(rx, ry, rw, rh, fillColor=fcolor, strokeColor=None, strokeWidth=0))

    # Door and Window Cutouts
    h_cutouts: Dict[int, List[Tuple[float, float]]] = {}  # r -> list of (x1, x2)
    v_cutouts: Dict[int, List[Tuple[float, float]]] = {}  # c -> list of (y1, y2) in RL coords
    door_rad = min(cell_size * 0.85, 18.0)
    door_rad = max(door_rad, 12.0)

    for p in norm_placements:
        if p["room_id"] in ("corridor", "living"):
            continue

        r = p["row"]
        c = p["col"]
        w = p["width"]
        h = p["height"]
        r_end = r + h
        c_end = c + w

        rx = offset_x + (c * cell_size)
        ry = offset_y + ((rows - r_end) * cell_size)
        rw = w * cell_size
        rh = h * cell_size

        # Find best side: N, S, W, E
        candidates = []
        n_sc = 100 if (r > 0 and any(matrix[r - 1][col] == "corridor" for col in range(c, c_end))) else (
            50 if (r > 0 and any(matrix[r - 1][col] == "living" for col in range(c, c_end))) else (
                10 if (r > 0 and any(matrix[r - 1][col] is not None for col in range(c, c_end))) else 0
            )
        )
        candidates.append(("N", n_sc))
        s_sc = 100 if (r_end < rows and any(matrix[r_end][col] == "corridor" for col in range(c, c_end))) else (
            50 if (r_end < rows and any(matrix[r_end][col] == "living" for col in range(c, c_end))) else (
                10 if (r_end < rows and any(matrix[r_end][col] is not None for col in range(c, c_end))) else 0
            )
        )
        candidates.append(("S", s_sc))
        w_sc = 100 if (c > 0 and any(matrix[row][c - 1] == "corridor" for row in range(r, r_end))) else (
            50 if (c > 0 and any(matrix[row][c - 1] == "living" for row in range(r, r_end))) else (
                10 if (c > 0 and any(matrix[row][c - 1] is not None for row in range(r, r_end))) else 0
            )
        )
        candidates.append(("W", w_sc))
        e_sc = 100 if (c_end < cols and any(matrix[row][c_end] == "corridor" for row in range(r, r_end))) else (
            50 if (c_end < cols and any(matrix[row][c_end] == "living" for row in range(r, r_end))) else (
                10 if (c_end < cols and any(matrix[row][c_end] is not None for row in range(r, r_end))) else 0
            )
        )
        candidates.append(("E", e_sc))
        candidates.sort(key=lambda x: x[1], reverse=True)
        chosen_side = candidates[0][0]

        offset_hinge = 5.0
        R = min(door_rad, (rw if chosen_side in ("N", "S") else rh) - offset_hinge - 2.0)
        R = max(R, 10.0)

        # In ReportLab:
        # North wall of room is at RL y = offset_y + (rows - r) * cell_size = ry + rh
        # Room interior is -Y (towards ry)
        if chosen_side == "N":
            hx = rx + offset_hinge
            hy = ry + rh
            leaf_x = hx
            leaf_y = hy - R
            h_cutouts.setdefault(r, []).append((hx, hx + R))
            drawing.add(Line(hx, hy, leaf_x, leaf_y, strokeColor=colors.HexColor("#0F172A"), strokeWidth=1.2))
            arc = ArcPath(strokeColor=colors.HexColor("#64748B"), strokeWidth=0.8, strokeDashArray=[2, 2], fillColor=None)
            arc.addArc(hx, hy, R, 270, 360)
            drawing.add(arc)
        elif chosen_side == "S":
            hx = rx + offset_hinge
            hy = ry
            leaf_x = hx
            leaf_y = hy + R
            h_cutouts.setdefault(r_end, []).append((hx, hx + R))
            drawing.add(Line(hx, hy, leaf_x, leaf_y, strokeColor=colors.HexColor("#0F172A"), strokeWidth=1.2))
            arc = ArcPath(strokeColor=colors.HexColor("#64748B"), strokeWidth=0.8, strokeDashArray=[2, 2], fillColor=None)
            arc.addArc(hx, hy, R, 0, 90)
            drawing.add(arc)
        elif chosen_side == "W":
            hx = rx
            hy = ry + rh - offset_hinge
            leaf_x = hx + R
            leaf_y = hy
            v_cutouts.setdefault(c, []).append((hy - R, hy))
            drawing.add(Line(hx, hy, leaf_x, leaf_y, strokeColor=colors.HexColor("#0F172A"), strokeWidth=1.2))
            arc = ArcPath(strokeColor=colors.HexColor("#64748B"), strokeWidth=0.8, strokeDashArray=[2, 2], fillColor=None)
            arc.addArc(hx, hy, R, 270, 360)
            drawing.add(arc)
        else:  # East
            hx = rx + rw
            hy = ry + rh - offset_hinge
            leaf_x = hx - R
            leaf_y = hy
            v_cutouts.setdefault(c_end, []).append((hy - R, hy))
            drawing.add(Line(hx, hy, leaf_x, leaf_y, strokeColor=colors.HexColor("#0F172A"), strokeWidth=1.2))
            arc = ArcPath(strokeColor=colors.HexColor("#64748B"), strokeWidth=0.8, strokeDashArray=[2, 2], fillColor=None)
            arc.addArc(hx, hy, R, 180, 270)
            drawing.add(arc)

    # Windows on exterior walls
    windows_rl = []
    habitable = {"master_bed", "living", "kitchen", "bed_2", "dining"}
    for p in norm_placements:
        if p["room_id"] not in habitable:
            continue
        r = p["row"]
        c = p["col"]
        w = p["width"]
        h = p["height"]
        r_end = r + h
        c_end = c + w
        rx = offset_x + (c * cell_size)
        ry = offset_y + ((rows - r_end) * cell_size)
        rw = w * cell_size
        rh = h * cell_size

        if r == 0 or all(matrix[r - 1][col] is None for col in range(c, c_end)):
            if p["room_id"] != "living":
                win_w = min(rw * 0.45, 24.0)
                wx = rx + (rw - win_w) / 2.0
                wy = ry + rh
                h_cutouts.setdefault(r, []).append((wx, wx + win_w))
                windows_rl.append(("H", wx, wx + win_w, wy))
        if r_end >= rows or all(matrix[r_end][col] is None for col in range(c, c_end)):
            win_w = min(rw * 0.45, 24.0)
            wx = rx + (rw - win_w) / 2.0
            wy = ry
            h_cutouts.setdefault(r_end, []).append((wx, wx + win_w))
            windows_rl.append(("H", wx, wx + win_w, wy))
        if c_end >= cols or all(matrix[row][c_end] is None for row in range(r, r_end)):
            win_h = min(rh * 0.45, 24.0)
            wy = ry + (rh - win_h) / 2.0
            wx = rx + rw
            v_cutouts.setdefault(c_end, []).append((wy, wy + win_h))
            windows_rl.append(("V", wy, wy + win_h, wx))
        if c == 0 or all(matrix[row][c - 1] is None for row in range(r, r_end)):
            win_h = min(rh * 0.45, 24.0)
            wy = ry + (rh - win_h) / 2.0
            wx = rx
            v_cutouts.setdefault(c, []).append((wy, wy + win_h))
            windows_rl.append(("V", wy, wy + win_h, wx))

    # Exterior & Interior Walls
    t_ext = 2.4
    t_int = 1.1
    half_ext = t_ext / 2.0

    # Horizontal Walls
    for r in range(rows + 1):
        c = 0
        rl_y = offset_y + ((rows - r) * cell_size)
        while c < cols:
            top_room = matrix[r - 1][c] if r > 0 else None
            bot_room = matrix[r][c] if r < rows else None
            if top_room == bot_room:
                c += 1
                continue
            is_ext = (top_room is None) != (bot_room is None)
            start_c = c
            while c < cols:
                t = matrix[r - 1][c] if r > 0 else None
                b = matrix[r][c] if r < rows else None
                if (t is None) != (b is None) if is_ext else (t is not None and b is not None and t != b):
                    c += 1
                else:
                    break
            end_c = c
            x1 = offset_x + (start_c * cell_size)
            x2 = offset_x + (end_c * cell_size)

            cuts = h_cutouts.get(r, [])
            if is_ext:
                for seg_x1, seg_x2 in _subtract_intervals_rl((x1, x2), cuts):
                    drawing.add(Line(seg_x1, rl_y, seg_x2, rl_y, strokeColor=colors.HexColor("#0F172A"), strokeWidth=t_ext, strokeLineCap=2))
            else:
                for seg_x1, seg_x2 in _subtract_intervals_rl((x1 + half_ext, x2 - half_ext), cuts):
                    drawing.add(Line(seg_x1, rl_y, seg_x2, rl_y, strokeColor=colors.HexColor("#475569"), strokeWidth=t_int, strokeLineCap=2))

    # Vertical Walls
    for c in range(cols + 1):
        r = 0
        rl_x = offset_x + (c * cell_size)
        while r < rows:
            left_room = matrix[r][c - 1] if c > 0 else None
            right_room = matrix[r][c] if c < cols else None
            if left_room == right_room:
                r += 1
                continue
            is_ext = (left_room is None) != (right_room is None)
            start_r = r
            while r < rows:
                l = matrix[r][c - 1] if c > 0 else None
                rg = matrix[r][c] if c < cols else None
                if (l is None) != (rg is None) if is_ext else (l is not None and rg is not None and l != rg):
                    r += 1
                else:
                    break
            end_r = r
            y_bot = offset_y + ((rows - end_r) * cell_size)
            y_top = offset_y + ((rows - start_r) * cell_size)

            cuts = v_cutouts.get(c, [])
            if is_ext:
                for seg_y1, seg_y2 in _subtract_intervals_rl((y_bot, y_top), cuts):
                    drawing.add(Line(rl_x, seg_y1, rl_x, seg_y2, strokeColor=colors.HexColor("#0F172A"), strokeWidth=t_ext, strokeLineCap=2))
            else:
                for seg_y1, seg_y2 in _subtract_intervals_rl((y_bot + half_ext, y_top - half_ext), cuts):
                    drawing.add(Line(rl_x, seg_y1, rl_x, seg_y2, strokeColor=colors.HexColor("#475569"), strokeWidth=t_int, strokeLineCap=2))

    # Draw windows: 3 parallel lines
    for w_item in windows_rl:
        if w_item[0] == "H":
            x1, x2, wy = w_item[1], w_item[2], w_item[3]
            drawing.add(Line(x1, wy - 1.0, x2, wy - 1.0, strokeColor=colors.HexColor("#64748B"), strokeWidth=0.6))
            drawing.add(Line(x1, wy, x2, wy, strokeColor=colors.HexColor("#0284C7"), strokeWidth=0.8))
            drawing.add(Line(x1, wy + 1.0, x2, wy + 1.0, strokeColor=colors.HexColor("#64748B"), strokeWidth=0.6))
        else:
            y1, y2, wx = w_item[1], w_item[2], w_item[3]
            drawing.add(Line(wx - 1.0, y1, wx - 1.0, y2, strokeColor=colors.HexColor("#64748B"), strokeWidth=0.6))
            drawing.add(Line(wx, y1, wx, y2, strokeColor=colors.HexColor("#0284C7"), strokeWidth=0.8))
            drawing.add(Line(wx + 1.0, y1, wx + 1.0, y2, strokeColor=colors.HexColor("#64748B"), strokeWidth=0.6))

    # Centered labels and metric dimensions
    for p in norm_placements:
        rx = offset_x + (p["col"] * cell_size)
        ry = offset_y + ((rows - (p["row"] + p["height"])) * cell_size)
        rw = p["width"] * cell_size
        rh = p["height"] * cell_size
        cx = rx + (rw / 2.0)
        cy = ry + (rh / 2.0)
        font_sz = max(6.5, min(8.0, cell_size * 0.38))
        drawing.add(String(cx, cy + 2.0, p["name"].upper()[:14], fontName="Helvetica-Bold", fontSize=font_sz, textAnchor="middle", fillColor=colors.HexColor("#0F172A")))
        if p["area"] > 0:
            drawing.add(String(cx, cy - 7.0, f"{p['area']:.1f} m²", fontName="Helvetica", fontSize=font_sz * 0.85, textAnchor="middle", fillColor=colors.HexColor("#64748B")))

    # Dimension lines & 45-degree ticks
    dim_top_y = offset_y + draw_h + 10.0
    drawing.add(Line(offset_x, dim_top_y, offset_x + draw_w, dim_top_y, strokeColor=colors.HexColor("#64748B"), strokeWidth=0.8))
    drawing.add(Line(offset_x - 3, dim_top_y - 3, offset_x + 3, dim_top_y + 3, strokeColor=colors.HexColor("#0F172A"), strokeWidth=1.2))
    drawing.add(Line(offset_x + draw_w - 3, dim_top_y - 3, offset_x + draw_w + 3, dim_top_y + 3, strokeColor=colors.HexColor("#0F172A"), strokeWidth=1.2))
    drawing.add(String(offset_x + (draw_w / 2.0), dim_top_y + 3.0, "FRONTAGE", fontName="Helvetica-Bold", fontSize=6.5, textAnchor="middle", fillColor=colors.HexColor("#475569")))

    dim_left_x = offset_x - 12.0
    drawing.add(Line(dim_left_x, offset_y, dim_left_x, offset_y + draw_h, strokeColor=colors.HexColor("#64748B"), strokeWidth=0.8))
    drawing.add(Line(dim_left_x - 3, offset_y - 3, dim_left_x + 3, offset_y + 3, strokeColor=colors.HexColor("#0F172A"), strokeWidth=1.2))
    drawing.add(Line(dim_left_x - 3, offset_y + draw_h - 3, dim_left_x + 3, offset_y + draw_h + 3, strokeColor=colors.HexColor("#0F172A"), strokeWidth=1.2))

    # North arrow badge
    compass_x = width - 25.0
    compass_y = height - 20.0
    drawing.add(String(compass_x, compass_y, "↑ N", fontName="Helvetica-Bold", fontSize=8.0, textAnchor="middle", fillColor=colors.HexColor("#0F172A")))

    return drawing


def generate_pdf_report(

    data: Dict[str, Any],
    site_vision: Optional[Dict[str, Any]] = None,
    floor_plan: Optional[Dict[str, Any]] = None
) -> io.BytesIO:
    """
    Generates a formal, professional vector PDF report from an AnalysisResponse payload.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=36,
        rightMargin=36,
        topMargin=42,
        bottomMargin=42
    )

    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=17,
        leading=21,
        textColor=colors.HexColor("#0F172A")
    )
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=11.5,
        textColor=colors.HexColor("#475569")
    )
    section_h1 = ParagraphStyle(
        'SectionH1',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=14,
        textColor=colors.HexColor("#0F172A"),
        spaceBefore=8,
        spaceAfter=3
    )
    body_text = ParagraphStyle(
        'ReportBody',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#1E293B")
    )
    table_text = ParagraphStyle(
        'TableBody',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.5,
        leading=9.5,
        textColor=colors.HexColor("#0F172A")
    )
    table_header = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7.5,
        leading=9.5,
        textColor=colors.white
    )
    disclaimer_style = ParagraphStyle(
        'DisclaimerText',
        parent=styles['Normal'],
        fontName='Helvetica-Oblique',
        fontSize=7,
        leading=9,
        textColor=colors.HexColor("#64748B")
    )

    story = []

    # Title & Metadata
    req_id = data.get("request_id") or ("BW-" + datetime.now().strftime("%Y%m%d%H%M"))
    timestamp_str = data.get("timestamp") or datetime.now().strftime("%Y-%m-%d %H:%M:%S UTC")
    coords = data.get("coordinates") or {}
    lat = coords.get("latitude") or 0.0
    lon = coords.get("longitude") or 0.0
    address = data.get("formatted_address") or "Site Location"

    story.append(Paragraph("BUILDWISE AI - SITE PLANNING & FEASIBILITY REPORT", title_style))
    story.append(Spacer(1, 2))
    story.append(Paragraph(f"Reference: {req_id} | Issued: {timestamp_str}", subtitle_style))
    story.append(Spacer(1, 6))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#0F172A"), spaceAfter=8))

    # Project Overview Table
    cost_data = data.get("cost_estimate") or {}
    base_cost = cost_data.get("base_cost_inr") or 0
    base_rate = cost_data.get("base_rate_per_sqft") or 1
    built_area = base_cost / max(base_rate, 1)
    slope_val = next((f.get('raw_value') for f in (data.get('factors') or []) if f.get('factor_id') == 'slope'), 0)
    slope_str = f"{slope_val}% Slope" if slope_val is not None else "0% Slope"

    meta_table_data = [
        [
            Paragraph(f"<b>Target Site:</b> {address}", table_text),
            Paragraph(f"<b>Coordinates:</b> {lat:.5f} N, {lon:.5f} E", table_text)
        ],
        [
            Paragraph(f"<b>Built-up Area:</b> {built_area:,.0f} sq ft", table_text),
            Paragraph(f"<b>Topographic Gradient:</b> {slope_str}", table_text)
        ]
    ]
    meta_table = Table(meta_table_data, colWidths=[260, 260])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#F1F5F9")),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 8))

    # Overall Suitability Summary Card
    score = data.get("overall_suitability_score") or 0.0
    verdict = data.get("suitability_verdict") or "Unknown"

    if score >= 70.0:
        verdict_color = colors.HexColor("#059669")
    elif score >= 50.0:
        verdict_color = colors.HexColor("#D97706")
    else:
        verdict_color = colors.HexColor("#DC2626")

    score_card_data = [
        [
            Paragraph("<b>COMPOSITE LAND SUITABILITY SCORE</b>", table_header),
            Paragraph("<b>FEASIBILITY CLASSIFICATION</b>", table_header)
        ],
        [
            Paragraph(f"<font size=15><b>{score:.1f} / 100</b></font>", table_text),
            Paragraph(f"<font size=13 color='{verdict_color.hexval()}'><b>{verdict.upper()}</b></font>", table_text)
        ]
    ]
    score_table = Table(score_card_data, colWidths=[260, 260])
    score_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1E293B")),
        ('BACKGROUND', (0, 1), (-1, 1), colors.HexColor("#F8FAFC")),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor("#0F172A")),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ]))
    story.append(score_table)
    story.append(Spacer(1, 8))

    # 1. Multi-Criteria Land Suitability Assessment
    story.append(Paragraph("1. Multi-Criteria Land Suitability Assessment (MCDA)", section_h1))
    factor_headers = [
        Paragraph("Evaluation Factor", table_header),
        Paragraph("Weight", table_header),
        Paragraph("Field Value", table_header),
        Paragraph("Score", table_header),
        Paragraph("Rating", table_header),
        Paragraph("Engineering Assessment", table_header)
    ]
    factor_rows = [factor_headers]

    for f in (data.get("factors") or []):
        st = (f.get("status") or "").capitalize()
        weight_val = f.get("weight") or 0.0
        score_val = f.get("score") or 0.0
        raw_val = f.get("raw_value") if f.get("raw_value") is not None else 0
        factor_rows.append([
            Paragraph(f"<b>{f.get('name', '')}</b>", table_text),
            Paragraph(f"{weight_val*100:.0f}%", table_text),
            Paragraph(f"{raw_val} {f.get('unit', '')}", table_text),
            Paragraph(f"{score_val:.1f}/100", table_text),
            Paragraph(st, table_text),
            Paragraph(f.get("details", ""), table_text)
        ])

    factor_table = Table(factor_rows, colWidths=[95, 35, 65, 45, 55, 225])
    factor_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1E293B")),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(factor_table)
    story.append(Spacer(1, 8))

    # 2. Hazard History & Climate Stress Profile (NEW)
    hazard = data.get("hazard_profile") or {}
    if hazard:
        seismic = hazard.get("seismic") or {}
        flood = hazard.get("flood") or {}
        storm = hazard.get("storm_cyclone") or {}

        story.append(Paragraph("2. Hazard History & Climate Stress Profile", section_h1))
        ratio = flood.get("discharge_peak_to_mean_ratio")
        ratio_display = f"{ratio:.1f}x" if isinstance(ratio, (int, float)) else "N/A (<0.1 m3/s)"
        z_factor = seismic.get("zone_factor")
        z_str = f"{z_factor:.2f}" if isinstance(z_factor, (int, float)) else "0.16"
        max_gust = storm.get("max_annual_gust_kmh") or 0.0
        rain_days = storm.get("extreme_rainfall_days") or 0.0

        hazard_table_data = [
            [
                Paragraph("<b>BIS IS 1893 Seismic Zone:</b>", table_text),
                Paragraph(f"<b>{seismic.get('zone', 'Zone III')}</b> (Z = {z_str})", table_text),
                Paragraph("<b>USGS 50-Yr Events (250km):</b>", table_text),
                Paragraph(f"{seismic.get('event_count_display', '0')} events (Max M{seismic.get('max_magnitude') or 'N/A'})", table_text)
            ],
            [
                Paragraph("<b>River Discharge Ratio:</b>", table_text),
                Paragraph(f"{ratio_display} ({flood.get('pressure_level', 'low').capitalize()})", table_text),
                Paragraph("<b>NDMA Flood Prone:</b>", table_text),
                Paragraph("Yes" if flood.get("ndma_flood_prone") else "No", table_text)
            ],
            [
                Paragraph("<b>Mean Annual Gust (ERA5):</b>", table_text),
                Paragraph(f"{max_gust:.1f} km/h", table_text),
                Paragraph("<b>Heavy Rain Days (>=50mm):</b>", table_text),
                Paragraph(f"{rain_days:.1f} days/yr (Cyclone: {'Yes' if storm.get('ndma_cyclone_prone') else 'No'})", table_text)
            ]
        ]
        haz_table = Table(hazard_table_data, colWidths=[130, 130, 130, 130])
        haz_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
            ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
            ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('LEFTPADDING', (0, 0), (-1, -1), 5),
            ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ]))
        story.append(haz_table)
        story.append(Spacer(1, 8))

    # 3. Passive Solar & Aerodynamic Orientation Strategy
    story.append(Paragraph("3. Passive Solar & Aerodynamic Orientation Strategy", section_h1))
    orient = data.get("orientation") or {}
    opt_axis = orient.get('optimal_axis_degrees') or 90
    wind_az = orient.get('prevailing_wind_direction_degrees')
    wind_az_val = wind_az if isinstance(wind_az, (int, float)) else 240.0

    orient_table_data = [
        [
            Paragraph("<b>Recommended Axis:</b>", table_text),
            Paragraph(f"{opt_axis} deg ({orient.get('axis_label', 'East-West')})", table_text),
            Paragraph("<b>Prevailing Wind:</b>", table_text),
            Paragraph(f"{wind_az_val:.0f} deg azimuth", table_text)
        ],
        [
            Paragraph("<b>Ventilation Index:</b>", table_text),
            Paragraph(orient.get("cross_ventilation_rating", "Good"), table_text),
            Paragraph("<b>Solar Apertures:</b>", table_text),
            Paragraph("Principal Glazing on North / South", table_text)
        ]
    ]
    orient_table = Table(orient_table_data, colWidths=[100, 160, 95, 165])
    orient_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(orient_table)
    story.append(Spacer(1, 4))
    story.append(Paragraph(f"<b>Design Rationale:</b> {orient.get('passive_design_rationale', '')}", body_text))
    story.append(Spacer(1, 8))

    # 4. Vastu Shastra & Functional Planning Advisory (NEW)
    vastu = data.get("vastu_advisory") or {}
    if vastu:
        story.append(Paragraph("4. Vastu Shastra & Functional Planning Advisory", section_h1))
        road_approach = vastu.get("road_approach") or {}
        road_side = road_approach.get("approach_side") or "unknown"
        slope_rd = vastu.get("slope_reading") or {}

        ranked_ents = vastu.get("ranked_entrances") or []
        ent_desc = ", ".join([f"{e.get('direction')} ({(e.get('score') or 0):.0f}/100)" for e in ranked_ents]) if ranked_ents else "None evaluated"

        vastu_meta_data = [
            [
                Paragraph(f"<b>Approach Road Side:</b> {road_side.upper()}", table_text),
                Paragraph(f"<b>Top Ranked Entrances:</b> {ent_desc}", table_text)
            ],
            [
                Paragraph(f"<b>Topographic Drainage:</b> Toward {slope_rd.get('drainage_direction') or 'Neutral'} ({(slope_rd.get('auspiciousness') or 'neutral').capitalize()})", table_text),
                Paragraph(f"<b>Remedy Note:</b> {slope_rd.get('remedy_notes') or 'Natural drainage direction favourable; standard grading.'}", table_text)
            ]
        ]
        vastu_table = Table(vastu_meta_data, colWidths=[180, 340])
        vastu_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
            ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
            ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('LEFTPADDING', (0, 0), (-1, -1), 5),
            ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ]))
        story.append(vastu_table)
        story.append(Spacer(1, 8))

    # 5. Preliminary Construction Cost Estimate (CPWD Aligned)
    story.append(Paragraph("5. Preliminary Construction Cost Estimate (CPWD Plinth Area Benchmarks)", section_h1))
    cost = data.get("cost_estimate") or {}
    cost_headers = [
        Paragraph("Cost Category", table_header),
        Paragraph("Amount (INR)", table_header),
        Paragraph("Share (%)", table_header),
        Paragraph("Scope of Civil Works", table_header)
    ]
    cost_rows = [cost_headers]

    for c in (cost.get("breakdown") or []):
        amt = c.get('amount_inr') or 0.0
        pct = c.get('percentage') or 0.0
        cost_rows.append([
            Paragraph(f"<b>{c.get('category', '')}</b>", table_text),
            Paragraph(f"INR {amt:,.0f}", table_text),
            Paragraph(f"{pct:.1f}%", table_text),
            Paragraph(c.get("description", ""), table_text)
        ])

    tot_inr = cost.get("total_estimated_cost_inr") or 0.0
    c_min = cost.get("cost_range_min_inr") or 0.0
    c_max = cost.get("cost_range_max_inr") or 0.0
    cost_rows.append([
        Paragraph("<b>TOTAL ESTIMATED BUDGET</b>", table_text),
        Paragraph(f"<b>INR {tot_inr:,.0f}</b>", table_text),
        Paragraph("<b>100.0%</b>", table_text),
        Paragraph(f"Range: INR {c_min:,.0f} - {c_max:,.0f} (+/-7.5% variation)", table_text)
    ])

    cost_table = Table(cost_rows, colWidths=[120, 100, 45, 255])
    cost_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1E293B")),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
        ('ROWBACKGROUNDS', (0, 1), (-1, -2), [colors.white, colors.HexColor("#F8FAFC")]),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor("#E2E8F0")),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(cost_table)
    story.append(Spacer(1, 8))

    # 6. Indicative Land Valuation (NEW)
    land = data.get("land_value") or {}
    if land:
        story.append(Paragraph("6. Indicative Land Valuation & Combined Project Outlay", section_h1))
        ind_rate = land.get("indicative_rate_per_sqft")
        land_cost = land.get("land_cost_inr")
        comb_tot = land.get("combined_project_total_inr")
        source_label = land.get("source_publication") or "Published Circle Rates"
        loc_mult = land.get("locality_multiplier")
        loc_mult_val = loc_mult if isinstance(loc_mult, (int, float)) else 1.0
        plot_area = land.get("plot_area_sqft") or 0

        rate_str = f"INR {ind_rate:,.0f} /sq ft {'(User-Supplied)' if land.get('is_user_override') else ''}" if ind_rate is not None and ind_rate > 0 else "Unlisted / Verification Required"
        cost_str = f"INR {land_cost:,.0f} ({plot_area:,.0f} sq ft plot)" if land_cost is not None else "Pending Rate Input"
        tot_str = f"<b>INR {comb_tot:,.0f}</b> (Land + Construction)" if comb_tot is not None else f"<b>INR {tot_inr:,.0f}</b> (Civil Construction Only)"

        land_table_data = [
            [
                Paragraph("<b>Indicative Land Rate:</b>", table_text),
                Paragraph(rate_str, table_text),
                Paragraph("<b>Locality Multiplier:</b>", table_text),
                Paragraph(f"{loc_mult_val:.2f}x (Road + Facility factors)", table_text)
            ],
            [
                Paragraph("<b>Estimated Land Cost:</b>", table_text),
                Paragraph(cost_str, table_text),
                Paragraph("<b>Total Project Outlay:</b>", table_text),
                Paragraph(tot_str, table_text)
            ]
        ]
        land_table = Table(land_table_data, colWidths=[120, 140, 110, 150])
        land_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
            ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
            ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('LEFTPADDING', (0, 0), (-1, -1), 5),
            ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ]))
        story.append(land_table)
        story.append(Spacer(1, 3))
        story.append(Paragraph(f"<b>Valuation Source:</b> {source_label}. <i>{land.get('disclaimer', '')}</i>", disclaimer_style))
        story.append(Spacer(1, 8))

    # 7. Site Constraints & Engineering Risk Mitigation
    story.append(Paragraph("7. Site Constraints & Engineering Risk Mitigation", section_h1))
    risk_headers = [
        Paragraph("Risk Classification", table_header),
        Paragraph("Severity", table_header),
        Paragraph("Observed Constraint", table_header),
        Paragraph("Prescribed Mitigation Measure", table_header)
    ]
    risk_rows = [risk_headers]

    for r in data.get("risks", []):
        sev = r.get("severity", "").upper()
        risk_rows.append([
            Paragraph(f"<b>{r.get('title', '')}</b>", table_text),
            Paragraph(sev, table_text),
            Paragraph(r.get("description", ""), table_text),
            Paragraph(r.get("mitigation_strategy", ""), table_text)
        ])

    risk_table = Table(risk_rows, colWidths=[120, 45, 175, 180])
    risk_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1E293B")),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(risk_table)
    story.append(Spacer(1, 8))

    # 8. Categorized & Traceable Action Plan (Upgraded)
    story.append(Paragraph("8. Traceable Civil Engineering Action Plan", section_h1))
    recs_items = data.get("recommendation_items", [])
    if recs_items:
        rec_headers = [
            Paragraph("Category & Rule ID", table_header),
            Paragraph("Severity", table_header),
            Paragraph("Trigger & Standard Reference", table_header),
            Paragraph("Prescribed Engineering Action", table_header)
        ]
        rec_rows = [rec_headers]

        for item in recs_items:
            sev = item.get("severity", "advisory").upper()
            rule_id = item.get("rule_id", "REC")
            cat_label = item.get("category_label", "Engineering")
            trig = item.get("trigger_condition", "")
            src_ref = item.get("source_data_ref", "")
            rec_rows.append([
                Paragraph(f"<b>{cat_label}</b><br/><font color='#64748B'>{rule_id}</font>", table_text),
                Paragraph(f"<b>{sev}</b>", table_text),
                Paragraph(f"<b>{trig}</b><br/><font color='#64748B'>{src_ref}</font>", table_text),
                Paragraph(item.get("recommendation_text", ""), table_text)
            ])

        rec_table = Table(rec_rows, colWidths=[110, 45, 145, 220])
        rec_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1E293B")),
            ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
            ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('LEFTPADDING', (0, 0), (-1, -1), 5),
            ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ]))
        story.append(rec_table)
    else:
        # Fallback to plain list if recommendation_items absent
        for idx, rec in enumerate(data.get("detailed_recommendations", []), 1):
            story.append(Paragraph(f"<b>{idx}.</b> {rec}", body_text))
            story.append(Spacer(1, 2))

    # 9. Ecological Site Vision & Tree Preservation (Sentinel-2 Remote Sensing)
    vision = site_vision if site_vision is not None else data.get("site_vision")
    if hasattr(vision, "model_dump"):
        vision = vision.model_dump()

    if vision and isinstance(vision, dict) and vision.get("mode") != "unavailable":
        story.append(Paragraph("9. Ecological Site Vision & Tree Preservation Plan", section_h1))

        green_pct = float(vision.get("green_cover_pct", 0.0))
        water_pct = float(vision.get("water_cover_pct", 0.0))
        built_pct = float(vision.get("built_up_pct", 0.0))
        clusters = vision.get("tree_clusters", {}).get("features", [])
        cluster_count = len(clusters) if isinstance(clusters, list) else 0
        scene_meta = vision.get("scene_metadata") or {}
        img_date = scene_meta.get("datetime", "Recent")[:10] if scene_meta.get("datetime") else "N/A"
        mode_label = vision.get("mode", "index-only").upper()

        summary_text = (
            f"<b>Spectral Green Cover:</b> {green_pct:.1f}% | "
            f"<b>Tree Canopy Clusters:</b> {cluster_count} | "
            f"<b>Water Cover:</b> {water_pct:.1f}% | "
            f"<b>Built-up Ratio:</b> {built_pct:.1f}% | "
            f"<b>Acquisition:</b> {img_date} (Copernicus Sentinel-2, Mode: {mode_label})"
        )
        story.append(Paragraph(summary_text, body_text))
        story.append(Spacer(1, 4))

        plan = vision.get("preservation_plan", [])
        if plan:
            top_items = [p.model_dump() if hasattr(p, "model_dump") else p for p in plan[:3]]
            plan_headers = [
                Paragraph("Cluster ID", table_header),
                Paragraph("Canopy Area", table_header),
                Paragraph("Action Rank", table_header),
                Paragraph("Prescribed Civil / Ecological Measure", table_header)
            ]
            plan_rows = [plan_headers]
            for p in top_items:
                cid = p.get("cluster_id", "cluster")
                area = f"{p.get('area_sqm', 0):.0f} m²"
                rank = p.get("rank", "context").upper()
                action = p.get("action", "")
                plan_rows.append([
                    Paragraph(f"<b>{cid}</b>", table_text),
                    Paragraph(area, table_text),
                    Paragraph(f"<b>{rank}</b>", table_text),
                    Paragraph(action, table_text)
                ])

            plan_table = Table(plan_rows, colWidths=[90, 65, 80, 285])
            plan_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1E293B")),
                ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
                ('TOPPADDING', (0, 0), (-1, -1), 3),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
                ('LEFTPADDING', (0, 0), (-1, -1), 5),
                ('RIGHTPADDING', (0, 0), (-1, -1), 5),
            ]))
            story.append(plan_table)
            story.append(Spacer(1, 6))

    # 10. Generative Architectural Blueprint (Vastu & Spatial CSP)
    floorplan = floor_plan if floor_plan is not None else (data.get("floor_plan") or data.get("floorplan"))
    if hasattr(floorplan, "model_dump"):
        floorplan = floorplan.model_dump()

    if floorplan and isinstance(floorplan, dict) and (floorplan.get("grid_matrix") or floorplan.get("placements") or floorplan.get("svg_blueprint")):
        from app.services.floorplan.floorplan_service import create_floorplan_reportlab_drawing

        story.append(Paragraph("10. Generative Architectural Blueprint (Vastu & Spatial CSP)", section_h1))

        metrics = floorplan.get("metrics") or {}
        v_pct = float(metrics.get("vastu_compliance_pct", 0.0))
        p_pct = float(metrics.get("plumbing_adjacency_score", 0.0))
        u_pct = float(metrics.get("space_utilization_pct", 0.0))
        b_area = float(metrics.get("total_built_up_sqm", 0.0))
        st_val = (floorplan.get("status") or "optimal").upper()
        t_ms = float(floorplan.get("timing_ms", 0.0))

        fp_summary = (
            f"<b>Solver Status:</b> {st_val} ({t_ms:.1f} ms) | "
            f"<b>Vastu Compliance:</b> {v_pct:.1f}% | "
            f"<b>Plumbing Adjacency:</b> {p_pct:.1f}% | "
            f"<b>Space Utilization:</b> {u_pct:.1f}% | "
            f"<b>Total Habitable:</b> {b_area:.1f} m²"
        )
        story.append(Paragraph(fp_summary, body_text))
        story.append(Spacer(1, 4))

        drawing = draw_floorplan_reportlab(
            floorplan.get("placements") or [],
            floorplan.get("grid_matrix") or [],
            width=520.0,
            height=220.0,
            rectangles=floorplan.get("rectangles")
        )
        story.append(drawing)
        story.append(Spacer(1, 6))

    # Formal Engineering Disclaimer
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#94A3B8"), spaceAfter=5))
    disclaimer_text = (
        "LEGAL & ENGINEERING DISCLAIMER: This assessment is generated algorithmically for preliminary planning and concept feasibility purposes only. "
        "Calculations are based on public digital elevation datasets, remote meteorological telemetry, and CPWD Plinth Area Rates (PAR). "
        "This report does not constitute a certified geotechnical borehole survey, an approved municipal structural drawing, or legal land title clearance. "
        "Physical site testing and certified structural engineer stamp are mandatory prior to any ground excavation or contract tender."
    )
    story.append(Paragraph(disclaimer_text, disclaimer_style))

    # Build document with custom canvas
    doc.build(story, canvasmaker=NumberedCanvas)
    buffer.seek(0)
    return buffer
