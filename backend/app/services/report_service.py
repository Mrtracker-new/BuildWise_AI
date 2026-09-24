import io
import os
import html
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple

from app.schemas.request import ReportRequest

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether, HRFlowable, PageBreak
)
from reportlab.pdfgen import canvas
from reportlab.graphics.shapes import Drawing, Rect, Line, String, Group, ArcPath, Circle, Polygon
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont


# =============================================================================
# 1. FONT REGISTRATION & TYPOGRAPHY SYSTEM
# =============================================================================

def _init_inter_fonts() -> Tuple[str, str, str, str]:
    """
    Registers Inter TrueType fonts with ReportLab for font subsetting and crisp vector rendering.
    Falls back gracefully to Helvetica if Inter TTF files are unavailable.
    """
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    fonts_dir = os.path.join(base_dir, "assets", "fonts")

    font_files = {
        "Inter": os.path.join(fonts_dir, "Inter-Regular.ttf"),
        "Inter-Medium": os.path.join(fonts_dir, "Inter-Medium.ttf"),
        "Inter-SemiBold": os.path.join(fonts_dir, "Inter-SemiBold.ttf"),
        "Inter-Bold": os.path.join(fonts_dir, "Inter-Bold.ttf"),
    }

    all_exist = all(os.path.exists(p) and os.path.getsize(p) > 1000 for p in font_files.values())

    if all_exist:
        try:
            for font_name, font_path in font_files.items():
                if font_name not in pdfmetrics.getRegisteredFontNames():
                    pdfmetrics.registerFont(TTFont(font_name, font_path))
            pdfmetrics.registerFontFamily(
                "Inter",
                normal="Inter",
                bold="Inter-Bold",
                italic="Inter",
                boldItalic="Inter-Bold"
            )
            return "Inter", "Inter-Medium", "Inter-SemiBold", "Inter-Bold"
        except Exception:
            pass

    # Fallback to Helvetica
    return "Helvetica", "Helvetica", "Helvetica-Bold", "Helvetica-Bold"


FONT_REGULAR, FONT_MEDIUM, FONT_SEMIBOLD, FONT_BOLD = _init_inter_fonts()


# =============================================================================
# 2. APPLE DESIGN PALETTE & TOKENS
# =============================================================================

PAGE_MARGIN_MM = 18.0
PAGE_MARGIN_PT = PAGE_MARGIN_MM * mm  # ~51.02 pt
CONTENT_WIDTH_PT = A4[0] - (2.0 * PAGE_MARGIN_PT)  # ~493.23 pt (174.0 mm >= 165mm)

COLOR_TEXT_PRIMARY = colors.HexColor("#1D1D1F")
COLOR_TEXT_SECONDARY = colors.HexColor("#6E6E73")
COLOR_TEXT_TERTIARY = colors.HexColor("#86868B")

COLOR_ACCENT = colors.HexColor("#0071E3")
COLOR_ACCENT_TINT = colors.HexColor("#E5F1FC")  # 12% fill

COLOR_HAIRLINE = colors.HexColor("#E5E5EA")  # rgba(0,0,0,0.10) equivalent on white
COLOR_BG_SUBTLE = colors.HexColor("#F5F5F7")  # 4% gray fill
COLOR_TRACK_GRAY = colors.HexColor("#EBEBED")  # 8% gray fill

# Semantic colors & 12% tint fills
COLOR_GREEN_TEXT = colors.HexColor("#1B873F")
COLOR_GREEN_TINT = colors.HexColor("#EBF9F0")
COLOR_GREEN_BORDER = colors.HexColor("#34C759")

COLOR_AMBER_TEXT = colors.HexColor("#B25E00")
COLOR_AMBER_TINT = colors.HexColor("#FFF4E5")
COLOR_AMBER_BORDER = colors.HexColor("#FF9500")

COLOR_RED_TEXT = colors.HexColor("#D70015")
COLOR_RED_TINT = colors.HexColor("#FDECEB")
COLOR_RED_BORDER = colors.HexColor("#FF3B30")


# =============================================================================
# 3. RUNNING TWO-PASS CANVAS WITH NUMBERING
# =============================================================================

