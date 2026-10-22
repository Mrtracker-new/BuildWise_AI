import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, Optional, Tuple

from app.schemas.response import LandValueEstimate, MultiplierBreakdown
from app.services.boundary_service import resolve_plot_area_sqft
from app.utils.geo_utils import haversine_distance

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"

_GUIDANCE_DATA: Optional[Dict[str, Any]] = None

def _load_guidance_table() -> Dict[str, Any]:
    global _GUIDANCE_DATA
    if _GUIDANCE_DATA is None:
        file_path = DATA_DIR / "guidance_values.json"
        with open(file_path, "r", encoding="utf-8") as f:
            _GUIDANCE_DATA = json.load(f)
    return _GUIDANCE_DATA


def match_guidance_entry(lat: float, lon: float, address: str) -> Optional[Dict[str, Any]]:
    """
    Matches land guidance rate entry using haversine spatial distance first (Amendment 4),
    and reverse-geocoded address name second.
    """
    table = _load_guidance_table()
    entries = table.get("entries", [])

    # 1. Coordinate spatial distance match
    closest_entry = None
    min_dist_km = float("inf")

    for entry in entries:
        c_lat = entry.get("center_lat")
        c_lon = entry.get("center_lon")
        r_km = entry.get("radius_km", 20.0)

        if c_lat is not None and c_lon is not None:
            dist_km = haversine_distance(lat, lon, c_lat, c_lon) / 1000.0
            if dist_km <= r_km and dist_km < min_dist_km:
                min_dist_km = dist_km
                closest_entry = entry

    if closest_entry is not None:
        return closest_entry

    # 2. Name-based match fallback
    addr_lower = address.lower()
    for entry in entries:
        city_name = entry.get("city", "").lower()
        if city_name and city_name in addr_lower:
            return entry

    return None


def calculate_locality_multiplier(
    road_score: float,
    facility_score: float
) -> Tuple[float, MultiplierBreakdown]:
    """
    Computes locality multiplier from road accessibility and civic facility factor scores.
    Formula: raw_mult = 1.0 + (road_score - 70.0)/200.0 + (facility_score - 70.0)/200.0
    Clamped strictly between 0.85 and 1.25.
    """
    road_contrib = round((road_score - 70.0) / 200.0, 3)
    fac_contrib = round((facility_score - 70.0) / 200.0, 3)
    raw_mult = 1.0 + road_contrib + fac_contrib

    clamped_mult = max(0.85, min(1.25, round(raw_mult, 2)))
    is_clamped = (clamped_mult != round(raw_mult, 2))

    breakdown = MultiplierBreakdown(
        road_accessibility_score=round(road_score, 1),
        road_contribution=road_contrib,
        facility_proximity_score=round(facility_score, 1),
        facility_contribution=fac_contrib,
        net_multiplier=clamped_mult,
        is_clamped=is_clamped
    )

    return clamped_mult, breakdown


def calculate_land_value(
    lat: float,
    lon: float,
    address: str,
    road_score: float,
    facility_score: float,
    built_up_area_sqft: float,
    floors: int,
    total_construction_cost_inr: float,
    override_rate_per_sqft: Optional[float] = None,
    plot_area_sqft: Optional[float] = None,
    ground_coverage_ratio: float = 0.60,
    boundary_area_sqm: Optional[float] = None,
) -> LandValueEstimate:
    """
    Calculates indicative land valuation, locality multiplier adjustments,
    and combined total project expenditure.
    """
    table = _load_guidance_table()
    disclaimer = table["_meta"].get(
        "mandatory_disclaimer",
        "Indicative guidance-value estimate based on published state government circle rates. "
        "Verify official valuation and stamp duty with the local Sub-Registrar Office before legal transaction."
    )

    # 1. Plot area: ONE decision, and it names its source (audit F07).
    #    captured boundary > client-supplied area > coverage derivation.
    gcr = max(0.40, min(0.75, ground_coverage_ratio))
    actual_plot_area, plot_area_source, plot_area_warnings = resolve_plot_area_sqft(
        boundary_area_sqm=boundary_area_sqm,
        requested_plot_area_sqft=plot_area_sqft,
        built_up_area_sqft=built_up_area_sqft,
        floors=floors,
        ground_coverage_ratio=gcr,
    )

    # 2. Locality Multiplier
    multiplier, breakdown = calculate_locality_multiplier(road_score, facility_score)

    # 3. Match Guidance Value Table
    matched_entry = match_guidance_entry(lat, lon, address)

    # 4. Check user override precedence
    if override_rate_per_sqft is not None and override_rate_per_sqft > 0.0:
        indicative_rate = round(override_rate_per_sqft, 2)
        base_table_rate = matched_entry.get("rate_inr_per_sqft") if matched_entry else None
        is_override = True
        as_of_year = datetime.now(timezone.utc).year
        jurisdiction = matched_entry.get("zone_label") if matched_entry else "User Custom Location"
        source_pub = "User-Supplied Valuation Rate"
        conf_warning = None
    elif matched_entry is not None:
        base_table_rate = matched_entry.get("rate_inr_per_sqft")
        indicative_rate = round(base_table_rate * multiplier, 2)
        is_override = False
        as_of_year = matched_entry.get("effective_year", 2024)
        jurisdiction = matched_entry.get("zone_label")
        source_pub = matched_entry.get("publication_source")
        # Disclose rate-table staleness so an old
        # circle rate is never presented as current-market guidance.
        current_year = datetime.now(timezone.utc).year
        rate_year = as_of_year if isinstance(as_of_year, int) else current_year
        if current_year - rate_year >= 2:
            conf_warning = (
                f"Guidance rate is effective {rate_year} and may be stale relative to current market. "
                "Verify the latest sub-registrar guidance value before financial decisions."
            )
        else:
            conf_warning = None
    else:
        # Table miss without override -> return null rate with confidence warning (Amendment 8)
        base_table_rate = None
        indicative_rate = None
        is_override = False
        as_of_year = None
        jurisdiction = None
        source_pub = None
        conf_warning = (
            "No state guidance circle rate published for this specific jurisdiction in local table. "
            "Enter a manual override rate or verify with the sub-registrar office to estimate land valuation."
        )

    # 5. Financial totals
    if indicative_rate is not None:
        land_cost = round(actual_plot_area * indicative_rate, 2)
        combined_total = round(land_cost + total_construction_cost_inr, 2)
    else:
        land_cost = None
        combined_total = None

    return LandValueEstimate(
        indicative_rate_per_sqft=indicative_rate,
        base_table_rate_per_sqft=base_table_rate,
        is_user_override=is_override,
        locality_multiplier=multiplier,
        multiplier_breakdown=breakdown,
        plot_area_sqft=actual_plot_area,
        plot_area_source=plot_area_source,
        boundary_area_sqft=(
            round(float(boundary_area_sqm) / 0.09290304, 1)
            if boundary_area_sqm is not None else None
        ),
        plot_area_warnings=plot_area_warnings,
        ground_coverage_ratio_applied=gcr,
        land_cost_inr=land_cost,
        construction_cost_inr=round(total_construction_cost_inr, 2),
        combined_project_total_inr=combined_total,
        as_of_year=as_of_year,
        jurisdiction_zone=jurisdiction,
        source_publication=source_pub,
        disclaimer=disclaimer,
        confidence_warning=conf_warning
    )
