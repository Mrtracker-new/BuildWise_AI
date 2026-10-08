import time
from typing import Dict, List, Tuple, Any
from app.ai.base_adapter import BaseExplanationAdapter

class MockExplanationAdapter(BaseExplanationAdapter):
    """
    Deterministic rule-based explanation engine.
    Requires zero external API keys, zero network connectivity, and operates with zero latency.
    Adheres strictly to professional civil engineering terminology without emojis.
    """
    async def generate_explanation(
        self,
        analysis_data: Dict[str, Any]
    ) -> Tuple[str, List[str], Dict[str, str]]:
        start_time = time.time()

        score = analysis_data.get("overall_suitability_score", 70.0)
        verdict = analysis_data.get("suitability_verdict", "Suitable")
        coords = analysis_data.get("coordinates", {})
        lat = coords.get("latitude", 0.0)
        lon = coords.get("longitude", 0.0)
        address = analysis_data.get("formatted_address", "Selected Site")

        orientation = analysis_data.get("orientation", {})
        optimal_axis = orientation.get("optimal_axis_degrees", 90.0)
        axis_label = orientation.get("axis_label", "East-West")
        vent_rating = orientation.get("cross_ventilation_rating", "Good")

        cost = analysis_data.get("cost_estimate", {})
        total_cost = cost.get("total_estimated_cost_inr", 0.0)
        terrain_mult = cost.get("terrain_multiplier", 1.0)

        factors = {f.get("factor_id"): f for f in analysis_data.get("factors", [])}
        slope_factor = factors.get("slope", {})
        slope_pct = slope_factor.get("raw_value", 2.0)
        slope_score = slope_factor.get("score", 100.0)

        # Module 1 Hazard data
        hazard = analysis_data.get("hazard_profile", {})
        seismic = hazard.get("seismic", {})
        # Zone may be None ("Not Assessed") outside India
        seismic_zone = seismic.get("zone") or "Not Assessed (outside IS 1893 extent)"
        seismic_factor = seismic.get("zone_factor") or 0.0
        flood_prof = hazard.get("flood", {})
        flood_pressure = flood_prof.get("pressure_level", "low").upper()
        storm_prof = hazard.get("storm_cyclone", {})
        storm_exposure = storm_prof.get("exposure_level", "low").upper()

        # Module 2 Land Value data
        land_val = analysis_data.get("land_value", {})
        ind_rate = land_val.get("indicative_rate_per_sqft")
        land_cost = land_val.get("land_cost_inr")
        combined_total = land_val.get("combined_project_total_inr")

        # Module 3 Vastu data
        vastu = analysis_data.get("vastu_advisory", {})
        ranked_ents = vastu.get("ranked_entrances", [])
        top_ent = ranked_ents[0] if ranked_ents else {"direction": "NE", "score": 100.0}
        road_app = vastu.get("road_approach", {})
        app_side = road_app.get("approach_side", "unknown")

        # 1. Executive Summary Synthesis
        summary_paragraphs = []

        para_1 = (
            f"The site at {address} (Latitude {lat:.4f}, Longitude {lon:.4f}) achieves a composite "
            f"land suitability rating of {score:.1f} out of 100, designated as {verdict}. "
            f"This index reflects a weighted multi-criteria synthesis incorporating measured topographic grade ({slope_pct}% slope), "
            f"regional hydrological drainage vulnerability, transportation network connectivity, ambient microclimate conditions, "
            f"and civic service proximity."
        )
        summary_paragraphs.append(para_1)

        # Hazard commentary
        hazard_commentary = (
            f"Hazard history and climate stress profiling classifies the site under BIS IS 1893:2016 {seismic_zone} "
            f"(Zone Factor Z={seismic_factor:.2f}). Hydrological telemetry indicates {flood_pressure} flood pressure, "
            f"while historical 10-year meteorological archives indicate {storm_exposure} storm wind and cyclonic exposure. "
            f"Structural ductility and elevated plinth levels must be detailed accordingly."
        )
        summary_paragraphs.append(hazard_commentary)

        if slope_score >= 80.0:
            slope_commentary = (
                f"Topographic assessment confirms favorable flat-to-gentle terrain conditions ({slope_pct}% slope), "
                f"allowing standard isolated or strip footings without costly deep retaining structures or extensive site benching."
            )
        else:
            slope_commentary = (
                f"Topographic analysis indicates an undulating slope profile ({slope_pct}% slope), "
                f"imposing a terrain multiplier of {terrain_mult}x on substructure works. "
                f"Stepped foundation pads, terraced retention walls, and controlled perimeter swales are required."
            )

        orientation_commentary = (
            f"Passive bioclimatic layout analysis advises establishing the building longitudinal axis along {optimal_axis} degrees ({axis_label}). "
            f"This orientation limits peak afternoon solar exposure on long vertical facades while facilitating natural cross-ventilation, "
            f"rated as {vent_rating} based on local prevailing wind vectors. "
            f"Functional planning aligns primary entrance orientation toward the {top_ent.get('direction', 'NE')} facade ({top_ent.get('score', 100):.0f}/100 rating) "
            f"relative to the {app_side} approach access road."
        )
        summary_paragraphs.append(f"{slope_commentary} {orientation_commentary}")

        # Cost & Land Value commentary
        if ind_rate is not None and combined_total is not None:
            cost_commentary = (
                f"The preliminary capital expenditure estimate for the proposed built-up area totals INR {total_cost:,.0f} for construction works. "
                f"Indicative land valuation at INR {ind_rate:,.0f}/sq ft yields an estimated land outlay of INR {land_cost:,.0f}, "
                f"bringing the combined preliminary project outlay to INR {combined_total:,.0f}. "
                f"Civil structural framing constitutes approximately 50% of construction baseline investment."
            )
        else:
            cost_commentary = (
                f"The preliminary construction expenditure estimate for the proposed built-up area totals INR {total_cost:,.0f} "
                f"(benchmark range INR {cost.get('cost_range_min_inr', 0):,.0f} to INR {cost.get('cost_range_max_inr', 0):,.0f}). "
                f"Civil structural framing constitutes approximately 50% of the baseline investment, with architectural finishes "
                f"and MEP services comprising 18% and 14% respectively."
            )
        summary_paragraphs.append(cost_commentary)

        executive_summary = "\n\n".join(summary_paragraphs)

        # 2. Traceable Actionable Recommendations
        # If structured recommendations were passed, use their texts directly
        recs_input = analysis_data.get("recommendations") or analysis_data.get("recommendation_items")
        if recs_input and isinstance(recs_input, list) and len(recs_input) > 0:
            recommendations = []
            for item in recs_input:
                if isinstance(item, dict):
                    t = item.get("recommendation_text")
                    if t:
                        recommendations.append(t)
                elif isinstance(item, str):
                    recommendations.append(item)
        else:
            recommendations = [
                f"Align primary building massing along the recommended {optimal_axis} degree axis to optimize natural solar shading and daylight distribution.",
                f"Provide continuous horizontal overhangs (minimum 600mm projection) along south-facing fenestrations to block high-angle summer solar radiation.",
                "Incorporate dedicated cross-ventilation apertures with operable louvers or casement sashes on windward and leeward building facades.",
                f"Establish the finished plinth level at minimum +600mm above adjacent road crown level to mitigate surface stormwater ingress.",
                "Execute standard geotechnical plate load testing (minimum 3 sample points across footprint) to verify in-situ safe bearing capacity prior to foundation casting.",
                "Install a dual-stage rainwater harvesting percolation pit network designed for local peak rainfall intensity.",
                "Apply high-albedo solar reflective coating or vegetative thermal roof insulation to minimize heat transfer to top-floor habitable areas."
            ]

        # Compute parameter reflection
        grade_str = str(analysis_data.get("quality_grade", "standard")).capitalize()
        built_up_area = float(analysis_data.get("built_up_area_sqft", 2000.0))
        floors_num = int(analysis_data.get("floors", 1))
        storeys_str = f"G+{floors_num - 1}" if floors_num > 1 else "G"
        foundations_type = "deep raft or pile foundations" if floors_num >= 4 else ("isolated RCC footings" if floors_num <= 2 else "reinforced continuous strip footings")

        parameter_reflection = (
            f"This analysis is directly governed by the {built_up_area:,.0f} sq ft built-up footprint specified with {grade_str} grade finishes. "
            f"The {storeys_str} storey load profile necessitates {foundations_type} under IS 456, while base construction benchmarks total approximately INR {total_cost:,.0f}."
        )

        duration_ms = round((time.time() - start_time) * 1000.0, 2)
        metadata = {
            "provider_requested": "mock",
            "provider_used": "mock",
            "generation_time_ms": str(duration_ms),
            "parameter_reflection": parameter_reflection,
            "feasibility_score": str(round(score))
        }

        return executive_summary, recommendations, metadata
