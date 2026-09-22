import time
import httpx
from typing import Dict, List, Tuple, Any
from app.ai.base_adapter import BaseExplanationAdapter
from app.ai.mock_adapter import MockExplanationAdapter
from app.config import settings

class OllamaExplanationAdapter(BaseExplanationAdapter):
    """
    Adapter for local Ollama instances (e.g., llama3, mistral).
    Falls back gracefully to MockExplanationAdapter if Ollama is not running.
    """
    def __init__(self):
        self.mock = MockExplanationAdapter()
        self.base_url = settings.OLLAMA_BASE_URL

    async def generate_explanation(
        self,
        analysis_data: Dict[str, Any]
    ) -> Tuple[str, List[str], Dict[str, str]]:
        start_time = time.time()
        url = f"{self.base_url.rstrip('/')}/api/generate"

        prompt = (
            "You are a licensed civil engineer. Write a professional technical summary and 5 recommendations "
            "evaluating these site metrics. Do not change any numbers. Never use emojis.\n"
            f"Metrics: {analysis_data}\n\n"
            "Format:\n"
            "SUMMARY: <text>\n"
            "RECOMMENDATIONS:\n"
            "- <item 1>\n"
        )

        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                payload = {
                    "model": "llama3:latest",
                    "prompt": prompt,
                    "stream": False,
                    "options": {"temperature": 0.2}
                }
                resp = await client.post(url, json=payload)
                if resp.status_code == 200:
                    text = resp.json().get("response", "")
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
                    duration_ms = round((time.time() - start_time) * 1000.0, 2)
                    return summary, recs if recs else ["Standard engineering drainage recommended."], {
                        "provider_requested": "ollama",
                        "provider_used": "ollama",
                        "generation_time_ms": str(duration_ms)
                    }
        except Exception:
            pass

        summary, recs, meta = await self.mock.generate_explanation(analysis_data)
        meta["provider_requested"] = "ollama"
        meta["provider_used"] = "mock_fallback"
        meta["fallback_reason"] = "Local Ollama daemon is unreachable or timed out"
        return summary, recs, meta
