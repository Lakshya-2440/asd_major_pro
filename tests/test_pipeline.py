import io
from unittest.mock import MagicMock

import cv2
import numpy as np
import requests
from fastapi.testclient import TestClient

from src.main import app
from src.marker import get_aruco_dictionary
from src.pipeline import AnalysisPipeline, run_pipeline
from src.segmentation import HuggingFaceSegmenter, generate_mock_animal_mask

client = TestClient(app)


def create_sample_image_fixture(
    width: int = 1000,
    height: int = 750,
    include_marker: bool = True,
    marker_size: int = 120,
) -> bytes:
    """
    Generate synthetic valid image fixture with an animal silhouette
    and optional ArUco calibration marker.
    """
    # 1. Base canvas: neutral gray (brightness ~ 180, sharp, non-saturated)
    canvas = np.full((height, width, 3), 180, dtype=np.uint8)

    # 2. Add high-contrast silhouette texture in background/foreground
    raw_mask = generate_mock_animal_mask(height, width)
    # Paint animal body dark gray/black on light gray background
    canvas[raw_mask > 0] = [30, 30, 30]

    # 3. Add ArUco reference marker at top-left if requested
    if include_marker:
        aruco_dict = get_aruco_dictionary("DICT_4X4_50")
        marker = cv2.aruco.generateImageMarker(aruco_dict, 0, marker_size)
        marker_bgr = cv2.cvtColor(marker, cv2.COLOR_GRAY2BGR)
        canvas[40 : 40 + marker_size, 40 : 40 + marker_size] = marker_bgr

    # Encode to JPEG bytes
    success, buffer = cv2.imencode(".jpg", canvas, [cv2.IMWRITE_JPEG_QUALITY, 95])
    assert success, "Failed to encode sample image fixture"
    return buffer.tobytes()


def test_full_pipeline_success_with_sample_image_fixture():
    """Verify end-to-end pipeline execution from image bytes to scoring and latency breakdown."""
    image_bytes = create_sample_image_fixture(include_marker=True)
    pipeline = AnalysisPipeline()

    result = pipeline.run(
        image_bytes=image_bytes,
        species="cattle",
        breed="Gir",
        tag_id="COW-TAG-101",
    )

    # 1. Basic schema and metadata
    assert result["species"] == "cattle"
    assert result["breed"] == "Gir"
    assert result["tag_id"] == "COW-TAG-101"
    assert result["pipeline_version"] == "0.2.0"

    # 2. Quality validation & marker calibration
    assert "blurry" not in result["quality_flags"]
    assert "too_dark" not in result["quality_flags"]
    assert "too_bright" not in result["quality_flags"]
    assert "marker_missing" not in result["quality_flags"]
    assert result["pixels_per_cm"] is not None
    assert result["pixels_per_cm"] > 0

    # 3. Landmarks
    landmarks = result["landmarks"]
    expected_landmarks = [
        "withers",
        "shoulder_point",
        "hip_point",
        "pin_bone",
        "brisket",
        "front_hoof",
        "rear_hoof",
    ]
    for lm in expected_landmarks:
        assert lm in landmarks
        assert "x" in landmarks[lm]
        assert "y" in landmarks[lm]
        assert "confidence" in landmarks[lm]

    # 4. Physical measurements in cm
    measurements = result["measurements"]
    for metric in ["height_at_withers_cm", "body_length_cm", "body_depth_cm", "rump_angle_deg"]:
        assert metric in measurements
        assert isinstance(measurements[metric]["value"], (int, float))
        assert measurements[metric]["value"] > 0 or metric == "rump_angle_deg"

    assert measurements["height_at_withers_cm"]["unit"] == "cm"
    assert measurements["body_length_cm"]["unit"] == "cm"
    assert measurements["body_depth_cm"]["unit"] == "cm"

    # 5. Trait scores (1-9 linear scale) & overall score (50-100)
    trait_scores = result["trait_scores"]
    for trait in ["stature", "body_length", "body_depth", "rump_angle"]:
        assert trait in trait_scores
        assert isinstance(trait_scores[trait], int)
        assert 1 <= trait_scores[trait] <= 9

    assert isinstance(result["overall_score"], (int, float))
    assert 50.0 <= result["overall_score"] <= 100.0

    # 6. Execution timing & latency breakdown
    latencies = result["latency_ms"]
    assert "quality_check_ms" in latencies
    assert "marker_detection_ms" in latencies
    assert "segmentation_ms" in latencies
    assert "landmark_extraction_ms" in latencies
    assert "measurements_ms" in latencies
    assert "scoring_ms" in latencies
    assert "total_ms" in latencies
    assert latencies["total_ms"] >= latencies["quality_check_ms"]


