from typing import List
from app.schemas.response import RiskItem

def identify_site_risks(
    slope_pct: float,
    elevation_m: float,
    climate: dict,
    road_score: float,
    floors: int
) -> List[RiskItem]:
    """
    Deterministically evaluates specific site risks and generates structured mitigation strategies.
    """
    risks: List[RiskItem] = []

    # 1. Slope & Topography Risk
    if slope_pct > 15.0:
        risks.append(RiskItem(
            severity="high",
            category="slope",
            title="Steep Terrain Slope & Foundation Differential Settlement",
            description=f"Terrain slope of {slope_pct}% indicates steep inclination requiring significant benching, terraced retaining walls, and engineered stepped footings.",
            mitigation_strategy="Conduct slope stability analysis; construct reinforced RCC retaining walls with weep holes; avoid unbraced downhill structural cantilever extensions."
        ))
    elif slope_pct > 6.0:
        risks.append(RiskItem(
            severity="medium",
            category="slope",
            title="Moderate Incline & Surface Water Runoff",
            description=f"Slope of {slope_pct}% introduces directional surface erosion and potential moisture accumulation along uphill foundation walls.",
            mitigation_strategy="Grade site away from foundations; provide interceptor swales and French drains on the uphill perimeter."
        ))
    else:
        risks.append(RiskItem(
            severity="low",
            category="slope",
            title="Conventional Topography",
            description=f"Terrain slope of {slope_pct}% is flat to gentle, minimizing earthwork and retaining requirements.",
            mitigation_strategy="Ensure standard positive site grading (1:50 slope) for the first 2 meters around the plinth perimeter."
        ))

    # 2. Hydrological & Flood Risk
    annual_precip = climate.get("annual_precipitation_mm", 900.0)
    if elevation_m < 15.0 or annual_precip > 1600.0:
        risks.append(RiskItem(
            severity="high" if elevation_m < 10.0 else "medium",
            category="flood",
            title="Low Invert Elevation & High Precipitation Surcharge",
            description=f"Elevation of {elevation_m:.0f}m AMSL combined with {annual_precip:.0f}mm precipitation increases localized waterlogging vulnerability.",
            mitigation_strategy="Elevate finished plinth level to minimum +750mm above road crown; implement dual sump-pump rainwater evacuation and waterproofing membrane on substructures."
        ))
    else:
        risks.append(RiskItem(
            severity="low",
            category="flood",
            title="Satisfactory Natural Drainage Invert",
            description=f"Elevation of {elevation_m:.0f}m AMSL provides adequate vertical head for gravity stormwater discharge.",
            mitigation_strategy="Implement standard perimeter recharge pits and rainwater harvesting collection tanks."
        ))

    # 3. Transportation & Accessibility Risk
    if road_score < 60.0:
        risks.append(RiskItem(
            severity="high",
            category="access",
            title="Constrained Heavy Vehicle & Ready-Mix Access",
            description="Access routes indicate narrow or unpaved right-of-way that may restrict transit-mixer concrete trucks and heavy crane operations.",
            mitigation_strategy="Inspect turning radius along approach roads; budget for on-site batching plant or smaller payload transit trucks (3-4 m3 capacity)."
        ))

    # 4. Thermal & Microclimate Risk
    temp_max = climate.get("temperature_max_c", 32.0)
    if temp_max > 36.0:
        risks.append(RiskItem(
            severity="medium",
            category="climate",
            title="Extreme Peak Summer Solar Heat Gain",
            description=f"Maximum ambient temperature of {temp_max:.1f} deg C will create substantial cooling energy demand on exposed unshaded surfaces.",
            mitigation_strategy="Apply high-albedo reflective roof coatings (SRI > 78); specify AAC block walling (U-value < 0.6 W/m2K) and double-glazed low-E windows on West/East facades."
        ))

    # 5. Multi-Storey Wind & Structural Consideration
    if floors >= 3:
        wind_speed = climate.get("wind_speed_kmh", 12.0)
        risks.append(RiskItem(
            severity="low" if wind_speed < 25.0 else "medium",
            category="structural",
            title=f"Multi-Storey ({floors} Floors) Wind Drift & Base Moment",
            description=f"Building height across {floors} levels increases wind shear and overturning moments on footings.",
            mitigation_strategy="Conduct formal 3D structural analysis in accordance with IS 875 (Part 3) for design wind loads; tie perimeter columns with continuous grade tie-beams."
        ))

    return risks
