import base64
from unittest.mock import MagicMock, patch

import cv2
import numpy as np
import pytest
import requests

from src.segmentation import (
    HuggingFaceSegmenter,
    generate_mock_animal_mask,
    load_segmentation_config,
    post_process_mask,
)


def create_base64_mask(mask: np.ndarray) -> str:
    """Encode a binary mask array to base64 PNG string."""
    success, buffer = cv2.imencode(".png", mask)
    assert success, "Failed to encode mask to PNG"
    return base64.b64encode(buffer).decode("utf-8")


def test_post_process_mask_closes_small_holes() -> None:
    """Verify morphologyEx MORPH_CLOSE fills internal small holes in the animal mask."""
    mask = np.zeros((400, 400), dtype=np.uint8)
    # Draw solid circle
    cv2.circle(mask, (200, 200), 100, 255, -1)
    # Inject small internal holes
    cv2.circle(mask, (200, 200), 5, 0, -1)
    cv2.circle(mask, (220, 220), 4, 0, -1)

    assert mask[200, 200] == 0
    assert mask[220, 220] == 0

    processed = post_process_mask(mask, kernel_size=15)

    # Internal holes must be filled
    assert processed[200, 200] == 255
    assert processed[220, 220] == 255
    assert set(np.unique(processed)).issubset({0, 255})


def test_post_process_mask_isolates_largest_component_and_smooths() -> None:
    """Verify findContours isolates largest connected component and removes noise artifacts."""
    mask = np.zeros((500, 500), dtype=np.uint8)
    # Primary animal body
    cv2.rectangle(mask, (150, 150), (350, 350), 255, -1)
    # Background noise artifact
    cv2.circle(mask, (50, 50), 10, 255, -1)

    assert mask[50, 50] == 255

    processed = post_process_mask(mask, kernel_size=5)

    # Noise artifact removed
    assert processed[50, 50] == 0
    # Main body retained
    assert processed[250, 250] == 255


