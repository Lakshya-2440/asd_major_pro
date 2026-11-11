import logging
from pathlib import Path
from typing import Any

import numpy as np
import yaml

logger = logging.getLogger(__name__)

DEFAULT_CONFIG_PATH = Path(__file__).resolve().parent.parent / "configs" / "scoring_rules.yaml"

TRAIT_ALIASES: dict[str, list[str]] = {
    "stature": ["stature", "height_at_withers_cm", "height", "stature_cm"],
    "body_length": ["body_length", "body_length_cm", "length", "length_cm"],
    "body_depth": ["body_depth", "body_depth_cm", "depth", "depth_cm"],
    "rump_angle": ["rump_angle", "rump_angle_deg", "angle", "rump_slope_deg"],
}

DEFAULT_RULES: dict[str, Any] = {
    "scoring_version": "1.0.0",
    "scale": {
        "min_score": 50.0,
        "max_score": 100.0,
    },
    "cattle": {
        "weights": {
            "stature": 0.25,
            "body_length": 0.20,
            "body_depth": 0.25,
            "rump_angle": 0.30,
        },
        "breeds": {
            "gir": {
                "stature": [112.0, 117.0, 122.0, 127.0, 132.0, 137.0, 142.0, 147.0, 152.0],
                "body_length": [128.0, 133.0, 138.0, 143.0, 148.0, 153.0, 158.0, 163.0, 168.0],
                "body_depth": [56.0, 60.0, 64.0, 68.0, 72.0, 76.0, 80.0, 84.0, 88.0],
                "rump_angle": [0.0, 2.0, 4.0, 6.0, 8.0, 10.0, 12.0, 14.0, 16.0],
            },
            "sahiwal": {
                "stature": [110.0, 115.0, 120.0, 125.0, 130.0, 135.0, 140.0, 145.0, 150.0],
                "body_length": [124.0, 129.0, 134.0, 139.0, 144.0, 149.0, 154.0, 159.0, 164.0],
                "body_depth": [54.0, 58.0, 62.0, 66.0, 70.0, 74.0, 78.0, 82.0, 86.0],
                "rump_angle": [0.0, 2.0, 4.0, 6.0, 8.0, 10.0, 12.0, 14.0, 16.0],
            },
        },
    },
    "buffalo": {
        "weights": {
            "stature": 0.25,
            "body_length": 0.20,
            "body_depth": 0.25,
            "rump_angle": 0.30,
        },
        "breeds": {
            "murrah": {
                "stature": [120.0, 125.0, 130.0, 135.0, 140.0, 145.0, 150.0, 155.0, 160.0],
                "body_length": [135.0, 140.0, 145.0, 150.0, 155.0, 160.0, 165.0, 170.0, 175.0],
                "body_depth": [60.0, 65.0, 70.0, 75.0, 80.0, 85.0, 90.0, 95.0, 100.0],
                "rump_angle": [0.0, 2.0, 4.0, 6.0, 8.0, 10.0, 12.0, 14.0, 16.0],
            },
        },
    },
}


def load_scoring_rules(config_path: str | Path | None = None) -> dict[str, Any]:
    """Load scoring rules configuration from YAML or return defaults."""
    path = Path(config_path) if config_path else DEFAULT_CONFIG_PATH
    rules = DEFAULT_RULES.copy()

    if path.is_file():
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f) or {}
                if isinstance(data, dict):
                    rules.update(data)
        except (OSError, yaml.YAMLError) as err:
            logger.warning("Failed to load scoring rules from %s: %s", path, err)

    return rules


def map_measurement_to_score(val: float, thresholds: list[float] | tuple[float, ...]) -> int:
    """
    Map continuous measurement value to integer score (1-9) using piecewise linear interpolation.

    Args:
        val: Continuous measurement value in centimeters or degrees.
        thresholds: Ordered thresholds (8 bin boundaries or 9 calibration points).

    Returns:
        int: Score clamped between 1 and 9.
    """
    if len(thresholds) == 8:
        # 8 cutoffs: < b0 -> 1, [b0, b1) -> 2, ..., >= b7 -> 9
        score = 1
        for b in thresholds:
            if val >= b:
                score += 1
            else:
                break
        return int(np.clip(score, 1, 9))

    if len(thresholds) == 9:
        # 9 calibration points: evaluate piecewise linear interpolation
        scores = list(range(1, 10))
        interpolated = float(np.interp(val, thresholds, scores))
        return int(np.clip(round(interpolated), 1, 9))

    raise ValueError(f"Thresholds must contain 8 or 9 elements, got {len(thresholds)}")


