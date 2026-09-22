import time
import httpx
from typing import Dict, List, Tuple, Any
from app.ai.base_adapter import BaseExplanationAdapter
from app.ai.mock_adapter import MockExplanationAdapter
from app.config import settings

class GroqExplanationAdapter(BaseExplanationAdapter):
    """
    Adapter for Groq free-tier LLM inference.
    Falls back gracefully to deterministic MockExplanationAdapter if key is missing or call fails.
    """
    def __init__(self):
        self.mock = MockExplanationAdapter()
        self.api_key = settings.GROQ_API_KEY

    async def generate_explanation(
        self,
        analysis_data: Dict[str, Any]
    ) -> Tuple[str, List[str], Dict[str, str]]:
        if not self.api_key:
            summary, recs, meta = await self.mock.generate_explanation(analysis_data)
            meta["provider_requested"] = "groq"
            meta["provider_used"] = "mock_fallback"
            meta["fallback_reason"] = "GROQ_API_KEY is not configured in environment"
            return summary, recs, meta

        start_time = time.time()
        prompt = (
            "You are a principal civil and architectural structural consultant. "
            "Write a concise, professional engineering summary and 5-6 technical bullet points "
            "evaluating the following calculated site parameters. "
            "STRICT RULES: Do not recalculate or alter any numbers. Do not invent scores. "
            "Do not use emojis under any circumstances. Keep the tone rigorous, technical, and objective.\n\n"
            f"Calculated Data: {analysis_data}\n\n"
            "Format your response as:\n"
            "SUMMARY: <2-3 paragraph technical synthesis>\n"
            "RECOMMENDATIONS:\n"
            "- <recommendation 1>\n"
            "- <recommendation 2>\n"
        )

        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                headers = {
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json"
                }
                payload = {
                    "model": "llama-3.1-8b-instant",
                    "messages": [
                        {"role": "system", "content": "You are a professional civil engineer. Never use emojis."},
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 0.2,
                    "max_tokens": 800
                }
                resp = await client.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload)
                if resp.status_code == 200:
                    data = resp.json()
                    content = data["choices"][0]["message"]["content"]
                    
                    # Parse summary and recommendations
                    summary = ""
                    recs = []
                    lines = content.splitlines()
                    is_rec = False
                    summary_lines = []
                    
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
                            elif cleaned and len(recs) > 0 and not cleaned[0].isdigit():
                                recs[-1] += " " + cleaned

                    summary = "\n\n".join(summary_lines) if summary_lines else content
                    if not recs:
                        recs = ["Implement standard perimeter drainage.", "Conduct plate load testing."]

                    duration_ms = round((time.time() - start_time) * 1000.0, 2)
                    return summary, recs, {
                        "provider_requested": "groq",
                        "provider_used": "groq",
                        "generation_time_ms": str(duration_ms)
                    }
        except Exception as e:
            pass

        # Fallback to mock on error
        summary, recs, meta = await self.mock.generate_explanation(analysis_data)
        meta["provider_requested"] = "groq"
        meta["provider_used"] = "mock_fallback"
        meta["fallback_reason"] = "Groq API call failed or timed out"
        return summary, recs, meta
