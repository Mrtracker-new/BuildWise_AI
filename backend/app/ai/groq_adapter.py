import os
import time
import json
import re
import logging
import httpx
from typing import Dict, List, Tuple, Any
from app.ai.base_adapter import BaseExplanationAdapter
from app.ai.mock_adapter import MockExplanationAdapter
from app.config import settings

logger = logging.getLogger(__name__)

class GroqExplanationAdapter(BaseExplanationAdapter):
    """
    Adapter for Groq LLM inference with strict JSON enforcement, markdown stripping,
    and automatic deterministic mock fallback.
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
        system_prompt = (
            "You are an AI assistant for BuildWise. Generate realistic CPWD benchmark costs in INR "
            "based on the provided plinth area and specification grade. Calculate structural requirements "
            "based on IS 456 and IS 1893. Output ONLY valid JSON, no markdown formatting."
        )

        user_prompt = (
            f"Analyze the following calculated site parameters and provide a comprehensive engineering evaluation.\n"
            f"Coordinates: {analysis_data.get('coordinates', {})}\n"
            f"Built-up Plinth Area: {analysis_data.get('built_up_area_sqft', 2000)} sq ft\n"
            f"Specification Grade: {analysis_data.get('quality_grade', 'standard')}\n"
            f"Storeys: {analysis_data.get('floors', 1)}\n"
            f"Suitability Score: {analysis_data.get('overall_suitability_score', 70)} ({analysis_data.get('suitability_verdict', 'Suitable')})\n"
            f"Hazard Profile: {analysis_data.get('hazard_profile', {})}\n"
            f"Cost Estimate: {analysis_data.get('cost_estimate', {})}\n"
            f"Orientation: {analysis_data.get('orientation', {})}\n"
            f"Vastu Advisory: {analysis_data.get('vastu_advisory', {})}\n\n"
            "Return a single strictly valid JSON object with exactly these keys:\n"
            "{\n"
            '  "summary": "2-3 paragraph professional civil engineering synthesis evaluating the site feasibility and structural design considerations",\n'
            '  "recommendations": [\n'
            '    "Detailed IS 456 / IS 1893 recommendation 1",\n'
            '    "Detailed CPWD specification recommendation 2",\n'
            '    "Detailed foundation / geotechnical recommendation 3",\n'
            '    "Detailed bioclimatic orientation recommendation 4",\n'
            '    "Detailed Vastu / functional layout recommendation 5"\n'
            "  ]\n"
            "}\n"
            "Do NOT include markdown fences, backticks, or explanatory text outside the JSON object."
        )

        candidate_models = [
            os.getenv("GROQ_MODEL") or self.model or "openai/gpt-oss-120b",
            "openai/gpt-oss-120b",
            "openai/gpt-oss-20b",
            "llama-3.3-70b-versatile",
            "llama-3.1-8b-instant"
        ]

        last_error = "Groq API call failed or timed out"
        for target_model in candidate_models:
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
                        "max_tokens": 1200
                    }
                    resp = await client.post(
                        "https://api.groq.com/openai/v1/chat/completions",
                        headers=headers,
                        json=payload
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        raw_content = data["choices"][0]["message"]["content"]

                        # 1. The "Markdown Wrapper" JSON Trap: extract content between first { and last }
                        json_match = re.search(r'\{.*\}', raw_content, re.DOTALL)
                        if not json_match:
                            raise ValueError(f"No JSON object found in Groq response: {raw_content[:100]}")
                        cleaned_json = json_match.group(0).strip()

                        try:
                            parsed = json.loads(cleaned_json)
                        except (json.JSONDecodeError, Exception) as jerr:
                            logger.warning(f"Groq JSONDecodeError on model {target_model}: {jerr}")
                            raise jerr

                        summary = parsed.get("summary") or parsed.get("engineering_summary") or ""
                        recs = parsed.get("recommendations") or parsed.get("detailed_recommendations") or []
                        if isinstance(recs, str):
                            recs = [r.strip() for r in recs.split("\n") if r.strip()]

                        if not summary:
                            raise ValueError("Empty engineering summary in parsed JSON")

                        if not recs:
                            recs = [
                                "Design ductile RCC frame elements in accordance with IS 13920 and IS 456.",
                                "Execute subsurface geotechnical borehole validation prior to foundation cast.",
                                "Incorporate perimeter swale and stormwater retention according to CPWD specifications.",
                                "Align structural fenestrations to maximize cross-ventilation along the passive axis."
                            ]

                        duration_ms = round((time.time() - start_time) * 1000.0, 2)
                        return summary, recs, {
                            "provider_requested": "groq",
                            "provider_used": f"groq ({target_model})",
                            "generation_time_ms": str(duration_ms)
                        }
                    else:
                        last_error = f"Groq status {resp.status_code}: {resp.text[:100]}"
                        logger.warning(f"Groq API error on model {target_model}: {last_error}")
            except Exception as e:
                last_error = f"Groq request exception on model {target_model}: {type(e).__name__} ({str(e)})"
                logger.warning(last_error)

        # Fallback to deterministic mock on error
        logger.warning(f"Groq failed completely. Falling back to deterministic mock. Reason: {last_error}")
        summary, recs, meta = await self.mock.generate_explanation(analysis_data)
        meta["provider_requested"] = "groq"
        meta["provider_used"] = "mock_fallback"
        meta["fallback_reason"] = last_error
        return summary, recs, meta
