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

class GeminiExplanationAdapter(BaseExplanationAdapter):
    """
    Adapter for Google Gemini REST API with strict JSON mode,
    markdown stripping, and automatic deterministic mock fallback.
    """
    def __init__(self):
        self.mock = MockExplanationAdapter()
        self.api_key = settings.GEMINI_API_KEY

    async def generate_explanation(
        self,
        analysis_data: Dict[str, Any]
    ) -> Tuple[str, List[str], Dict[str, str]]:
        if not self.api_key or self.api_key.startswith("your_"):
            summary, recs, meta = await self.mock.generate_explanation(analysis_data)
            meta["provider_requested"] = "gemini"
            meta["provider_used"] = "mock_fallback"
            meta["fallback_reason"] = "GEMINI_API_KEY is not configured in environment"
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
            "gemini-2.5-flash-lite",
            "gemini-3.5-flash-lite",
            "gemini-3.6-flash"
        ]

        last_error = "Gemini API call failed or timed out"
        for target_model in candidate_models:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{target_model}:generateContent?key={self.api_key}"
            try:
                async with httpx.AsyncClient(timeout=12.0) as client:
                    payload = {
                        "systemInstruction": {
                            "parts": [{"text": system_prompt}]
                        },
                        "contents": [{"parts": [{"text": user_prompt}]}],
                        "generationConfig": {
                            "temperature": 0.2,
                            "maxOutputTokens": 1200,
                            "responseMimeType": "application/json"
                        }
                    }
                    resp = await client.post(url, json=payload)
                    if resp.status_code == 200:
                        data = resp.json()
                        candidates = data.get("candidates", [])
                        if candidates:
                            text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")

                            # 1. The "Markdown Wrapper" JSON Trap: extract content between first { and last }
                            json_match = re.search(r'\{.*\}', text, re.DOTALL)
                            if not json_match:
                                raise ValueError(f"No JSON object found in Gemini response: {text[:100]}")
                            cleaned_json = json_match.group(0).strip()

                            try:
                                parsed = json.loads(cleaned_json)
                            except (json.JSONDecodeError, Exception) as jerr:
                                logger.warning(f"Gemini JSONDecodeError on model {target_model}: {jerr}")
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
                                "provider_requested": "gemini",
                                "provider_used": f"gemini ({target_model})",
                                "generation_time_ms": str(duration_ms)
                            }
                    else:
                        last_error = f"Gemini status {resp.status_code} on {target_model}: {resp.text[:100]}"
                        logger.warning(last_error)
            except Exception as e:
                last_error = f"Gemini exception on {target_model}: {type(e).__name__} ({str(e)})"
                logger.warning(last_error)

        # Fallback to deterministic mock on error
        logger.warning(f"Gemini failed completely. Falling back to deterministic mock. Reason: {last_error}")
        summary, recs, meta = await self.mock.generate_explanation(analysis_data)
        meta["provider_requested"] = "gemini"
        meta["provider_used"] = "mock_fallback"
        meta["fallback_reason"] = last_error
        return summary, recs, meta
