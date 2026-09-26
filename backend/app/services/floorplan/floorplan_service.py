from typing import Dict, Any

from reportlab.graphics.shapes import Drawing

from app.schemas.floorplan import FloorPlanRequest, FloorPlanResponse


def generate_floor_plan(req: FloorPlanRequest) -> FloorPlanResponse:
    """
    Sole geometry engine pipeline for all architectural layout generation.
    Parameterized exclusively by Stage-1 Universal Space Semantics Ontology
    and typology profiles.
    """
    from app.services.floorplan.engine import SoleGeometryEngine
    engine = SoleGeometryEngine(req)
    return engine.solve_floorplan_response()



def create_floorplan_reportlab_drawing(
    floorplan_data: Dict[str, Any],
    max_w: float = 480.0,
    max_h: float = 240.0
) -> Drawing:
    """
    Constructs a native ReportLab vector Drawing object from floor plan data for PDF reports.
    Delegates to draw_floorplan_reportlab for publication-grade CAD blueprint rendering.
    """
    from app.services.report_service import draw_floorplan_reportlab
    placements = floorplan_data.get("placements") or []
    grid_matrix = floorplan_data.get("grid_matrix") or []
    rectangles = floorplan_data.get("rectangles")
    return draw_floorplan_reportlab(placements, grid_matrix, width=max_w, height=max_h, rectangles=rectangles)


# Expose draw_floorplan_reportlab as well
def draw_floorplan_reportlab(*args, **kwargs) -> Drawing:
    from app.services.report_service import draw_floorplan_reportlab as _dfr
    return _dfr(*args, **kwargs)

