import time
import httpx
from typing import Dict, List, Tuple, Any
from app.ai.base_adapter import BaseExplanationAdapter
from app.ai.mock_adapter import MockExplanationAdapter
from app.config import settings

class GeminiExplanationAdapter(BaseExplanationAdapter):
    """
    Adapter for Google Gemini free-tier REST API.
    Gracefully falls back to deterministic MockExplanationAdapter if key is missing or call fails.
    """
    def __init__(self):
        self.mock = MockExplanationAdapter()
        self.api_key = settings.GEMINI_API_KEY

    async def generate_explanation(
        self,
        analysis_data: Dict[str, Any]
    ) -> Tuple[str, List[str], Dict[str, str]]:
        if not self.api_key:
            summary, recs, meta = await self.mock.generate_explanation(analysis_data)
            meta["provider_requested"] = "gemini"
            meta["provider_used"] = "mock_fallback"
            meta["fallback_reason"] = "GEMINI_API_KEY is not configured in environment"
            return summary, recs, meta

        start_time = time.time()
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={self.api_key}"

        prompt = (
            "You are a licensed professional civil engineer and bioclimatic building architect. "
            "Write an objective, rigorous 2-paragraph engineering summary and 5-6 technical recommendations "
            "evaluating these calculated site metrics. "
            "STRICT RULES: Do not recalculate or invent any numerical values. "
            "Under NO circumstances use emojis in your response. "
            f"Metrics: {analysis_data}\n\n"
            "Format:\n"
            "SUMMARY: <paragraphs>\n"
            "RECOMMENDATIONS:\n"
            "- <item 1>\n"
            "- <item 2>\n"
        )

        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                payload = {
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {"temperature": 0.2, "maxOutputTokens": 800}
                }
                resp = await client.post(url, json=payload)
                if resp.status_code == 200:
                    data = resp.json()
                    candidates = data.get("candidates", [])
                    if candidates:
                        text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                        lines = text.splitlines()
                        summary_lines = []
                        recs = []
                        is_rec = False

                        for line in lines:
                            cleaned = line.strip()
                            if "RECOMMENDATIONS:" in cleaned.upper():
                                is_rec = True
                                continue
                            if not is_rec:
                                if cleaned.upper().startswith("SUMMARY:"):
                                    cleaned = cleaned[8:].strip()
                                if cleaned:
                                    summary_lines.append(cleaned)
                            else:
                                if cleaned.startswith(("-", "*", "•")):
                                    recs.append(cleaned.lstrip("-*• ").strip())

                        summary = "\n\n".join(summary_lines) if summary_lines else text
                        if not recs:
                            recs = ["Implement standard perimeter site drainage."]

                        duration_ms = round((time.time() - start_time) * 1000.0, 2)
                        return summary, recs, {
                            "provider_requested": "gemini",
                            "provider_used": "gemini",
                            "generation_time_ms": str(duration_ms)
                        }
        except Exception:
            pass

        summary, recs, meta = await self.mock.generate_explanation(analysis_data)
        meta["provider_requested"] = "gemini"
        meta["provider_used"] = "mock_fallback"
        meta["fallback_reason"] = "Gemini API call failed or timed out"
        return summary, recs, meta
