import io
from datetime import datetime
from typing import Dict, Any

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether, HRFlowable
)
from reportlab.pdfgen import canvas

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
        self.drawString(36, A4[1] - 25, "BuildWise AI | Preliminary Engineering Feasibility Report")
        self.drawRightString(A4[0] - 36, A4[1] - 25, "ISO / CPWD Benchmark Assessment")
        self.setStrokeColor(colors.HexColor("#CBD5E1"))
        self.setLineWidth(0.5)
        self.line(36, A4[1] - 28, A4[0] - 36, A4[1] - 28)

        # Running Footer
        self.line(36, 32, A4[0] - 36, 32)
        self.drawString(36, 22, "Confidential - For Preliminary Civil Engineering & Architectural Planning Only")
        self.drawRightString(A4[0] - 36, 22, f"Page {self._pageNumber} of {page_count}")
        self.restoreState()


def generate_pdf_report(data: Dict[str, Any]) -> io.BytesIO:
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

    # Custom typography styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=18,
        leading=22,
        textColor=colors.HexColor("#0F172A")
    )
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#475569")
    )
    section_h1 = ParagraphStyle(
        'SectionH1',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=15,
        textColor=colors.HexColor("#0F172A"),
        spaceBefore=10,
        spaceAfter=4
    )
    body_text = ParagraphStyle(
        'ReportBody',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=11.5,
        textColor=colors.HexColor("#1E293B")
    )
    table_text = ParagraphStyle(
        'TableBody',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#0F172A")
    )
    table_header = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10,
        textColor=colors.white
    )
    disclaimer_style = ParagraphStyle(
        'DisclaimerText',
        parent=styles['Normal'],
        fontName='Helvetica-Oblique',
        fontSize=7.5,
        leading=9.5,
        textColor=colors.HexColor("#64748B")
    )

    story = []

    # Title & Metadata
    req_id = data.get("request_id", "BW-" + datetime.now().strftime("%Y%m%d%H%M"))
    timestamp_str = data.get("timestamp", datetime.now().strftime("%Y-%m-%d %H:%M:%S UTC"))
    coords = data.get("coordinates", {})
    lat = coords.get("latitude", 0.0)
    lon = coords.get("longitude", 0.0)
    address = data.get("formatted_address", "Site Location")

    story.append(Paragraph("BUILDWISE AI - SITE PLANNING & FEASIBILITY REPORT", title_style))
    story.append(Spacer(1, 2))
    story.append(Paragraph(f"Reference: {req_id} | Issued: {timestamp_str}", subtitle_style))
    story.append(Spacer(1, 8))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#0F172A"), spaceAfter=10))

    # Project Overview Table
    meta_table_data = [
        [
            Paragraph("<b>Target Site:</b> " + address, table_text),
            Paragraph(f"<b>Coordinates:</b> {lat:.5f} N, {lon:.5f} E", table_text)
        ],
        [
            Paragraph(f"<b>Built-up Area:</b> {data.get('cost_estimate', {}).get('base_cost_inr', 0) / max(data.get('cost_estimate', {}).get('base_rate_per_sqft', 1), 1):,.0f} sq ft", table_text),
            Paragraph(f"<b>Topographic Gradient:</b> {next((f.get('raw_value') for f in data.get('factors', []) if f.get('factor_id') == 'slope'), 0)}% Slope", table_text)
        ]
    ]
    meta_table = Table(meta_table_data, colWidths=[260, 260])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#F1F5F9")),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 10))

    # Overall Suitability Summary Card
    score = data.get("overall_suitability_score", 0.0)
    verdict = data.get("suitability_verdict", "Unknown")

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
            Paragraph(f"<font size=16><b>{score:.1f} / 100</b></font>", table_text),
            Paragraph(f"<font size=14 color='{verdict_color.hexval()}'><b>{verdict.upper()}</b></font>", table_text)
        ]
    ]
    score_table = Table(score_card_data, colWidths=[260, 260])
    score_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1E293B")),
        ('BACKGROUND', (0, 1), (-1, 1), colors.HexColor("#F8FAFC")),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor("#0F172A")),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ]))
    story.append(score_table)
    story.append(Spacer(1, 12))

    # Factor Analysis Breakdown
    story.append(Paragraph("1. Multi-Criteria Land Suitability Assessment", section_h1))
    factor_headers = [
        Paragraph("Evaluation Factor", table_header),
        Paragraph("Weight", table_header),
        Paragraph("Field Value", table_header),
        Paragraph("Score", table_header),
        Paragraph("Rating", table_header),
        Paragraph("Engineering Assessment", table_header)
    ]
    factor_rows = [factor_headers]

    for f in data.get("factors", []):
        st = f.get("status", "").capitalize()
        factor_rows.append([
            Paragraph(f"<b>{f.get('name', '')}</b>", table_text),
            Paragraph(f"{f.get('weight', 0)*100:.0f}%", table_text),
            Paragraph(f"{f.get('raw_value', 0)} {f.get('unit', '')}", table_text),
            Paragraph(f"{f.get('score', 0):.1f}/100", table_text),
            Paragraph(st, table_text),
            Paragraph(f.get("details", ""), table_text)
        ])

    factor_table = Table(factor_rows, colWidths=[100, 38, 70, 50, 60, 202])
    factor_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1E293B")),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(factor_table)
    story.append(Spacer(1, 12))

    # Passive Orientation & Bioclimatic Design
    story.append(Paragraph("2. Passive Solar & Aerodynamic Orientation Strategy", section_h1))
    orient = data.get("orientation", {})
    orient_table_data = [
        [
            Paragraph("<b>Recommended Axis:</b>", table_text),
            Paragraph(f"{orient.get('optimal_axis_degrees', 90)} deg ({orient.get('axis_label', 'East-West')})", table_text),
            Paragraph("<b>Prevailing Wind:</b>", table_text),
            Paragraph(f"{orient.get('prevailing_wind_direction_degrees', 240):.0f} deg azimuth", table_text)
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
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(orient_table)
    story.append(Spacer(1, 4))
    story.append(Paragraph(f"<b>Design Rationale:</b> {orient.get('passive_design_rationale', '')}", body_text))
    story.append(Spacer(1, 12))

    # Preliminary Cost Estimation (CPWD Aligned)
    story.append(Paragraph("3. Preliminary Construction Cost Estimate (CPWD Plinth Area Benchmarks)", section_h1))
    cost = data.get("cost_estimate", {})
    cost_headers = [
        Paragraph("Cost Category", table_header),
        Paragraph("Estimated Amount (INR)", table_header),
        Paragraph("Share (%)", table_header),
        Paragraph("Scope of Civil Works", table_header)
    ]
    cost_rows = [cost_headers]

    for c in cost.get("breakdown", []):
        cost_rows.append([
            Paragraph(f"<b>{c.get('category', '')}</b>", table_text),
            Paragraph(f"INR {c.get('amount_inr', 0):,.0f}", table_text),
            Paragraph(f"{c.get('percentage', 0):.1f}%", table_text),
            Paragraph(c.get("description", ""), table_text)
        ])

    # Add Total Row
    tot_inr = cost.get("total_estimated_cost_inr", 0.0)
    cost_rows.append([
        Paragraph("<b>TOTAL ESTIMATED BUDGET</b>", table_text),
        Paragraph(f"<b>INR {tot_inr:,.0f}</b>", table_text),
        Paragraph("<b>100.0%</b>", table_text),
        Paragraph(f"Range: INR {cost.get('cost_range_min_inr', 0):,.0f} - {cost.get('cost_range_max_inr', 0):,.0f} (+/-7.5% market variation)", table_text)
    ])

    cost_table = Table(cost_rows, colWidths=[130, 110, 48, 232])
    cost_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1E293B")),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
        ('ROWBACKGROUNDS', (0, 1), (-1, -2), [colors.white, colors.HexColor("#F8FAFC")]),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor("#E2E8F0")),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(cost_table)
    story.append(Spacer(1, 12))

    # Identified Site Constraints & Risk Matrix
    story.append(Paragraph("4. Site Constraints & Engineering Risk Mitigation", section_h1))
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

    risk_table = Table(risk_rows, colWidths=[130, 50, 160, 180])
    risk_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1E293B")),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(risk_table)
    story.append(Spacer(1, 12))

    # Technical Commentary & Recommendations
    story.append(Paragraph("5. Technical Synthesis & Engineering Action Plan", section_h1))
    summary_text = data.get("engineering_summary", "")
    for paragraph in summary_text.split("\n\n"):
        if paragraph.strip():
            story.append(Paragraph(paragraph.strip(), body_text))
            story.append(Spacer(1, 4))

    story.append(Spacer(1, 4))
    story.append(Paragraph("<b>Prescribed Action Items:</b>", body_text))
    story.append(Spacer(1, 2))

    for idx, rec in enumerate(data.get("detailed_recommendations", []), 1):
        story.append(Paragraph(f"<b>{idx}.</b> {rec}", body_text))
        story.append(Spacer(1, 2))

    # Formal Engineering Disclaimer
    story.append(Spacer(1, 14))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#94A3B8"), spaceAfter=6))
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
