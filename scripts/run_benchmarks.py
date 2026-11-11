#!/usr/bin/env python3
"""
Measurement Accuracy & Validation Benchmark Harness.

Runs end-to-end computer vision analysis pipeline on validation dataset,
computes Mean Absolute Error (MAE) against ground truth tape measurements,
measures expert score agreement, and validates Section 15 accuracy criteria.
"""

import argparse
import json
import logging
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from src.pipeline import AnalysisPipeline

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

DEFAULT_MANIFEST_PATH = REPO_ROOT / "data" / "validation_manifest.json"
SECTION_15_HEIGHT_TOLERANCE_CM = 3.0
SECTION_15_AGREEMENT_TARGET_PCT = 80.0


def evaluate_benchmark(
    manifest_path: str | Path | None = None,
    pipeline: AnalysisPipeline | None = None,
    height_tolerance_cm: float = SECTION_15_HEIGHT_TOLERANCE_CM,
) -> dict[str, Any]:
    """
    Evaluate validation dataset against ground truth measurements and expert scores.

    Args:
        manifest_path: Path to validation_manifest.json.
        pipeline: Optional AnalysisPipeline instance.
        height_tolerance_cm: Maximum permissible Mean Absolute Error for stature (cm).

    Returns:
        dict: Detailed benchmark results, aggregate metrics, and markdown report.
    """
    path = Path(manifest_path) if manifest_path else DEFAULT_MANIFEST_PATH
    if not path.is_file():
        raise FileNotFoundError(f"Validation manifest not found at: {path}")

    with open(path, "r", encoding="utf-8") as f:
        records: list[dict[str, Any]] = json.load(f)

    if not records:
        raise ValueError(f"Manifest at {path} contains no records.")

    pipe = pipeline or AnalysisPipeline()
    results: list[dict[str, Any]] = []

    height_errors: list[float] = []
    length_errors: list[float] = []
    score_agreements: list[bool] = []

    for idx, rec in enumerate(records, start=1):
        rel_img_path = rec["image_path"]
        img_path = REPO_ROOT / rel_img_path if not Path(rel_img_path).is_absolute() else Path(rel_img_path)

        if not img_path.is_file():
            raise FileNotFoundError(f"Validation image not found: {img_path}")

        with open(img_path, "rb") as img_f:
            image_bytes = img_f.read()

        species = rec.get("species", "cattle")
        breed = rec.get("breed", "Gir")
        tape_height = float(rec["tape_height_cm"])
        tape_length = float(rec["tape_length_cm"])
        expert_stature = int(rec["expert_stature_score"])

        output = pipe.run(
            image_bytes=image_bytes,
            species=species,
            breed=breed,
        )

        measurements = output.get("measurements", {})
        trait_scores = output.get("trait_scores", {})

        pred_height = float(measurements.get("height_at_withers_cm", {}).get("value", 0.0))
        pred_length = float(measurements.get("body_length_cm", {}).get("value", 0.0))

        stature_entry = trait_scores.get("stature", 0)
        pred_stature = stature_entry.get("score", 0) if isinstance(stature_entry, dict) else int(stature_entry)

        height_err = round(abs(pred_height - tape_height), 2)
        length_err = round(abs(pred_length - tape_length), 2)
        score_diff = abs(pred_stature - expert_stature)
        agrees = score_diff <= 1

        height_errors.append(height_err)
        length_errors.append(length_err)
        score_agreements.append(agrees)

        results.append(
            {
                "index": idx,
                "image_name": Path(rel_img_path).name,
                "species": species,
                "breed": breed,
                "tape_height_cm": tape_height,
                "pred_height_cm": pred_height,
                "height_error_cm": height_err,
                "tape_length_cm": tape_length,
                "pred_length_cm": pred_length,
                "length_error_cm": length_err,
                "expert_score": expert_stature,
                "pred_score": pred_stature,
                "score_agreement": agrees,
            }
        )

    # Compute aggregate metrics
    height_mae = round(float(sum(height_errors) / len(height_errors)), 3)
    length_mae = round(float(sum(length_errors) / len(length_errors)), 3)
    max_height_error = round(float(max(height_errors)), 3)
    max_length_error = round(float(max(length_errors)), 3)

    agreement_pct = round(float(sum(score_agreements) / len(score_agreements) * 100.0), 1)

    height_within_tolerance = height_mae <= height_tolerance_cm and max_height_error <= height_tolerance_cm
    section_15_passed = bool(height_within_tolerance and agreement_pct >= SECTION_15_AGREEMENT_TARGET_PCT)

    # Build Markdown Summary Table
    md_lines: list[str] = [
        "# Livestock ATC Validation Benchmark Report",
        "",
        "## Summary Metrics",
        "",
        "| Metric | Result | Target (PRD Sec 15) | Status |",
        "|---|---|---|---|",
        f"| **Height at Withers MAE** | {height_mae:.2f} cm | ≤ {height_tolerance_cm:.1f} cm | {'✅ PASS' if height_mae <= height_tolerance_cm else '❌ FAIL'} |",
        f"| **Height Max Error** | {max_height_error:.2f} cm | ≤ {height_tolerance_cm:.1f} cm | {'✅ PASS' if max_height_error <= height_tolerance_cm else '❌ FAIL'} |",
        f"| **Body Length MAE** | {length_mae:.2f} cm | Reference metric | ℹ️ INFO |",
        f"| **Body Length Max Error** | {max_length_error:.2f} cm | Reference metric | ℹ️ INFO |",
        f"| **Score Agreement (±1 pt)** | {agreement_pct:.1f}% | ≥ {SECTION_15_AGREEMENT_TARGET_PCT:.1f}% | {'✅ PASS' if agreement_pct >= SECTION_15_AGREEMENT_TARGET_PCT else '❌ FAIL'} |",
        f"| **Total Validation Images** | {len(records)} | N/A | ℹ️ INFO |",
        "",
        "## Sample Breakdown",
        "",
        "| Image | Species | Breed | True H (cm) | Pred H (cm) | ΔH (cm) | True L (cm) | Pred L (cm) | ΔL (cm) | True Sc | Pred Sc | Agree |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|",
    ]

    for r in results:
        agree_str = "✅" if r["score_agreement"] else "❌"
        md_lines.append(
            f"| `{r['image_name']}` | {r['species']} | {r['breed']} | "
            f"{r['tape_height_cm']:.1f} | {r['pred_height_cm']:.1f} | {r['height_error_cm']:.2f} | "
            f"{r['tape_length_cm']:.1f} | {r['pred_length_cm']:.1f} | {r['length_error_cm']:.2f} | "
            f"{r['expert_score']} | {r['pred_score']} | {agree_str} |"
        )

    md_report = "\n".join(md_lines)

    return {
        "height_mae": height_mae,
        "length_mae": length_mae,
        "max_height_error": max_height_error,
        "max_length_error": max_length_error,
        "score_agreement_pct": agreement_pct,
        "section_15_passed": section_15_passed,
        "height_within_tolerance": height_within_tolerance,
        "total_samples": len(records),
        "results": results,
        "markdown_report": md_report,
    }


