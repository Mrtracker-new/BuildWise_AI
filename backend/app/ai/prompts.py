"""
Prompts for BuildWise Civil and Structural Engineering AI adapters.
Adheres strictly to CPWD benchmarks, IS 456, IS 1893, and NBC 2016.
"""
from typing import Optional

CIVIL_ENGINEER_SYSTEM_PROMPT = """You are an elite Indian Civil and Structural Engineer AI, specializing in CPWD (Central Public Works Department) benchmarks, IS 456 (Concrete), IS 1893 (Seismic), and NBC 2016 (National Building Code).

Your task is to analyze a construction site based on the provided user parameters and generate a strict, mathematically sound feasibility report.

RULES:
1. MATHEMATICAL ACCURACY: If the user provides a Plinth Area of 2,000 sq ft and a 'Premium' grade (approx ₹3,500/sqft), the total base cost MUST be close to ₹70,00,000. Do not hallucinate random numbers. Calculate them.
2. PARAMETER REFLECTION: Your analysis must explicitly reflect the inputs. If 'Storeys' is G+3, you must recommend deeper foundations (e.g., pile or raft) compared to G+1 (isolated footings).
3. SEISMIC ZONE: Use the provided Latitude/Longitude to infer the likely Seismic Zone (II, III, IV, or V) per IS 1893 and adjust structural recommendations accordingly.
4. NO FLUFF: Output ONLY valid JSON matching the provided schema. No markdown, no introductory text."""


def build_user_prompt(
    lat: float,
    lon: float,
    area: float,
    grade: str,
    typology: str,
    storeys: str,
    coverage: int,
    client_requirements: Optional[str] = None,
) -> str:
    """
    Builds the standardized user prompt strictly adhering to the specified format:
    'Analyze this site: Lat={lat}, Lon={lon}, Area={area} sqft, Grade={grade}, Typology={typology}, Storeys={storeys}, Ground Coverage={coverage}%.'

    Client requirements, when supplied, are appended verbatim so the narrative
    reflects the brief instead of silently dropping a populated sidebar field.
    """
    prompt = (
        f"Analyze this site: Lat={lat}, Lon={lon}, Area={area} sqft, "
        f"Grade={grade}, Typology={typology}, Storeys={storeys}, Ground Coverage={coverage}%."
    )
    reqs = (client_requirements or "").strip()
    if reqs:
        prompt += f"\nClient requirements that must be reflected in the narrative: {reqs}"
    return prompt
