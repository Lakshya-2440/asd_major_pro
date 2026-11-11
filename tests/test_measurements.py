import math
from typing import NamedTuple

import pytest

from src.measurements import (
    BodyMeasurementCalculator,
    compute_measurements,
    validate_biological_ranges,
)


class Point(NamedTuple):
    x: float
    y: float
    confidence: float = 1.0


def make_standard_synthetic_landmarks() -> dict[str, dict[str, float]]:
    """Generate realistic synthetic landmark coordinates for testing."""
    return {
        "withers": {"x": 400.0, "y": 100.0, "confidence": 0.95},
        "front_hoof": {"x": 400.0, "y": 380.0, "confidence": 0.95},
        "shoulder_point": {"x": 550.0, "y": 150.0, "confidence": 0.90},
        "pin_bone": {"x": 250.0, "y": 190.0, "confidence": 0.90},
        "brisket": {"x": 410.0, "y": 250.0, "confidence": 0.92},
        "hip_point": {"x": 310.0, "y": 180.0, "confidence": 0.92},
    }


def test_compute_measurements_exact_mathematical_values() -> None:
    """Verify exact formula calculations for height, body length, depth, and rump angle."""
    landmarks = make_standard_synthetic_landmarks()
    pixels_per_cm = 2.0

    res = compute_measurements(landmarks, pixels_per_cm=pixels_per_cm, species="cattle")

    # 1. Height at withers: |380 - 100| / 2.0 = 280 / 2 = 140.0 cm
    expected_height = 140.0
    assert res["height_at_withers_cm"]["value"] == expected_height
    assert res["height_at_withers_cm"]["unit"] == "cm"
    assert res["height_at_withers_cm"]["confidence"] == pytest.approx(0.95, abs=0.01)

    # 2. Body length: sqrt((550 - 250)^2 + (150 - 190)^2) / 2.0 = sqrt(300^2 + 40^2) / 2 = 302.655 / 2 = 151.33 cm
    expected_length = round(math.hypot(300, -40) / 2.0, 2)
    assert res["body_length_cm"]["value"] == expected_length
    assert res["body_length_cm"]["unit"] == "cm"
    assert res["body_length_cm"]["confidence"] == pytest.approx(0.90, abs=0.01)

    # 3. Body depth: |250 - 100| / 2.0 = 150 / 2 = 75.0 cm
    expected_depth = 75.0
    assert res["body_depth_cm"]["value"] == expected_depth
    assert res["body_depth_cm"]["unit"] == "cm"
    assert res["body_depth_cm"]["confidence"] == pytest.approx(0.935, abs=0.01)

    # 4. Rump angle: dx = |250 - 310| = 60, dy = 190 - 180 = 10 -> atan2(10, 60) ~ 9.46 deg
    expected_angle = round(math.degrees(math.atan2(10, 60)), 2)
    assert res["rump_angle_deg"]["value"] == expected_angle
    assert res["rump_angle_deg"]["unit"] == "deg"
    assert res["rump_angle_deg"]["confidence"] == pytest.approx(0.91, abs=0.01)

    # Within standard biological norms -> no warnings
    assert res["warnings"] == []
    assert res["height_at_withers_cm"]["warning"] is None


def test_biological_boundary_warnings_flagged() -> None:
    """Verify warnings are raised when measurements fall outside plausible biological ranges."""
    landmarks = make_standard_synthetic_landmarks()
    # At 4.0 pixels per cm, height becomes 280 / 4.0 = 70.0 cm (< 100 cm biological minimum)
    pixels_per_cm = 4.0

    res = compute_measurements(landmarks, pixels_per_cm=pixels_per_cm, species="cattle")

    assert res["height_at_withers_cm"]["value"] == 70.0
    assert len(res["warnings"]) > 0
    assert any("height_at_withers_cm" in w for w in res["warnings"])
    assert res["height_at_withers_cm"]["warning"] is not None


def test_support_object_and_tuple_landmarks() -> None:
    """Verify landmarks provided as objects or tuples are parsed correctly."""
    landmarks = {
        "withers": Point(x=400, y=100, confidence=0.9),
        "front_hoof": Point(x=400, y=380, confidence=0.9),
        "shoulder_point": (550, 150, 0.85),
        "pin_bone": (250, 190, 0.85),
        "brisket": Point(x=410, y=250, confidence=0.88),
        "hip_point": (310, 180),
    }

    res = compute_measurements(landmarks, pixels_per_cm=2.0)
    assert res["height_at_withers_cm"]["value"] == 140.0
    assert res["body_depth_cm"]["value"] == 75.0


def test_buffalo_species_ranges() -> None:
    """Verify buffalo biological ranges are evaluated appropriately."""
    measurements = {
        "height_at_withers_cm": {"value": 105.0},  # Buffalo min is 110.0 cm
        "body_length_cm": {"value": 150.0},
    }
    warnings = validate_biological_ranges(measurements, species="buffalo")
    assert len(warnings) == 1
    assert "height_at_withers_cm" in warnings[0]


def test_invalid_pixels_per_cm_raises_value_error() -> None:
    """Verify non-positive scaling factor raises ValueError."""
    landmarks = make_standard_synthetic_landmarks()
    with pytest.raises(ValueError, match="pixels_per_cm must be positive"):
        compute_measurements(landmarks, pixels_per_cm=0.0)

    with pytest.raises(ValueError, match="pixels_per_cm must be positive"):
        compute_measurements(landmarks, pixels_per_cm=-2.5)


def test_missing_landmark_raises_value_error() -> None:
    """Verify missing required anatomical landmarks raise ValueError."""
    landmarks = make_standard_synthetic_landmarks()
    del landmarks["pin_bone"]

    with pytest.raises(ValueError, match="Missing required landmark: 'pin_bone'"):
        compute_measurements(landmarks, pixels_per_cm=2.0)


def test_invalid_coordinates_raises_value_error() -> None:
    """Verify non-numeric landmark coordinates raise ValueError."""
    landmarks = make_standard_synthetic_landmarks()
    landmarks["withers"] = {"x": "not_a_number", "y": 100}

    with pytest.raises(ValueError, match="Invalid non-numeric coordinates"):
        compute_measurements(landmarks, pixels_per_cm=2.0)


def test_calculator_class_wrapper() -> None:
    """Verify BodyMeasurementCalculator class wrapper produces identical outputs."""
    landmarks = make_standard_synthetic_landmarks()
    calculator = BodyMeasurementCalculator(species="cattle")

    res1 = calculator.compute(landmarks, pixels_per_cm=2.0)
    res2 = calculator(landmarks, pixels_per_cm=2.0)

    assert res1 == res2
    assert res1["height_at_withers_cm"]["value"] == 140.0

