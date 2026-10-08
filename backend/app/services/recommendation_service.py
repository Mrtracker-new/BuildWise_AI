from typing import List

from app.schemas.response import (
    FactorScore,
    HazardProfile,
    LandValueEstimate,
    VastuAdvisory,
    OrientationData,
    CostEstimate,
    RecommendationItem
)

def generate_recommendations(
    factors: List[FactorScore],
    hazard_profile: HazardProfile,
    land_value: LandValueEstimate,
    vastu_advisory: VastuAdvisory,
    orientation: OrientationData,
    cost_estimate: CostEstimate
) -> List[RecommendationItem]:
    """
    Evaluates civil engineering, environmental, regulatory, and spatial criteria
    to emit categorized, severity-ranked, and traceable action items.
    """
    items: List[RecommendationItem] = []

    # Map factors by ID
    factors_map = {f.factor_id: f for f in factors}
    slope_factor = factors_map.get("slope")
    slope_pct = slope_factor.raw_value if slope_factor else 2.0

    # 1. Structural & Seismic Safety (STR)
    seismic = hazard_profile.seismic
    if seismic.zone is None:
        # Jurisdiction outside IS 1893 coverage.
        items.append(RecommendationItem(
            category="structure",
            category_label="Structural & Seismic Engineering",
            severity="advisory",
            rule_id="STR-000",
            trigger_condition="Seismic zone not assessed (site outside IS 1893:2016 mapping extent)",
            source_data_ref="IS 1893:2016 Jurisdiction Extent Gate",
            recommendation_text=(
                "No seismic zone was assigned because the site coordinates are outside the IS 1893:2016 (India) "
                "mapping extent. Engage the governing national seismic code for the site jurisdiction and commission "
                "a licensed structural engineer before any design work."
            )
        ))
    elif seismic.zone in ["Zone IV", "Zone V"]:
        items.append(RecommendationItem(
            category="structure",
            category_label="Structural & Seismic Engineering",
            severity="critical",
            rule_id="STR-001",
            trigger_condition=f"Seismic {seismic.zone} (Zone Factor Z={seismic.zone_factor:.2f})",
            source_data_ref=f"{seismic.standard} / IS 13920:2016",
            recommendation_text=(
                f"Mandatory seismic-resistant structural design in accordance with {seismic.standard}. "
                f"Incorporate ductile detailing per IS 13920, continuous RCC shear walls, moment-resisting framed connections, "
                f"and geotechnical Standard Penetration Testing (SPT) to evaluate soil liquefaction susceptibility."
            )
        ))
    else:
        items.append(RecommendationItem(
            category="structure",
            category_label="Structural & Seismic Engineering",
            severity="advisory",
            rule_id="STR-002",
            trigger_condition=f"Seismic {seismic.zone} (Zone Factor Z={seismic.zone_factor:.2f})",
            source_data_ref=f"{seismic.standard} / IS 4326:2013",
            recommendation_text=(
                f"Implement standard earthquake-resistant detailing in accordance with IS 4326. "
                f"Provide continuous horizontal reinforced concrete plinth and lintel bands with tied corner reinforcement "
                f"to ensure structural box action under lateral vibrations."
            )
        ))

    # 2. Water Management & Flood Defense (FLD)
    flood = hazard_profile.flood
    if flood.pressure_level == "high" or flood.ndma_flood_prone:
        ratio_str = f"Discharge Ratio: {flood.discharge_peak_to_mean_ratio:.1f}x" if flood.discharge_peak_to_mean_ratio is not None else "Elevation < 15m AMSL"
        items.append(RecommendationItem(
            category="water_drainage",
            category_label="Hydrology & Flood Defense",
            severity="critical",
            rule_id="FLD-001",
            trigger_condition=f"Flood pressure level {flood.pressure_level.upper()} ({ratio_str})",
            source_data_ref="Open-Meteo Flood API / NDMA Flood Vulnerability Atlas",
            recommendation_text=(
                f"Elevate finished ground floor plinth level to minimum +750mm to +900mm above the highest recorded road crown or flood watermark. "
                f"Install dual automatic submersible sump pumps with battery backup, non-return check valves on all municipal stormwater outlets, "
                f"and integral crystalline waterproofing membrane across all substructure foundation walls."
            )
        ))
    elif flood.pressure_level == "moderate":
        items.append(RecommendationItem(
            category="water_drainage",
            category_label="Hydrology & Flood Defense",
            severity="advisory",
            rule_id="FLD-002",
            trigger_condition=f"Moderate flood pressure index ({flood.discharge_peak_to_mean_ratio or 'terrain elevation'} proxy)",
            source_data_ref="Open-Meteo Flood Telemetry & Digital Elevation Model",
            recommendation_text=(
                "Establish finished plinth level at minimum +600mm above adjacent road crown level. "
                "Construct perimeter gravel French drains and positive surface grading (1:50 slope away from structure) "
                "to divert intense monsoon runoff into percolation recharge pits."
            )
        ))

    # 3. Topographic Earthworks & Slope Retention (SLP)
    if slope_pct > 15.0:
        items.append(RecommendationItem(
            category="site_works",
            category_label="Site Grading & Geotechnical",
            severity="critical",
            rule_id="SLP-001",
            trigger_condition=f"Terrain slope {slope_pct:.1f}% exceeds 15% grade threshold",
            source_data_ref="Digital Elevation Model Contour Gradient Analysis",
            recommendation_text=(
                f"Steep topography ({slope_pct:.1f}% grade) requires stepped terraced foundation pads and cantilevered reinforced concrete retaining walls. "
                f"Design retaining walls for full lateral active earth pressure with geotextile-wrapped perforated weep-hole collectors. "
                f"Commission a formal global slope stability assessment before structural column casting."
            )
        ))
    elif slope_pct > 8.0:
        items.append(RecommendationItem(
            category="site_works",
            category_label="Site Grading & Geotechnical",
            severity="advisory",
            rule_id="SLP-002",
            trigger_condition=f"Moderate terrain slope of {slope_pct:.1f}%",
            source_data_ref="Digital Elevation Model Offset Sampling",
            recommendation_text=(
                f"Execute engineered site benching with stepped strip footings to accommodate {slope_pct:.1f}% incline. "
                f"Excavate an uphill contour interceptor swale to prevent overland sheet-flow from scouring foundation edges."
            )
        ))

    # 4. Access & Site Circulation (ACC)
    if vastu_advisory.ranked_entrances:
        top_ent = vastu_advisory.ranked_entrances[0]
        items.append(RecommendationItem(
            category="access_circulation",
            category_label="Access & Site Circulation",
            severity="optimal",
            rule_id="ACC-001",
            trigger_condition=f"Primary road approach on {vastu_advisory.road_approach.approach_side} side",
            source_data_ref="OpenStreetMap Overpass Highway Network & Spatial Bearing Vector",
            recommendation_text=(
                f"Locate primary vehicular gate and pedestrian entry portico along the {top_ent.direction} facade "
                f"({top_ent.score:.0f}/100 suitability rating). {top_ent.practical_rationale}"
            )
        ))

    # 5. Vastu & Functional Planning (VAS)
    items.append(RecommendationItem(
        category="vastu_compliance",
        category_label="Vastu & Functional Planning",
        severity="advisory",
        rule_id="VAS-001",
        trigger_condition=f"Passive solar axis at {orientation.optimal_axis_degrees:.0f} deg & SW wind vector",
        source_data_ref="Vastu Shastra Canon & NBC 2016 Part 8 Bioclimatic Physics",
        recommendation_text=(
            f"Situate kitchen in Southeast (Agneya) quadrant to reconcile traditional Vastu canon with passive thermal comfort—"
            f"benefiting from early morning daybreak illumination while utilizing prevailing {orientation.prevailing_wind_direction_degrees:.0f} deg winds "
            f"to carry cooking aromas and hot air away from living areas and bedrooms."
        )
    ))

    if vastu_advisory.slope_reading.auspiciousness == "requires_remedy":
        items.append(RecommendationItem(
            category="vastu_compliance",
            category_label="Vastu & Functional Planning",
            severity="advisory",
            rule_id="VAS-002",
            trigger_condition=f"Ground slopes downhill toward {vastu_advisory.slope_reading.drainage_direction}",
            source_data_ref="Topographic Drainage Aspect & Vastu Slope Canon",
            recommendation_text=(
                f"Topographic drainage falls toward {vastu_advisory.slope_reading.drainage_direction}, which requires spatial remediation: "
                f"raise southern/southwestern plinth grade by +300mm and construct northern/eastern diversion swales to simulate favourable Ishanya flow."
            )
        ))

    # 6. Land Valuation & Phasing (LND)
    if land_value.is_user_override:
        items.append(RecommendationItem(
            category="cost_phasing",
            category_label="Land Valuation & Capital Phasing",
            severity="optimal",
            rule_id="LND-002",
            trigger_condition=f"User-supplied land rate override applied (INR {land_value.indicative_rate_per_sqft:,.0f} /sq ft)",
            source_data_ref="User Custom Capital Valuation Schedule",
            recommendation_text=(
                f"Valuation computed from user-supplied benchmark rate of INR {land_value.indicative_rate_per_sqft:,.0f}/sq ft, "
                f"yielding estimated land outlay of INR {land_value.land_cost_inr:,.0f} and combined project investment "
                f"(land + CPWD construction) of INR {land_value.combined_project_total_inr:,.0f}."
            )
        ))
    elif land_value.indicative_rate_per_sqft is not None:
        items.append(RecommendationItem(
            category="cost_phasing",
            category_label="Land Valuation & Capital Phasing",
            severity="advisory",
            rule_id="LND-001",
            trigger_condition=f"Published circle rate ({land_value.jurisdiction_zone or 'State Registry'})",
            source_data_ref=f"{land_value.source_publication or 'State Revenue Department'} ({land_value.as_of_year or 2024})",
            recommendation_text=(
                f"Land valuation is indexed against official state guidance circle rates modified by local road and civic facility factor scores "
                f"({land_value.locality_multiplier:.2f}x multiplier). Obtain certified Encumbrance Certificate (Form 15) and verify current sub-registrar "
                f"stamp duty schedule before closing transaction."
            )
        ))
    else:
        # Amendment 8: LND-003 when indicative rate is null and no override
        items.append(RecommendationItem(
            category="cost_phasing",
            category_label="Land Valuation & Capital Phasing",
            severity="advisory",
            rule_id="LND-003",
            trigger_condition="No published circle rate found in local table and no override supplied",
            source_data_ref="State Registration & Stamps Department Registry",
            recommendation_text=(
                "No automated government guidance circle rate was matched for this specific jurisdiction. "
                "Supply an indicative land rate override in the project parameters or consult the local Sub-Registrar Office "
                "to obtain certified valuation registers."
            )
        ))

    # 7. Climate & Passive Design (CLM)
    items.append(RecommendationItem(
        category="climate_passive",
        category_label="Climate & Passive Bioclimatic Design",
        severity="optimal",
        rule_id="CLM-001",
        trigger_condition=f"Optimal longitudinal axis {orientation.optimal_axis_degrees:.0f} deg ({orientation.axis_label})",
        source_data_ref="Passive Solar Radiation Model & Aerodynamic Ventilation Matrix",
        recommendation_text=(
            f"Orient principal building longitudinal axis along {orientation.optimal_axis_degrees:.0f} deg ({orientation.axis_label}) "
            f"with deep horizontal louvers (min 600mm projection) on southern glazing and casement window apertures on windward facades "
            f"to harness prevailing {orientation.prevailing_wind_direction_degrees:.0f} deg natural cross-ventilation."
        )
    ))

    # 8. Storm & Extreme Wind Defense (STM - Amendment 8)
    storm = hazard_profile.storm_cyclone
    if storm.exposure_level == "high":
        items.append(RecommendationItem(
            category="structure",
            category_label="Structural & Seismic Engineering",
            severity="critical",
            rule_id="STM-001",
            trigger_condition=f"High cyclonic / storm wind gust exposure ({storm.max_annual_gust_kmh:.0f} km/h gust, NDMA flag: {storm.ndma_cyclone_prone})",
            source_data_ref="Open-Meteo ERA5 10-Year Archive & NDMA Wind Hazard Atlas",
            recommendation_text=(
                f"Severe wind gust and cyclonic exposure ({storm.max_annual_gust_kmh:.0f} km/h design gust) mandates continuous mechanical hurricane ties "
                f"anchoring roof rafters to RCC tie-beams, aerodynamic hip roof profiles, impact-resistant laminated fenestrations, and reinforced parapets."
            )
        ))
    elif storm.exposure_level == "moderate":
        items.append(RecommendationItem(
            category="structure",
            category_label="Structural & Seismic Engineering",
            severity="advisory",
            rule_id="STM-001",
            trigger_condition=f"Moderate storm wind exposure ({storm.max_annual_gust_kmh:.0f} km/h gust)",
            source_data_ref="Open-Meteo ERA5 10-Year Climate Archive",
            recommendation_text=(
                f"Provide continuous anchor bolts for roof truss attachments and specify wind-pressure resistant window frames "
                f"rated for {storm.max_annual_gust_kmh:.0f} km/h maximum gusts per IS 875 (Part 3)."
            )
        ))

    # Sort items deterministically by severity: critical -> advisory -> optimal
    severity_order = {"critical": 0, "advisory": 1, "optimal": 2}
    items.sort(key=lambda x: (severity_order.get(x.severity, 3), x.rule_id))

    return items


def get_top_severity_recommendations(items: List[RecommendationItem], limit: int = 8) -> List[RecommendationItem]:
    """
    Returns top N severity-ranked recommendation items for AI adapter payload (Amendment 10),
    protecting low-hardware Ollama context windows while preserving structured truth.
    """
    return items[:limit]