def extract_trait_value(measurements: dict[str, Any], trait_name: str) -> float:
    """Extract numeric value for a given linear trait from measurements dictionary."""
    candidates = TRAIT_ALIASES.get(trait_name, [trait_name])
    for alias in candidates:
        if alias in measurements:
            item = measurements[alias]
            if isinstance(item, dict) and "value" in item:
                return float(item["value"])
            if hasattr(item, "value"):
                return float(item.value)
            if isinstance(item, (int, float)):
                return float(item)

    raise ValueError(f"Missing measurement for trait '{trait_name}'. Checked keys: {candidates}")


class ScoringEngine:
    """Rule-based 1-9 linear trait scoring engine and overall type classifier."""

    def __init__(
        self,
        config_path: str | Path | None = None,
        rules: dict[str, Any] | None = None,
    ) -> None:
        """Initialize scoring engine with configuration file or dictionary rules."""
        if rules:
            self.rules = rules
        else:
            self.rules = load_scoring_rules(config_path)

        self.version = str(self.rules.get("scoring_version", "1.0.0"))
        scale_cfg = self.rules.get("scale", {})
        self.min_score = float(scale_cfg.get("min_score", 50.0))
        self.max_score = float(scale_cfg.get("max_score", 100.0))

    def compute_scores(
        self,
        measurements: dict[str, Any],
        species: str,
        breed: str,
    ) -> dict[str, Any]:
        """
        Compute 1-9 linear trait scores and overall composite type score.

        Args:
            measurements: Dictionary of body measurements.
            species: Animal species ('cattle' or 'buffalo').
            breed: Animal breed name (e.g. 'Gir', 'Sahiwal', 'Murrah').

        Returns:
            dict: Structured trait scores, overall score, and version:
                  {
                    "trait_scores": {"stature": int, ...},
                    "overall_score": float,
                    "scoring_version": str
                  }
        """
        norm_species = species.lower().strip()
        norm_breed = breed.lower().strip()

        # Check supported species
        species_keys = [k for k in self.rules if k not in ("scoring_version", "scale")]
        if norm_species not in self.rules or not isinstance(self.rules[norm_species], dict):
            raise ValueError(
                f"Unsupported species: '{species}'. Supported species: {species_keys}"
            )

        species_cfg = self.rules[norm_species]
        breeds_cfg = species_cfg.get("breeds", {})

        # Check supported breed
        if norm_breed not in breeds_cfg:
            available_breeds = list(breeds_cfg.keys())
            raise ValueError(
                f"Unsupported breed '{breed}' for species '{species}'. Supported breeds: {available_breeds}"
            )

        breed_thresholds = breeds_cfg[norm_breed]
        weights = species_cfg.get("weights", {})

        trait_scores: dict[str, int] = {}
        weighted_sum = 0.0
        total_weight = 0.0

        for trait in ["stature", "body_length", "body_depth", "rump_angle"]:
            if trait not in breed_thresholds:
                raise ValueError(f"Missing scoring criteria for trait '{trait}' in breed '{breed}'")

            val = extract_trait_value(measurements, trait)
            score = map_measurement_to_score(val, breed_thresholds[trait])
            trait_scores[trait] = score

            w = float(weights.get(trait, 0.25))
            weighted_sum += score * w
            total_weight += w

        weighted_avg = weighted_sum / total_weight if total_weight > 0 else 5.0

        # Map weighted average (1-9 scale) to composite scale (min_score - max_score)
        norm_factor = (weighted_avg - 1.0) / 8.0
        overall = self.min_score + norm_factor * (self.max_score - self.min_score)

        return {
            "trait_scores": trait_scores,
            "overall_score": round(float(overall), 1),
            "scoring_version": self.version,
        }

    def score(
        self,
        measurements: dict[str, Any],
        species: str,
        breed: str,
    ) -> dict[str, Any]:
        """Alias for compute_scores."""
        return self.compute_scores(measurements, species=species, breed=breed)

    def __call__(
        self,
        measurements: dict[str, Any],
        species: str,
        breed: str,
    ) -> dict[str, Any]:
        """Callable alias for compute_scores."""
        return self.compute_scores(measurements, species=species, breed=breed)


def score_measurements(
    measurements: dict[str, Any],
    species: str,
    breed: str,
    config_path: str | Path | None = None,
) -> dict[str, Any]:
    """Helper function to score measurements with a default engine instance."""
    engine = ScoringEngine(config_path=config_path)
    return engine.compute_scores(measurements, species=species, breed=breed)