def main() -> None:
    """CLI runner for validation benchmarks."""
    parser = argparse.ArgumentParser(description="Evaluate livestock linear measurement benchmarks.")
    parser.add_argument(
        "--manifest",
        type=str,
        default=str(DEFAULT_MANIFEST_PATH),
        help="Path to validation_manifest.json",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Optional path to output markdown report",
    )
    parser.add_argument(
        "--no-assert",
        action="store_true",
        help="Skip asserting Section 15 tolerance thresholds",
    )
    args = parser.parse_args()

    try:
        report = evaluate_benchmark(manifest_path=args.manifest)
    except (FileNotFoundError, ValueError, RuntimeError, json.JSONDecodeError, OSError) as exc:
        logger.error("Benchmark failed with error: %s", exc)
        sys.exit(1)

    print(report["markdown_report"])

    if args.output:
        out_path = Path(args.output)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(report["markdown_report"])
        logger.info("Saved benchmark report to %s", out_path)

    # Section 15 validation check
    if not args.no_assert:
        if not report["section_15_passed"]:
            logger.error(
                "Section 15 metrics assertion failed! Height MAE: %.2f cm (target <= %.1f cm), Agreement: %.1f%%",
                report["height_mae"],
                SECTION_15_HEIGHT_TOLERANCE_CM,
                report["score_agreement_pct"],
            )
            sys.exit(2)
        logger.info("Section 15 metrics passed successfully!")


if __name__ == "__main__":
    main()
