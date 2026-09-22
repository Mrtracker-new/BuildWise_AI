from abc import ABC, abstractmethod
from typing import Dict, List, Tuple, Any

class BaseExplanationAdapter(ABC):
    """
    Abstract interface for technical explanation commentary generation.
    AI adapters must only narrate and synthesize calculated engineering metrics,
    never compute or alter numerical values.
    """
    @abstractmethod
    async def generate_explanation(
        self,
        analysis_data: Dict[str, Any]
    ) -> Tuple[str, List[str], Dict[str, str]]:
        """
        Returns:
            (engineering_summary: str, detailed_recommendations: List[str], metadata: Dict[str, str])
        """
        pass
