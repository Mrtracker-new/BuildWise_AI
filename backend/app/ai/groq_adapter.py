import os
import time
import json
import re
import logging
import httpx
from typing import Dict, List, Tuple, Any
from pydantic import ValidationError

from app.ai.base_adapter import BaseExplanationAdapter
from app.ai.mock_adapter import MockExplanationAdapter
from app.ai.prompts import CIVIL_ENGINEER_SYSTEM_PROMPT, build_user_prompt
from app.schemas.analysis import AnalysisResponse
from app.config import settings

logger = logging.getLogger(__name__)

class GroqExplanationAdapter(BaseExplanationAdapter):
    """
    Adapter for Groq LLM inference with strict JSON enforcement, Pydantic schema validation,
    markdown stripping, and automatic deterministic mock fallback.
    """
    def __init__(self):
        self.mock = MockExplanationAdapter()
        self.api_key = settings.GROQ_API_KEY
        self.model = getattr(settings, "GROQ_MODEL", "llama-3.3-70b-versatile")

    async def generate_explanation(
        self,
        analysis_data: Dict[str, Any]
    ) -> Tuple[str, List[str], Dict[str, str]]:
        api_key = os.getenv("GROQ_API_KEY") or self.api_key or getattr(settings, "GROQ_API_KEY", "")
        if not api_key:
            summary, recs, meta = await self.mock.generate_explanation(analysis_data)
            meta["provider_requested"] = "groq"
            meta["provider_used"] = "mock_fallback"
            meta["fallback_reason"] = "GROQ_API_KEY is not configured in environment"
            return summary, recs, meta

        start_time = time.time()

        # 1. Format User Prompt with explicit parameters
        coords = analysis_data.get("coordinates", {})
        lat = coords.get("latitude", 12.9716)
        lon = coords.get("longitude", 77.5946)
        area = analysis_data.get("built_up_area_sqft", 2000.0)
        grade = analysis_data.get("quality_grade", "standard")
        typology = analysis_data.get("building_typology", "residential_single")
        floors_val = analysis_data.get("floors", 1)
        storeys = f"G+{floors_val - 1}" if isinstance(floors_val, int) and floors_val > 1 else ("G" if floors_val == 1 else str(floors_val))
        cov_val = analysis_data.get("ground_coverage_ratio", 0.60)
        coverage = round(cov_val * 100) if cov_val <= 1.0 else round(cov_val)

        user_prompt = build_user_prompt(
            lat=lat,
            lon=lon,
            area=area,
            grade=grade,
            typology=typology,
            storeys=storeys,
            coverage=coverage
        )

        # 2. System prompt with explicit required fields and Pydantic JSON schema representation
        schema_repr = json.dumps(AnalysisResponse.model_json_schema(), indent=2)
        system_prompt = (
            f"{CIVIL_ENGINEER_SYSTEM_PROMPT}\n\n"
            f"REQUIRED JSON KEYS (All are mandatory):\n"
            f"- 'feasibility_score': integer (0-100)\n"
            f"- 'structural_recommendations': array of strings (min 1 recommendation)\n"
            f"- 'cost_breakdown': object (CPWD benchmark costs)\n"
            f"- 'vastu_compliance': object (orientation and entrance analysis)\n"
            f"- 'parameter_reflection': string (2-sentence reflection of user inputs)\n"
            f"- 'engineering_summary': string (synthesis of structural feasibility)\n\n"
            f"You must strictly output a valid JSON object matching this JSON Schema:\n"
            f"{schema_repr}"
        )

        candidate_models = [
            os.getenv("GROQ_MODEL") or self.model or "openai/gpt-oss-120b",
            "openai/gpt-oss-120b",
            "openai/gpt-oss-20b",
            "qwen/qwen3.8-27b",
            "llama-3.3-70b-versatile",
            "llama-3.1-8b-instant",
        ]

        # Deduplicate while preserving order
        seen = set()
        deduped_models = []
        for m in candidate_models:
            if m and m not in seen:
                seen.add(m)
                deduped_models.append(m)

        last_error = "Groq API call failed or timed out"
        for target_model in deduped_models:
            try:
                async with httpx.AsyncClient(timeout=12.0) as client:
                    headers = {
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json"
                    }
                    payload = {
                        "model": target_model,
                        "response_format": {"type": "json_object"},
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt}
                        ],
                        "temperature": 0.2,
                        "max_tokens": 1500
                    }
                    resp = await client.post(
                        "https://api.groq.com/openai/v1/chat/completions",
                        headers=headers,
                        json=payload
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        raw_content = data["choices"][0]["message"]["content"]

                        # Extract JSON object between first { and last }
                        json_match = re.search(r'\{.*\}', raw_content, re.DOTALL)
                        if not json_match:
                            raise ValueError(f"No JSON object found in Groq response: {raw_content[:100]}")
                        cleaned_json = json_match.group(0).strip()

                        # Parse and validate into Pydantic AnalysisResponse
                        try:
                            report = AnalysisResponse.model_validate_json(cleaned_json)
                        except ValidationError as val_err:
                            logger.warning(f"Groq output failed AnalysisResponse Pydantic validation on model {target_model}: {val_err}")
                            raise val_err

                        summary = report.engineering_summary or (
                            f"{report.parameter_reflection}\n\n"
                            f"Feasibility Score: {report.feasibility_score}/100 based on IS 456 / IS 1893. "
                            f"Key structural considerations: {'; '.join(report.structural_recommendations[:2])}."
                        )
                        recs = report.structural_recommendations or report.detailed_recommendations or []

                        duration_ms = round((time.time() - start_time) * 1000.0, 2)
                        return summary, recs, {
                            "provider_requested": "groq",
                            "provider_used": f"groq ({target_model})",
                            "generation_time_ms": str(duration_ms),
                            "parameter_reflection": report.parameter_reflection,
                            "feasibility_score": str(report.feasibility_score)
                        }
                    else:
                        last_error = f"Groq status {resp.status_code}: {resp.text[:100]}"
                        logger.warning(f"Groq API error on model {target_model}: {last_error}")
            except ValidationError as v_err:
                last_error = f"Pydantic ValidationError on model {target_model}: {str(v_err)[:150]}"
                logger.warning(last_error)
            except Exception as e:
                last_error = f"Groq request exception on model {target_model}: {type(e).__name__} ({str(e)})"
                logger.warning(last_error)

        # Fallback to deterministic mock on error or validation failure
        logger.warning(f"Groq failed completely. Falling back to deterministic mock. Reason: {last_error}")
        summary, recs, meta = await self.mock.generate_explanation(analysis_data)
        meta["provider_requested"] = "groq"
        meta["provider_used"] = "mock_fallback"
        meta["fallback_reason"] = last_error
        return summary, recs, meta
