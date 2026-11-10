import cv2
import numpy as np
import pytest

from src.landmarks import (
    LandmarkExtractor,
    compute_point_confidence,
    detect_animal_orientation,
    extract_landmarks,
)
from src.segmentation import generate_mock_animal_mask


def test_detect_orientation_right_facing() -> None:
    """Verify right-facing synthetic cow silhouette is detected as right-facing."""
    mask = generate_mock_animal_mask(600, 800)
    orientation = detect_animal_orientation(mask)
    assert orientation == "right-facing"


def test_detect_orientation_left_facing() -> None:
    """Verify horizontally flipped cow silhouette is detected as left-facing."""
    mask_right = generate_mock_animal_mask(600, 800)
    mask_left = cv2.flip(mask_right, 1)
    orientation = detect_animal_orientation(mask_left)
    assert orientation == "left-facing"


def test_extract_landmarks_output_structure_and_types() -> None:
    """Verify extracted landmarks match required dictionary schema and types."""
    mask = generate_mock_animal_mask(600, 800)
    landmarks = extract_landmarks(mask)

    expected_keys = {
        "withers",
        "shoulder_point",
        "hip_point",
        "pin_bone",
        "brisket",
        "front_hoof",
        "rear_hoof",
    }
    assert set(landmarks.keys()) == expected_keys

    for key, pt in landmarks.items():
        assert isinstance(pt["x"], int), f"{key}['x'] is not int"
        assert isinstance(pt["y"], int), f"{key}['y'] is not int"
        assert isinstance(pt["confidence"], float), f"{key}['confidence'] is not float"
        assert 0.0 <= pt["confidence"] <= 1.0, f"{key}['confidence'] out of range [0, 1]"


def test_extract_landmarks_right_facing_geometric_relationships() -> None:
    """Verify spatial relationships for right-facing animal."""
    mask = generate_mock_animal_mask(600, 800)
    lm = extract_landmarks(mask, orientation="right-facing")

    # Longitudinal order: pin_bone < hip_point < withers < shoulder_point
    assert lm["pin_bone"]["x"] < lm["hip_point"]["x"]
    assert lm["hip_point"]["x"] < lm["withers"]["x"]
    assert lm["withers"]["x"] < lm["shoulder_point"]["x"]

    # Legs order: rear hoof is behind front hoof
    assert lm["rear_hoof"]["x"] < lm["front_hoof"]["x"]

    # Vertical order: withers (top) < brisket < hooves (ground)
    assert lm["withers"]["y"] < lm["brisket"]["y"]
    assert lm["brisket"]["y"] < lm["front_hoof"]["y"]
    assert lm["hip_point"]["y"] < lm["rear_hoof"]["y"]


def test_extract_landmarks_left_facing_geometric_relationships() -> None:
    """Verify spatial relationships for left-facing animal."""
    mask_right = generate_mock_animal_mask(600, 800)
    mask_left = cv2.flip(mask_right, 1)
    lm = extract_landmarks(mask_left, orientation="left-facing")

    # Longitudinal order: shoulder_point < withers < hip_point < pin_bone
    assert lm["shoulder_point"]["x"] < lm["withers"]["x"]
    assert lm["withers"]["x"] < lm["hip_point"]["x"]
    assert lm["hip_point"]["x"] < lm["pin_bone"]["x"]

    # Legs order: front hoof is forward of rear hoof
    assert lm["front_hoof"]["x"] < lm["rear_hoof"]["x"]

    # Vertical order: withers (top) < brisket < hooves (ground)
    assert lm["withers"]["y"] < lm["brisket"]["y"]
    assert lm["brisket"]["y"] < lm["front_hoof"]["y"]
    assert lm["hip_point"]["y"] < lm["rear_hoof"]["y"]


def test_auto_detect_orientation_when_unspecified() -> None:
    """Verify automatic orientation detection works seamlessly when orientation=None."""
    mask_right = generate_mock_animal_mask(600, 800)
    mask_left = cv2.flip(mask_right, 1)

    lm_r = extract_landmarks(mask_right, orientation=None)
    lm_l = extract_landmarks(mask_left, orientation=None)

    assert lm_r["pin_bone"]["x"] < lm_r["shoulder_point"]["x"]
    assert lm_l["shoulder_point"]["x"] < lm_l["pin_bone"]["x"]


def test_compute_point_confidence() -> None:
    """Verify curvature-based confidence calculation returns bounded float score."""
    mask = generate_mock_animal_mask(600, 800)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    cnt = max(contours, key=cv2.contourArea).reshape(-1, 2)

    # Sharp apex point (bottom of hoof)
    conf_hoof = compute_point_confidence([496, 516], cnt)
    assert isinstance(conf_hoof, float)
    assert 0.70 <= conf_hoof <= 1.0


def test_empty_mask_raises_value_error() -> None:
    """Verify ValueError is raised on empty or all-black mask."""
    empty_mask = np.zeros((400, 400), dtype=np.uint8)
    with pytest.raises(ValueError, match="empty or contains no foreground"):
        extract_landmarks(empty_mask)


def test_landmark_extractor_class_wrapper() -> None:
    """Verify LandmarkExtractor class wrapper provides identical results."""
    mask = generate_mock_animal_mask(600, 800)
    extractor = LandmarkExtractor()

    assert extractor.detect_orientation(mask) == "right-facing"

    lm1 = extractor.extract_landmarks(mask)
    lm2 = extractor(mask)

    assert lm1 == lm2
    assert "withers" in lm1

