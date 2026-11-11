from typing import Any

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = "ok"
    service: str = "analysis-service"
    version: str = "0.2.0"


class Coordinate(BaseModel):
    x: int
    y: int
    confidence: float | None = 1.0


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
    tag_id: str | None = None
    pipeline_version: str = "0.2.0"
    pixels_per_cm: float | None = None
    quality_flags: list[str] = Field(default_factory=list)
    landmarks: dict[str, Any] = Field(default_factory=dict)
    measurements: dict[str, Any] = Field(default_factory=dict)
    trait_scores: dict[str, Any] = Field(default_factory=dict)
    overall_score: float = 0.0
    latency_ms: dict[str, float] = Field(default_factory=dict)
    timing_ms: dict[str, float] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
    error: str | None = None

    model_config = {"extra": "allow"}


class RecomputeRequest(BaseModel):
    landmarks: dict[str, Coordinate] = Field(
        ..., description="Adjusted anatomical landmark coordinates"
    )
    pixels_per_cm: float = Field(
        ..., gt=0, description="Pixel to centimeter scale factor (must be > 0)"
    )
    species: str = Field(default="cattle", description="Animal species: cattle or buffalo")
    breed: str = Field(default="Gir", description="Animal breed name")


class RecomputeResponse(BaseModel):
    measurements: dict[str, Any] = Field(default_factory=dict)
    trait_scores: dict[str, Any] = Field(default_factory=dict)
    overall_score: float = 0.0
    warnings: list[str] = Field(default_factory=list)
