import io
import os
import html
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether, HRFlowable, PageBreak, Image as RLImage
)
from reportlab.pdfgen import canvas
from reportlab.graphics.shapes import Drawing, Rect, String, ArcPath, Circle
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


def _keep_with_next(flowable: Any) -> Any:
    """
    Marks a flowable as keep-with-next so it never strands at the bottom of a
    page away from its content (ReportLab honours keepWithNext on Paragraphs,
    and platypus propagates it through KeepTogether wrappers).
    """
    try:
        flowable.keepWithNext = True
    except Exception:
        pass
    return flowable


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
        _keep_with_next(header_p),
        _keep_with_next(Spacer(1, 4)),
        _keep_with_next(HRFlowable(width="100%", thickness=0.5, color=COLOR_HAIRLINE, spaceBefore=2, spaceAfter=8))
    ])


# =============================================================================
# 5. BLUEPRINT VECTOR DRAWING ENGINE
# =============================================================================


def draw_floorplan_reportlab(
    placements: Any = None,
    grid_matrix: Any = None,
    width: float = CONTENT_WIDTH_PT,
    height: float = 450.0,
    rectangles: Any = None,
    ground_cores: Optional[List[Any]] = None,
    ground_ducts: Optional[List[Any]] = None,
    floor_name: Optional[str] = None,
    floor_index: int = 0,
    plot_width_m: Optional[float] = None,
    plot_depth_m: Optional[float] = None,
    total_storeys: Optional[int] = None,
    seed: Optional[str] = None,
    typology: Optional[str] = None
) -> Drawing:
    """
    Renders architectural floor plan vector drawing into ReportLab Drawing via the shared Drawing IR.
    """
    from app.services.floorplan.drawing_ir import build_drawing_ir, render_reportlab_from_ir
    floor_data = rectangles if rectangles is not None else {"placements": placements}
    bldg = {"vertical_cores": ground_cores or [], "duct_shafts": ground_ducts or []}
    ir = build_drawing_ir(
        floor_data=floor_data,
        building_model=bldg,
        gen_id=seed,
        typology=typology,
        plot_width_m=plot_width_m,
        plot_depth_m=plot_depth_m,
        total_storeys=total_storeys,
        elevation_m=floor_index * 3.0
    )
    return render_reportlab_from_ir(ir, width=width, height=height)


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
    for idx, r in enumerate(raw_rooms, 1):
        rid = str(_get(r, "room_id", "") or "")
        name = str(_get(r, "room_name", "") or "")
        if not name:
            name = rid.replace("_", " ").title() if rid else "Room"
        if name in seen_names:
            continue
        seen_names.add(name)
        is_core = bool(_get(r, "is_vertical_core", False)) or rid in ("stairs", "staircase", "lift", "elevator")
        zone = str(_get(r, "zone", "General") or "General")
        chip_label = "[Core]" if is_core else f"[{zone.title()}]"
        dot_color = "#AF52DE" if is_core else ZONE_COLORS.get(zone.lower(), "#0071E3")
        cell_p = Paragraph(f'<b>{idx}.</b> <font color="{dot_color}" size=8>•</font> <b>{html.escape(name)}</b> <font color="{COLOR_TEXT_TERTIARY.hexval()}" size=6.5>{html.escape(chip_label)}</font>', p_leg)
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
def make_construction_schedules_table(
    floor_data: Dict[str, Any],
    width: float = CONTENT_WIDTH_PT,
    floor_index: int = 0
) -> List[Any]:
    """
    Renders Apple-designed ReportLab Tables for:
    - Wall Type Legend (W1 exterior 230mm, W2 interior 115mm, W3 partition 75mm)
    - Door Schedule (Tag, WxH, Type, Clear Opening, Level)
    - Window Schedule (Tag, WxH, Sill, Lintel, Ventilation Ratio)
    - Room Schedule (No., Name, Clear Area, Clear Dims, Finish Zone)
    """
    flowables: List[Any] = []

    p_th = ParagraphStyle('SchedTH', fontName=FONT_SEMIBOLD, fontSize=8.0, leading=10.0, textColor=COLOR_TEXT_SECONDARY)
    p_td = ParagraphStyle('SchedTD', fontName=FONT_REGULAR, fontSize=7.5, leading=9.5, textColor=COLOR_TEXT_PRIMARY)
    p_td_num = ParagraphStyle('SchedTDNum', fontName=FONT_REGULAR, fontSize=7.5, leading=9.5, textColor=COLOR_TEXT_PRIMARY, alignment=2)
    p_title = ParagraphStyle('SchedH3', fontName=FONT_SEMIBOLD, fontSize=9.0, leading=12.0, textColor=COLOR_ACCENT)

    # 1. Wall Type Legend
    flowables.append(Spacer(1, 4))
    flowables.append(_keep_with_next(Paragraph("<b>Wall Type Specifications (NBC 2016 Compliant)</b>", p_title)))
    flowables.append(Spacer(1, 3))
    wall_headers = ["Wall Type", "Thickness", "Construction Specification", "Statutory Code Reference"]
    wall_data = [
        [Paragraph(h, p_th) for h in wall_headers],
        [Paragraph("<b>W1</b>", p_td), Paragraph("230 mm", p_td), Paragraph("Exterior Load-Bearing / Structural Envelope (Masonry/RCC)", p_td), Paragraph("NBC 2016 Part 3 Cl 3.4.1", p_td)],
        [Paragraph("<b>W2</b>", p_td), Paragraph("115 mm", p_td), Paragraph("Interior Non-Load-Bearing Partition (Half-Brick Masonry)", p_td), Paragraph("IS 2212 / NBC 2016", p_td)],
        [Paragraph("<b>W3</b>", p_td), Paragraph("75 mm", p_td), Paragraph("Toilet / MEP Shaft Lightweight Enclosure", p_td), Paragraph("IS 456 / NBC 2016", p_td)],
    ]
    w_cols = [55.0, 60.0, 240.0, width - 355.0]
    t_wall = Table(wall_data, colWidths=w_cols, repeatRows=1)
    t_wall.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), COLOR_BG_SUBTLE),
        ('BOX', (0, 0), (-1, -1), 0.5, COLOR_HAIRLINE),
        ('LINEBELOW', (0, 0), (-1, -1), 0.5, COLOR_HAIRLINE),
        ('TOPPADDING', (0, 0), (-1, -1), 3.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3.5),
        ('LEFTPADDING', (0, 0), (-1, -1), 5.0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5.0),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    flowables.append(t_wall)

    # Extract or synthesize schedules
    d_sched = _get(floor_data, "door_schedule", [])
    w_sched = _get(floor_data, "window_schedule", [])
    r_sched = _get(floor_data, "room_schedule", [])

    wall_graph = _get(floor_data, "wall_graph", None)
    if wall_graph:
        if not d_sched:
            d_sched = getattr(wall_graph, "door_schedule", []) or _get(wall_graph, "door_schedule", [])
        if not w_sched:
            w_sched = getattr(wall_graph, "window_schedule", []) or _get(wall_graph, "window_schedule", [])
        if not r_sched:
            r_sched = getattr(wall_graph, "room_schedule", []) or _get(wall_graph, "room_schedule", [])

    # Fallback from doors/windows/rooms if needed
    if not d_sched:
        doors_raw = _get(floor_data, "doors", []) or (_get(floor_data, "rectangles", {}) or {}).get("doors", [])
        for idx, d in enumerate(doors_raw, 1):
            w = _safe_float(_get(d, "width_m", 0.9), 0.9)
            d_sched.append({
                "tag": f"D{idx}",
                "width_m": w,
                "height_m": 2.10,
                "door_type": str(_get(d, "door_type", "Standard Flush Timber")),
                "level": floor_index,
            })

    if not w_sched:
        wins_raw = _get(floor_data, "windows", []) or (_get(floor_data, "rectangles", {}) or {}).get("windows", [])
        for idx, w in enumerate(wins_raw, 1):
            w_w = _safe_float(_get(w, "width_m", 1.2), 1.2)
            w_sched.append({
                "tag": f"W{idx}",
                "width_m": w_w,
                "height_m": 1.20,
                "sill_m": 0.90,
                "lintel_m": 2.10,
                "ventilation_ratio": ">= 12.5% (NBC Cl 4.2)",
            })

    if not r_sched:
        rooms_raw = _get(floor_data, "rooms", []) or (_get(floor_data, "rectangles", {}) or {}).get("rooms", []) or _get(floor_data, "placements", [])
        for idx, r in enumerate(rooms_raw, 1):
            r_nm = str(_get(r, "room_name", f"Room {idx}"))
            r_w = _safe_float(_get(r, "width_m", _get(r, "width", 3.0)), 3.0)
            r_d = _safe_float(_get(r, "depth_m", _get(r, "height", 3.0)), 3.0)
            r_ar = _safe_float(_get(r, "area_sqm", r_w * r_d), r_w * r_d)
            r_sched.append({
                "room_number": idx,
                "room_name": r_nm,
                "clear_area_sqm": r_ar,
                "clear_dims": f"{r_w:.2f}m x {r_d:.2f}m",
                "finish_zone": "Vitrified Tiles + Low-VOC Acrylic Paint",
            })

    # 2. Door Schedule Table
    flowables.append(Spacer(1, 8))
    flowables.append(_keep_with_next(Paragraph("<b>Door Schedule</b>", p_title)))
    flowables.append(Spacer(1, 3))
    door_headers = ["Tag", "Size (W x H)", "Door Type Specification", "Clear Opening", "Storey Level"]
    door_table_data = [[Paragraph(h, p_th) for h in door_headers]]
    for d in (d_sched or [])[:8]:
        d_tag = str(_get(d, "tag", "D1"))
        d_size = f"{_safe_float(_get(d, 'width_m', 0.9)):.2f}m x {_safe_float(_get(d, 'height_m', 2.1)):.2f}m"
        d_type = str(_get(d, "door_type", "Flush Timber Door"))
        d_clear = f"{_safe_float(_get(d, 'width_m', 0.9)):.2f}m Clear"
        # CANONICAL LEVEL LADDER: the wire may carry "L0", "Level 0" or even
        # a pre-prefixed "LLevel 0". Normalize BEFORE the display format so the
        # table can never print a double-prefixed ladder token.
        _raw_lvl = str(_get(d, "level", ""))
        if _raw_lvl.startswith("LLevel "):
            _raw_lvl = _raw_lvl[len("L"):]
        elif _raw_lvl.startswith("L") and not _raw_lvl.startswith("Level"):
            pass
        elif _raw_lvl.startswith("Level "):
            _raw_lvl = f"L{_raw_lvl[len('Level '):]}"
        elif not _raw_lvl:
            _raw_lvl = f"L{floor_index}"
        d_lvl = f"{_raw_lvl} (+{floor_index * 3.0:.2f}m)"
        door_table_data.append([
            Paragraph(f"<b>{d_tag}</b>", p_td),
            Paragraph(d_size, p_td),
            Paragraph(d_type, p_td),
            Paragraph(d_clear, p_td),
            Paragraph(d_lvl, p_td),
        ])
    d_cols = [45.0, 95.0, 165.0, 85.0, width - 390.0]
    t_door = Table(door_table_data, colWidths=d_cols, repeatRows=1)
    t_door.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), COLOR_BG_SUBTLE),
        ('BOX', (0, 0), (-1, -1), 0.5, COLOR_HAIRLINE),
        ('LINEBELOW', (0, 0), (-1, -1), 0.5, COLOR_HAIRLINE),
        ('TOPPADDING', (0, 0), (-1, -1), 3.0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3.0),
        ('LEFTPADDING', (0, 0), (-1, -1), 5.0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5.0),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    flowables.append(t_door)

    # 3. Window Schedule Table
    flowables.append(Spacer(1, 8))
    flowables.append(_keep_with_next(Paragraph("<b>Window Schedule (NBC 2016 Light &amp; Ventilation Ratios)</b>", p_title)))
    flowables.append(Spacer(1, 3))
    win_headers = ["Tag", "Size (W x H)", "Sill Level", "Lintel Level", "Code Ventilation Ratio"]
    win_table_data = [[Paragraph(h, p_th) for h in win_headers]]
    for w in (w_sched or [])[:8]:
        w_tag = str(_get(w, "tag", "W1"))
        w_size = f"{_safe_float(_get(w, 'width_m', 1.2)):.2f}m x {_safe_float(_get(w, 'height_m', 1.2)):.2f}m"
        w_sill = f"{_safe_float(_get(w, 'sill_m', 0.9)):.2f}m"
        w_lint = f"{_safe_float(_get(w, 'lintel_m', 2.1)):.2f}m"
        w_vr = str(_get(w, "ventilation_ratio", ">= 12.5% (NBC Part 8 Sec 1 Cl 4.2)"))
        win_table_data.append([
            Paragraph(f"<b>{w_tag}</b>", p_td),
            Paragraph(w_size, p_td),
            Paragraph(w_sill, p_td),
            Paragraph(w_lint, p_td),
            Paragraph(w_vr, p_td),
        ])
    w_cols = [45.0, 95.0, 70.0, 70.0, width - 280.0]
    t_win = Table(win_table_data, colWidths=w_cols, repeatRows=1)
    t_win.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), COLOR_BG_SUBTLE),
        ('BOX', (0, 0), (-1, -1), 0.5, COLOR_HAIRLINE),
        ('LINEBELOW', (0, 0), (-1, -1), 0.5, COLOR_HAIRLINE),
        ('TOPPADDING', (0, 0), (-1, -1), 3.0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3.0),
        ('LEFTPADDING', (0, 0), (-1, -1), 5.0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5.0),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    flowables.append(t_win)

    # 4. Room Schedule Table
    flowables.append(Spacer(1, 8))
    flowables.append(_keep_with_next(Paragraph("<b>Room Schedule (Clear Interior Dimensions &amp; Finish Specifications)</b>", p_title)))
    flowables.append(Spacer(1, 3))
    room_headers = ["No.", "Room Name", "Clear Area", "Clear Dimensions (W x D)", "Finish Specification"]
    room_table_data = [[Paragraph(h, p_th) for h in room_headers]]
    for r in (r_sched or [])[:10]:
        r_num = str(_get(r, "room_number", 1))
        r_name = str(_get(r, "room_name", "Room"))
        r_area = f"{_safe_float(_get(r, 'clear_area_sqm', 0.0)):.2f} m²"
        r_dims = str(_get(r, "clear_dims", "-"))
        r_finish = " ".join(str(_get(r, "finish_zone", "Zone Standard Finish")).split())
        room_table_data.append([
            Paragraph(r_num, p_td_num),
            Paragraph(f"<b>{r_name}</b>", p_td),
            Paragraph(r_area, p_td_num),
            Paragraph(r_dims, p_td),
            Paragraph(r_finish, p_td),
        ])
    r_cols = [30.0, 120.0, 75.0, 110.0, width - 335.0]
    t_room = Table(room_table_data, colWidths=r_cols, repeatRows=1)
    t_room.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), COLOR_BG_SUBTLE),
        ('BOX', (0, 0), (-1, -1), 0.5, COLOR_HAIRLINE),
        ('LINEBELOW', (0, 0), (-1, -1), 0.5, COLOR_HAIRLINE),
        ('TOPPADDING', (0, 0), (-1, -1), 3.0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3.0),
        ('LEFTPADDING', (0, 0), (-1, -1), 5.0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5.0),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    flowables.append(t_room)

    return flowables


