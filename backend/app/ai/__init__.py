from typing import Optional
from app.ai.base_adapter import BaseExplanationAdapter
from app.ai.mock_adapter import MockExplanationAdapter
from app.ai.groq_adapter import GroqExplanationAdapter
from app.ai.gemini_adapter import GeminiExplanationAdapter
from app.ai.ollama_adapter import OllamaExplanationAdapter

def get_ai_adapter(provider: Optional[str] = "mock") -> BaseExplanationAdapter:
    """
    Factory function returning the appropriate explanation adapter.
    Defaults to MockExplanationAdapter if unrecognized or unspecified.
    """
    selected = (provider or "mock").lower().strip()
    if selected == "groq":
        return GroqExplanationAdapter()
    elif selected == "gemini":
        return GeminiExplanationAdapter()
    elif selected == "ollama":
        return OllamaExplanationAdapter()
    return MockExplanationAdapter()

__all__ = [
    "BaseExplanationAdapter",
    "MockExplanationAdapter",
    "GroqExplanationAdapter",
    "GeminiExplanationAdapter",
    "OllamaExplanationAdapter",
    "get_ai_adapter"
]
