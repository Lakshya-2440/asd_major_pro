from pathlib import Path

import pytest
import yaml

from src.scoring import ScoringEngine, score_measurements


def make_sample_gir_measurements() -> dict[str, dict[str, float]]:
    """Sample measurements matching prompt example for Gir cattle."""
    return {
        "height_at_withers_cm": {"value": 142.0, "confidence": 0.95},
        "body_length_cm": {"value": 153.0, "confidence": 0.90},
        "body_depth_cm": {"value": 80.0, "confidence": 0.92},
        "rump_angle_deg": {"value": 8.0, "confidence": 0.91},
    }


def test_deterministic_scoring_matching_prompt_example() -> None:
    """Verify scoring engine produces exact expected scores and overall score."""
    engine = ScoringEngine()
    measurements = make_sample_gir_measurements()

    result = engine.compute_scores(measurements, species="cattle", breed="Gir")

    assert result["trait_scores"] == {
        "stature": 7,
        "body_length": 6,
        "body_depth": 7,
        "rump_angle": 5,
    }
    assert result["overall_score"] == 82.5
    assert result["scoring_version"] == "1.0.0"


def test_boundary_minimum_scores() -> None:
    """Verify extreme minimum boundary values yield scores of 1 and overall score of 50.0."""
    engine = ScoringEngine()
    min_measurements = {
        "stature": 100.0,
        "body_length": 110.0,
        "body_depth": 50.0,
        "rump_angle": -2.0,
    }

    result = engine.compute_scores(min_measurements, species="cattle", breed="Gir")

    assert result["trait_scores"] == {
        "stature": 1,
        "body_length": 1,
        "body_depth": 1,
        "rump_angle": 1,
    }
    assert result["overall_score"] == 50.0


def test_boundary_maximum_scores() -> None:
    """Verify extreme maximum boundary values yield scores of 9 and overall score of 100.0."""
    engine = ScoringEngine()
    max_measurements = {
        "stature": 160.0,
        "body_length": 180.0,
        "body_depth": 95.0,
        "rump_angle": 20.0,
    }

    result = engine.compute_scores(max_measurements, species="cattle", breed="Gir")

    assert result["trait_scores"] == {
        "stature": 9,
        "body_length": 9,
        "body_depth": 9,
        "rump_angle": 9,
    }
    assert result["overall_score"] == 100.0


def test_boundary_median_scores() -> None:
    """Verify midpoint values produce intermediate scores around 5 and overall score of 75.0."""
    engine = ScoringEngine()
    median_measurements = {
        "stature": 132.0,
        "body_length": 148.0,
        "body_depth": 72.0,
        "rump_angle": 8.0,
    }

    result = engine.compute_scores(median_measurements, species="cattle", breed="Gir")

    assert result["trait_scores"] == {
        "stature": 5,
        "body_length": 5,
        "body_depth": 5,
        "rump_angle": 5,
    }
    assert result["overall_score"] == 75.0


def test_sahiwal_breed_scoring() -> None:
    """Verify scoring works accurately for Sahiwal cattle breed."""
    engine = ScoringEngine()
    sahiwal_measurements = {
        "stature": 130.0,  # index 4 -> 5
        "body_length": 144.0,  # index 4 -> 5
        "body_depth": 70.0,  # index 4 -> 5
        "rump_angle": 8.0,  # index 4 -> 5
    }

    result = engine.compute_scores(sahiwal_measurements, species="cattle", breed="Sahiwal")
    assert result["trait_scores"] == {
        "stature": 5,
        "body_length": 5,
        "body_depth": 5,
        "rump_angle": 5,
    }
    assert result["overall_score"] == 75.0


def test_murrah_buffalo_scoring() -> None:
    """Verify scoring works accurately for Murrah buffalo breed."""
    engine = ScoringEngine()
    murrah_measurements = {
        "stature": 140.0,  # index 4 -> 5
        "body_length": 155.0,  # index 4 -> 5
        "body_depth": 80.0,  # index 4 -> 5
        "rump_angle": 8.0,  # index 4 -> 5
    }

    result = engine.compute_scores(murrah_measurements, species="buffalo", breed="Murrah")
    assert result["trait_scores"] == {
        "stature": 5,
        "body_length": 5,
        "body_depth": 5,
        "rump_angle": 5,
    }
    assert result["overall_score"] == 75.0


def test_unsupported_species_raises_value_error() -> None:
    """Verify error is raised when species is not supported."""
    engine = ScoringEngine()
    measurements = make_sample_gir_measurements()

    with pytest.raises(ValueError, match="Unsupported species: 'horse'"):
        engine.compute_scores(measurements, species="horse", breed="Gir")


def test_unsupported_breed_raises_value_error() -> None:
    """Verify error is raised when breed is not supported for the species."""
    engine = ScoringEngine()
    measurements = make_sample_gir_measurements()

    with pytest.raises(ValueError, match="Unsupported breed 'Jersey' for species 'cattle'"):
        engine.compute_scores(measurements, species="cattle", breed="Jersey")


def test_custom_config_override(tmp_path: Path) -> None:
    """Verify scoring rules can be configured via a custom YAML file."""
    custom_yaml = tmp_path / "custom_scoring.yaml"
    custom_yaml.write_text(
        yaml.dump(
            {
                "scoring_version": "2.0.0",
                "scale": {"min_score": 0.0, "max_score": 100.0},
                "cattle": {
                    "weights": {
                        "stature": 0.25,
                        "body_length": 0.25,
                        "body_depth": 0.25,
                        "rump_angle": 0.25,
                    },
                    "breeds": {
                        "gir": {
                            "stature": [100.0, 110.0, 120.0, 130.0, 140.0, 150.0, 160.0, 170.0, 180.0],
                            "body_length": [100.0, 110.0, 120.0, 130.0, 140.0, 150.0, 160.0, 170.0, 180.0],
                            "body_depth": [50.0, 55.0, 60.0, 65.0, 70.0, 75.0, 80.0, 85.0, 90.0],
                            "rump_angle": [0.0, 2.0, 4.0, 6.0, 8.0, 10.0, 12.0, 14.0, 16.0],
                        }
                    },
                },
            }
        ),
        encoding="utf-8",
    )

    custom_engine = ScoringEngine(config_path=custom_yaml)
    assert custom_engine.version == "2.0.0"
    res = custom_engine.compute_scores(
        {
            "stature": 140.0,  # score 5
            "body_length": 140.0,  # score 5
            "body_depth": 70.0,  # score 5
            "rump_angle": 8.0,  # score 5
        },
        species="cattle",
        breed="Gir",
    )
    assert res["trait_scores"]["stature"] == 5
    # With min_score: 0.0, score 5 maps to (5-1)/8 * 100 = 50.0
    assert res["overall_score"] == 50.0


def test_helper_function_score_measurements() -> None:
    """Verify standalone helper score_measurements produces identical result."""
    measurements = make_sample_gir_measurements()
    res = score_measurements(measurements, species="cattle", breed="Gir")
    assert res["trait_scores"]["stature"] == 7
    assert res["overall_score"] == 82.5