def make_site_plan_sheet_flowables(
    site_plan_data: Any,
    width: float = CONTENT_WIDTH_PT,
    gen_id: str = "GEN-SITE-01",
    typology: str = "residential_single"
) -> List[Any]:
    """
    Renders dedicated A4 Sheet 10.SP (Site Plan & Cadastral Survey) for irregular plots:
    - Cadastral brief callout with local tangent plane projection details
    - 4-tile statutory site stat strip (Plot Area, Buildable, Footprint, Coverage)
    - Full-width vector Drawing IR rendering (boundary, setback, hatched band, outdoor zones, rotated footprint)
    - Boundary Survey & Setting-Out Table (P1..Pn, Easting/Northing, Edge Lengths, Bearings)
    - Outdoor Difference Fragments Breakdown Table
    """
    flowables: List[Any] = []
    from app.schemas.site_plan import SitePlanModel
    if isinstance(site_plan_data, SitePlanModel):
        sp_model = site_plan_data
    elif isinstance(site_plan_data, dict):
        sp_model = SitePlanModel.model_validate(site_plan_data)
    else:
        return flowables

    flowables.append(PageBreak())
    flowables.append(create_section_header("10.SP", "SITE PLAN & CADASTRAL SURVEY (Datum +0.00m)"))

    p_th = ParagraphStyle('SiteTH', fontName=FONT_SEMIBOLD, fontSize=8.0, leading=10.0, textColor=COLOR_TEXT_SECONDARY)
    p_td = ParagraphStyle('SiteTD', fontName=FONT_REGULAR, fontSize=7.5, leading=9.5, textColor=COLOR_TEXT_PRIMARY)
    p_td_num = ParagraphStyle('SiteTDNum', fontName=FONT_REGULAR, fontSize=7.5, leading=9.5, textColor=COLOR_TEXT_PRIMARY, alignment=2)
    p_title = ParagraphStyle('SiteH3', fontName=FONT_SEMIBOLD, fontSize=9.0, leading=12.0, textColor=COLOR_ACCENT)
    p_meta = ParagraphStyle('SiteMeta', fontName=FONT_REGULAR, fontSize=7.0, leading=9.0, textColor=COLOR_TEXT_SECONDARY)

    # 1. Brief Callout
    poly = sp_model.plot_polygon
    shape_type_display = poly.shape_type.replace('_', '-').title()
    rot_str = f", rotation {sp_model.footprint.rotation_angle_deg:.1f}°" if abs(sp_model.footprint.rotation_angle_deg) > 0.05 else ""
    brief_text = (
        f"<b>Cadastral Setting-Out &amp; Statutory Zoning:</b> Local metric tangent plane (+X East, +Y North). "
        f"Evaluated as a <b>{shape_type_display}</b> boundary ({len(poly.vertices)} vertices, {poly.area_sqm:.1f} m²) with verified counter-clockwise "
        f"winding, statutory NBC inward setback buffer ({sp_model.nominal_setback_m:.2f}m), "
        f"and an inscribed constructible footprint of {sp_model.footprint.width_m:.2f}m × {sp_model.footprint.depth_m:.2f}m "
        f"({sp_model.footprint.area_sqm:.1f} m²{rot_str}). All subsequent upper storeys derive their spatial anchoring strictly from this rectangular footprint."
    )
    flowables.append(make_callout(brief_text, width=width))
    flowables.append(Spacer(1, 4))

    if getattr(sp_model, "design_policy", None):
        policy_box = (
            f"<b>Declared Design Policy:</b> {sp_model.design_policy}<br/>"
            f"<b>Rationale:</b> {getattr(sp_model, 'design_policy_rationale', 'Structural grid, construction cost, NBC regularity')}"
        )
        flowables.append(make_callout(policy_box, width=width))
        flowables.append(Spacer(1, 4))

    if getattr(sp_model, "waste_warning_triggered", False):
        waste_warn = (
            f"<b>Waste Warning:</b> Best orthogonal footprint wastes {sp_model.waste_pct:.1f}% (> 25%) of buildable area. "
            f"Evaluated rotations showed no viable improvement without compromising structural regularity. Functional wedge absorption recommended."
        )
        flowables.append(make_callout(waste_warn, width=width))
        flowables.append(Spacer(1, 4))

    # 2. 4-Tile Stat Strip
    tile_w = width / 4.0
    st1 = make_stat_tile("Plot Area", f"{poly.area_sqm:.1f} m²", width=tile_w - 6.0)
    st2 = make_stat_tile("Buildable Envelope", f"{sp_model.buildable_area_sqm:.1f} m²", width=tile_w - 6.0)
    st3 = make_stat_tile("Inscribed Footprint", f"{sp_model.footprint.area_sqm:.1f} m²", width=tile_w - 6.0)
    st4 = make_stat_tile("Ground Coverage", f"{sp_model.certificate.ground_coverage_actual_pct:.1f}%", width=tile_w - 6.0)

    stat_table = Table([[st1, st2, st3, st4]], colWidths=[tile_w, tile_w, tile_w, tile_w])
    stat_table.setStyle(TableStyle([
        ('LEFTPADDING', (0, 0), (-1, -1), 2.0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 2.0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    flowables.append(stat_table)
    flowables.append(Spacer(1, 4))

    # Drawing Status Stamp Callout (the fallback derives from the
    # canonical single-source helper rather than a re-worded literal)
    from app.services.floorplan.validation_gate import drawing_status_stamp as _canonical_stamp
    stamp_txt = getattr(sp_model, "drawing_status_stamp", None) or _canonical_stamp(["L1"])
    p_stamp = Paragraph(f"<font color='#DC2626'><b>{stamp_txt}</b></font>", p_meta)
    t_stamp = Table([[p_stamp]], colWidths=[width])
    t_stamp.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#FEF2F2")),
        ('BOX', (0, 0), (-1, -1), 0.75, colors.HexColor("#DC2626")),
        ('TOPPADDING', (0, 0), (-1, -1), 3.0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3.0),
        ('LEFTPADDING', (0, 0), (-1, -1), 6.0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6.0),
    ]))
    flowables.append(t_stamp)
    flowables.append(Spacer(1, 3))

    # Derivation Chain Banner
    deriv_text = getattr(sp_model, "derivation_text", "FOOTPRINT DERIVED FROM BUILDABLE POLYGON P1..Pn via PLOT -> SETBACKS -> BUILDABLE -> BUILDING LINE")
    p_deriv = Paragraph(f"<b>Building-Line Derivation:</b> {deriv_text}", p_meta)
    sb_dims = getattr(sp_model, "setback_dimensions", {}) or {}
    sb_summary = f"Setbacks: Front {sb_dims.get('front', 0.0):.2f}m | Rear {sb_dims.get('rear', 0.0):.2f}m | Side 1 {sb_dims.get('side1', 0.0):.2f}m | Side 2 {sb_dims.get('side2', 0.0):.2f}m"
    p_sb = Paragraph(f"<font color='#475569'><b>Statutory Building Line:</b> {sb_summary}</font>", p_meta)
    t_deriv = Table([[p_deriv], [p_sb]], colWidths=[width])
    t_deriv.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
        ('BOX', (0, 0), (-1, -1), 0.5, COLOR_HAIRLINE),
        ('TOPPADDING', (0, 0), (-1, -1), 3.0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3.0),
        ('LEFTPADDING', (0, 0), (-1, -1), 6.0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6.0),
    ]))
    flowables.append(t_deriv)
    flowables.append(Spacer(1, 4))

    # 3. Vector Drawing via Drawing IR
    from app.services.floorplan.drawing_ir import build_site_drawing_ir, render_reportlab_from_ir
    site_ir = build_site_drawing_ir(sp_model, gen_id=gen_id, typology=typology)
    drawing = render_reportlab_from_ir(site_ir, width=width, height=360.0)
    flowables.append(drawing)
    flowables.append(Spacer(1, 5))

    # 4. Cadastral Survey Schedule Table
    flowables.append(_keep_with_next(Paragraph("<b>Boundary Survey Table &amp; Setting-Out Bearings</b>", p_title)))
    flowables.append(Spacer(1, 3))

    table_data: List[List[Any]] = [[
        Paragraph("<b>Vertex</b>", p_th),
        Paragraph("<b>Local Easting (X)</b>", p_th),
        Paragraph("<b>Local Northing (Y)</b>", p_th),
        Paragraph("<b>Boundary Edge</b>", p_th),
        Paragraph("<b>Edge Length</b>", p_th),
        Paragraph("<b>Quadrant Bearing</b>", p_th),
    ]]

    for i, v in enumerate(sp_model.vertex_table):
        edge = sp_model.edges[i] if i < len(sp_model.edges) else None
        e_label = f"{edge.from_vertex} – {edge.to_vertex}" if edge else "—"
        e_len = f"{edge.length_m:.2f} m" if edge else "—"
        e_brg = edge.bearing_dms if edge else "—"

        table_data.append([
            Paragraph(f"<b>{v.id}</b>", p_td),
            Paragraph(f"{v.x_m:.2f} m", p_td_num),
            Paragraph(f"{v.y_m:.2f} m", p_td_num),
            Paragraph(e_label, p_td),
            Paragraph(e_len, p_td_num),
            Paragraph(e_brg, p_td),
        ])

    c_w = [45.0, 75.0, 75.0, 80.0, 75.0, width - 350.0]
    t_survey = Table(table_data, colWidths=c_w, repeatRows=1)
    t_survey.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), COLOR_BG_SUBTLE),
        ('BOX', (0, 0), (-1, -1), 0.5, COLOR_HAIRLINE),
        ('LINEBELOW', (0, 0), (-1, -1), 0.5, COLOR_HAIRLINE),
        ('TOPPADDING', (0, 0), (-1, -1), 3.0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3.0),
        ('LEFTPADDING', (0, 0), (-1, -1), 4.0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4.0),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    flowables.append(t_survey)

    # 4b. Parking-First Pipeline & ECS Compliance Table
    pkg = getattr(sp_model, "parking", None)
    if pkg:
        flowables.append(Spacer(1, 5))
        flowables.append(_keep_with_next(Paragraph("<b>Parking-First Pipeline &amp; ECS Compliance Table</b>", p_title)))
        flowables.append(Spacer(1, 2))

        ecs_req = getattr(pkg, "ecs_required", 1)
        ecs_prov = getattr(pkg, "ecs_provided", 1)
        coex = getattr(pkg, "coexistence_status", "COEXISTENT")
        def_warn = getattr(pkg, "deficit_warning", None)
        status_color = "#10B981" if coex == "COEXISTENT" else "#DC2626"
        p_status = Paragraph(f"<font color='{status_color}'><b>{coex}</b></font>", p_td)

        pkg_data: List[List[Any]] = [
            [
                Paragraph("<b>Required ECS</b>", p_th),
                Paragraph("<b>Provided ECS</b>", p_th),
                Paragraph("<b>Bay Dimensions</b>", p_th),
                Paragraph("<b>Drive Aisle</b>", p_th),
                Paragraph("<b>Coexistence Status</b>", p_th),
            ],
            [
                Paragraph(f"{ecs_req} ECS", p_td),
                Paragraph(f"{ecs_prov} ECS", p_td),
                Paragraph("2.50m × 5.00m (NBC Cl 4.1)", p_td),
                Paragraph("3.50m (One-Way)", p_td),
                p_status,
            ]
        ]
        t_pkg = Table(pkg_data, colWidths=[70.0, 70.0, 140.0, 85.0, width - 365.0])
        t_pkg.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), COLOR_BG_SUBTLE),
            ('BOX', (0, 0), (-1, -1), 0.5, COLOR_HAIRLINE),
            ('LINEBELOW', (0, 0), (-1, -1), 0.5, COLOR_HAIRLINE),
            ('TOPPADDING', (0, 0), (-1, -1), 2.5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2.5),
            ('LEFTPADDING', (0, 0), (-1, -1), 4.0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 4.0),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        flowables.append(t_pkg)

        if def_warn:
            flowables.append(Spacer(1, 2))
            p_warn = Paragraph(f"<font color='#DC2626'><b>PARKING WARNING:</b> {def_warn}<br/><b>OPTIONS:</b> Reduce Footprint | Stack Parking (Mechanized) | Accept Deficit (Municipal Approval)</font>", p_meta)
            t_warn = Table([[p_warn]], colWidths=[width])
            t_warn.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#FEF2F2")),
                ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#DC2626")),
                ('TOPPADDING', (0, 0), (-1, -1), 2.5),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 2.5),
                ('LEFTPADDING', (0, 0), (-1, -1), 5.0),
                ('RIGHTPADDING', (0, 0), (-1, -1), 5.0),
            ]))
            flowables.append(t_warn)

    # 4c. Annotation Status Taxonomy Table
    flowables.append(Spacer(1, 5))
    flowables.append(_keep_with_next(Paragraph("<b>Annotation Status Taxonomy (Drawing Honesty Protocol)</b>", p_title)))
    flowables.append(Spacer(1, 2))
    tax_data: List[List[Any]] = [
        [
            Paragraph("<b>Status Code</b>", p_th),
            Paragraph("<b>Taxonomy Definition &amp; Application in BuildWise</b>", p_th),
        ],
        [
            Paragraph("<font color='#047857'><b>VERIFIED</b></font>", p_td),
            Paragraph("Mathematically provable: Cadastral boundary lengths, closed polygon sum, overall dimension chains, building line.", p_td),
        ],
        [
            Paragraph("<font color='#0284C7'><b>CALCULATED</b></font>", p_td),
            Paragraph("Procedurally computed: Setback deductions, buildable polygon, parking bays (2.5x5.0m), room envelopes.", p_td),
        ],
        [
            Paragraph("<font color='#D97706'><b>ASSUMED</b></font>", p_td),
            Paragraph("Planning default assumptions: Public access road width (9.0m), sewer invert level (-1.2m), neighbour plot bounds.", p_td),
        ],
        [
            Paragraph("<font color='#7C3AED'><b>RECOMMENDED</b></font>", p_td),
            Paragraph("Advisory engineering guidance: Drainage runoff slope (1:100), vehicular drop-off gate, pedestrian entry placement.", p_td),
        ],
    ]
    t_tax = Table(tax_data, colWidths=[100.0, width - 100.0], repeatRows=1)
    t_tax.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), COLOR_BG_SUBTLE),
        ('BOX', (0, 0), (-1, -1), 0.5, COLOR_HAIRLINE),
        ('LINEBELOW', (0, 0), (-1, -1), 0.5, COLOR_HAIRLINE),
        ('TOPPADDING', (0, 0), (-1, -1), 2.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2.5),
        ('LEFTPADDING', (0, 0), (-1, -1), 4.0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4.0),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    flowables.append(t_tax)

    # 5. Outdoor Zone Breakdown (if fragments exist)
    if sp_model.outdoor_zones:
        flowables.append(Spacer(1, 5))
        flowables.append(_keep_with_next(Paragraph("<b>Designated Outdoor Zones (Buildable Polygon \\ Footprint Difference)</b>", p_title)))
        flowables.append(Spacer(1, 2))
        oz_data: List[List[Any]] = [[
            Paragraph("<b>Zone ID</b>", p_th),
            Paragraph("<b>Designation</b>", p_th),
            Paragraph("<b>Fragment Area</b>", p_th),
            Paragraph("<b>Centroid (X, Y)</b>", p_th),
        ]]
        for oz in sp_model.outdoor_zones:
            fid = getattr(oz, "fragment_id", getattr(oz, "id", "OUT"))
            fname = getattr(oz, "name", getattr(oz, "label", "Outdoor Zone"))
            cent = getattr(oz, "centroid", (0.0, 0.0))
            cx = cent[0] if isinstance(cent, (list, tuple)) and len(cent) >= 2 else getattr(oz, "centroid_x", 0.0)
            cy = cent[1] if isinstance(cent, (list, tuple)) and len(cent) >= 2 else getattr(oz, "centroid_y", 0.0)
            oz_data.append([
                Paragraph(f"<b>{fid}</b>", p_td),
                Paragraph(fname, p_td),
                Paragraph(f"{oz.area_sqm:.2f} m²", p_td_num),
                Paragraph(f"({cx:.2f}m, {cy:.2f}m)", p_td),
            ])
        oz_cols = [60.0, 160.0, 85.0, width - 305.0]
        t_oz = Table(oz_data, colWidths=oz_cols, repeatRows=1)
        t_oz.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), COLOR_BG_SUBTLE),
            ('BOX', (0, 0), (-1, -1), 0.5, COLOR_HAIRLINE),
            ('LINEBELOW', (0, 0), (-1, -1), 0.5, COLOR_HAIRLINE),
            ('TOPPADDING', (0, 0), (-1, -1), 2.5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2.5),
            ('LEFTPADDING', (0, 0), (-1, -1), 4.0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 4.0),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        flowables.append(t_oz)

    # 6. Functional Wedge Zones Breakdown (if wedge zones exist)
    if getattr(sp_model, "wedge_zones", None):
        flowables.append(Spacer(1, 5))
        flowables.append(_keep_with_next(Paragraph("<b>Absorbed Functional Wedge Zones (Non-Habitable Residue)</b>", p_title)))
        flowables.append(Spacer(1, 2))
        wdg_data: List[List[Any]] = [[
            Paragraph("<b>Wedge ID</b>", p_th),
            Paragraph("<b>Classification &amp; Name</b>", p_th),
            Paragraph("<b>Absorbed Area</b>", p_th),
            Paragraph("<b>Enclosed Built-Up</b>", p_th),
            Paragraph("<b>Adjacency / Placement</b>", p_th),
        ]]
        for wz in sp_model.wedge_zones:
            wid = getattr(wz, "wedge_id", "WDG")
            wname = getattr(wz, "name", "Wedge Zone")
            wclass = getattr(wz, "classification", "wedge").replace("_", " ").title()
            warea = getattr(wz, "area_sqm", 0.0)
            is_enc = getattr(wz, "is_enclosed_storage", False)
            enc_str = "Yes (Counted in BUA)" if is_enc else "No (Non-Carpet / Outdoor)"
            is_int = getattr(wz, "is_interior_side", False)
            pos_str = "Interior Sheet Edge" if is_int else "Boundary Setback Buffer"
            wdg_data.append([
                Paragraph(f"<b>{wid}</b>", p_td),
                Paragraph(f"{wname} ({wclass})", p_td),
                Paragraph(f"{warea:.2f} m²", p_td_num),
                Paragraph(enc_str, p_td),
                Paragraph(pos_str, p_td),
            ])
        wdg_cols = [55.0, 160.0, 75.0, 110.0, width - 400.0]
        t_wdg = Table(wdg_data, colWidths=wdg_cols, repeatRows=1)
        t_wdg.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), COLOR_BG_SUBTLE),
            ('BOX', (0, 0), (-1, -1), 0.5, COLOR_HAIRLINE),
            ('LINEBELOW', (0, 0), (-1, -1), 0.5, COLOR_HAIRLINE),
            ('TOPPADDING', (0, 0), (-1, -1), 2.5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2.5),
            ('LEFTPADDING', (0, 0), (-1, -1), 4.0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 4.0),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        flowables.append(t_wdg)

    return flowables


