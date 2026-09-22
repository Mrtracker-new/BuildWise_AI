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

        flood_factor = factors.get("flood_risk", {})
        flood_score = flood_factor.get("score", 80.0)

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
            f"rated as {vent_rating} based on local prevailing wind vectors."
        )
        summary_paragraphs.append(f"{slope_commentary} {orientation_commentary}")

        cost_commentary = (
            f"The preliminary capital expenditure estimate for the proposed built-up area totals INR {total_cost:,.0f} "
            f"(benchmark range INR {cost.get('cost_range_min_inr', 0):,.0f} to INR {cost.get('cost_range_max_inr', 0):,.0f}). "
            f"Civil structural framing constitutes approximately 50% of the baseline investment, with architectural finishes "
            f"and MEP services comprising 18% and 14% respectively."
        )
        summary_paragraphs.append(cost_commentary)

        executive_summary = "\n\n".join(summary_paragraphs)

        # 2. Detailed Actionable Recommendations
        recommendations = [
            f"Align primary building massing along the recommended {optimal_axis} degree axis to optimize natural solar shading and daylight distribution.",
            f"Provide continuous horizontal overhangs (minimum 600mm projection) along south-facing fenestrations to block high-angle summer solar radiation.",
            "Incorporate dedicated cross-ventilation apertures with operable louvers or casement sashes on windward and leeward building facades.",
            f"Establish the finished plinth level at minimum +600mm above adjacent road crown level to mitigate surface stormwater ingress.",
            "Execute standard geotechnical plate load testing (minimum 3 sample points across footprint) to verify in-situ safe bearing capacity prior to foundation casting.",
            "Install a dual-stage rainwater harvesting percolation pit network designed for local peak rainfall intensity.",
            "Apply high-albedo solar reflective coating or vegetative thermal roof insulation to minimize heat transfer to top-floor habitable areas."
        ]

        if slope_pct > 8.0:
            recommendations.append("Engage a structural geotechnical specialist to detail reinforced concrete retaining walls and subsurface weep-hole drainage channels.")

        if flood_score < 70.0:
            recommendations.append("Incorporate perimeter French drains and sump pump provisions for high-water-table damp proofing.")

        duration_ms = round((time.time() - start_time) * 1000.0, 2)
        metadata = {
            "provider_requested": "mock",
            "provider_used": "mock",
            "generation_time_ms": str(duration_ms)
        }

        return executive_summary, recommendations, metadata
