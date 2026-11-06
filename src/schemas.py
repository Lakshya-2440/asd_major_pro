from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = "ok"
    service: str = "analysis-service"
    version: str = "0.2.0"


class Coordinate(BaseModel):
    x: int
    y: int


class LandmarkPoint(BaseModel):
    x: int
    y: int
    confidence: float = 1.0


class MeasurementValue(BaseModel):
    value: float
    unit: str = "cm"
    confidence: float = 1.0


class PredictResponse(BaseModel):
    species: str = "cattle"
    breed: str = "Gir"
    pipeline_version: str = "0.2.0"
    quality_flags: List[str] = Field(default_factory=list)
    landmarks: Dict[str, Any] = Field(default_factory=dict)
    measurements: Dict[str, Any] = Field(default_factory=dict)
    trait_scores: Dict[str, Any] = Field(default_factory=dict)
    overall_score: float = 0.0