def test_pipeline_unacceptable_quality_returns_early():
    """Verify that a dark or corrupt image terminates early without heavy inference."""
    dark_canvas = np.zeros((750, 1000, 3), dtype=np.uint8)
    _, buf = cv2.imencode(".jpg", dark_canvas)
    dark_bytes = buf.tobytes()

    pipeline = AnalysisPipeline()
    result = pipeline.run(dark_bytes, species="cattle", breed="Gir")

    assert "too_dark" in result["quality_flags"]
    assert result["landmarks"] == {}
    assert result["measurements"] == {}
    assert result["trait_scores"] == {}
    assert result["overall_score"] == 0.0
    assert "quality_check_ms" in result["latency_ms"]
    assert "segmentation_ms" not in result["latency_ms"]


def test_pipeline_missing_marker_uncalibrated_pixel_fallback():
    """Verify uncalibrated mode computes dimensions in pixels when ArUco marker is missing."""
    image_bytes = create_sample_image_fixture(include_marker=False)
    pipeline = AnalysisPipeline()

    result = pipeline.run(image_bytes, species="cattle", breed="Gir")

    assert "marker_missing" in result["quality_flags"]
    assert "uncalibrated" in result["quality_flags"]
    assert result["pixels_per_cm"] is None

    # Measurements exist with 'px' units for linear distances
    measurements = result["measurements"]
    assert measurements["height_at_withers_cm"]["unit"] == "px"
    assert measurements["body_length_cm"]["unit"] == "px"
    assert measurements["body_depth_cm"]["unit"] == "px"
    assert measurements["height_at_withers_cm"]["value"] > 0


def test_pipeline_hf_timeout_graceful_handling():
    """Verify HF API timeout does not crash the server and returns structured error output."""
    image_bytes = create_sample_image_fixture(include_marker=True)

    mock_segmenter = MagicMock(spec=HuggingFaceSegmenter)
    mock_segmenter.segment_image.side_effect = requests.exceptions.Timeout("HuggingFace API timeout after 30s")

    pipeline = AnalysisPipeline(segmenter=mock_segmenter)
    result = pipeline.run(image_bytes, species="cattle", breed="Gir")

    assert "segmentation_failed" in result["quality_flags"]
    assert "segmentation_timeout" in result["quality_flags"]
    assert "error" in result
    assert "timeout" in result["error"].lower()
    assert result["landmarks"] == {}
    assert result["measurements"] == {}
    assert result["overall_score"] == 0.0


def test_predict_endpoint_fastapi_integration():
    """Verify POST /predict FastAPI route end-to-end with multipart form-data."""
    image_bytes = create_sample_image_fixture(include_marker=True)
    image_stream = io.BytesIO(image_bytes)

    response = client.post(
        "/predict",
        files={"side_view": ("cow_sample.jpg", image_stream, "image/jpeg")},
        data={"species": "cattle", "breed": "Gir", "tag_id": "TAG-8822"},
    )

    assert response.status_code == 200
    data = response.json()

    assert data["species"] == "cattle"
    assert data["breed"] == "Gir"
    assert data["tag_id"] == "TAG-8822"
    assert data["pipeline_version"] == "0.2.0"
    assert data["pixels_per_cm"] is not None
    assert len(data["landmarks"]) == 7
    assert "height_at_withers_cm" in data["measurements"]
    assert "stature" in data["trait_scores"]
    assert data["overall_score"] > 0.0
    assert "total_ms" in data["latency_ms"]


def test_helper_run_pipeline_wrapper():
    """Verify module-level run_pipeline helper function."""
    image_bytes = create_sample_image_fixture(include_marker=True)
    res = run_pipeline(image_bytes, species="cattle", breed="Gir")
    assert isinstance(res, dict)
    assert res["pipeline_version"] == "0.2.0"
    assert res["overall_score"] >= 50.0
