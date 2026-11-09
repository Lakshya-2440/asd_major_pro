from pathlib import Path

import cv2
import numpy as np
import pytest
import yaml

from src.marker import (
    ArucoMarkerDetector,
    detect_reference_marker,
    get_aruco_dictionary,
)


def create_synthetic_marker_image(
    canvas_width: int = 800,
    canvas_height: int = 600,
    marker_size: int = 200,
    marker_id: int = 0,
    dict_name: str = "DICT_4X4_50",
    pos_x: int = 300,
    pos_y: int = 200,
) -> np.ndarray:
    """Generate white canvas with ArUco marker pasted at specified coordinates."""
    canvas = np.full((canvas_height, canvas_width, 3), 255, dtype=np.uint8)
    aruco_dict = get_aruco_dictionary(dict_name)
    marker = cv2.aruco.generateImageMarker(aruco_dict, marker_id, marker_size)
    marker_bgr = cv2.cvtColor(marker, cv2.COLOR_GRAY2BGR)
    canvas[pos_y : pos_y + marker_size, pos_x : pos_x + marker_size] = marker_bgr
    return canvas


def test_synthetic_marker_scale_calculation() -> None:
    """Verify synthetic 200px marker on 800x600 canvas computes exact scale factor."""
    # 200px marker has pixel width 199 (from x to x+199)
    marker_size = 200
    real_size_cm = 10.0
    img = create_synthetic_marker_image(
        canvas_width=800,
        canvas_height=600,
        marker_size=marker_size,
        marker_id=0,
        pos_x=300,
        pos_y=200,
    )

    result = detect_reference_marker(img, marker_real_size_cm=real_size_cm)

    assert result["found"] is True
    assert result["confidence"] == 1.0
    assert result["marker_id"] == 0

    # Corners should be around (300, 200) to (499, 399)
    # Expected edge length ~199.0 px -> pixels_per_cm ~ 19.9
    expected_edge_px = marker_size - 1
    expected_scale = expected_edge_px / real_size_cm
    assert result["pixels_per_cm"] == pytest.approx(expected_scale, abs=0.5)

    assert len(result["corners"]) == 4
    # Center should be approximately at (399.5, 299.5)
    assert result["center"][0] == pytest.approx(399.5, abs=1.0)
    assert result["center"][1] == pytest.approx(299.5, abs=1.0)

    # Bounding box [x, y, w, h]
    bbox = result["bbox"]
    assert bbox[0] == pytest.approx(300, abs=1.0)
    assert bbox[1] == pytest.approx(200, abs=1.0)
    assert bbox[2] == pytest.approx(200, abs=1.0)
    assert bbox[3] == pytest.approx(200, abs=1.0)


def test_marker_not_detected_on_blank_image() -> None:
    """Verify clean rejection when no reference marker is present in image."""
    blank_canvas = np.full((600, 800, 3), 255, dtype=np.uint8)

    result = detect_reference_marker(blank_canvas)

    assert result["found"] is False
    assert result["pixels_per_cm"] is None
    assert result["error"] == "Reference marker not detected"


def test_multiple_markers_primary_by_id() -> None:
    """Verify primary marker selection by ID when multiple markers are present."""
    canvas = np.full((600, 800, 3), 255, dtype=np.uint8)
    aruco_dict = get_aruco_dictionary("DICT_4X4_50")

    # Paste marker ID 5 at (100, 100)
    marker5 = cv2.aruco.generateImageMarker(aruco_dict, 5, 150)
    canvas[100:250, 100:250] = cv2.cvtColor(marker5, cv2.COLOR_GRAY2BGR)

    # Paste marker ID 2 at (400, 100)
    marker2 = cv2.aruco.generateImageMarker(aruco_dict, 2, 150)
    canvas[100:250, 400:550] = cv2.cvtColor(marker2, cv2.COLOR_GRAY2BGR)

    # Without explicit primary_id: picks lowest ID (ID 2)
    default_res = detect_reference_marker(canvas)
    assert default_res["found"] is True
    assert default_res["marker_id"] == 2

    # With explicit primary_id=5: picks ID 5
    selected_res = detect_reference_marker(canvas, primary_id=5)
    assert selected_res["found"] is True
    assert selected_res["marker_id"] == 5


