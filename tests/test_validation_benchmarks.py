import json
from pathlib import Path

import pytest

from scripts.run_benchmarks import (
    DEFAULT_MANIFEST_PATH,
    SECTION_15_HEIGHT_TOLERANCE_CM,
    evaluate_benchmark,
)


def test_validation_manifest_schema_and_integrity():
    """Verify that data/validation_manifest.json exists and strictly satisfies schema."""
    assert DEFAULT_MANIFEST_PATH.is_file(), f"Manifest file missing at {DEFAULT_MANIFEST_PATH}"

    with open(DEFAULT_MANIFEST_PATH, "r", encoding="utf-8") as f:
        records = json.load(f)

    assert isinstance(records, list), "Manifest must be a JSON array of records"
    assert len(records) >= 3, "Manifest should have at least 3 validation test images"

    required_keys = {
        "image_path",
        "species",
        "breed",
        "tape_height_cm",
        "tape_length_cm",
        "expert_stature_score",
    }

    for record in records:
        missing = required_keys - set(record.keys())
        assert not missing, f"Manifest record missing required keys: {missing}"

        assert isinstance(record["image_path"], str)
        assert isinstance(record["species"], str)
        assert isinstance(record["breed"], str)
        assert isinstance(record["tape_height_cm"], (int, float))
        assert isinstance(record["tape_length_cm"], (int, float))
        assert isinstance(record["expert_stature_score"], int)
        assert 1 <= record["expert_stature_score"] <= 9

        # Ensure image file actually exists on disk
        img_path = Path(__file__).resolve().parent.parent / record["image_path"]
        assert img_path.is_file(), f"Image path '{record['image_path']}' does not exist on disk"


def test_validation_benchmarks_section_15_accuracy_metrics():
    """
    Assert PRD Section 15 accuracy targets:
    - Height at withers MAE within 3 cm tolerance on test set.
    - Expert score agreement (within 1 score point) >= 80%.
    """
    report = evaluate_benchmark(manifest_path=DEFAULT_MANIFEST_PATH)

    # 1. Height at withers error targets
    assert report["height_mae"] <= SECTION_15_HEIGHT_TOLERANCE_CM, (
        f"Height MAE {report['height_mae']} exceeds Section 15 threshold {SECTION_15_HEIGHT_TOLERANCE_CM} cm"
    )
    assert report["max_height_error"] <= SECTION_15_HEIGHT_TOLERANCE_CM, (
        f"Max height error {report['max_height_error']} exceeds {SECTION_15_HEIGHT_TOLERANCE_CM} cm"
    )

    # 2. Score agreement target (PRD Section 15 target: within 1 point on >= 80% of samples)
    assert report["score_agreement_pct"] >= 80.0, (
        f"Score agreement {report['score_agreement_pct']}% is below target 80.0%"
    )

    # 3. Overall pass flag
    assert report["section_15_passed"] is True
    assert report["height_within_tolerance"] is True
    assert report["total_samples"] >= 3


def test_validation_benchmark_markdown_output_format():
    """Verify that benchmark report generates a complete markdown table with metrics."""
    report = evaluate_benchmark(manifest_path=DEFAULT_MANIFEST_PATH)
    md = report["markdown_report"]

    assert "# Livestock ATC Validation Benchmark Report" in md
    assert "## Summary Metrics" in md
    assert "Height at Withers MAE" in md
    assert "Body Length MAE" in md
    assert "Score Agreement (±1 pt)" in md
    assert "## Sample Breakdown" in md
    assert "cow_gir_01.jpg" in md


def test_missing_manifest_raises_file_not_found_error(tmp_path: Path):
    """Verify error raised when pointing to non-existent manifest file."""
    non_existent = tmp_path / "missing_manifest.json"
    with pytest.raises(FileNotFoundError):
        evaluate_benchmark(manifest_path=non_existent)


def test_empty_manifest_raises_value_error(tmp_path: Path):
    """Verify ValueError raised when manifest file is empty."""
    empty_manifest = tmp_path / "empty.json"
    empty_manifest.write_text("[]", encoding="utf-8")
    with pytest.raises(ValueError, match="contains no records"):
        evaluate_benchmark(manifest_path=empty_manifest)