class NumberedCanvas(canvas.Canvas):
    """
    Two-pass canvas to dynamically stamp running headers and footers with exact total page count.
    Apple design language: Hairline rules, left-aligned confidential title, Page X of Y on right.
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
        left_x = PAGE_MARGIN_PT
        right_x = A4[0] - PAGE_MARGIN_PT

        # Running header on pages 2+
        if self._pageNumber > 1:
            self.setFont(FONT_REGULAR, 7.5)
            self.setFillColor(COLOR_TEXT_TERTIARY)
            self.drawString(left_x, A4[1] - 26, "BuildWise AI • Site Feasibility & Engineering Advisory")
            self.drawRightString(right_x, A4[1] - 26, "Confidential Preliminary Assessment")
            self.setStrokeColor(COLOR_HAIRLINE)
            self.setLineWidth(0.5)
            self.line(left_x, A4[1] - 32, right_x, A4[1] - 32)

        # Running footer on every page
        footer_line_y = 34.0
        self.setStrokeColor(COLOR_HAIRLINE)
        self.setLineWidth(0.5)
        self.line(left_x, footer_line_y, right_x, footer_line_y)

        self.setFont(FONT_REGULAR, 7.5)
        self.setFillColor(COLOR_TEXT_TERTIARY)
        self.drawString(left_x, 22.0, "BuildWise AI - Confidential Preliminary Assessment")
        self.drawRightString(right_x, 22.0, f"Page {self._pageNumber} of {page_count}")
        self.restoreState()


# =============================================================================
# 4. REUSABLE APPLE FLOWABLE BUILDERS & SAFE HELPERS
# =============================================================================

def _get(obj: Any, key: str, default: Any = None) -> Any:
    """
    Safely retrieves key or attribute from a dict or object.
    If the value exists but is None, returns default.
    """
    if obj is None:
        return default
    if hasattr(obj, key):
        val = getattr(obj, key)
        return val if val is not None else default
    if isinstance(obj, dict):
        val = obj.get(key)
        return val if val is not None else default
    return default


def _safe_float(val: Any, default: float = 0.0) -> float:
    """Safely converts val to float; falls back to default on None, ValueError, or TypeError."""
    if val is None:
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


def _safe_int(val: Any, default: int = 0) -> int:
    """Safely converts val to int; falls back to default on None, ValueError, or TypeError."""
    if val is None:
        return default
    try:
        return int(val)
    except (ValueError, TypeError):
        return default


def make_pill(text: str, bg_color: colors.Color, text_color: colors.Color, width: float = 75.0) -> Table:
    """
    Renders an Apple-style tinted pill with 12% fill, rounded 4pt corners, and bold 8pt text.
    """
    p_style = ParagraphStyle(
        f"Pill_{id(bg_color)}_{id(text_color)}",
        fontName=FONT_SEMIBOLD,
        fontSize=8.0,
        leading=10.0,
        textColor=text_color,
        alignment=1  # Centered
    )
    safe_text = html.escape(str(text)) if text is not None else ""
    t = Table([[Paragraph(safe_text, p_style)]], colWidths=[width])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), bg_color),
        ('ROUNDEDCORNERS', [4, 4, 4, 4]),
        ('TOPPADDING', (0, 0), (-1, -1), 2.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2.5),
        ('LEFTPADDING', (0, 0), (-1, -1), 4.0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4.0),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    return t


def make_callout(text: str, width: float = CONTENT_WIDTH_PT) -> Table:
    """
    Renders an Apple-style callout box: rounded 6pt rect, 4% gray fill, 2pt accent left bar, 9pt text.
    """
    p_style = ParagraphStyle(
        "CalloutStyle",
        fontName=FONT_REGULAR,
        fontSize=9.0,
        leading=13.5,
        textColor=COLOR_TEXT_PRIMARY,
        alignment=0  # Left-aligned everywhere
    )
    t = Table([[Paragraph(text, p_style)]], colWidths=[width])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), COLOR_BG_SUBTLE),
        ('ROUNDEDCORNERS', [6, 6, 6, 6]),
        ('LINEBEFORE', (0, 0), (0, -1), 2.0, COLOR_ACCENT),
        ('TOPPADDING', (0, 0), (-1, -1), 7.0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 7.0),
        ('LEFTPADDING', (0, 0), (-1, -1), 10.0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8.0),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    return t


def make_stat_tile(label: str, value: str, width: float) -> Table:
    """
    Renders a single Apple-style stat tile: rounded 6pt rect, 4% gray fill, label 7.5pt gray, value 11pt/600.
    """
    s_lbl = ParagraphStyle('TileLbl', fontName=FONT_REGULAR, fontSize=7.5, leading=9.5, textColor=COLOR_TEXT_SECONDARY, alignment=0)
    s_val = ParagraphStyle('TileVal', fontName=FONT_SEMIBOLD, fontSize=11.0, leading=13.5, textColor=COLOR_TEXT_PRIMARY, alignment=0)
    t = Table([[Paragraph(label, s_lbl)], [Spacer(1, 2)], [Paragraph(value, s_val)]], colWidths=[width])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), COLOR_BG_SUBTLE),
        ('ROUNDEDCORNERS', [6, 6, 6, 6]),
        ('BOX', (0, 0), (-1, -1), 0.5, COLOR_HAIRLINE),
        ('TOPPADDING', (0, 0), (-1, -1), 5.0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5.0),
        ('LEFTPADDING', (0, 0), (-1, -1), 6.0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6.0),
    ]))
    return t


def make_share_cell(pct: float, bar_width: float = 113.4) -> Table:
    """
    Renders a cost table share cell: 40mm (~113.4pt) mini progress bar with track 8% gray and accent fill, plus percentage label.
    """
    pct_val = _safe_float(pct, 0.0)
    d = Drawing(bar_width, 6.0)
    d.add(Rect(0, 0, bar_width, 6.0, rx=3, ry=3, fillColor=COLOR_TRACK_GRAY, strokeColor=None))
    fill_w = max(2.0, min(bar_width, (pct_val / 100.0) * bar_width))
    d.add(Rect(0, 0, fill_w, 6.0, rx=3, ry=3, fillColor=COLOR_ACCENT, strokeColor=None))

    p = Paragraph(f"{pct_val:.1f}%", ParagraphStyle('SharePct', fontName=FONT_REGULAR, fontSize=8.0, leading=10.0, textColor=COLOR_TEXT_PRIMARY, alignment=2))
    t = Table([[d, p]], colWidths=[bar_width + 4.0, 32.0])
    t.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    return t


def create_section_header(num_str: str, title_str: str) -> KeepTogether:
    """
    Section header pattern: '01' accent 9pt/700 + title 13pt/600 + hairline rule, 24pt before / 10pt after.
    """
    p_style = ParagraphStyle(
        "SectionHeaderStyle",
        fontName=FONT_SEMIBOLD,
        fontSize=13.0,
        leading=16.0,
        textColor=COLOR_TEXT_PRIMARY,
        alignment=0
    )
    header_p = Paragraph(
        f'<font color="{COLOR_ACCENT.hexval()}" size="9"><b>{num_str}</b></font>&nbsp;&nbsp;&nbsp;&nbsp;'
        f'<font color="{COLOR_TEXT_PRIMARY.hexval()}" size="13"><b>{title_str}</b></font>',
        p_style
    )
    return KeepTogether([
        Spacer(1, 20),
        header_p,
        Spacer(1, 4),
        HRFlowable(width="100%", thickness=0.5, color=COLOR_HAIRLINE, spaceBefore=2, spaceAfter=8)
    ])


# =============================================================================
# 5. BLUEPRINT VECTOR DRAWING ENGINE
# =============================================================================

def _subtract_intervals_rl(
    base: Tuple[float, float],
    cutouts: List[Tuple[float, float]]
) -> List[Tuple[float, float]]:
    """Subtracts cutout door/window intervals from a base wall interval."""
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
    width: float = CONTENT_WIDTH_PT,
    height: float = 450.0
) -> Drawing:
    """
    Renders continuous envelope RectanglesModel into publication-grade ReportLab vector drawing.
    Occupies full content width (>=165mm) and >=60% of page height.
    Features: room labels >=8pt with halo, metric dimension lines with frontage callout,
    north arrow top-right, and metric graphic scale bar bottom-left.
    """
    env = _get(rectangles, "envelope")
    env_x = _safe_float(_get(env, "x", 1.0), 1.0)
    env_y = _safe_float(_get(env, "y", 1.0), 1.0)
    env_w = _safe_float(_get(env, "width", 8.0), 8.0)
    env_h = _safe_float(_get(env, "height", 8.0), 8.0)
    if env_w <= 0.0:
        env_w = 8.0
    if env_h <= 0.0:
        env_h = 8.0

    rooms_data = _get(rectangles, "rooms", []) or []
    doors_data = _get(rectangles, "doors", []) or []
    windows_data = _get(rectangles, "windows", []) or []

    max_x = max([env_x + env_w] + [_safe_float(_get(r, "x", 0.0)) + _safe_float(_get(r, "width", 0.0)) for r in rooms_data])
    max_y = max([env_y + env_h] + [_safe_float(_get(r, "y", 0.0)) + _safe_float(_get(r, "height", 0.0)) for r in rooms_data])
    plot_w = max(max_x + 1.0, 10.0)
    plot_d = max(max_y + 1.5, 10.0)

    pad_x = 45.0
    pad_y = 40.0
    avail_w = width - (2.0 * pad_x)
    avail_h = height - (2.0 * pad_y)
    scale = min(avail_w / max(plot_w, 1.0), avail_h / max(plot_d, 1.0))
    draw_w = plot_w * scale
    draw_h = plot_d * scale
    offset_x = (width - draw_w) / 2.0
    offset_y = (height - draw_h) / 2.0

    def x_pt(xm: float) -> float:
        return offset_x + (xm * scale)

    def y_pt(ym: float) -> float:
        return offset_y + ((plot_d - ym) * scale)

    drawing = Drawing(width, height)
    # Sheet background and subtle setback line
    drawing.add(Rect(0, 0, width, height, fillColor=colors.HexColor("#FFFFFF"), strokeColor=COLOR_HAIRLINE, strokeWidth=0.5, rx=6, ry=6))
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
        "corridor": colors.white,
        "home_office": colors.HexColor("#F0FDF4"),
        "powder_room": colors.HexColor("#E0F2FE"),
        "retail_floor": colors.HexColor("#EFF6FF"),
        "lobby": colors.HexColor("#F0FDF4"),
        "offices": colors.HexColor("#F1F5F9"),
        "restroom": colors.HexColor("#E0F2FE"),
        "server_room": colors.HexColor("#F3F4F6"),
        "utility": colors.HexColor("#FEF3C7"),
        "study": colors.HexColor("#F0FDF4"),
        "production_floor": colors.HexColor("#EFF6FF"),
        "storage_bay": colors.HexColor("#F8FAFC"),
        "office": colors.HexColor("#F1F5F9"),
        "utility_wc": colors.HexColor("#E0F2FE"),
    }

    parsed_rooms = []
    for r in rooms_data:
        rid = str(_get(r, "room_id", "") or "")
        rx = _safe_float(_get(r, "x", 0.0))
        ry = _safe_float(_get(r, "y", 0.0))
        rw = _safe_float(_get(r, "width", 0.0))
        rh = _safe_float(_get(r, "height", 0.0))
        fc = color_map.get(rid, colors.HexColor("#F8FAFC"))
        drawing.add(Rect(x_pt(rx), y_pt(ry + rh), rw * scale, rh * scale, fillColor=fc, strokeColor=None, strokeWidth=0))
        default_name = rid.replace("_", " ").title() if rid else "Room"
        parsed_rooms.append({
            "id": rid,
            "name": str(_get(r, "room_name", default_name) or default_name),
            "x": rx,
            "y": ry,
            "w": rw,
            "h": rh,
            "area": _safe_float(_get(r, "area_sqm", rw * rh)),
            "zone": str(_get(r, "zone", "General") or "General"),
            "vastu": bool(_get(r, "vastu_compliant", False))
        })

    parsed_doors = []
    for d in doors_data:
        parsed_doors.append({
            "id": str(_get(d, "door_id", "") or ""),
            "edge": str(_get(d, "wall_edge", "") or ""),
            "x1": _safe_float(_get(d, "x1", 0.0)),
            "y1": _safe_float(_get(d, "y1", 0.0)),
            "x2": _safe_float(_get(d, "x2", 0.0)),
            "y2": _safe_float(_get(d, "y2", 0.0)),
            "hx": _safe_float(_get(d, "hinge_x", 0.0)),
            "hy": _safe_float(_get(d, "hinge_y", 0.0)),
            "swing": str(_get(d, "swing_direction", "inward_right") or "inward_right"),
            "w_m": _safe_float(_get(d, "width_m", 0.9), 0.9)
        })

    parsed_windows = []
    for w in windows_data:
        parsed_windows.append({
            "id": str(_get(w, "window_id", "") or ""),
            "edge": str(_get(w, "wall_edge", "") or ""),
            "x1": _safe_float(_get(w, "x1", 0.0)),
            "y1": _safe_float(_get(w, "y1", 0.0)),
            "x2": _safe_float(_get(w, "x2", 0.0)),
            "y2": _safe_float(_get(w, "y2", 0.0)),
            "w_m": _safe_float(_get(w, "width_m", 1.2), 1.2)
        })

    # Interior Shared Partition Walls (1.2pt navy)
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

    # Exterior Envelope Walls (2.4pt dark slate)
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

    # On-plan Room Typography with Background Halo (>=8pt)
    for r in parsed_rooms:
        cx = x_pt(r["x"] + r["w"] / 2.0)
        cy = y_pt(r["y"] + r["h"] / 2.0)
        label_text = r["name"].upper()

        # Background halo rounded pill
        halo_w = max(len(label_text) * 6.2, 54.0)
        drawing.add(Rect(
            cx - (halo_w / 2.0), cy - 12.0, halo_w, 24.0,
            rx=4, ry=4,
            fillColor=colors.Color(1, 1, 1, alpha=0.92),
            strokeColor=colors.Color(0, 0, 0, alpha=0.08),
            strokeWidth=0.5
        ))

        # Room name >=8pt
        drawing.add(String(cx, cy + 2.5, label_text, textAnchor="middle", fontSize=8.5, fontName=FONT_BOLD, fillColor=COLOR_TEXT_PRIMARY))
        drawing.add(String(cx, cy - 6.5, f"{r['w']:.1f}m × {r['h']:.1f}m • {r['area']:.1f} m²", textAnchor="middle", fontSize=7.0, fontName=FONT_REGULAR, fillColor=COLOR_TEXT_SECONDARY))

    # Metric Dimension Lines & Frontage Callout
    dim_top_y = y_pt(0.0) + 16.0
    dim_x1 = x_pt(0.0)
    dim_x2 = x_pt(plot_w)
    # Extension lines
    drawing.add(Line(dim_x1, y_pt(0.0) + 2.0, dim_x1, dim_top_y + 5.0, strokeColor=colors.HexColor("#94A3B8"), strokeWidth=0.6, strokeDashArray=[2, 2]))
    drawing.add(Line(dim_x2, y_pt(0.0) + 2.0, dim_x2, dim_top_y + 5.0, strokeColor=colors.HexColor("#94A3B8"), strokeWidth=0.6, strokeDashArray=[2, 2]))
    # Main dimension line
    drawing.add(Line(dim_x1, dim_top_y, dim_x2, dim_top_y, strokeColor=colors.HexColor("#334155"), strokeWidth=1.0))
    # 45-degree ticks
    drawing.add(Line(dim_x1 - 4, dim_top_y - 4, dim_x1 + 4, dim_top_y + 4, strokeColor=COLOR_TEXT_PRIMARY, strokeWidth=1.4))
    drawing.add(Line(dim_x2 - 4, dim_top_y - 4, dim_x2 + 4, dim_top_y + 4, strokeColor=COLOR_TEXT_PRIMARY, strokeWidth=1.4))
    drawing.add(String((dim_x1 + dim_x2) / 2.0, dim_top_y + 4.0, f"{plot_w:.1f}m FRONTAGE", textAnchor="middle", fontSize=8.0, fontName=FONT_BOLD, fillColor=COLOR_TEXT_PRIMARY))

    dim_left_x = x_pt(0.0) - 18.0
    dim_y1 = y_pt(0.0)
    dim_y2 = y_pt(plot_d)
    # Extension lines
    drawing.add(Line(x_pt(0.0) - 2.0, dim_y1, dim_left_x - 5.0, dim_y1, strokeColor=colors.HexColor("#94A3B8"), strokeWidth=0.6, strokeDashArray=[2, 2]))
    drawing.add(Line(x_pt(0.0) - 2.0, dim_y2, dim_left_x - 5.0, dim_y2, strokeColor=colors.HexColor("#94A3B8"), strokeWidth=0.6, strokeDashArray=[2, 2]))
    # Left dimension line
    drawing.add(Line(dim_left_x, dim_y1, dim_left_x, dim_y2, strokeColor=colors.HexColor("#334155"), strokeWidth=1.0))
    # 45-degree ticks
    drawing.add(Line(dim_left_x - 4, dim_y1 - 4, dim_left_x + 4, dim_y1 + 4, strokeColor=COLOR_TEXT_PRIMARY, strokeWidth=1.4))
    drawing.add(Line(dim_left_x - 4, dim_y2 - 4, dim_left_x + 4, dim_y2 + 4, strokeColor=COLOR_TEXT_PRIMARY, strokeWidth=1.4))
    drawing.add(String(dim_left_x - 6.0, (dim_y1 + dim_y2) / 2.0, f"{plot_d:.1f}m DEPTH", textAnchor="middle", fontSize=7.5, fontName=FONT_BOLD, fillColor=COLOR_TEXT_PRIMARY))

    # North Compass (Top-Right)
    compass_x = width - 36.0
    compass_y = height - 36.0
    drawing.add(Circle(compass_x, compass_y, 14, fillColor=colors.HexColor("#F8FAFC"), strokeColor=COLOR_TEXT_PRIMARY, strokeWidth=1.0))
    drawing.add(Polygon([compass_x, compass_y + 11, compass_x + 4, compass_y, compass_x, compass_y + 2, compass_x - 4, compass_y], fillColor=COLOR_TEXT_PRIMARY, strokeColor=None))
    drawing.add(Polygon([compass_x, compass_y - 11, compass_x + 4, compass_y, compass_x, compass_y - 2, compass_x - 4, compass_y], fillColor=colors.HexColor("#94A3B8"), strokeColor=None))
    drawing.add(String(compass_x, compass_y + 14, "N", fontName=FONT_BOLD, fontSize=8.0, textAnchor="middle", fillColor=COLOR_TEXT_PRIMARY))

    # Graphic Scale Bar (Bottom-Left)
    scale_x = 42.0
    scale_y = 18.0
    drawing.add(String(scale_x, scale_y + 10, "GRAPHIC SCALE (METRIC)", fontName=FONT_BOLD, fontSize=7.0, fillColor=COLOR_TEXT_SECONDARY))
    drawing.add(Rect(scale_x, scale_y, 25, 4, fillColor=COLOR_TEXT_PRIMARY, strokeColor=COLOR_TEXT_PRIMARY, strokeWidth=0.5))
    drawing.add(Rect(scale_x + 25, scale_y, 25, 4, fillColor=colors.HexColor("#E2E8F0"), strokeColor=COLOR_TEXT_PRIMARY, strokeWidth=0.5))
    drawing.add(Rect(scale_x + 50, scale_y, 25, 4, fillColor=COLOR_TEXT_PRIMARY, strokeColor=COLOR_TEXT_PRIMARY, strokeWidth=0.5))
    drawing.add(Rect(scale_x + 75, scale_y, 25, 4, fillColor=colors.HexColor("#E2E8F0"), strokeColor=COLOR_TEXT_PRIMARY, strokeWidth=0.5))
    for i, lbl in enumerate(["0", "1m", "2m", "3m", "4m"]):
        drawing.add(String(scale_x + i * 25, scale_y - 7, lbl, fontName=FONT_REGULAR, fontSize=6.5, textAnchor="middle", fillColor=COLOR_TEXT_SECONDARY))

    return drawing


def draw_floorplan_reportlab(
    placements: Any,
    grid_matrix: Any,
    width: float = CONTENT_WIDTH_PT,
    height: float = 450.0,
    rectangles: Any = None
) -> Drawing:
    """
    Translates solved room placements into ReportLab vector drawing shapes (Line, Rect, String, ArcPath, Group).
    Delegates to _draw_rectangles_reportlab when continuous RectanglesModel is provided.
    Falls back gracefully to grid reconstruction if only discrete placements are available.
    """
    has_valid_rects = False
    if rectangles is not None:
        r_env = _get(rectangles, "envelope")
        r_rooms = _get(rectangles, "rooms", []) or []
        if r_env or r_rooms:
            has_valid_rects = True

    if has_valid_rects:
        return _draw_rectangles_reportlab(rectangles, width=width, height=height)

    drawing = Drawing(width, height)

    norm_placements: List[Dict[str, Any]] = []
    if isinstance(placements, (list, tuple)):
        for p in placements:
            rid = str(_get(p, "room_id", "") or "")
            r = _safe_int(_get(p, "row", _get(p, "r", 0)), 0)
            c = _safe_int(_get(p, "col", _get(p, "c", 0)), 0)
            w = max(_safe_int(_get(p, "width", _get(p, "w", 1)), 1), 1)
            h = max(_safe_int(_get(p, "height", _get(p, "h", 1)), 1), 1)
            default_name = rid.replace("_", " ").title() if rid else "Room"
            name = str(_get(p, "room_name", _get(p, "name", default_name)) or default_name)
            area = _safe_float(_get(p, "area_sqm", _get(p, "area", 0.0)), 0.0)
            zone = str(_get(p, "zone", "General") or "General")

            norm_placements.append({
                "room_id": rid,
                "row": r,
                "col": c,
                "width": w,
                "height": h,
                "name": name,
                "area": area,
                "zone": zone
            })

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

    drawing.add(Rect(0, 0, width, height, fillColor=colors.HexColor("#FFFFFF"), strokeColor=COLOR_HAIRLINE, strokeWidth=0.5, rx=6, ry=6))

    pad_x = 45.0
    pad_y = 40.0
    avail_w = width - (2.0 * pad_x)
    avail_h = height - (2.0 * pad_y)

    cell_size = min(avail_w / cols, avail_h / rows)
    draw_w = cols * cell_size
    draw_h = rows * cell_size
    offset_x = (width - draw_w) / 2.0
    offset_y = (height - draw_h) / 2.0

    drawing.add(Rect(offset_x, offset_y, draw_w, draw_h, fillColor=None, strokeColor=colors.HexColor("#CBD5E1"), strokeWidth=0.75, strokeDashArray=[3, 3]))

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
    h_cutouts: Dict[int, List[Tuple[float, float]]] = {}
    v_cutouts: Dict[int, List[Tuple[float, float]]] = {}
    door_rad = min(cell_size * 0.85, 18.0)
    door_rad = max(door_rad, 12.0)

    for p in norm_placements:
        if p["room_id"] in ("corridor", "living"):
            continue
        r, c = p["row"], p["col"]
        w, h = p["width"], p["height"]
        r_end, c_end = r + h, c + w
        rx = offset_x + (c * cell_size)
        ry = offset_y + ((rows - r_end) * cell_size)
        rw, rh = w * cell_size, h * cell_size

        candidates = [
            ("N", 100 if (r > 0 and any(matrix[r - 1][col] == "corridor" for col in range(c, c_end))) else 10),
            ("S", 100 if (r_end < rows and any(matrix[r_end][col] == "corridor" for col in range(c, c_end))) else 10),
            ("W", 100 if (c > 0 and any(matrix[row][c - 1] == "corridor" for row in range(r, r_end))) else 10),
            ("E", 100 if (c_end < cols and any(matrix[row][c_end] == "corridor" for row in range(r, r_end))) else 10),
        ]
        candidates.sort(key=lambda x: x[1], reverse=True)
        chosen_side = candidates[0][0]
        offset_hinge = 5.0
        R = min(door_rad, (rw if chosen_side in ("N", "S") else rh) - offset_hinge - 2.0)
        R = max(R, 10.0)

        if chosen_side == "N":
            hx, hy = rx + offset_hinge, ry + rh
            leaf_x, leaf_y = hx, hy - R
            h_cutouts.setdefault(r, []).append((hx, hx + R))
            drawing.add(Line(hx, hy, leaf_x, leaf_y, strokeColor=colors.HexColor("#0284C7"), strokeWidth=1.2))
            arc = ArcPath(strokeColor=colors.HexColor("#0284C7"), strokeWidth=0.8, strokeDashArray=[2, 2], fillColor=None)
            arc.addArc(hx, hy, R, 270, 360)
            drawing.add(arc)
        elif chosen_side == "S":
            hx, hy = rx + offset_hinge, ry
            leaf_x, leaf_y = hx, hy + R
            h_cutouts.setdefault(r_end, []).append((hx, hx + R))
            drawing.add(Line(hx, hy, leaf_x, leaf_y, strokeColor=colors.HexColor("#0284C7"), strokeWidth=1.2))
            arc = ArcPath(strokeColor=colors.HexColor("#0284C7"), strokeWidth=0.8, strokeDashArray=[2, 2], fillColor=None)
            arc.addArc(hx, hy, R, 0, 90)
            drawing.add(arc)
        elif chosen_side == "W":
            hx, hy = rx, ry + rh - offset_hinge
            leaf_x, leaf_y = hx + R, hy
            v_cutouts.setdefault(c, []).append((hy - R, hy))
            drawing.add(Line(hx, hy, leaf_x, leaf_y, strokeColor=colors.HexColor("#0284C7"), strokeWidth=1.2))
            arc = ArcPath(strokeColor=colors.HexColor("#0284C7"), strokeWidth=0.8, strokeDashArray=[2, 2], fillColor=None)
            arc.addArc(hx, hy, R, 270, 360)
            drawing.add(arc)
        else:
            hx, hy = rx + rw, ry + rh - offset_hinge
            leaf_x, leaf_y = hx - R, hy
            v_cutouts.setdefault(c_end, []).append((hy - R, hy))
            drawing.add(Line(hx, hy, leaf_x, leaf_y, strokeColor=colors.HexColor("#0284C7"), strokeWidth=1.2))
            arc = ArcPath(strokeColor=colors.HexColor("#0284C7"), strokeWidth=0.8, strokeDashArray=[2, 2], fillColor=None)
            arc.addArc(hx, hy, R, 180, 270)
            drawing.add(arc)

    t_ext = 2.4
    t_int = 1.2
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

    # Room Labels >=8pt with Background Halo
    for p in norm_placements:
        rx = offset_x + (p["col"] * cell_size)
        ry = offset_y + ((rows - (p["row"] + p["height"])) * cell_size)
        rw = p["width"] * cell_size
        rh = p["height"] * cell_size
        cx = rx + (rw / 2.0)
        cy = ry + (rh / 2.0)
        name_str = p["name"].upper()

        halo_w = max(len(name_str) * 6.2, 54.0)
        drawing.add(Rect(
            cx - (halo_w / 2.0), cy - 12.0, halo_w, 24.0,
            rx=4, ry=4,
            fillColor=colors.Color(1, 1, 1, alpha=0.92),
            strokeColor=colors.Color(0, 0, 0, alpha=0.08),
            strokeWidth=0.5
        ))
        drawing.add(String(cx, cy + 2.5, name_str[:16], fontName=FONT_BOLD, fontSize=8.5, textAnchor="middle", fillColor=COLOR_TEXT_PRIMARY))
        if p["area"] > 0:
            drawing.add(String(cx, cy - 6.5, f"{p['area']:.1f} m²", fontName=FONT_REGULAR, fontSize=7.0, textAnchor="middle", fillColor=COLOR_TEXT_SECONDARY))

    # Dimension lines & Frontage Callout
    dim_top_y = offset_y + draw_h + 16.0
    drawing.add(Line(offset_x, dim_top_y, offset_x + draw_w, dim_top_y, strokeColor=colors.HexColor("#334155"), strokeWidth=1.0))
    drawing.add(Line(offset_x - 4, dim_top_y - 4, offset_x + 4, dim_top_y + 4, strokeColor=COLOR_TEXT_PRIMARY, strokeWidth=1.4))
    drawing.add(Line(offset_x + draw_w - 4, dim_top_y - 4, offset_x + draw_w + 4, dim_top_y + 4, strokeColor=COLOR_TEXT_PRIMARY, strokeWidth=1.4))
    frontage_m = cols * 1.5  # Approximate frontage in meters
    drawing.add(String(offset_x + (draw_w / 2.0), dim_top_y + 4.0, f"{frontage_m:.1f}m FRONTAGE", fontName=FONT_BOLD, fontSize=8.0, textAnchor="middle", fillColor=COLOR_TEXT_PRIMARY))

    dim_left_x = offset_x - 18.0
    drawing.add(Line(dim_left_x, offset_y, dim_left_x, offset_y + draw_h, strokeColor=colors.HexColor("#334155"), strokeWidth=1.0))
    drawing.add(Line(dim_left_x - 4, offset_y - 4, dim_left_x + 4, offset_y + 4, strokeColor=COLOR_TEXT_PRIMARY, strokeWidth=1.4))
    drawing.add(Line(dim_left_x - 4, offset_y + draw_h - 4, dim_left_x + 4, offset_y + draw_h + 4, strokeColor=COLOR_TEXT_PRIMARY, strokeWidth=1.4))
    depth_m = rows * 1.5
    drawing.add(String(dim_left_x - 6.0, offset_y + (draw_h / 2.0), f"{depth_m:.1f}m DEPTH", fontName=FONT_BOLD, fontSize=7.5, textAnchor="middle", fillColor=COLOR_TEXT_PRIMARY))

    # North arrow badge
    compass_x = width - 36.0
    compass_y = height - 36.0
    drawing.add(Circle(compass_x, compass_y, 14, fillColor=colors.HexColor("#F8FAFC"), strokeColor=COLOR_TEXT_PRIMARY, strokeWidth=1.0))
    drawing.add(Polygon([compass_x, compass_y + 11, compass_x + 4, compass_y, compass_x, compass_y + 2, compass_x - 4, compass_y], fillColor=COLOR_TEXT_PRIMARY, strokeColor=None))
    drawing.add(Polygon([compass_x, compass_y - 11, compass_x + 4, compass_y, compass_x, compass_y - 2, compass_x - 4, compass_y], fillColor=colors.HexColor("#94A3B8"), strokeColor=None))
    drawing.add(String(compass_x, compass_y + 14, "N", fontName=FONT_BOLD, fontSize=8.0, textAnchor="middle", fillColor=COLOR_TEXT_PRIMARY))

    # Scale bar bottom-left
    scale_x = 42.0
    scale_y = 18.0
    drawing.add(String(scale_x, scale_y + 10, "GRAPHIC SCALE (METRIC)", fontName=FONT_BOLD, fontSize=7.0, fillColor=COLOR_TEXT_SECONDARY))
    drawing.add(Rect(scale_x, scale_y, 25, 4, fillColor=COLOR_TEXT_PRIMARY, strokeColor=COLOR_TEXT_PRIMARY, strokeWidth=0.5))
    drawing.add(Rect(scale_x + 25, scale_y, 25, 4, fillColor=colors.HexColor("#E2E8F0"), strokeColor=COLOR_TEXT_PRIMARY, strokeWidth=0.5))
    drawing.add(Rect(scale_x + 50, scale_y, 25, 4, fillColor=COLOR_TEXT_PRIMARY, strokeColor=COLOR_TEXT_PRIMARY, strokeWidth=0.5))
    drawing.add(Rect(scale_x + 75, scale_y, 25, 4, fillColor=colors.HexColor("#E2E8F0"), strokeColor=COLOR_TEXT_PRIMARY, strokeWidth=0.5))
    for i, lbl in enumerate(["0", "1m", "2m", "3m", "4m"]):
        drawing.add(String(scale_x + i * 25, scale_y - 7, lbl, fontName=FONT_REGULAR, fontSize=6.5, textAnchor="middle", fillColor=COLOR_TEXT_SECONDARY))

    return drawing


def make_floorplan_legend(floorplan_data: Dict[str, Any], width: float = CONTENT_WIDTH_PT) -> Table:
    """
    Renders the Apple-style blueprint legend row below the plan:
    (tinted dot + room name + zone chip per room, max 2 lines).
    """
    p_leg = ParagraphStyle('Leg', fontName=FONT_REGULAR, fontSize=8.0, leading=10.0, textColor=COLOR_TEXT_PRIMARY, alignment=0)

    ZONE_COLORS = {
        "private": "#0071E3",
        "public": "#34C759",
        "service": "#FF9500",
        "spiritual": "#AF52DE",
        "circulation": "#86868B",
        "general": "#0071E3"
    }

    rectangles = floorplan_data.get("rectangles")
    raw_rooms = []
    if rectangles:
        raw_rooms = _get(rectangles, "rooms", []) or []
    if not raw_rooms:
        raw_rooms = floorplan_data.get("placements") or []

    cells = []
    seen_names = set()
    for r in raw_rooms:
        rid = str(_get(r, "room_id", "") or "")
        name = str(_get(r, "room_name", "") or "")
        if not name:
            name = rid.replace("_", " ").title() if rid else "Room"
        if name in seen_names:
            continue
        seen_names.add(name)

        zone = str(_get(r, "zone", "General") or "General")
        dot_color = ZONE_COLORS.get(zone.lower(), "#0071E3")
        cell_p = Paragraph(f'<font color="{dot_color}" size=9>●</font> <b>{html.escape(name)}</b> <font color="{COLOR_TEXT_TERTIARY.hexval()}" size=7>[{html.escape(zone.title())}]</font>', p_leg)
        cells.append(cell_p)

    if not cells:
        return Table([[Paragraph("Room Layout Solved", p_leg)]], colWidths=[width])

    max_display = min(12, len(cells))
    cols = 4 if max_display >= 4 else max_display
    grid_rows = []
    for i in range(0, max_display, cols):
        row = cells[i:i + cols]
        while len(row) < cols:
            row.append(Paragraph("", p_leg))
        grid_rows.append(row)

    col_w = width / float(cols)
    t = Table(grid_rows, colWidths=[col_w] * cols)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), COLOR_BG_SUBTLE),
        ('ROUNDEDCORNERS', [6, 6, 6, 6]),
        ('BOX', (0, 0), (-1, -1), 0.5, COLOR_HAIRLINE),
        ('TOPPADDING', (0, 0), (-1, -1), 5.0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5.0),
        ('LEFTPADDING', (0, 0), (-1, -1), 6.0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6.0),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    return t


# =============================================================================
# 6. MAIN PDF REPORT GENERATOR (REDESIGNED v9)
# =============================================================================

def generate_pdf_report(
    data: Dict[str, Any],
    site_vision: Optional[Dict[str, Any]] = None,
    floor_plan: Optional[Dict[str, Any]] = None
) -> io.BytesIO:
    """
    Generates a formal, Apple-designed vector PDF engineering report from an AnalysisResponse payload.
    Features:
    - A4 portrait, 18mm margins, Inter typography, left-aligned text throughout
    - Page 1 top band with BW logo & score hero with 26mm gauge ring and 2x2 spec grid
    - Apple tables with hairlines, sentence-case headers, and semantic tinted pills
    - Section order & naming aligned with ReportSheet tabs (Overview -> Hazards -> Ecology -> Cost & Plan)
    - Section 02 Action Plan deduplication fix: AI Parameter Calibration rendered once as accent callout
    - Section 05 Ecology 5-tile stat strip
    - Section 10 Blueprint on dedicated full page with solver stat strip, full-width vector drawing, and legend
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=PAGE_MARGIN_PT,
        rightMargin=PAGE_MARGIN_PT,
        topMargin=PAGE_MARGIN_PT,
        bottomMargin=PAGE_MARGIN_PT
    )

    # Styles (Left-aligned everywhere, zero justified text)
    body_style = ParagraphStyle(
        'AppleBody',
        fontName=FONT_REGULAR,
        fontSize=9.5,
        leading=14.25,
        textColor=COLOR_TEXT_PRIMARY,
        alignment=0
    )
    table_text = ParagraphStyle(
        'AppleTableBody',
        fontName=FONT_REGULAR,
        fontSize=9.0,
        leading=12.5,
        textColor=COLOR_TEXT_PRIMARY,
        alignment=0
    )
    table_num = ParagraphStyle(
        'AppleTableNum',
        fontName=FONT_REGULAR,
        fontSize=9.0,
        leading=12.5,
        textColor=COLOR_TEXT_PRIMARY,
        alignment=2  # Right-aligned for tabular numbers
    )
    table_header = ParagraphStyle(
        'AppleTableHeader',
        fontName=FONT_SEMIBOLD,
        fontSize=8.0,
        leading=10.5,
        textColor=COLOR_TEXT_SECONDARY,
        alignment=0
    )
    table_header_right = ParagraphStyle(
        'AppleTableHeaderRight',
        fontName=FONT_SEMIBOLD,
        fontSize=8.0,
        leading=10.5,
        textColor=COLOR_TEXT_SECONDARY,
        alignment=2
    )
    kv_style = ParagraphStyle(
        'AppleKV',
        fontName=FONT_REGULAR,
        fontSize=9.0,
        leading=13.0,
        textColor=COLOR_TEXT_PRIMARY,
        alignment=0
    )
    disclaimer_style = ParagraphStyle(
        'AppleDisclaimer',
        fontName=FONT_REGULAR,
        fontSize=8.0,
        leading=11.5,
        textColor=COLOR_TEXT_SECONDARY,
        alignment=0
    )

    story: List[Any] = []

    # -------------------------------------------------------------------------
    # PAGE 1: HEADER & TOP BAND
    # -------------------------------------------------------------------------
    req_id = str(data.get("request_id") or ("BW-" + datetime.now().strftime("%Y%m%d%H%M")))
    timestamp_str = str(data.get("timestamp") or datetime.now().strftime("%Y-%m-%d %H:%M:%S UTC"))
    coords = data.get("coordinates") or {}
    lat = _safe_float(coords.get("latitude"), 0.0)
    lon = _safe_float(coords.get("longitude"), 0.0)
    address = str(data.get("formatted_address") or "Site Location")

    # Logo Drawing (28x28 rounded square with accent fill and white "BW")
    logo_d = Drawing(28, 28)
    logo_d.add(Rect(0, 0, 28, 28, rx=6, ry=6, fillColor=COLOR_ACCENT, strokeColor=None))
    logo_d.add(String(14, 8.5, "BW", fontName=FONT_BOLD, fontSize=11.5, textAnchor="middle", fillColor=colors.white))

    app_brand_p = Paragraph(f'<font color="{COLOR_ACCENT.hexval()}" size="11"><b>BuildWise AI</b></font>', ParagraphStyle('Brand', fontName=FONT_SEMIBOLD, leading=12))
    app_title_p = Paragraph('<font color="#1D1D1F" size="15"><b>Site Feasibility &amp; Engineering Advisory</b></font>', ParagraphStyle('DocTitle', fontName=FONT_BOLD, leading=17))

    title_box = Table([[logo_d, Table([[app_brand_p], [app_title_p]], colWidths=[270])]], colWidths=[34, 276])
    title_box.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))

    ref_chip_p = Paragraph(f"<b>Ref: {html.escape(req_id[:12])}</b>", ParagraphStyle('RefChip', fontName=FONT_REGULAR, fontSize=8.0, leading=10.0, textColor=COLOR_TEXT_SECONDARY, alignment=1))
    ref_chip = Table([[ref_chip_p]], colWidths=[110])
    ref_chip.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), COLOR_BG_SUBTLE),
        ('ROUNDEDCORNERS', [4, 4, 4, 4]),
        ('BOX', (0, 0), (-1, -1), 0.5, COLOR_HAIRLINE),
        ('TOPPADDING', (0, 0), (-1, -1), 2.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2.5),
        ('LEFTPADDING', (0, 0), (-1, -1), 4.0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4.0),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ]))

    right_meta_p = Paragraph(
        f'<font color="{COLOR_TEXT_SECONDARY.hexval()}" size="8">Issued: {html.escape(timestamp_str[:19])}<br/>WGS84: {lat:.5f}° N, {lon:.5f}° E</font>',
        ParagraphStyle('RightMeta', fontName=FONT_REGULAR, leading=11, alignment=2)
    )
    meta_box = Table([[ref_chip], [Spacer(1, 3)], [right_meta_p]], colWidths=[180])
    meta_box.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'RIGHT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))

    top_band = Table([[title_box, meta_box]], colWidths=[310, 183.2])
    top_band.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    story.append(top_band)
    story.append(Spacer(1, 10))

    # -------------------------------------------------------------------------
    # PAGE 1: HERO BAND (SCORE & 2x2 SPEC GRID)
    # -------------------------------------------------------------------------
    score = _safe_float(data.get("overall_suitability_score"), 0.0)
    score = max(0.0, min(100.0, score))
    verdict = str(data.get("suitability_verdict") or "Feasible")

    if score >= 75.0:
        verdict_color = COLOR_GREEN_TEXT
        verdict_tint = COLOR_GREEN_TINT
        ring_color = COLOR_GREEN_BORDER
    elif score >= 50.0:
        verdict_color = COLOR_AMBER_TEXT
        verdict_tint = COLOR_AMBER_TINT
        ring_color = COLOR_AMBER_BORDER
    else:
        verdict_color = COLOR_RED_TEXT
        verdict_tint = COLOR_RED_TINT
        ring_color = COLOR_RED_BORDER

    # Gauge ring 26mm diameter (~73.7 pt)
    gauge_d = Drawing(74, 74)
    gauge_d.add(Circle(37, 37, 30, fillColor=None, strokeColor=COLOR_TRACK_GRAY, strokeWidth=4.5))
    gauge_arc = ArcPath(strokeColor=ring_color, strokeWidth=4.5, fillColor=None)
    gauge_arc.addArc(37, 37, 30, 90, 90 - (score / 100.0) * 360.0)
    gauge_d.add(gauge_arc)
    gauge_d.add(String(37, 32, f"{score:.0f}", fontName=FONT_BOLD, fontSize=15, textAnchor="middle", fillColor=COLOR_TEXT_PRIMARY))

    # Middle: Score 40pt/700 + /100 11pt + verdict pill
    score_p = Paragraph(f'<font size="32"><b>{score:.1f}</b></font><font size="11" color="{COLOR_TEXT_TERTIARY.hexval()}"> / 100</font>', ParagraphStyle('HeroScore', fontName=FONT_BOLD, leading=34))
    verdict_pill = make_pill(verdict.upper(), verdict_tint, verdict_color, width=130)
    mid_hero = Table([[score_p], [Spacer(1, 4)], [verdict_pill]], colWidths=[140])
    mid_hero.setStyle(TableStyle([
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))

    # Right: 2x2 spec grid
    cost_data = data.get("cost_estimate") or {}
    base_cost = _safe_float(cost_data.get("base_cost_inr"), 0.0)
    base_rate = _safe_float(cost_data.get("base_rate_per_sqft"), 1.0)
    built_area = base_cost / max(base_rate, 1.0) if base_cost > 0 else _safe_float(data.get("built_up_area_sqft"), 2000.0)

    quality_grade = str(data.get("quality_grade") or "Standard")
    floors_count = _safe_int(data.get("floors"), 2)
    storeys_str = f"G+{floors_count-1} Storeys" if floors_count > 1 else "Ground Floor"

    slope_val = next((f.get('raw_value') for f in (data.get('factors') or []) if f.get('factor_id') == 'slope' and f.get('raw_value') is not None), 0)
    slope_str = f"{_safe_float(slope_val):.1f}% Slope" if slope_val is not None else "0% Slope"

    c_area = Paragraph(f'<font color="{COLOR_TEXT_SECONDARY.hexval()}" size="7.5">Built-up Area</font><br/><font color="{COLOR_TEXT_PRIMARY.hexval()}" size="10"><b>{built_area:,.0f} sq ft</b></font>', kv_style)
    c_grade = Paragraph(f'<font color="{COLOR_TEXT_SECONDARY.hexval()}" size="7.5">Specification Grade</font><br/><font color="{COLOR_TEXT_PRIMARY.hexval()}" size="10"><b>{html.escape(quality_grade.capitalize())} Grade</b></font>', kv_style)
    c_storeys = Paragraph(f'<font color="{COLOR_TEXT_SECONDARY.hexval()}" size="7.5">Storeys</font><br/><font color="{COLOR_TEXT_PRIMARY.hexval()}" size="10"><b>{html.escape(storeys_str)}</b></font>', kv_style)
    c_cov = Paragraph(f'<font color="{COLOR_TEXT_SECONDARY.hexval()}" size="7.5">Ground Coverage</font><br/><font color="{COLOR_TEXT_PRIMARY.hexval()}" size="10"><b>60.0% ({slope_str})</b></font>', kv_style)

    spec_grid = Table([[c_area, c_grade], [c_storeys, c_cov]], colWidths=[130, 130])
    spec_grid.setStyle(TableStyle([
        ('TOPPADDING', (0, 0), (-1, -1), 2.0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2.0),
        ('LEFTPADDING', (0, 0), (-1, -1), 4.0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4.0),
    ]))

    hero_card = Table([[gauge_d, mid_hero, spec_grid]], colWidths=[80, 145, 268.2])
    hero_card.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), COLOR_BG_SUBTLE),
        ('ROUNDEDCORNERS', [8, 8, 8, 8]),
        ('BOX', (0, 0), (-1, -1), 0.5, COLOR_HAIRLINE),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 8.0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8.0),
        ('LEFTPADDING', (0, 0), (-1, -1), 8.0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8.0),
    ]))
    story.append(hero_card)
    story.append(Spacer(1, 6))

    # Below hero: site address 10pt/500 + WGS84 coordinate row mono 8.5pt
    address_p = Paragraph(f"<b>Site Address:</b> {html.escape(address)}", ParagraphStyle('SiteAddr', fontName=FONT_MEDIUM, fontSize=10.0, leading=13.0, textColor=COLOR_TEXT_PRIMARY, alignment=0))
    coords_p = Paragraph(f"WGS84 Reference: {lat:.5f}° N, {lon:.5f}° E • Elevation: ~920m AMSL • Survey Benchmark CPWD/NBC Aligned", ParagraphStyle('SiteCoords', fontName=FONT_REGULAR, fontSize=8.5, leading=11.0, textColor=COLOR_TEXT_SECONDARY, alignment=0))
    story.append(address_p)
    story.append(Spacer(1, 2))
    story.append(coords_p)
    story.append(Spacer(1, 6))

    # =========================================================================
    # TAB 1: OVERVIEW
    # =========================================================================

    # --- Section 01: Multi-Criteria Land Suitability Assessment ---
    story.append(create_section_header("01", "Multi-Criteria Land Suitability Assessment"))
    factor_headers = [
        Paragraph("Evaluation factor", table_header),
        Paragraph("Weight", table_header_right),
        Paragraph("Field value", table_header),
        Paragraph("Score", table_header_right),
        Paragraph("Rating", table_header),
        Paragraph("Engineering assessment", table_header)
    ]
    factor_rows = [factor_headers]

    for f in (data.get("factors") or []):
        st = str(f.get("status") or "Optimal").capitalize()
        weight_val = _safe_float(f.get("weight"), 0.0)
        score_val = _safe_float(f.get("score"), 0.0)
        raw_val = f.get("raw_value") if f.get("raw_value") is not None else 0

        if score_val >= 75:
            pill = make_pill(st, COLOR_GREEN_TINT, COLOR_GREEN_TEXT, width=65)
        elif score_val >= 50:
            pill = make_pill(st, COLOR_AMBER_TINT, COLOR_AMBER_TEXT, width=65)
        else:
            pill = make_pill(st, COLOR_RED_TINT, COLOR_RED_TEXT, width=65)

        factor_rows.append([
            Paragraph(f"<b>{html.escape(str(f.get('name', '')))}</b>", table_text),
            Paragraph(f"{weight_val*100:.0f}%", table_num),
            Paragraph(f"{html.escape(str(raw_val))} {html.escape(str(f.get('unit', '')))}", table_text),
            Paragraph(f"{score_val:.1f}/100", table_num),
            pill,
            Paragraph(html.escape(str(f.get("details", ""))), table_text)
        ])

    factor_table = Table(factor_rows, colWidths=[95, 45, 70, 50, 75, 158.2])
    factor_table.setStyle(TableStyle([
        ('LINEBELOW', (0, 0), (-1, 0), 0.5, COLOR_HAIRLINE),
        ('LINEBELOW', (0, 1), (-1, -1), 0.5, COLOR_HAIRLINE),
        ('TOPPADDING', (0, 0), (-1, -1), 4.0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4.0),
        ('LEFTPADDING', (0, 0), (-1, -1), 4.0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4.0),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(factor_table)

    # --- Section 02: Engineering Commentary & Action Plan ---
    story.append(create_section_header("02", "Engineering Commentary & Action Plan"))

    # Render AI Parameter Calibration ONCE as an accent callout at the top of Action Plan
    param_reflection = data.get("parameter_reflection")
    if param_reflection:
        calib_text = f"<b>AI Parameter Calibration:</b> {html.escape(str(param_reflection))}"
        story.append(make_callout(calib_text, width=CONTENT_WIDTH_PT))
        story.append(Spacer(1, 6))

    eng_summary = data.get("engineering_summary")
    if eng_summary:
        summary_callout = make_callout(f"<b>Executive Synthesis:</b> {html.escape(str(eng_summary))}", width=CONTENT_WIDTH_PT)
        story.append(summary_callout)
        story.append(Spacer(1, 6))

    # Action Plan Table: Unique rule IDs only
    recs_items = data.get("recommendation_items") or []
    if recs_items:
        seen_rules = set()
        unique_recs = []
        for item in recs_items:
            rid = str(item.get("rule_id", "REC") or "REC")
            if rid not in seen_rules:
                seen_rules.add(rid)
                unique_recs.append(item)

        rec_headers = [
            Paragraph("Category & rule ID", table_header),
            Paragraph("Severity", table_header),
            Paragraph("Trigger & standard reference", table_header),
            Paragraph("Prescribed engineering action", table_header)
        ]
        rec_rows = [rec_headers]

        for item in unique_recs:
            sev = str(item.get("severity", "advisory") or "advisory").upper()
            rule_id = str(item.get("rule_id", "REC") or "REC")
            cat_label = str(item.get("category_label", "Engineering") or "Engineering")
            trig = str(item.get("trigger_condition", "") or "")
            src_ref = str(item.get("source_data_ref", "") or "")

            if sev == "CRITICAL":
                sev_pill = make_pill(sev, COLOR_RED_TINT, COLOR_RED_TEXT, width=65)
            elif sev in ("HIGH", "ADVISORY"):
                sev_pill = make_pill(sev, COLOR_AMBER_TINT, COLOR_AMBER_TEXT, width=65)
            else:
                sev_pill = make_pill(sev, COLOR_GREEN_TINT, COLOR_GREEN_TEXT, width=65)

            rec_rows.append([
                Paragraph(f"<b>{html.escape(cat_label)}</b><br/><font color='{COLOR_TEXT_TERTIARY.hexval()}'>{html.escape(rule_id)}</font>", table_text),
                sev_pill,
                Paragraph(f"<b>{html.escape(trig)}</b><br/><font color='{COLOR_TEXT_TERTIARY.hexval()}'>{html.escape(src_ref)}</font>", table_text),
                Paragraph(html.escape(str(item.get("recommendation_text", ""))), table_text)
            ])

        rec_table = Table(rec_rows, colWidths=[110, 75, 135, 173.2])
        rec_table.setStyle(TableStyle([
            ('LINEBELOW', (0, 0), (-1, 0), 0.5, COLOR_HAIRLINE),
            ('LINEBELOW', (0, 1), (-1, -1), 0.5, COLOR_HAIRLINE),
            ('TOPPADDING', (0, 0), (-1, -1), 4.0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4.0),
            ('LEFTPADDING', (0, 0), (-1, -1), 4.0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 4.0),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ]))
        story.append(rec_table)
    else:
        for idx, rec in enumerate(data.get("detailed_recommendations") or [], 1):
            story.append(Paragraph(f"<b>{idx}.</b> {html.escape(str(rec))}", body_style))
            story.append(Spacer(1, 2))

    # =========================================================================
    # TAB 2: HAZARDS
    # =========================================================================

    # --- Section 03: Hazard History & Climate Stress Profile ---
    hazard = data.get("hazard_profile") or {}
    if hazard:
        story.append(create_section_header("03", "Hazard History & Climate Stress Profile"))
        seismic = hazard.get("seismic") or {}
        flood = hazard.get("flood") or {}
        storm = hazard.get("storm_cyclone") or {}

        ratio = flood.get("discharge_peak_to_mean_ratio")
        ratio_val = _safe_float(ratio, None)
        ratio_display = f"{ratio_val:.1f}x" if ratio_val is not None else "N/A (<0.1 m³/s)"
        z_factor = seismic.get("zone_factor")
        z_val = _safe_float(z_factor, None)
        z_str = f"{z_val:.2f}" if z_val is not None else "0.16"
        max_gust = _safe_float(storm.get("max_annual_gust_kmh"), 0.0)
        rain_days = _safe_float(storm.get("extreme_rainfall_days"), 0.0)

        c_seis = Paragraph(f'<font color="{COLOR_TEXT_SECONDARY.hexval()}" size="8">BIS IS 1893 Seismic Zone</font><br/><font color="{COLOR_TEXT_PRIMARY.hexval()}" size="10"><b>{html.escape(str(seismic.get("zone", "Zone III")))} (Z = {z_str})</b></font>', kv_style)
        c_usgs = Paragraph(f'<font color="{COLOR_TEXT_SECONDARY.hexval()}" size="8">USGS 50-Yr Seismicity (250km)</font><br/><font color="{COLOR_TEXT_PRIMARY.hexval()}" size="10"><b>{html.escape(str(seismic.get("event_count_display", "0")))} events (Max M{html.escape(str(seismic.get("max_magnitude") or "N/A"))})</b></font>', kv_style)

        c_flood = Paragraph(f'<font color="{COLOR_TEXT_SECONDARY.hexval()}" size="8">River Discharge Ratio (ERA5)</font><br/><font color="{COLOR_TEXT_PRIMARY.hexval()}" size="10"><b>{ratio_display} ({html.escape(str(flood.get("pressure_level", "low")).capitalize())} pressure)</b></font>', kv_style)
        c_ndma = Paragraph(f'<font color="{COLOR_TEXT_SECONDARY.hexval()}" size="8">NDMA Flood Prone Basin</font><br/><font color="{COLOR_TEXT_PRIMARY.hexval()}" size="10"><b>{"Yes (Mitigation Recommended)" if flood.get("ndma_flood_prone") else "No (Low Inundation Risk)"}</b></font>', kv_style)

        c_gust = Paragraph(f'<font color="{COLOR_TEXT_SECONDARY.hexval()}" size="8">Mean Annual Gust (ERA5)</font><br/><font color="{COLOR_TEXT_PRIMARY.hexval()}" size="10"><b>{max_gust:.1f} km/h</b></font>', kv_style)
        c_rain = Paragraph(f'<font color="{COLOR_TEXT_SECONDARY.hexval()}" size="8">Heavy Rain Days (≥50mm)</font><br/><font color="{COLOR_TEXT_PRIMARY.hexval()}" size="10"><b>{rain_days:.1f} days/yr (Cyclone: {"Yes" if storm.get("ndma_cyclone_prone") else "No"})</b></font>', kv_style)

        haz_table = Table([[c_seis, c_usgs], [c_flood, c_ndma], [c_gust, c_rain]], colWidths=[246.6, 246.6])
        haz_table.setStyle(TableStyle([
            ('LINEBELOW', (0, 0), (-1, -1), 0.5, COLOR_HAIRLINE),
            ('TOPPADDING', (0, 0), (-1, -1), 5.0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5.0),
            ('LEFTPADDING', (0, 0), (-1, -1), 4.0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 4.0),
        ]))
        story.append(haz_table)

    # --- Section 04: Site Constraints & Risk Mitigation Matrix ---
    story.append(create_section_header("04", "Site Constraints & Risk Mitigation Matrix"))
    risk_headers = [
        Paragraph("Risk classification", table_header),
        Paragraph("Severity", table_header),
        Paragraph("Observed constraint", table_header),
        Paragraph("Prescribed mitigation measure", table_header)
    ]
    risk_rows = [risk_headers]

    for r in (data.get("risks") or []):
        sev = str(r.get("severity") or "").upper()
        if sev == "CRITICAL":
            pill = make_pill(sev, COLOR_RED_TINT, COLOR_RED_TEXT, width=60)
        elif sev in ("HIGH", "MODERATE"):
            pill = make_pill(sev, COLOR_AMBER_TINT, COLOR_AMBER_TEXT, width=60)
        else:
            pill = make_pill(sev, COLOR_GREEN_TINT, COLOR_GREEN_TEXT, width=60)

        risk_rows.append([
            Paragraph(f"<b>{html.escape(str(r.get('title', '')))}</b>", table_text),
            pill,
            Paragraph(html.escape(str(r.get("description", ""))), table_text),
            Paragraph(html.escape(str(r.get("mitigation_strategy", ""))), table_text)
        ])

    risk_table = Table(risk_rows, colWidths=[115, 68, 145, 165.2])
    risk_table.setStyle(TableStyle([
        ('LINEBELOW', (0, 0), (-1, 0), 0.5, COLOR_HAIRLINE),
        ('LINEBELOW', (0, 1), (-1, -1), 0.5, COLOR_HAIRLINE),
        ('TOPPADDING', (0, 0), (-1, -1), 4.0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4.0),
        ('LEFTPADDING', (0, 0), (-1, -1), 4.0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4.0),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    story.append(risk_table)

    # =========================================================================
    # TAB 3: ECOLOGY
    # =========================================================================

    # --- Section 05: Ecological Site Vision & Tree Preservation Plan ---
    vision = site_vision if site_vision is not None else data.get("site_vision")
    if hasattr(vision, "model_dump"):
        vision = vision.model_dump()

    if vision and isinstance(vision, dict) and vision.get("mode") != "unavailable":
        story.append(create_section_header("05", "Ecological Site Vision & Tree Preservation Plan"))

        green_pct = _safe_float(vision.get("green_cover_pct"), 0.0)
        water_pct = _safe_float(vision.get("water_cover_pct"), 0.0)
        built_pct = _safe_float(vision.get("built_up_pct"), 0.0)
        clusters = (vision.get("tree_clusters") or {}).get("features") or []
        cluster_count = len(clusters) if isinstance(clusters, list) else 0
        scene_meta = vision.get("scene_metadata") or {}
        img_date = scene_meta.get("datetime", "Recent")[:10] if scene_meta.get("datetime") else "N/A"
        mode_label = str(vision.get("mode") or "index-only").upper()

        t1 = make_stat_tile("Green Cover", f"{green_pct:.1f}%", width=94.0)
        t2 = make_stat_tile("Canopy Clusters", f"{cluster_count}", width=94.0)
        t3 = make_stat_tile("Water Cover", f"{water_pct:.1f}%", width=94.0)
        t4 = make_stat_tile("Built-up Ratio", f"{built_pct:.1f}%", width=94.0)
        t5 = make_stat_tile("Acquisition", html.escape(img_date), width=94.0)

        stat_strip = Table([[t1, t2, t3, t4, t5]], colWidths=[98.64, 98.64, 98.64, 98.64, 98.64])
        stat_strip.setStyle(TableStyle([
            ('LEFTPADDING', (0, 0), (-1, -1), 2.0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 2.0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ]))
        story.append(stat_strip)
        story.append(Spacer(1, 4))

        meta_line = f"Copernicus Sentinel-2 Multispectral • Mode: {html.escape(mode_label)} • Ground Sample: 10m Multi-band Surface Reflectance Telemetry"
        story.append(Paragraph(meta_line, ParagraphStyle('EcoMeta', fontName=FONT_REGULAR, fontSize=8.0, leading=10.0, textColor=COLOR_TEXT_TERTIARY, alignment=0)))
        story.append(Spacer(1, 6))

        plan = vision.get("preservation_plan") or []
        if plan:
            top_items = [p.model_dump() if hasattr(p, "model_dump") else p for p in plan[:3]]
            plan_headers = [
                Paragraph("Cluster ID", table_header),
                Paragraph("Canopy area", table_header_right),
                Paragraph("Action rank", table_header),
                Paragraph("Prescribed ecological measure", table_header)
            ]
            plan_rows = [plan_headers]
            for p in top_items:
                cid = str(p.get("cluster_id") or "cluster")
                area_val = _safe_float(p.get('area_sqm'), 0.0)
                area = f"{area_val:.0f} m²"
                rank = str(p.get("rank") or "context").upper()
                action = str(p.get("action") or "")

                if rank in ("PRESERVE", "HIGH"):
                    rank_pill = make_pill(rank, COLOR_GREEN_TINT, COLOR_GREEN_TEXT, width=70)
                elif rank in ("RELOCATE", "TRANSPLANT"):
                    rank_pill = make_pill(rank, COLOR_AMBER_TINT, COLOR_AMBER_TEXT, width=70)
                else:
                    rank_pill = make_pill(rank, COLOR_ACCENT_TINT, COLOR_ACCENT, width=70)

                plan_rows.append([
                    Paragraph(f"<b>{html.escape(cid)}</b>", table_text),
                    Paragraph(area, table_num),
                    rank_pill,
                    Paragraph(html.escape(action), table_text)
                ])

            plan_table = Table(plan_rows, colWidths=[90, 75, 78, 250.2])
            plan_table.setStyle(TableStyle([
                ('LINEBELOW', (0, 0), (-1, 0), 0.5, COLOR_HAIRLINE),
                ('LINEBELOW', (0, 1), (-1, -1), 0.5, COLOR_HAIRLINE),
                ('TOPPADDING', (0, 0), (-1, -1), 4.0),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 4.0),
                ('LEFTPADDING', (0, 0), (-1, -1), 4.0),
                ('RIGHTPADDING', (0, 0), (-1, -1), 4.0),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ]))
            story.append(plan_table)

    # --- Section 06: Passive Solar & Aerodynamic Orientation Strategy ---
    story.append(create_section_header("06", "Passive Solar & Aerodynamic Orientation Strategy"))
    orient = data.get("orientation") or {}
    opt_axis = _safe_int(orient.get('optimal_axis_degrees'), 90)
    wind_az = orient.get('prevailing_wind_direction_degrees')
    wind_az_val = _safe_float(wind_az, 240.0)
    axis_lbl = str(orient.get("axis_label") or "East-West")
    vent_rating = str(orient.get("cross_ventilation_rating") or "Good")

    c_axis = Paragraph(f'<font color="{COLOR_TEXT_SECONDARY.hexval()}" size="8">Recommended Solar Axis</font><br/><font color="{COLOR_TEXT_PRIMARY.hexval()}" size="10"><b>{opt_axis}° ({html.escape(axis_lbl)})</b></font>', kv_style)
    c_wind = Paragraph(f'<font color="{COLOR_TEXT_SECONDARY.hexval()}" size="8">Prevailing Wind Direction</font><br/><font color="{COLOR_TEXT_PRIMARY.hexval()}" size="10"><b>{wind_az_val:.0f}° Azimuth</b></font>', kv_style)
    c_vent = Paragraph(f'<font color="{COLOR_TEXT_SECONDARY.hexval()}" size="8">Cross-Ventilation Index</font><br/><font color="{COLOR_TEXT_PRIMARY.hexval()}" size="10"><b>{html.escape(vent_rating)}</b></font>', kv_style)
    c_fen = Paragraph(f'<font color="{COLOR_TEXT_SECONDARY.hexval()}" size="8">Solar Fenestration Apertures</font><br/><font color="{COLOR_TEXT_PRIMARY.hexval()}" size="10"><b>Principal Glazing on North / South</b></font>', kv_style)

    orient_table = Table([[c_axis, c_wind], [c_vent, c_fen]], colWidths=[246.6, 246.6])
    orient_table.setStyle(TableStyle([
        ('LINEBELOW', (0, 0), (-1, -1), 0.5, COLOR_HAIRLINE),
        ('TOPPADDING', (0, 0), (-1, -1), 5.0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5.0),
        ('LEFTPADDING', (0, 0), (-1, -1), 4.0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4.0),
    ]))
    story.append(orient_table)
    story.append(Spacer(1, 4))
    if orient.get('passive_design_rationale'):
        story.append(make_callout(f"<b>Passive Design Rationale:</b> {html.escape(str(orient.get('passive_design_rationale')))}", width=CONTENT_WIDTH_PT))

    # --- Section 07: Vastu Shastra & Functional Planning Advisory ---
    vastu = data.get("vastu_advisory") or {}
    if vastu:
        story.append(create_section_header("07", "Vastu Shastra & Functional Planning Advisory"))
        road_approach = vastu.get("road_approach") or {}
        road_side = str(road_approach.get("approach_side") or "unknown")
        slope_rd = vastu.get("slope_reading") or {}
        ranked_ents = vastu.get("ranked_entrances") or []
        ent_desc = ", ".join([f"{e.get('direction')} ({_safe_float(e.get('score'), 0.0):.0f}/100)" for e in ranked_ents]) if ranked_ents else "Evaluated from road frontage"

        c_road = Paragraph(f'<font color="{COLOR_TEXT_SECONDARY.hexval()}" size="8">Approach Road Orientation</font><br/><font color="{COLOR_TEXT_PRIMARY.hexval()}" size="10"><b>{html.escape(road_side.upper())} frontage access</b></font>', kv_style)
        c_ents = Paragraph(f'<font color="{COLOR_TEXT_SECONDARY.hexval()}" size="8">Ranked Entrance Locations</font><br/><font color="{COLOR_TEXT_PRIMARY.hexval()}" size="10"><b>{html.escape(ent_desc)}</b></font>', kv_style)
        c_drain = Paragraph(f'<font color="{COLOR_TEXT_SECONDARY.hexval()}" size="8">Topographic Drainage Vector</font><br/><font color="{COLOR_TEXT_PRIMARY.hexval()}" size="10"><b>Toward {html.escape(str(slope_rd.get("drainage_direction") or "Neutral"))} ({html.escape(str(slope_rd.get("auspiciousness") or "neutral").capitalize())})</b></font>', kv_style)
        c_comp = Paragraph(f'<font color="{COLOR_TEXT_SECONDARY.hexval()}" size="8">Vastu Compliance Status</font><br/><font color="{COLOR_TEXT_PRIMARY.hexval()}" size="10"><b>{html.escape(str(vastu.get("overall_compliance_rating", "Favourable")))}</b></font>', kv_style)

        vastu_table = Table([[c_road, c_ents], [c_drain, c_comp]], colWidths=[246.6, 246.6])
        vastu_table.setStyle(TableStyle([
            ('LINEBELOW', (0, 0), (-1, -1), 0.5, COLOR_HAIRLINE),
            ('TOPPADDING', (0, 0), (-1, -1), 5.0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5.0),
            ('LEFTPADDING', (0, 0), (-1, -1), 4.0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 4.0),
        ]))
        story.append(vastu_table)
        story.append(Spacer(1, 4))
        remedy_msg = slope_rd.get("remedy_notes") or "Natural site drainage and orientation align with standard architectural layout guidelines."
        story.append(make_callout(f"<b>Remedy &amp; Planning Note:</b> {html.escape(str(remedy_msg))}", width=CONTENT_WIDTH_PT))

    # =========================================================================
    # TAB 4: COST & PLAN
    # =========================================================================

    # --- Section 08: Preliminary Construction Cost Estimate ---
    story.append(create_section_header("08", "Preliminary Construction Cost Estimate"))
    cost = data.get("cost_estimate") or {}
    cost_headers = [
        Paragraph("Cost category", table_header),
        Paragraph("Amount (INR)", table_header_right),
        Paragraph("Share (%)", table_header),
        Paragraph("Scope of civil works", table_header)
    ]
    cost_rows = [cost_headers]

    for c in (cost.get("breakdown") or []):
        amt = _safe_float(c.get('amount_inr'), 0.0)
        pct = _safe_float(c.get('percentage'), 0.0)
        cost_rows.append([
            Paragraph(f"<b>{html.escape(str(c.get('category', '')))}</b>", table_text),
            Paragraph(f"INR {amt:,.0f}", table_num),
            make_share_cell(pct, bar_width=100.0),
            Paragraph(html.escape(str(c.get("description", ""))), table_text)
        ])

    tot_inr = _safe_float(cost.get("total_estimated_cost_inr"), 0.0)
    c_min = _safe_float(cost.get("cost_range_min_inr"), 0.0)
    c_max = _safe_float(cost.get("cost_range_max_inr"), 0.0)

    cost_rows.append([
        Paragraph("<b>TOTAL ESTIMATED BUDGET</b>", table_text),
        Paragraph(f"<b>INR {tot_inr:,.0f}</b>", table_num),
        make_share_cell(100.0, bar_width=100.0),
        Paragraph("", table_text)
    ])
    cost_rows.append([
        "",
        Paragraph(f"Range: INR {c_min:,.0f} – INR {c_max:,.0f} (±7.5% variation based on site conditions)", ParagraphStyle('CostRange', fontName=FONT_REGULAR, fontSize=8.5, leading=11.0, textColor=COLOR_TEXT_SECONDARY, alignment=2)),
        "",
        ""
    ])

    cost_table = Table(cost_rows, colWidths=[120, 95, 140, 138.2])
    cost_table.setStyle(TableStyle([
        ('LINEBELOW', (0, 0), (-1, 0), 0.5, COLOR_HAIRLINE),
        ('LINEBELOW', (0, 1), (-1, -3), 0.5, COLOR_HAIRLINE),
        ('LINEABOVE', (0, -2), (-1, -2), 1.5, COLOR_TEXT_PRIMARY),  # 1.5pt rule above TOTAL
        ('SPAN', (1, -1), (3, -1)),  # Span +/- range line across right columns
        ('TOPPADDING', (0, 0), (-1, -1), 4.0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4.0),
        ('LEFTPADDING', (0, 0), (-1, -1), 4.0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4.0),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(cost_table)

    # --- Section 09: Indicative Land Valuation & Project Outlay ---
    land = data.get("land_value") or {}
    if land:
        story.append(create_section_header("09", "Indicative Land Valuation & Project Outlay"))
        ind_rate = _safe_float(land.get("indicative_rate_per_sqft"), None)
        land_cost = _safe_float(land.get("land_cost_inr"), None)
        comb_tot = _safe_float(land.get("combined_project_total_inr"), None)
        source_label = str(land.get("source_publication") or "Published Circle Rates")
        loc_mult_val = _safe_float(land.get("locality_multiplier"), 1.0)
        plot_area = _safe_float(land.get("plot_area_sqft"), 0.0)

        rate_str = f"INR {ind_rate:,.0f} /sq ft {'(User-Supplied)' if land.get('is_user_override') else ''}" if ind_rate is not None and ind_rate > 0 else "Unlisted / Verification Required"
        cost_str = f"INR {land_cost:,.0f} ({plot_area:,.0f} sq ft plot)" if land_cost is not None else "Pending Rate Input"
        tot_str = f"INR {comb_tot:,.0f} (Land + Construction)" if comb_tot is not None else f"INR {tot_inr:,.0f} (Civil Construction Only)"

        c_rate = Paragraph(f'<font color="{COLOR_TEXT_SECONDARY.hexval()}" size="8">Indicative Land Circle Rate</font><br/><font color="{COLOR_TEXT_PRIMARY.hexval()}" size="10"><b>{rate_str}</b></font>', kv_style)
        c_loc = Paragraph(f'<font color="{COLOR_TEXT_SECONDARY.hexval()}" size="8">Locality &amp; Access Multiplier</font><br/><font color="{COLOR_TEXT_PRIMARY.hexval()}" size="10"><b>{loc_mult_val:.2f}x (Road + Facility factors)</b></font>', kv_style)
        c_lcost = Paragraph(f'<font color="{COLOR_TEXT_SECONDARY.hexval()}" size="8">Estimated Land Cost</font><br/><font color="{COLOR_TEXT_PRIMARY.hexval()}" size="10"><b>{cost_str}</b></font>', kv_style)
        c_outlay = Paragraph(f'<font color="{COLOR_TEXT_SECONDARY.hexval()}" size="8">Total Combined Project Outlay</font><br/><font color="{COLOR_TEXT_PRIMARY.hexval()}" size="10"><b>{tot_str}</b></font>', kv_style)

        land_table = Table([[c_rate, c_loc], [c_lcost, c_outlay]], colWidths=[246.6, 246.6])
        land_table.setStyle(TableStyle([
            ('LINEBELOW', (0, 0), (-1, -1), 0.5, COLOR_HAIRLINE),
            ('TOPPADDING', (0, 0), (-1, -1), 5.0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5.0),
            ('LEFTPADDING', (0, 0), (-1, -1), 4.0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 4.0),
        ]))
        story.append(land_table)
        story.append(Spacer(1, 4))
        disc_text = f"<b>Valuation Source &amp; Methodology:</b> {html.escape(source_label)}. <i>{html.escape(str(land.get('disclaimer', '')))}</i>"
        story.append(make_callout(disc_text, width=CONTENT_WIDTH_PT))

    # --- Section 10: Generative Architectural Blueprint (DEDICATED FULL PAGE) ---
    floorplan = floor_plan if floor_plan is not None else (data.get("floor_plan") or data.get("floorplan"))
    if hasattr(floorplan, "model_dump"):
        floorplan = floorplan.model_dump()

    if floorplan and isinstance(floorplan, dict) and (floorplan.get("rectangles") or floorplan.get("grid_matrix") or floorplan.get("placements") or floorplan.get("svg_blueprint")):
        # Section 10 on its own dedicated full page
        story.append(PageBreak())
        story.append(create_section_header("10", "Generative Architectural Blueprint"))

        # Design Brief callout above solver stat strip
        design_intent = floorplan.get("design_intent")
        prog_source = str(floorplan.get("program_source", "fallback")).lower()
        badge_label = "Program: AI-generated" if prog_source in ("llm", "cache") else "Program: Standard"
        badge_color = "#0071E3" if prog_source in ("llm", "cache") else "#86868B"

        placement_source = str(floorplan.get("placement_source", "")).lower()
        placement_badge = "Placement: AI-reasoned + KB-validated" if ("ai" in placement_source or "llm" in placement_source) else "Placement: KB-standard"
        placement_badge_color = "#0071E3" if ("ai" in placement_source or "llm" in placement_source) else "#86868B"

        placement_logic = floorplan.get("placement_logic") or []
        logic_summary = ""
        if isinstance(placement_logic, dict):
            logic_items = [f"{k.replace('_', ' ').title()}: {v}" for k, v in placement_logic.items()]
        elif isinstance(placement_logic, list):
            logic_items = [str(x) for x in placement_logic]
        else:
            logic_items = []

        if logic_items:
            logic_summary = f"<br/><font size='7.5' color='#4B5563'><b>Placement Rules:</b> {html.escape('; '.join(logic_items[:3]))}{'...' if len(logic_items) > 3 else ''}</font>"

        if not design_intent:
            design_intent = "Space plan optimized for functional circulation, Vastu compliance, and plumbing consolidation."

        qa = floorplan.get("qa") or (floorplan.get("rectangles") or {}).get("qa") or {}
        if hasattr(qa, "model_dump"):
            qa = qa.model_dump()
        elif not isinstance(qa, dict):
            qa = {}
        entry_hub = str(qa.get("entry", "hall")).title()
        circ_status = str(qa.get("circulation", "connected")).title()
        viol_count = int(qa.get("violations", 0))
        critic_verdict = str(qa.get("critic", "pass")).lower()
        critic_label = "Passed" if critic_verdict == "pass" else ("Skipped" if critic_verdict == "skipped" else "Flagged")
        critic_color = "#166534" if critic_verdict == "pass" else ("#86868B" if critic_verdict == "skipped" else "#B91C1C")

        brief_text = (
            f"<b>Design Brief:</b> <i>{html.escape(design_intent)}</i> &nbsp;&nbsp;<font color='{badge_color}'><b>[{badge_label}]</b></font> &nbsp;&nbsp;<font color='{placement_badge_color}'><b>[{placement_badge}]</b></font><br/>"
            f"<font size='8' color='#166534'><b>Circulation:</b> {circ_status} &nbsp;|&nbsp; <b>Main Entry:</b> {entry_hub} &nbsp;|&nbsp; <b>Architect Review:</b> <font color='{critic_color}'><b>{critic_label}</b></font> &nbsp;|&nbsp; <b>QA Gate:</b> {viol_count} Violations</font>"
            f"{logic_summary}"
        )
        story.append(make_callout(brief_text, width=CONTENT_WIDTH_PT))
        story.append(Spacer(1, 6))

        metrics = floorplan.get("metrics") or {}
        v_pct = _safe_float(metrics.get("vastu_compliance_pct"), 0.0)
        p_pct = _safe_float(metrics.get("plumbing_adjacency_score"), 0.0)
        u_pct = _safe_float(metrics.get("space_utilization_pct"), 0.0)
        b_area = _safe_float(metrics.get("total_built_up_sqm"), 0.0)

        # 4-tile solver stat strip
        tile_w = CONTENT_WIDTH_PT / 4.0
        bp_t1 = make_stat_tile("Vastu Compliance", f"{v_pct:.1f}%", width=tile_w - 6.0)
        bp_t2 = make_stat_tile("Plumbing Adjacency", f"{p_pct:.1f}%", width=tile_w - 6.0)
        bp_t3 = make_stat_tile("Space Utilization", f"{u_pct:.1f}%", width=tile_w - 6.0)
        bp_t4 = make_stat_tile("Total Habitable", f"{b_area:.1f} m²", width=tile_w - 6.0)

        bp_stat_strip = Table([[bp_t1, bp_t2, bp_t3, bp_t4]], colWidths=[tile_w, tile_w, tile_w, tile_w])
        bp_stat_strip.setStyle(TableStyle([
            ('LEFTPADDING', (0, 0), (-1, -1), 2.0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 2.0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ]))
        story.append(bp_stat_strip)
        story.append(Spacer(1, 6))

        # Vector drawing at FULL content width (174mm >= 165mm) and 420pt height
        drawing = draw_floorplan_reportlab(
            floorplan.get("placements") or [],
            floorplan.get("grid_matrix") or [],
            width=CONTENT_WIDTH_PT,
            height=420.0,
            rectangles=floorplan.get("rectangles")
        )
        story.append(drawing)
        story.append(Spacer(1, 6))

        # Legend row (tinted dot + room name + zone chip per room, up to 3 lines)
        legend_table = make_floorplan_legend(floorplan, width=CONTENT_WIDTH_PT)
        story.append(legend_table)

    # -------------------------------------------------------------------------
    # FORMAL ENGINEERING DISCLAIMER
    # -------------------------------------------------------------------------
    story.append(Spacer(1, 12))
    disclaimer_text = (
        "<b>LEGAL &amp; ENGINEERING DISCLAIMER:</b> This assessment is generated algorithmically for preliminary planning and "
        "concept feasibility advisory purposes only. Calculations are grounded in public digital elevation models, remote "
        "meteorological telemetry, and CPWD Plinth Area Benchmarks. This document does not constitute a certified geotechnical "
        "borehole survey, an approved municipal structural drawing, or legal land title clearance. "
        "Physical site testing and certified structural engineer stamp are mandatory prior to any ground excavation or contract tender."
    )
    story.append(make_callout(disclaimer_text, width=CONTENT_WIDTH_PT))

    # Build document using NumberedCanvas
    doc.build(story, canvasmaker=NumberedCanvas)
    buffer.seek(0)
    return buffer
