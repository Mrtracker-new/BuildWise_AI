from typing import Dict, Optional, Any

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

def generate_multi_floor_blueprint_svg(
    floor_index: int,
    floor_name: str,
    rooms: Any,
    doors: Any,
    windows: Any,
    envelope: Any,
    ground_cores: Any = None,
    ground_ducts: Any = None,
    theme: str = "cad",
    include_ghost_overlay: bool = True,
    building_typology: Any = None,
    wall_graph: Any = None,
    plot_width_m: Optional[float] = None,
    plot_depth_m: Optional[float] = None,
    total_storeys: Optional[int] = None,
    gen_id: Optional[str] = None,
    validation_gate: Any = None,
    include_service_layer: bool = True,
    include_structural_sheet: bool = True,
) -> str:
    """
    Renders a publication-grade architectural CAD/Paper SVG blueprint for an individual storey plate
    via the shared Drawing IR. Carries the universal validation gate for the layer table and the
    service/structural drawing toggles.
    """
    from app.services.floorplan.drawing_ir import build_drawing_ir, render_svg_from_ir

    floor_dict = {
        "floor_index": floor_index,
        "floor_name": floor_name,
        "rooms": rooms,
        "doors": doors,
        "windows": windows,
        "envelope": envelope,
        "wall_graph": wall_graph,
        "validation_gate": validation_gate,
    }

    class DummyBuilding:
        pass

    dummy = DummyBuilding()
    dummy.vertical_cores = ground_cores if include_ghost_overlay else []
    dummy.duct_shafts = ground_ducts if include_service_layer else []
    dummy.validation_gate = validation_gate
    dummy.include_service_layer = include_service_layer
    dummy.include_structural_sheet = include_structural_sheet
    dummy.total_storeys = total_storeys if total_storeys is not None else (1 if not ground_cores else 2)
    dummy.building_typology = building_typology
    dummy.plot_width_m = plot_width_m
    dummy.plot_depth_m = plot_depth_m
    dummy.seed = gen_id

    ir = build_drawing_ir(
        floor_data=floor_dict,
        building_model=dummy,
        gen_id=gen_id,
        typology=building_typology,
        plot_width_m=plot_width_m,
        plot_depth_m=plot_depth_m,
        total_storeys=total_storeys,
        theme=theme
    )
    return render_svg_from_ir(ir, theme=theme)