def test_mock_fallback_mode_when_token_absent(monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify segmenter automatically enables mock fallback when HF_TOKEN is missing."""
    monkeypatch.delenv("HF_TOKEN", raising=False)
    monkeypatch.delenv("MOCK_SEGMENTATION", raising=False)

    segmenter = HuggingFaceSegmenter(token=None, mock=None)
    assert segmenter.is_mock is True

    test_image = np.full((600, 800, 3), 128, dtype=np.uint8)
    mask = segmenter.segment_image(test_image)

    assert isinstance(mask, np.ndarray)
    assert mask.shape == (600, 800)
    assert mask.dtype == np.uint8
    assert set(np.unique(mask)).issubset({0, 255})
    # Non-empty animal silhouette generated
    assert np.count_nonzero(mask == 255) > 10000


def test_mock_mode_with_bytes_input() -> None:
    """Verify segmenter accepts compressed image bytes and returns binary mask."""
    segmenter = HuggingFaceSegmenter(mock=True)
    raw_img = np.full((400, 600, 3), 200, dtype=np.uint8)
    _, encoded = cv2.imencode(".jpg", raw_img)

    mask = segmenter.segment_image(encoded.tobytes())
    assert mask.shape == (400, 600)
    assert np.count_nonzero(mask == 255) > 5000


def test_exponential_backoff_retry_on_503_and_429() -> None:
    """Verify retry logic handles 503 and 429 status codes with exponential backoff."""
    segmenter = HuggingFaceSegmenter(
        token="test_hf_token",
        mock=False,
        max_retries=3,
        backoff_factor=0.01,
    )

    mock_resp_503 = MagicMock()
    mock_resp_503.status_code = 503
    mock_resp_503.json.return_value = {"error": "Model is loading", "estimated_time": 0.01}

    mock_resp_429 = MagicMock()
    mock_resp_429.status_code = 429

    mock_resp_200 = MagicMock()
    mock_resp_200.status_code = 200
    mock_resp_200.headers = {"content-type": "application/json"}

    # Create dummy cow mask
    dummy_mask = np.zeros((100, 100), dtype=np.uint8)
    cv2.circle(dummy_mask, (50, 50), 30, 255, -1)
    b64_mask = create_base64_mask(dummy_mask)
    mock_resp_200.json.return_value = [{"label": "cow", "mask": b64_mask}]

    with (
        patch.object(
            segmenter.session,
            "post",
            side_effect=[mock_resp_503, mock_resp_429, mock_resp_200],
        ) as mock_post,
        patch("time.sleep") as mock_sleep,
    ):
        test_img = np.zeros((100, 100, 3), dtype=np.uint8)
        mask = segmenter.segment_image(test_img)

        assert mock_post.call_count == 3
        assert mock_sleep.call_count == 2
        assert mask.shape == (100, 100)
        assert np.count_nonzero(mask == 255) > 0


def test_retry_exhaustion_raises_http_error() -> None:
    """Verify HTTPError is raised when max retry attempts are exhausted."""
    segmenter = HuggingFaceSegmenter(
        token="test_hf_token",
        mock=False,
        max_retries=3,
        backoff_factor=0.01,
    )

    mock_resp_503 = MagicMock()
    mock_resp_503.status_code = 503
    mock_resp_503.raise_for_status.side_effect = requests.exceptions.HTTPError("503 Service Unavailable")

    with (
        patch.object(segmenter.session, "post", return_value=mock_resp_503) as mock_post,
        patch("time.sleep"),
    ):
        test_img = np.zeros((100, 100, 3), dtype=np.uint8)
        with pytest.raises(requests.exceptions.HTTPError):
            segmenter.segment_image(test_img)

        assert mock_post.call_count == 3


def test_parse_multiple_masks_selects_largest_target_animal() -> None:
    """Verify largest connected component belonging to target animal is selected."""
    segmenter = HuggingFaceSegmenter(token="dummy_token", mock=False)

    h, w = 300, 300
    # Small cow mask (radius 20)
    small_cow = np.zeros((h, w), dtype=np.uint8)
    cv2.circle(small_cow, (50, 50), 20, 255, -1)

    # Large cow mask (radius 60)
    large_cow = np.zeros((h, w), dtype=np.uint8)
    cv2.circle(large_cow, (180, 180), 60, 255, -1)

    # Irrelevant background mask (grass)
    grass = np.full((h, w), 255, dtype=np.uint8)

    api_payload = [
        {"label": "grass", "mask": create_base64_mask(grass)},
        {"label": "cow", "mask": create_base64_mask(small_cow)},
        {"label": "cattle", "mask": create_base64_mask(large_cow)},
    ]

    selected_mask = segmenter._parse_api_response(api_payload, height=h, width=w)
    processed = post_process_mask(selected_mask)

    # Small cow and grass are not in final mask
    assert processed[50, 50] == 0
    # Large cow center is present
    assert processed[180, 180] == 255


def test_parse_polygon_output() -> None:
    """Verify parsing polygon coordinates into binary mask."""
    segmenter = HuggingFaceSegmenter(token="dummy_token", mock=False)
    h, w = 200, 200

    polygon_pts = [[40, 40], [160, 40], [160, 160], [40, 160]]
    api_payload = [{"label": "ox", "polygon": polygon_pts}]

    mask = segmenter._parse_api_response(api_payload, height=h, width=w)
    processed = post_process_mask(mask)

    assert processed[100, 100] == 255
    assert processed[10, 10] == 0


def test_load_models_yaml_config() -> None:
    """Verify models.yaml configuration file is loaded successfully."""
    cfg = load_segmentation_config()
    assert cfg["model_id"] == "facebook/detr-resnet-50-panoptic"
    assert "cow" in cfg["target_labels"]
    assert cfg["max_retries"] == 3


def test_generate_mock_animal_mask_structure() -> None:
    """Verify synthetic mock mask contains expected dimensions and values."""
    mock_mask = generate_mock_animal_mask(600, 800)
    assert mock_mask.shape == (600, 800)
    assert mock_mask.dtype == np.uint8
    assert set(np.unique(mock_mask)) == {0, 255}