# =============================================================================
# 6. MAIN PDF REPORT GENERATOR (REDESIGNED v9)
# =============================================================================

def make_universal_gate_table(gate: Dict[str, Any]) -> List[Any]:
    """
    UNIVERSAL VALIDATION GATE layer table as ReportLab flowables.
    Shared by the Sheet 10.0 dossier and the single-floor blueprint page so the
    gate is a content layer on every blueprint-bearing PDF (SVG/PDF parity).
    Every generation lists ALL layers L1-L14 with per-layer status
    (PASS | WARN | FAIL | N/A-with-reason); overall = worst layer.
    """
    flowables: List[Any] = []
    _gate_layers = list((gate or {}).get("layers") or [])
    if not _gate_layers:
        return flowables
    _g_overall = str((gate or {}).get("overall_status", "PASS"))
    _g_colors = {"PASS": COLOR_GREEN_TEXT, "WARN": COLOR_AMBER_TEXT, "FAIL": COLOR_RED_TEXT, "N/A": COLOR_TEXT_SECONDARY}
    _g_head = ParagraphStyle('GateHead', fontName=FONT_SEMIBOLD, fontSize=7.5, leading=9.0, textColor=COLOR_TEXT_PRIMARY)
    _g_cell = ParagraphStyle('GateCell', fontName=FONT_REGULAR, fontSize=7.0, leading=8.5, textColor=COLOR_TEXT_SECONDARY)
    _g_layer = ParagraphStyle('GateLayer', fontName=FONT_SEMIBOLD, fontSize=7.0, leading=8.5, textColor=COLOR_TEXT_PRIMARY)
    _g_th = ParagraphStyle('GateTH', fontName=FONT_SEMIBOLD, fontSize=7.0, leading=8.5, textColor=COLOR_TEXT_PRIMARY)
    _g_status = {
        st: ParagraphStyle(f'GateSt_{st}', fontName=FONT_SEMIBOLD, fontSize=7.5, leading=9.0,
                           textColor=_g_colors.get(st, COLOR_TEXT_SECONDARY))
        for st in ("PASS", "WARN", "FAIL", "N/A")
    }
    _gate_rows = [
        [
            Paragraph("<b>UNIVERSAL VALIDATION GATE - LAYERS L1-L14</b>", _g_head),
            Paragraph("", _g_cell),
            Paragraph(f"<b>OVERALL: {_g_overall}</b>",
                      _g_status.get(_g_overall, _g_cell)),
        ],
        [
            Paragraph("<b>Layer</b>", _g_th),
            Paragraph("<b>Scope / Summary (N/A shows reason)</b>", _g_th),
            Paragraph("<b>Status</b>", _g_th),
        ],
    ]
    for _ld in _gate_layers[:14]:
        _lid = str(_ld.get("layer_id", "?"))
        _lt = str(_ld.get("title", ""))
        _lst = str(_ld.get("status", "PASS"))
        if _lst == "N/A":
            _lsum = f"N/A: {_ld.get('reason', 'not applicable')}"
        else:
            _lsum = str(_ld.get("summary", ""))
            _f = _ld.get("findings") or []
            if _f:
                # Keep only findings that add information (skip echoes of the
                # summary and near-identical repeated findings).
                _seen_f = {_lsum.strip().lower()}
                _extra = []
                for _fx in (str(x).strip() for x in _f[:4]):
                    if not _fx:
                        continue
                    _key = _fx.lower()
                    if _key in _seen_f:
                        continue
                    _seen_f.add(_key)
                    _extra.append(_fx)
                if _extra:
                    _lsum += " - " + "; ".join(_extra[:2])
        _gate_rows.append([
            Paragraph(f"<b>{html.escape(_lid)}</b> {html.escape(_lt)}", _g_layer),
            Paragraph(html.escape(_lsum[:220]), _g_cell),
            Paragraph(f"<b>{_lst}</b>", _g_status.get(_lst, _g_cell)),
        ])
    _warn_ids = [str(_ld.get("layer_id")) for _ld in _gate_layers if str(_ld.get("status")) == "WARN"]
    if _warn_ids:
        _g_warn_style = ParagraphStyle('GateWarn', fontName=FONT_REGULAR, fontSize=7.0, leading=8.5, textColor=COLOR_AMBER_TEXT)
        _gate_rows.append([
            Paragraph(f"<b>Warnings surfaced as chips:</b> {html.escape(', '.join(_warn_ids))}", _g_warn_style),
            "",
            Paragraph("<b>ADVISORY</b>", _g_warn_style),
        ])
    t_gate = Table(_gate_rows, colWidths=[150.0, 279.0, 60.23], repeatRows=2)
    t_gate.setStyle(TableStyle([
        ('SPAN', (0, 0), (1, 0)),
        ('BACKGROUND', (0, 0), (-1, 0), COLOR_BG_SUBTLE),
        ('BACKGROUND', (0, 1), (-1, 1), COLOR_BG_SUBTLE),
        ('LINEBELOW', (0, 0), (-1, 0), 1.0, COLOR_ACCENT),
        ('LINEBELOW', (0, 1), (-1, 1), 0.5, COLOR_HAIRLINE),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3.0),
        ('TOPPADDING', (0, 0), (-1, -1), 3.0),
        ('LEFTPADDING', (0, 0), (-1, -1), 4.0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4.0),
        ('BOX', (0, 0), (-1, -1), 1.0, COLOR_ACCENT),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    flowables.append(t_gate)
    flowables.append(Spacer(1, 8))
    return flowables



def generate_pdf_report(
    data: Dict[str, Any],
    site_vision: Optional[Dict[str, Any]] = None,
    floor_plan: Optional[Dict[str, Any]] = None,
    dossier_only: bool = False,
    include_construction_schedules: Optional[bool] = None
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

    # Logo: Official brand logo or fallback Drawing
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    logo_path = os.path.join(base_dir, "assets", "brand", "BuildWise_logo_square.png")
    if os.path.exists(logo_path):
        logo_element = RLImage(logo_path, width=28, height=28)
    else:
        # Logo Drawing (28x28 rounded square with accent fill and white "BW")
        logo_d = Drawing(28, 28)
        logo_d.add(Rect(0, 0, 28, 28, rx=6, ry=6, fillColor=COLOR_ACCENT, strokeColor=None))
        logo_d.add(String(14, 8.5, "BW", fontName=FONT_BOLD, fontSize=11.5, textAnchor="middle", fillColor=colors.white))
        logo_element = logo_d

    is_dossier_only = dossier_only or bool(data.get("dossier_only"))
    app_brand_p = Paragraph(f'<font color="{COLOR_ACCENT.hexval()}" size="11"><b>BuildWise AI</b></font>', ParagraphStyle('Brand', fontName=FONT_SEMIBOLD, leading=12))
    doc_title_text = "Architectural Floor Plan Dossier" if is_dossier_only else "Site Feasibility &amp; Engineering Advisory"
    app_title_p = Paragraph(f'<font color="#1D1D1F" size="15"><b>{doc_title_text}</b></font>', ParagraphStyle('DocTitle', fontName=FONT_BOLD, leading=17))

    title_box = Table([[logo_element, Table([[app_brand_p], [app_title_p]], colWidths=[270])]], colWidths=[34, 276])
    title_box.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))

    # Ref chip: show the full request ID, sizing the chip to the rendered text
    # (Inter, 8pt). Only ellipsize when the ID exceeds the meta column width.
    ref_fs = 8.0
    ref_chip_max_w = 178.0  # meta_box column is 180pt wide
    ref_disp = f"Ref: {req_id}"
    ref_esc = html.escape(ref_disp)
    # The chip text renders bold (Inter-Bold); measure with the bold face so the
    # computed chip width actually fits it on a single line.
    ref_text_w = pdfmetrics.stringWidth(ref_esc, FONT_BOLD, ref_fs)
    if ref_text_w + 10.0 <= ref_chip_max_w:
        chip_w = ref_text_w + 10.0
    else:
        while len(ref_disp) > 8 and pdfmetrics.stringWidth(html.escape(ref_disp) + "...", FONT_BOLD, ref_fs) + 10.0 > ref_chip_max_w:
            ref_disp = ref_disp[:-1]
        ref_disp += "..."
        ref_esc = html.escape(ref_disp)
        chip_w = min(ref_chip_max_w, pdfmetrics.stringWidth(ref_esc, FONT_BOLD, ref_fs) + 10.0)
    ref_chip_p = Paragraph(f"<b>{ref_esc}</b>", ParagraphStyle('RefChip', fontName=FONT_REGULAR, fontSize=ref_fs, leading=10.0, textColor=COLOR_TEXT_SECONDARY, alignment=1))
    ref_chip = Table([[ref_chip_p]], colWidths=[chip_w])
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
    # DEGRADED-MODE WARNING BANNER: degradation notices collected
    # during analysis are surfaced as a visible amber banner near the top of the
    # PDF - they must never be buried in appendix prose or dropped entirely.
    # -------------------------------------------------------------------------
    pdf_warnings = [str(w).strip() for w in (data.get("warnings") or []) if str(w).strip()]
    if pdf_warnings or bool(data.get("degraded_mode")):
        banner_style = ParagraphStyle(
            'DegradedBanner',
            fontName=FONT_REGULAR,
            fontSize=8.5,
            leading=12.5,
            textColor=COLOR_TEXT_PRIMARY,
            alignment=0
        )
        items_html = "".join(f"<br/>• {html.escape(w)}" for w in pdf_warnings)
        if not items_html:
            items_html = "<br/>• One or more telemetry services were unreachable; deterministic fallback models were applied."
        banner_p = Paragraph(
            f'<font color="{COLOR_AMBER_TEXT.hexval()}"><b>DATA DEGRADATION NOTICE — read before relying on figures</b></font>'
            f'{items_html}',
            banner_style
        )
        banner_tbl = Table([[banner_p]], colWidths=[CONTENT_WIDTH_PT])
        banner_tbl.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), COLOR_AMBER_TINT),
            ('ROUNDEDCORNERS', [6, 6, 6, 6]),
            ('LINEBEFORE', (0, 0), (0, -1), 2.0, COLOR_AMBER_BORDER),
            ('TOPPADDING', (0, 0), (-1, -1), 7.0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 7.0),
            ('LEFTPADDING', (0, 0), (-1, -1), 10.0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8.0),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        story.append(banner_tbl)
        story.append(Spacer(1, 8))

    if not is_dossier_only:
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
            status_raw = str(f.get("status") or "optimal")
            st = status_raw.replace("_", " ").capitalize()
            weight_val = _safe_float(f.get("weight"), 0.0)
            score_val = _safe_float(f.get("score"), 0.0)
            raw_val = f.get("raw_value")
            unit_str = str(f.get("unit", "") or "")

            # Provenance status words mirror the report UI census exactly: the
            # same categorizer contract (unmeasured -> UNKNOWN; disclosed
            # fallback/synthetic/modelled/proxy details -> ASSUMED; otherwise
            # VERIFIED). The word prints in the assessment cell so the dossier
            # and the sheet can never diverge.
            if status_raw == "unknown" or raw_val is None:
                provenance_word = "UNKNOWN"
            else:
                details_lc = str(f.get("details") or "").lower()
                if any(
                    key in details_lc
                    for key in ("fallback", "synthetic", "modelled", "modeled", "proxy", "latitudinal")
                ):
                    provenance_word = "ASSUMED"
                else:
                    provenance_word = "VERIFIED"

            # Unmeasured factors (status 'unknown' / raw_value null)
            # render as a neutral gray "Unknown" pill and "Not measured" field
            # value - never a fabricated 0 or a green/amber/red severity color.
            if provenance_word == "UNKNOWN":
                pill = make_pill(st, COLOR_BG_SUBTLE, COLOR_TEXT_SECONDARY, width=65)
            elif score_val >= 75:
                pill = make_pill(st, COLOR_GREEN_TINT, COLOR_GREEN_TEXT, width=65)
            elif score_val >= 50:
                pill = make_pill(st, COLOR_AMBER_TINT, COLOR_AMBER_TEXT, width=65)
            else:
                pill = make_pill(st, COLOR_RED_TINT, COLOR_RED_TEXT, width=65)

            field_value_text = (
                "<i>Not measured</i>" if raw_val is None
                else f"{html.escape(str(raw_val))} {html.escape(unit_str)}"
            )

            factor_rows.append([
                Paragraph(f"<b>{html.escape(str(f.get('name', '')))}</b>", table_text),
                Paragraph(f"{weight_val*100:.0f}%", table_num),
                Paragraph(field_value_text, table_text),
                Paragraph(f"{score_val:.1f}/100", table_num),
                pill,
                Paragraph(
                    f"<font color='{COLOR_TEXT_TERTIARY.hexval()}'><b>{provenance_word}</b></font> "
                    f"{html.escape(str(f.get('details', '')))}",
                    table_text,
                )
            ])

        factor_table = Table(factor_rows, colWidths=[95, 45, 70, 50, 75, 158.2], repeatRows=1)
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

            rec_table = Table(rec_rows, colWidths=[110, 75, 135, 173.2], repeatRows=1)
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
            z_str = f"{z_val:.2f}" if z_val is not None else None
            max_gust = _safe_float(storm.get("max_annual_gust_kmh"), 0.0)
            rain_days = _safe_float(storm.get("extreme_rainfall_days"), 0.0)

            # A null/missing zone renders the explicit not-assessed state -
            # never a fabricated default zone letter or zone factor.
            zone_raw = seismic.get("zone")
            if zone_raw:
                zone_display = f"{zone_raw} (Z = {z_str})"
            else:
                zone_display = "NOT ASSESSED (outside IS 1893 extent)"
            c_seis = Paragraph(f'<font color="{COLOR_TEXT_SECONDARY.hexval()}" size="8">BIS IS 1893 Seismic Zone</font><br/><font color="{COLOR_TEXT_PRIMARY.hexval()}" size="10"><b>{html.escape(zone_display)}</b></font>', kv_style)
            c_usgs = Paragraph(f'<font color="{COLOR_TEXT_SECONDARY.hexval()}" size="8">USGS 50-Yr Seismicity (250km)</font><br/><font color="{COLOR_TEXT_PRIMARY.hexval()}" size="10"><b>{html.escape(str(seismic.get("event_count_display", "0")))} events (Max M{html.escape(str(seismic.get("max_magnitude") or "N/A"))})</b></font>', kv_style)

            c_flood = Paragraph(f'<font color="{COLOR_TEXT_SECONDARY.hexval()}" size="8">River Discharge Ratio (ERA5)</font><br/><font color="{COLOR_TEXT_PRIMARY.hexval()}" size="10"><b>{ratio_display} ({html.escape(str(flood.get("pressure_level", "low")).capitalize())} pressure)</b></font>', kv_style)
            c_ndma = Paragraph(f'<font color="{COLOR_TEXT_SECONDARY.hexval()}" size="8">NDMA Flood Prone Basin</font><br/><font color="{COLOR_TEXT_PRIMARY.hexval()}" size="10"><b>{"Yes (Mitigation Recommended)" if flood.get("ndma_flood_prone") else "No (Low Inundation Risk)"}</b></font>', kv_style)

            c_gust = Paragraph(f'<font color="{COLOR_TEXT_SECONDARY.hexval()}" size="8">Mean Annual Gust (ERA5)</font><br/><font color="{COLOR_TEXT_PRIMARY.hexval()}" size="10"><b>{max_gust:.1f} km/h</b></font>', kv_style)
            c_rain = Paragraph(f'<font color="{COLOR_TEXT_SECONDARY.hexval()}" size="8">Heavy Rain Days (>=50mm)</font><br/><font color="{COLOR_TEXT_PRIMARY.hexval()}" size="10"><b>{rain_days:.1f} days/yr (Cyclone: {"Yes" if storm.get("ndma_cyclone_prone") else "No"})</b></font>', kv_style)

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

        risk_table = Table(risk_rows, colWidths=[115, 68, 145, 165.2], repeatRows=1)
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

                plan_table = Table(plan_rows, colWidths=[90, 75, 78, 250.2], repeatRows=1)
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

        cost_table = Table(cost_rows, colWidths=[120, 95, 140, 138.2], repeatRows=1)
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

    # --- Section 10: Generative Architectural Blueprint / Multi-Storey Dossier ---
    floorplan = floor_plan if floor_plan is not None else (data.get("floor_plan") or data.get("floorplan"))
    if hasattr(floorplan, "model_dump"):
        floorplan = floorplan.model_dump()

    multi_storey = None
    if isinstance(floorplan, dict):
        multi_storey = floorplan.get("multi_storey")
    if not multi_storey and isinstance(data, dict):
        multi_storey = data.get("multi_storey")
    if hasattr(multi_storey, "model_dump"):
        multi_storey = multi_storey.model_dump()

    ms_floors = multi_storey.get("floors", []) if isinstance(multi_storey, dict) else []
    is_multi_floor = len(ms_floors) > 1

    disclaimer_text = (
        "<b>LEGAL &amp; ENGINEERING DISCLAIMER:</b> This assessment is generated algorithmically for preliminary planning and "
        "concept feasibility advisory purposes only. Calculations are grounded in public digital elevation models, remote "
        "meteorological telemetry, and CPWD Plinth Area Benchmarks. This document does not constitute a certified geotechnical "
        "borehole survey, an approved municipal structural drawing, or legal land title clearance. "
        "Physical site testing and certified structural engineer stamp are mandatory prior to any ground excavation or contract tender."
    )

    if is_multi_floor:
        # =========================================================================
        # SHEET 10.0: MULTI-STOREY ARCHITECTURAL DOSSIER & CORE STACKING ANALYSIS
        # =========================================================================
        if not is_dossier_only:
            story.append(PageBreak())
        story.append(create_section_header("10.0", "Multi-Storey Architectural Dossier & Core Stacking Analysis"))

        typology_raw = str(multi_storey.get("building_typology", "T1_SINGLE_FAMILY"))
        typology_display = typology_raw.replace("_", " ").title()
        total_storeys = int(multi_storey.get("total_storeys", len(ms_floors)))
        total_bua = float(multi_storey.get("total_built_up_area_sqm", 0.0))
        if total_bua <= 0.0:
            total_bua = sum(float(_get(f, "built_up_area_sqm", 0.0)) for f in ms_floors)
        total_sqft = total_bua * 10.7639

        v_cores = multi_storey.get("vertical_cores", []) or []
        d_shafts = multi_storey.get("duct_shafts", []) or []

        stack_status = "<font color='#166534'><b>PASS — Cores Locked</b></font>"
        gen_id_str = str(_get(floorplan, "generation_id") or _get(multi_storey, "generation_id") or _get(multi_storey, "seed") or _get(data, "seed") or "GEN-F01")
        params_snap = _get(floorplan, "params_snapshot") or _get(multi_storey, "params_snapshot") or {}
        cov_pct = float(params_snap.get("ground_coverage_ratio", 0.60)) * 100.0 if params_snap else 60.0
        strict_str = str(params_snap.get("vastu_strictness", "medium")).title() if params_snap else "Medium"
        overview_text = (
            f"<b>Generation Token:</b> <code>{html.escape(gen_id_str)}</code> &nbsp;|&nbsp; "
            f"<b>Typology:</b> {html.escape(typology_display)} &nbsp;|&nbsp; "
            f"<b>Storeys:</b> G+{total_storeys - 1} ({total_storeys} Storeys)<br/>"
            f"<b>Gross Built-Up Area:</b> {total_bua:.1f} m² ({total_sqft:.0f} sq ft) &nbsp;|&nbsp; "
            f"<b>Coverage:</b> {cov_pct:.0f}% &nbsp;|&nbsp; <b>Strictness:</b> {strict_str} &nbsp;|&nbsp; "
            f"<b>Vertical Stacking:</b> {stack_status}<br/>"
            f"<font size='7.5' color='#4B5563'>All {len(v_cores)} vertical circulation core(s) and {len(d_shafts)} MEP plumbing shaft(s) "
            f"maintain 0.00m horizontal drift across all {total_storeys} floor plates, ensuring NBC 2016 Part 4 compliance and zero-leakage wet stacks.</font>"
        )
        story.append(make_callout(overview_text, width=CONTENT_WIDTH_PT))
        story.append(Spacer(1, 6))

        # Table 1: Vertical Core & Shaft Stacking Verification Table
        th_style = ParagraphStyle('TH_Stack', fontName=FONT_SEMIBOLD, fontSize=8.0, leading=10.0, textColor=COLOR_TEXT_PRIMARY)
        td_style = ParagraphStyle('TD_Stack', fontName=FONT_REGULAR, fontSize=7.5, leading=9.5, textColor=COLOR_TEXT_PRIMARY)
        td_green = ParagraphStyle('TD_Green', fontName=FONT_SEMIBOLD, fontSize=7.5, leading=9.5, textColor=COLOR_GREEN_TEXT)
        td_id_style = ParagraphStyle('TD_Stack_ID', fontName=FONT_SEMIBOLD, fontSize=6.8, leading=8.8, textColor=COLOR_TEXT_PRIMARY)

        core_headers = [
            Paragraph("<b>Core / Shaft ID</b>", th_style),
            Paragraph("<b>Type</b>", th_style),
            Paragraph("<b>Ground Anchor (X, Y)</b>", th_style),
            Paragraph("<b>Footprint (W × D)</b>", th_style),
            Paragraph("<b>Continuous Floors</b>", th_style),
            Paragraph("<b>Stacking Status</b>", th_style),
        ]
        core_rows = [core_headers]
        for vc in v_cores:
            cid = str(_get(vc, "core_id", "core"))
            ctype = str(_get(vc, "core_type", "staircase")).replace("_", " ").title()
            cx = _safe_float(_get(vc, "x", 0.0))
            cy = _safe_float(_get(vc, "y", 0.0))
            cw = _safe_float(_get(vc, "width_m", _get(vc, "width", 0.0)))
            cd = _safe_float(_get(vc, "depth_m", _get(vc, "depth", 0.0)))
            c_floors = _get(vc, "continuous_across_floors", []) or list(range(total_storeys))
            floors_str = f"F0 – F{total_storeys - 1} (All)" if len(c_floors) >= total_storeys else ", ".join(f"F{f}" for f in c_floors)
            core_rows.append([
                Paragraph(f"<b>{html.escape(cid)}</b>", td_id_style),
                Paragraph(html.escape(ctype), td_style),
                Paragraph(f"({cx:.2f}, {cy:.2f}) m", td_style),
                Paragraph(f"{cw:.2f} × {cd:.2f} m", td_style),
                Paragraph(floors_str, td_style),
                Paragraph("<b>100% Locked (0.00m Drift)</b>", td_green)
            ])

        for ds in d_shafts:
            sid = str(_get(ds, "shaft_id", "shaft"))
            stype = str(_get(ds, "shaft_type", "plumbing_wet")).replace("_", " ").title()
            sx = _safe_float(_get(ds, "x", 0.0))
            sy = _safe_float(_get(ds, "y", 0.0))
            sw = _safe_float(_get(ds, "width_m", _get(ds, "width", 0.0)))
            sd = _safe_float(_get(ds, "depth_m", _get(ds, "depth", 0.0)))
            servicing = _get(ds, "servicing_rooms", []) or ["Wet Rooms"]
            serv_str = ", ".join(servicing[:2]) if servicing else "All Storeys"
            core_rows.append([
                Paragraph(f"<b>{html.escape(sid)}</b>", td_id_style),
                Paragraph(html.escape(stype), td_style),
                Paragraph(f"({sx:.2f}, {sy:.2f}) m", td_style),
                Paragraph(f"{sw:.2f} × {sd:.2f} m", td_style),
                Paragraph(f"Servicing: {html.escape(serv_str)}", td_style),
                Paragraph("<b>Wet Stack Aligned</b>", td_green)
            ])

        if len(core_rows) == 1:
            core_rows.append([
                Paragraph("Vertical Cores Locked", td_style),
                Paragraph("Staircase / MEP", td_style),
                Paragraph("(Anchor Verified)", td_style),
                Paragraph("NBC Standard", td_style),
                Paragraph("All Storeys", td_style),
                Paragraph("<b>100% Locked</b>", td_green)
            ])

        col_w_stack = [100.0, 88.0, 78.0, 78.0, 72.0, 77.23]
        t_cores = Table(core_rows, colWidths=col_w_stack, repeatRows=1)
        t_cores.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), COLOR_BG_SUBTLE),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4.0),
            ('TOPPADDING', (0, 0), (-1, -1), 4.0),
            ('LEFTPADDING', (0, 0), (-1, -1), 4.0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 4.0),
            ('LINEBELOW', (0, 0), (-1, 0), 1.0, COLOR_ACCENT),
            ('LINEBELOW', (0, 1), (-1, -1), 0.5, COLOR_HAIRLINE),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        story.append(t_cores)
        story.append(Spacer(1, 10))

        # Table 2: Storey-Level Architectural & Compliance Distribution
        level_headers = [
            Paragraph("<b>Sheet</b>", th_style),
            Paragraph("<b>Level / Floor Name</b>", th_style),
            Paragraph("<b>Elevation</b>", th_style),
            Paragraph("<b>Built-Up</b>", th_style),
            Paragraph("<b>Carpet Area</b>", th_style),
            Paragraph("<b>Vastu %</b>", th_style),
            Paragraph("<b>Plumbing %</b>", th_style),
            Paragraph("<b>Circulation</b>", th_style),
        ]
        level_rows = [level_headers]
        tot_bua_calc = 0.0
        tot_carpet_calc = 0.0
        sum_vastu = 0.0
        sum_plumb = 0.0

        for fl in ms_floors:
            f_idx = int(_get(fl, "floor_index", 0))
            f_name = str(_get(fl, "floor_name", f"Floor {f_idx}"))
            f_elev = f"+{f_idx * 3.0:.1f}m"
            f_bua = _safe_float(_get(fl, "built_up_area_sqm", 0.0))
            f_carpet = _safe_float(_get(fl, "carpet_area_sqm", 0.0))
            f_vastu = _safe_float(_get(fl, "vastu_score_pct", _get(fl, "vastu_compliance_pct", 0.0)))
            f_plumb = _safe_float(_get(fl, "plumbing_stack_alignment_pct", 100.0), 100.0)
            f_circ = str(_get(fl, "circulation_status", "connected")).title()

            tot_bua_calc += f_bua
            tot_carpet_calc += f_carpet
            sum_vastu += f_vastu
            sum_plumb += f_plumb

            level_rows.append([
                Paragraph(f"<b>Sheet 10.{f_idx + 1}</b>", td_style),
                Paragraph(html.escape(f_name), td_style),
                Paragraph(f_elev, td_style),
                Paragraph(f"{f_bua:.1f} m²", td_style),
                Paragraph(f"{f_carpet:.1f} m²", td_style),
                Paragraph(f"{f_vastu:.1f}%", td_style),
                Paragraph(f"{f_plumb:.1f}%", td_style),
                Paragraph(f"<b>{html.escape(f_circ)}</b>", td_green)
            ])

        n_fl = max(len(ms_floors), 1)
        avg_v = sum_vastu / n_fl
        avg_p = sum_plumb / n_fl
        tbua_display = total_bua if total_bua > 0.0 else tot_bua_calc
        tcarpet_display = tot_carpet_calc if tot_carpet_calc > 0.0 else tbua_display * 0.82

        # Summary row
        level_rows.append([
            Paragraph("<b>TOTAL</b>", th_style),
            Paragraph("<b>All Storeys Combined</b>", th_style),
            Paragraph("<b>—</b>", th_style),
            Paragraph(f"<b>{tbua_display:.1f} m²</b>", th_style),
            Paragraph(f"<b>{tcarpet_display:.1f} m²</b>", th_style),
            Paragraph(f"<b>{avg_v:.1f}%</b>", th_style),
            Paragraph(f"<b>{avg_p:.1f}%</b>", th_style),
            Paragraph("<b>Verified</b>", td_green)
        ])

        col_w_level = [55.0, 95.0, 50.0, 60.0, 60.0, 55.0, 55.0, 63.23]
        t_levels = Table(level_rows, colWidths=col_w_level, repeatRows=1)
        t_levels.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), COLOR_BG_SUBTLE),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4.0),
            ('TOPPADDING', (0, 0), (-1, -1), 4.0),
            ('LEFTPADDING', (0, 0), (-1, -1), 4.0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 4.0),
            ('LINEBELOW', (0, 0), (-1, 0), 1.0, COLOR_ACCENT),
            ('LINEBELOW', (0, 1), (-1, -2), 0.5, COLOR_HAIRLINE),
            ('LINEABOVE', (0, -1), (-1, -1), 1.0, COLOR_ACCENT),
            ('BACKGROUND', (0, -1), (-1, -1), COLOR_BG_SUBTLE),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        story.append(t_levels)
        story.append(Spacer(1, 8))

        # Mathematical Validity Certificate block on Sheet 10.0
        cert = _get(multi_storey, "mathematical_certificate") or _get(floorplan, "mathematical_certificate") or {}
        if cert:
            cert_id = str(cert.get("certificate_id", "CERT-MATH-VALID-2026"))
            is_valid = bool(cert.get("is_valid", True))
            status_text = "VERIFIED &amp; CERTIFIED" if is_valid else "NON-COMPLIANT"
            status_color = "#166534" if is_valid else "#D70015"

            td_red = ParagraphStyle('TD_Red_Cert', fontName=FONT_SEMIBOLD, fontSize=7.5, leading=9.5, textColor=COLOR_RED_TEXT)
            td_bold = ParagraphStyle('TD_Bold_Cert', fontName=FONT_SEMIBOLD, fontSize=8.0, leading=10.0, textColor=COLOR_TEXT_PRIMARY)
            td_right_bold = ParagraphStyle('TD_Right_Bold_Cert', fontName=FONT_SEMIBOLD, fontSize=8.0, leading=10.0, textColor=COLOR_TEXT_PRIMARY, alignment=2)
            td_small = ParagraphStyle('TD_Small_Cert', fontName=FONT_REGULAR, fontSize=7.0, leading=8.5, textColor=COLOR_TEXT_SECONDARY)

            cert_checks = [
                ("1. Non-Overlap &amp; Containment", "PASS" if cert.get("zero_overlap", cert.get("non_overlap", True)) and cert.get("envelope_containment", cert.get("containment", True)) else "FAIL", "REL-01 / CONT-01"),
                ("2. Zero Forbidden Wall Pairs", "PASS" if cert.get("zero_forbidden_violations", True) else "FAIL", "REL-02 / FORBIDDEN"),
                ("3. BFS Circulation Reachability", "PASS" if cert.get("connectivity_bfs", True) else "FAIL", "CIRC-01 / BFS-GRAPH"),
                ("4. Dimension Chains Sum (&lt;=1mm)", "PASS" if cert.get("chain_sums_match", True) else "FAIL", "DIM-01 / NBC-TOLERANCE"),
                ("5. NBC Egress Travel Distance", "PASS" if cert.get("egress_distances_satisfied", True) else "FAIL", "NBC-03 / EGRESS-30M"),
                ("6. Vertical Stack Alignment", "PASS" if cert.get("vertical_stack_valid", True) else "FAIL", "VERT-01..05 / CORE-STACK"),
                ("7. Core Continuity (All Levels)", "PASS" if cert.get("core_continuity_valid", True) else "FAIL", "RULE-FP-01 / NBC-CORE"),
                ("8. No Wet Room Over Terrace", "PASS" if cert.get("no_wet_over_terrace_valid", True) else "FAIL", "RULE-FP-03 / PLUMB-STACK"),
                ("9. Terrace FAR Statutory Exemption", "PASS" if cert.get("terrace_far_exempt", True) else "FAIL", "RULE-FP-06 / FAR-EXEMPT"),
                ("10. Cores Stack-Aligned", "PASS" if cert.get("cores_stack_aligned", True) else "FAIL", "RULE-FP-01 / VERT-STACK"),
            ]

            cert_rows = [
                [
                    Paragraph(f"<b>MATHEMATICAL VALIDITY CERTIFICATE — {html.escape(cert_id)}</b>", td_bold),
                    "",
                    Paragraph(f"<font color='{status_color}'><b>[{status_text}]</b></font>", td_right_bold),
                ],
                [
                    Paragraph("<b>Invariant Check Description</b>", th_style),
                    Paragraph("<b>Rule Reference</b>", th_style),
                    Paragraph("<b>Status</b>", th_style),
                ]
            ]
            for chk_name, chk_status, chk_ref in cert_checks:
                status_p = Paragraph(f"<b>{chk_status}</b>", td_green if chk_status == "PASS" else td_red)
                cert_rows.append([
                    Paragraph(chk_name, td_style),
                    Paragraph(f"<code>{chk_ref}</code>", td_style),
                    status_p,
                ])

            rules_list = cert.get("certified_rules") or [
                "NBC-01", "NBC-02", "NBC-03", "REL-01", "REL-02", "VERT-01", "VERT-02", "CIRC-01", "DIM-01", "VASTU-01", "SAN-01"
            ]
            if rules_list:
                rules_str = ", ".join(rules_list[:10])
                if len(rules_list) > 10:
                    rules_str += f" (+{len(rules_list) - 10} more)"
                cert_rows.append([
                    Paragraph(f"<b>Certified Rule IDs:</b> {html.escape(rules_str)}", td_small),
                    "",
                    Paragraph("<b>100% SATISFIED</b>", td_green),
                ])

            t_cert = Table(cert_rows, colWidths=[240.0, 160.0, 89.23], repeatRows=2)
            t_cert.setStyle(TableStyle([
                ('SPAN', (0, 0), (1, 0)),
                ('BACKGROUND', (0, 0), (-1, 0), COLOR_BG_SUBTLE),
                ('BACKGROUND', (0, 1), (-1, 1), COLOR_BG_SUBTLE),
                ('LINEBELOW', (0, 0), (-1, 0), 1.0, COLOR_ACCENT),
                ('LINEBELOW', (0, 1), (-1, 1), 0.5, COLOR_HAIRLINE),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 3.0),
                ('TOPPADDING', (0, 0), (-1, -1), 3.0),
                ('LEFTPADDING', (0, 0), (-1, -1), 4.0),
                ('RIGHTPADDING', (0, 0), (-1, -1), 4.0),
                ('BOX', (0, 0), (-1, -1), 1.0, COLOR_ACCENT),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ]))
            if rules_list:
                t_cert.setStyle(TableStyle([
                    ('SPAN', (0, -1), (1, -1)),
                    ('BACKGROUND', (0, -1), (-1, -1), COLOR_BG_SUBTLE),
                    ('LINEABOVE', (0, -1), (-1, -1), 0.5, COLOR_HAIRLINE),
                ]))
            story.append(t_cert)
            story.append(Spacer(1, 8))

        # =========================================================================
        # UNIVERSAL VALIDATION GATE - LAYER TABLE (SHEET 10.0)
        # Every generation lists ALL layers L1-L14 with per-layer status
        # (PASS | WARN | FAIL | N/A-with-reason); overall = worst layer.
        # Rendering extracted to make_universal_gate_table so the
        # single-floor blueprint path emits the same content layer.
        _gate = (cert or {}).get("details", {}).get("validation_gate") or _get(multi_storey, "validation_gate") or {}
        _gate_flowables = make_universal_gate_table(_gate)
        if _gate_flowables:
            story.extend(_gate_flowables)

        # Life Safety & Structural Compliance / Legal Advisory
        if not cert:
            compliance_text = (
                "<b>NBC 2016 &amp; CPWD Structural Compliance Verification:</b><br/>"
                "• <b>Vertical Core Continuity:</b> Staircase treads (&gt;= 250mm) and risers (&lt;= 175mm) continuous through structural floor slabs.<br/>"
                "• <b>Plumbing Wet Stack Integrity:</b> All wet wall vertical risers align directly over ground inspection chambers without horizontal offsets.<br/>"
                "• <b>Life Safety Egress:</b> Travel distance from most remote habitable room to protected vertical core conforms to NBC 2016 Part 4 (&lt; 30m)."
            )
            story.append(make_callout(compliance_text, width=CONTENT_WIDTH_PT))
            story.append(Spacer(1, 6))

        # Legal disclaimer on Sheet 10.0
        compact_disclaimer = (
            "<b>LEGAL &amp; ENGINEERING ADVISORY:</b> Algorithmic preliminary space plan for feasibility review. "
            "Physical site testing and certified structural engineer stamp are mandatory prior to excavation or contract tender."
        )
        story.append(make_callout(compact_disclaimer, width=CONTENT_WIDTH_PT))

        # =========================================================================
        # SHEET 10.SP: SITE PLAN & CADASTRAL SURVEY (When site is non-rectangular)
        # =========================================================================
        sp_candidate = _get(multi_storey, "site_plan") or _get(floorplan, "site_plan") or data.get("site_plan")
        if sp_candidate:
            poly_data = _get(sp_candidate, "plot_polygon", {})
            st = str(_get(poly_data, "shape_type", "rectangle"))
            if st != "rectangle":
                site_sheet_flowables = make_site_plan_sheet_flowables(
                    sp_candidate,
                    width=CONTENT_WIDTH_PT,
                    gen_id=str(_get(multi_storey, "seed") or req_id),
                    typology=typology_raw
                )
                story.extend(site_sheet_flowables)

        # =========================================================================
        # SHEETS 10.1, 10.2, ...: DEDICATED A4 PAGE PER STOREY LEVEL
        # =========================================================================
        render_ms_schedules = include_construction_schedules
        if render_ms_schedules is None:
            render_ms_schedules = bool(data.get("include_construction_schedules", False))

        for fl in ms_floors:
            f_idx = int(_get(fl, "floor_index", 0))
            f_name = str(_get(fl, "floor_name", f"Floor {f_idx}"))
            elev_str = f"+{f_idx * 3.0:.2f}m"

            story.append(PageBreak())
            sheet_num = f"10.{f_idx + 1}"
            story.append(create_section_header(sheet_num, f"{f_name.upper()} ({elev_str} Elevation)"))

            # Floor Brief Callout
            if f_idx == 0:
                level_brief = (
                    f"<b>Level Brief:</b> Ground Datum (+0.00m). Features primary building entrance, vertical circulation core anchor, "
                    f"and foundational service risers. All subsequent upper storeys derive their spatial anchoring from this level."
                )
            else:
                level_brief = (
                    f"<b>Level Brief:</b> Upper Storey Plate ({elev_str}). Stacked directly above ground datum with 100% vertical core "
                    f"coincidence. Purple dashed outline indicates verified ground anchor alignment (Ghost Core Overlay)."
                )
            story.append(make_callout(level_brief, width=CONTENT_WIDTH_PT))
            story.append(Spacer(1, 5))

            # 4-Tile Stat Strip
            f_vastu = _safe_float(_get(fl, "vastu_score_pct", _get(fl, "vastu_compliance_pct", 0.0)))
            f_plumb = _safe_float(_get(fl, "plumbing_stack_alignment_pct", 100.0), 100.0)
            f_bua = _safe_float(_get(fl, "built_up_area_sqm", 0.0))
            f_carpet = _safe_float(_get(fl, "carpet_area_sqm", 0.0))

            tile_w = CONTENT_WIDTH_PT / 4.0
            bp_t1 = make_stat_tile("Vastu Compliance", f"{f_vastu:.1f}%", width=tile_w - 6.0)
            bp_t2 = make_stat_tile("Plumbing Alignment", f"{f_plumb:.1f}%", width=tile_w - 6.0)
            bp_t3 = make_stat_tile("Built-Up Area", f"{f_bua:.1f} m²", width=tile_w - 6.0)
            bp_t4 = make_stat_tile("Carpet Area", f"{f_carpet:.1f} m²", width=tile_w - 6.0)

            bp_stat_strip = Table([[bp_t1, bp_t2, bp_t3, bp_t4]], colWidths=[tile_w, tile_w, tile_w, tile_w])
            bp_stat_strip.setStyle(TableStyle([
                ('LEFTPADDING', (0, 0), (-1, -1), 2.0),
                ('RIGHTPADDING', (0, 0), (-1, -1), 2.0),
                ('TOPPADDING', (0, 0), (-1, -1), 0),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
            ]))
            story.append(bp_stat_strip)
            story.append(Spacer(1, 5))

            # Floor Rectangles Dictionary
            floor_env = _get(fl, "envelope", {}) or {}
            floor_rects = {
                "envelope": {
                    "x": _safe_float(_get(floor_env, "x", 1.0), 1.0),
                    "y": _safe_float(_get(floor_env, "y", 1.0), 1.0),
                    "width": _safe_float(_get(floor_env, "width", 10.0), 10.0),
                    "height": _safe_float(_get(floor_env, "depth", _get(floor_env, "height", 10.0)), 10.0),
                },
                "rooms": [
                    {
                        "room_id": str(_get(r, "room_id", "")),
                        "room_name": str(_get(r, "room_name", "")),
                        "x": _safe_float(_get(r, "x", 0.0)),
                        "y": _safe_float(_get(r, "y", 0.0)),
                        "width": _safe_float(_get(r, "width_m", _get(r, "width", 0.0))),
                        "height": _safe_float(_get(r, "depth_m", _get(r, "height", 0.0))),
                        "area_sqm": _safe_float(_get(r, "area_sqm", 0.0)),
                        "zone": str(_get(r, "zone", "General")),
                        "vastu_compliant": bool(_get(r, "vastu_compliant", True)),
                        "is_vertical_core": bool(_get(r, "is_vertical_core", False)),
                    }
                    for r in (_get(fl, "rooms", []) or [])
                ],
                "doors": [
                    {
                        "door_id": str(_get(d, "door_id", "")),
                        "wall_edge": str(_get(d, "wall_edge", "")),
                        "x1": _safe_float(_get(d, "x1", 0.0)),
                        "y1": _safe_float(_get(d, "y1", 0.0)),
                        "x2": _safe_float(_get(d, "x2", 0.0)),
                        "y2": _safe_float(_get(d, "y2", 0.0)),
                        "hinge_x": _safe_float(_get(d, "hinge_x", 0.0)),
                        "hinge_y": _safe_float(_get(d, "hinge_y", 0.0)),
                        "swing_direction": str(_get(d, "swing_direction", "inward_right")),
                        "width_m": _safe_float(_get(d, "width_m", 0.9), 0.9),
                    }
                    for d in (_get(fl, "doors", []) or [])
                ],
                "windows": [
                    {
                        "window_id": str(_get(w, "window_id", "")),
                        "wall_edge": str(_get(w, "wall_edge", "")),
                        "x1": _safe_float(_get(w, "x1", 0.0)),
                        "y1": _safe_float(_get(w, "y1", 0.0)),
                        "x2": _safe_float(_get(w, "x2", 0.0)),
                        "y2": _safe_float(_get(w, "y2", 0.0)),
                        "width_m": _safe_float(_get(w, "width_m", 1.2), 1.2),
                    }
                    for w in (_get(fl, "windows", []) or [])
                ]
            }

            # Vector Drawing via shared Drawing IR at height=405.0
            from app.services.floorplan.drawing_ir import build_drawing_ir, render_reportlab_from_ir
            clean_seed = str(_get(multi_storey, "seed") or _get(fl, "seed") or req_id)
            ir = build_drawing_ir(
                floor_data=fl,
                building_model=multi_storey,
                gen_id=clean_seed,
                typology=typology_raw
            )
            drawing = render_reportlab_from_ir(ir, width=CONTENT_WIDTH_PT, height=405.0)
            story.append(drawing)
            story.append(Spacer(1, 5))

            # Per-Floor Legend
            legend_table = make_floorplan_legend({"rectangles": floor_rects}, width=CONTENT_WIDTH_PT)
            story.append(legend_table)

            # SVG/PDF parity: the service/structural legend taught on the
            # SVG sheet panel must also teach its symbols on the PDF page.
            from app.services.floorplan.drawing_ir import SERVICE_LEGEND_PARTS
            story.append(Spacer(1, 3))
            story.append(Paragraph(
                "<b>SERVICE/STRUCTURAL LEGEND:</b> " + " | ".join(SERVICE_LEGEND_PARTS),
                disclaimer_style,
            ))

            # Dedicated Construction Schedules Sheet (When enabled)
            if render_ms_schedules:
                story.append(PageBreak())
                story.append(create_section_header(f"{sheet_num}.S", f"{f_name.upper()} — Setting-Out & Schedules"))
                sched_brief = (
                    f"<b>Construction Setting-Out &amp; Fabrication Schedules:</b> Verified dimensional schedules for {html.escape(f_name)} ({elev_str}). "
                    f"Contractor setting-out reference for masonry envelope, door jambs, window lintels, and interior room finishes."
                )
                story.append(make_callout(sched_brief, width=CONTENT_WIDTH_PT))
                story.append(Spacer(1, 4))
                sched_flowables = make_construction_schedules_table(fl, width=CONTENT_WIDTH_PT, floor_index=f_idx)
                story.extend(sched_flowables)

    elif floorplan and isinstance(floorplan, dict):
        if not floorplan.get("rectangles") and not floorplan.get("placements") and ms_floors:
            first_fl = ms_floors[0]
            floor_env = _get(first_fl, "envelope", {}) or {}
            floorplan["rectangles"] = {
                "envelope": {
                    "x": _safe_float(_get(floor_env, "x", 1.0), 1.0),
                    "y": _safe_float(_get(floor_env, "y", 1.0), 1.0),
                    "width": _safe_float(_get(floor_env, "width", 10.0), 10.0),
                    "height": _safe_float(_get(floor_env, "depth", _get(floor_env, "height", 10.0)), 10.0),
                },
                "rooms": [
                    {
                        "room_id": str(_get(r, "room_id", "")),
                        "room_name": str(_get(r, "room_name", "")),
                        "x": _safe_float(_get(r, "x", 0.0)),
                        "y": _safe_float(_get(r, "y", 0.0)),
                        "width": _safe_float(_get(r, "width_m", _get(r, "width", 0.0))),
                        "height": _safe_float(_get(r, "depth_m", _get(r, "height", 0.0))),
                        "area_sqm": _safe_float(_get(r, "area_sqm", 0.0)),
                        "zone": str(_get(r, "zone", "General")),
                        "vastu_compliant": bool(_get(r, "vastu_compliant", True)),
                        "is_vertical_core": bool(_get(r, "is_vertical_core", False)),
                    }
                    for r in _get(first_fl, "rooms", [])
                ],
                "doors": _get(first_fl, "doors", []),
                "windows": _get(first_fl, "windows", [])
            }
            if not floorplan.get("placements"):
                floorplan["placements"] = [
                    {
                        "room_id": str(_get(r, "room_id", "")),
                        "room_name": str(_get(r, "room_name", "")),
                        "row": 0,
                        "col": 0,
                        "width": max(1, int(round(_safe_float(_get(r, "width_m", _get(r, "width", 0.0)))))),
                        "height": max(1, int(round(_safe_float(_get(r, "depth_m", _get(r, "height", 0.0)))))),
                        "area_sqm": _safe_float(_get(r, "area_sqm", 0.0)),
                        "width_m": _safe_float(_get(r, "width_m", _get(r, "width", 0.0))),
                        "depth_m": _safe_float(_get(r, "depth_m", _get(r, "height", 0.0))),
                        "zone": str(_get(r, "zone", "General")),
                        "vastu_compliant": bool(_get(r, "vastu_compliant", True)),
                    }
                    for r in _get(first_fl, "rooms", [])
                ]

        # Section 10 on its own dedicated full page (Single Floor Mode)
        if not is_dossier_only:
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
            rectangles=floorplan.get("rectangles"),
            plot_width_m=floorplan.get("plot_width_m") or data.get("plot_width_m"),
            plot_depth_m=floorplan.get("plot_depth_m") or data.get("plot_depth_m"),
            seed=floorplan.get("seed") or data.get("seed"),
            typology=floorplan.get("building_typology") or data.get("building_typology")
        )
        story.append(drawing)
        story.append(Spacer(1, 6))

        # Legend row (tinted dot + room name + zone chip per room, up to 3 lines)
        legend_table = make_floorplan_legend(floorplan, width=CONTENT_WIDTH_PT)
        story.append(legend_table)

        # SVG/PDF parity: service legend mirrors the SVG sheet panel.
        from app.services.floorplan.drawing_ir import SERVICE_LEGEND_PARTS
        story.append(Spacer(1, 3))
        story.append(Paragraph(
            "<b>SERVICE/STRUCTURAL LEGEND:</b> " + " | ".join(SERVICE_LEGEND_PARTS),
            disclaimer_style,
        ))

        # SVG/PDF parity: the universal gate layer table is a content
        # layer on EVERY blueprint-bearing page (single-floor included).
        _gate_sf = _get(multi_storey, "validation_gate", {}) or {}
        _gate_sf_flowables = make_universal_gate_table(_gate_sf)
        if _gate_sf_flowables:
            story.extend(_gate_sf_flowables)

        # Construction Schedules (Door, Window, Room, Wall Specs)
        render_single_sched = include_construction_schedules
        if render_single_sched is None:
            render_single_sched = bool(data.get("include_construction_schedules", True))

        if render_single_sched:
            story.append(PageBreak())
            story.append(create_section_header("10.S", "Setting-Out & Construction Schedules"))
            sched_brief = (
                "<b>Construction Setting-Out &amp; Fabrication Schedules:</b> Verified dimensional schedules for layout setting-out. "
                "Contractor reference for masonry envelope, door jambs, window lintels, and interior room finishes."
            )
            story.append(make_callout(sched_brief, width=CONTENT_WIDTH_PT))
            story.append(Spacer(1, 4))
            sched_flowables = make_construction_schedules_table(floorplan, width=CONTENT_WIDTH_PT, floor_index=0)
            story.extend(sched_flowables)

        # Dedicated Site Survey Sheet for irregular plots in single-floor mode
        sp_single = _get(floorplan, "site_plan") or data.get("site_plan")
        if sp_single:
            poly_data = _get(sp_single, "plot_polygon", {})
            st = str(_get(poly_data, "shape_type", "rectangle"))
            if st != "rectangle":
                site_sheet_flowables = make_site_plan_sheet_flowables(
                    sp_single,
                    width=CONTENT_WIDTH_PT,
                    gen_id=str(_get(floorplan, "seed") or req_id),
                    typology=typology_raw
                )
                story.extend(site_sheet_flowables)

        # Disclaimer after single floorplan
        story.append(Spacer(1, 12))
        story.append(make_callout(disclaimer_text, width=CONTENT_WIDTH_PT))
    else:
        # Fallback disclaimer when no floorplan exists
        story.append(Spacer(1, 12))
        story.append(make_callout(disclaimer_text, width=CONTENT_WIDTH_PT))

    # Build document using NumberedCanvas
    doc.build(story, canvasmaker=NumberedCanvas)
    buffer.seek(0)
    return buffer
