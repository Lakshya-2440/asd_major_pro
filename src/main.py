from typing import Optional
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from src.schemas import HealthResponse, PredictResponse

app = FastAPI(
    title="Auto-ATC Analysis Service",
    description="Computer vision and scoring microservice for cattle & buffalo ATC evaluation",
    version="0.2.0",
)

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
    side_view: UploadFile = File(..., description="Side view image of animal with ArUco marker"),
    species: str = Form("cattle", description="Animal species: cattle or buffalo"),
    breed: str = Form("Gir", description="Animal breed name"),
    tag_id: Optional[str] = Form(None, description="Animal Tag ID"),
) -> PredictResponse:
    """
    Predict landmarks, real-world measurements, and 1-9 linear trait scores.
    Currently returns structured dummy payload (scaffold phase).
    """
    _ = await side_view.read()  # Read stream to simulate receipt
    return PredictResponse(
        species=species,
        breed=breed,
        pipeline_version="0.2.0",
        quality_flags=[],
        landmarks={},
        measurements={},
        trait_scores={},
        overall_score=0.0,
    )