def test_warped_perspective_marker_scale() -> None:
    """Verify mean edge length calculation under perspective distortion."""
    canvas = np.full((600, 800, 3), 255, dtype=np.uint8)
    aruco_dict = get_aruco_dictionary("DICT_4X4_50")
    marker = cv2.aruco.generateImageMarker(aruco_dict, 0, 200)
    canvas[100:300, 100:300] = cv2.cvtColor(marker, cv2.COLOR_GRAY2BGR)

    # Warp marker perspective
    pts1 = np.float32([[100, 100], [300, 100], [300, 300], [100, 300]])
    pts2 = np.float32([[120, 110], [280, 95], [290, 305], [95, 290]])
    matrix = cv2.getPerspectiveTransform(pts1, pts2)
    warped = cv2.warpPerspective(canvas, matrix, (800, 600), borderValue=(255, 255, 255))

    result = detect_reference_marker(warped, marker_real_size_cm=10.0)

    assert result["found"] is True
    assert result["pixels_per_cm"] > 0
    # Perimeter / 4 / 10 should equal pixels_per_cm
    assert result["pixels_per_cm"] == pytest.approx(result["perimeter"] / 40.0, rel=1e-3)


def test_small_marker_area_rejected() -> None:
    """Verify marker smaller than 0.05% of frame area is rejected."""
    # 1000x1000 canvas = 1,000,000 pixels. 0.05% = 500 pixels.
    # 15x15 marker has area ~225 pixels (< 500 pixels).
    canvas = np.full((1000, 1000, 3), 255, dtype=np.uint8)
    aruco_dict = get_aruco_dictionary("DICT_4X4_50")
    tiny_marker = cv2.aruco.generateImageMarker(aruco_dict, 0, 15)
    canvas[100:115, 100:115] = cv2.cvtColor(tiny_marker, cv2.COLOR_GRAY2BGR)

    result = detect_reference_marker(canvas, min_area_ratio=0.0005)

    assert result["found"] is False
    assert result["pixels_per_cm"] is None
    assert "area too small" in result["error"]


def test_dict_5x5_100_support() -> None:
    """Verify configurable dictionary supports DICT_5X5_100."""
    canvas = np.full((600, 800, 3), 255, dtype=np.uint8)
    aruco_dict = get_aruco_dictionary("DICT_5X5_100")
    marker = cv2.aruco.generateImageMarker(aruco_dict, 42, 180)
    canvas[150:330, 200:380] = cv2.cvtColor(marker, cv2.COLOR_GRAY2BGR)

    result = detect_reference_marker(canvas, dictionary="DICT_5X5_100")

    assert result["found"] is True
    assert result["marker_id"] == 42
    assert result["pixels_per_cm"] > 0


def test_configurable_via_yaml(tmp_path: Path) -> None:
    """Verify thresholds and settings load from YAML configuration file."""
    config_file = tmp_path / "test_marker_cfg.yaml"
    config_file.write_text(
        yaml.dump(
            {
                "dictionary": "DICT_4X4_50",
                "marker_real_size_cm": 5.0,
                "min_area_ratio": 0.001,
            }
        ),
        encoding="utf-8",
    )

    img = create_synthetic_marker_image(marker_size=200, marker_id=0)
    result = detect_reference_marker(img, config_path=config_file)

    assert result["found"] is True
    # With 5.0 cm, pixels_per_cm will be ~199 / 5.0 = 39.8
    assert result["pixels_per_cm"] == pytest.approx(39.8, abs=1.0)


def test_invalid_marker_size_raises_value_error() -> None:
    """Verify non-positive marker physical size raises ValueError."""
    canvas = np.full((100, 100, 3), 255, dtype=np.uint8)
    with pytest.raises(ValueError, match="must be positive"):
        detect_reference_marker(canvas, marker_real_size_cm=0.0)


def test_invalid_image_input() -> None:
    """Verify invalid image input returns clean error without crashing."""
    result = detect_reference_marker(np.array([]))
    assert result["found"] is False
    assert result["pixels_per_cm"] is None


def test_aruco_detector_class_wrapper() -> None:
    """Verify ArucoMarkerDetector object provides identical detection behavior."""
    detector = ArucoMarkerDetector(marker_real_size_cm=10.0, dictionary="DICT_4X4_50")
    img = create_synthetic_marker_image(marker_size=200, marker_id=0)

    result = detector.detect(img)
    assert result["found"] is True
    assert result["marker_id"] == 0
    assert result["pixels_per_cm"] == pytest.approx(19.9, abs=0.5)

