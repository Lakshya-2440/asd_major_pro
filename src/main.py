
from fastapi import FastAPI, File, Form, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware

from src.measurements import REQUIRED_LANDMARKS, compute_measurements
from src.pipeline import AnalysisPipeline
from src.schemas import (
    HealthResponse,
    PredictResponse,
    RecomputeRequest,
    RecomputeResponse,
)
from src.scoring import ScoringEngine

app = FastAPI(
    title="Auto-ATC Analysis Service",
    description="Computer vision and scoring microservice for cattle & buffalo ATC evaluation",
    version="0.2.0",
)

# Initialize scoring engine and pipeline singletons
scoring_engine = ScoringEngine()
pipeline = AnalysisPipeline(scoring_engine=scoring_engine)

# Enable CORS for local development & frontend origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
def get_health() -> HealthResponse:
    """Return health status and pipeline version."""
    return HealthResponse()


@app.post("/predict", response_model=PredictResponse)
async def predict(
    side_view: UploadFile = File(..., description="Side view image of animal with ArUco marker"),  # noqa: B008
    species: str = Form("cattle", description="Animal species: cattle or buffalo"),
    breed: str = Form("Gir", description="Animal breed name"),
    tag_id: str | None = Form(None, description="Animal Tag ID"),
) -> PredictResponse:
    """
    Predict landmarks, real-world measurements, and 1-9 linear trait scores.
    Executes end-to-end analysis pipeline:
    Quality -> ArUco Marker -> Segmentation -> Landmarks -> Measurements -> Scoring.
    """
    image_bytes = await side_view.read()
    result = pipeline.run(
        image_bytes=image_bytes,
        species=species,
        breed=breed,
        tag_id=tag_id,
    )
    return PredictResponse(**result)


@app.post("/recompute", response_model=RecomputeResponse)
def recompute(request: RecomputeRequest) -> RecomputeResponse:
    """
    Recalculate measurements and linear trait scores from user-adjusted landmarks.
    """
    # 1. Validate presence of required anatomical landmarks
    for req in REQUIRED_LANDMARKS:
        if req not in request.landmarks:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Missing required landmark: '{req}'",
            )

    # 2. Validate pixels_per_cm
    if request.pixels_per_cm <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"pixels_per_cm must be positive, got {request.pixels_per_cm}",
        )

    # 3. Convert coordinates to plain dictionaries for measurement extraction
    landmarks_dict = {
        name: coord.model_dump()
        for name, coord in request.landmarks.items()
    }

    # 4. Compute physical measurements and trait scores
    try:
        raw_measurements = compute_measurements(
            landmarks=landmarks_dict,
            pixels_per_cm=request.pixels_per_cm,
            species=request.species,
        )
        scoring_result = scoring_engine.compute_scores(
            measurements=raw_measurements,
            species=request.species,
            breed=request.breed,
        )
    except (ValueError, KeyError, TypeError) as err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(err),
        ) from err

    # 5. Extract warnings and mark recalculated measurements with source: "user_adjusted"
    warnings = raw_measurements.pop("warnings", [])
    measurements = {}
    for metric_name, metric_data in raw_measurements.items():
        if isinstance(metric_data, dict):
            measurements[metric_name] = {
                **metric_data,
                "source": "user_adjusted",
            }
        else:
            measurements[metric_name] = metric_data

    # 6. Mark recalculated trait scores with source: "user_adjusted"
    trait_scores = {}
    for trait_name, score_val in scoring_result.get("trait_scores", {}).items():
        trait_scores[trait_name] = {
            "score": score_val,
            "source": "user_adjusted",
        }

    return RecomputeResponse(
        measurements=measurements,
        trait_scores=trait_scores,
        overall_score=scoring_result["overall_score"],
        warnings=warnings,
    )
