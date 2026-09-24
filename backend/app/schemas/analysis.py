import re
import json
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field, ConfigDict, model_validator, field_validator


class AnalysisResponse(BaseModel):
    """
    Strict response schema for Indian Civil and Structural Engineering site feasibility reports.
    Adheres strictly to CPWD benchmarks, IS 456, IS 1893, and NBC 2016.
    """
    model_config = ConfigDict(extra="forbid")

    feasibility_score: int = Field(
        ...,
        ge=0,
        le=100,
        description="Overall site feasibility score based on IS codes and user parameters"
    )
    structural_recommendations: List[str] = Field(
        ...,
        min_length=1,
        description="Specific structural requirements based on IS 456 for the selected storeys and typology"
    )
    cost_breakdown: Dict[str, Any] = Field(
        ...,
        description="CPWD DSR benchmark costs in INR, strictly calculated based on the provided Plinth Area and Specification Grade"
    )
    vastu_compliance: Dict[str, Any] = Field(
        ...,
        description="Orientation analysis based on NBC 2016 and the provided Lat/Lon solar path"
    )
    parameter_reflection: str = Field(
        ...,
        description="A 2-sentence explanation of HOW the user's specific inputs (e.g., Premium grade + G+1 storeys) influenced this specific report."
    )
    engineering_summary: Optional[str] = Field(
        default=None,
        description="Comprehensive professional civil engineering synthesis evaluating site feasibility and structural design considerations"
    )
    detailed_recommendations: Optional[List[str]] = Field(
        default_factory=list,
        description="Specific actionable engineering and site planning recommendations"
    )
    summary: Optional[str] = Field(
        default=None,
        description="Alternative summary field for engineering evaluation"
    )
    recommendations: Optional[List[str]] = Field(
        default_factory=list,
        description="Alternative recommendations field"
    )
    notes: Optional[str] = Field(
        default=None,
        description="Optional structural engineering notes or geotechnical remarks"
    )
    assumptions: Optional[List[str]] = Field(
        default_factory=list,
        description="Optional design code assumptions or material parameters"
    )
    disclaimer: Optional[str] = Field(
        default=None,
        description="Optional regulatory or municipal compliance disclaimer"
    )

    @field_validator("feasibility_score", mode="before")
    @classmethod
    def parse_feasibility_score(cls, v: Any) -> Any:
        if isinstance(v, str):
            match = re.search(r'\b\d+\b', v)
            if match:
                return int(match.group(0))
        elif isinstance(v, float):
            return int(round(v))
        return v

    @field_validator("structural_recommendations", "detailed_recommendations", "recommendations", mode="before", check_fields=False)
    @classmethod
    def parse_list_fields(cls, v: Any) -> Any:
        if isinstance(v, str):
            return [line.strip().lstrip("0123456789.-*• ") for line in v.split("\n") if line.strip()]
        return v

    @field_validator("cost_breakdown", "vastu_compliance", mode="before", check_fields=False)
    @classmethod
    def parse_dict_fields(cls, v: Any) -> Any:
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return {"description": v}
        return v

    @model_validator(mode="after")
    def sync_aliases(self) -> "AnalysisResponse":
        if not self.engineering_summary and self.summary:
            self.engineering_summary = self.summary
        elif not self.engineering_summary:
            self.engineering_summary = (
                f"{self.parameter_reflection} "
                f"Feasibility evaluation indicates a score of {self.feasibility_score}/100 based on IS 456 and NBC 2016 standards."
            )
        if not self.detailed_recommendations and self.structural_recommendations:
            self.detailed_recommendations = list(self.structural_recommendations)
        return self
