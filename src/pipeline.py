import logging
import math
import time
from typing import Any

import cv2
import numpy as np

from src.landmarks import LandmarkExtractor
from src.marker import detect_reference_marker
from src.measurements import _extract_coord, compute_measurements
from src.quality import ImageQualityChecker
from src.scoring import ScoringEngine
from src.segmentation import HuggingFaceSegmenter

logger = logging.getLogger(__name__)


class AnalysisPipeline:
    """
    End-to-end computer vision analysis pipeline for livestock linear scoring.

    Pipeline stages:
    1. Image Quality Validation (blur, exposure, orientation, resolution)
    2. Reference Marker Detection (ArUco scale calculation)
    3. Animal Silhouette Segmentation (HF Inference API / Mock)
    4. Anatomical Landmark Extraction
    5. Real-world or Pixel Measurement Computation
    6. Rule-based 1-9 Trait Scoring & Overall Type Evaluation
    7. Consolidated Output Formulation with Per-Step Latency Breakdown
    """

    def __init__(
        self,
        quality_checker: ImageQualityChecker | None = None,
        segmenter: HuggingFaceSegmenter | None = None,
        landmark_extractor: LandmarkExtractor | None = None,
        scoring_engine: ScoringEngine | None = None,
        pipeline_version: str = "0.2.0",
    ) -> None:
        """Initialize pipeline with components or default instances."""
        self.quality_checker = quality_checker or ImageQualityChecker()
        self.segmenter = segmenter or HuggingFaceSegmenter()
        self.landmark_extractor = landmark_extractor or LandmarkExtractor()
        self.scoring_engine = scoring_engine or ScoringEngine()
        self.pipeline_version = pipeline_version

    def _compute_uncalibrated_measurements(
        self,
        landmarks: dict[str, Any],
    ) -> dict[str, Any]:
        """Compute body dimensions in pixels when reference marker is absent."""
        try:
            _wx, wy, w_conf = _extract_coord(landmarks["withers"], "withers")
            _fhx, fhy, fh_conf = _extract_coord(landmarks["front_hoof"], "front_hoof")
            sx, sy, s_conf = _extract_coord(landmarks["shoulder_point"], "shoulder_point")
            px, py, p_conf = _extract_coord(landmarks["pin_bone"], "pin_bone")
            _bx, by, b_conf = _extract_coord(landmarks["brisket"], "brisket")
            hx, hy, h_conf = _extract_coord(landmarks["hip_point"], "hip_point")

            height_px = round(float(abs(fhy - wy)), 2)
            length_px = round(float(math.hypot(sx - px, sy - py)), 2)
            depth_px = round(float(abs(by - wy)), 2)

            dx = abs(px - hx)
            dy = py - hy
            if dx > 0:
                angle_rad = math.atan2(dy, dx)
                angle_deg = round(math.degrees(angle_rad), 2)
            else:
                angle_deg = 90.0 if dy > 0 else (-90.0 if dy < 0 else 0.0)

            return {
                "height_at_withers_cm": {
                    "value": height_px,
                    "unit": "px",
                    "confidence": round((w_conf + fh_conf) / 2.0, 3),
                },
                "body_length_cm": {
                    "value": length_px,
                    "unit": "px",
                    "confidence": round((s_conf + p_conf) / 2.0, 3),
                },
                "body_depth_cm": {
                    "value": depth_px,
                    "unit": "px",
                    "confidence": round((w_conf + b_conf) / 2.0, 3),
                },
                "rump_angle_deg": {
                    "value": angle_deg,
                    "unit": "deg",
                    "confidence": round((h_conf + p_conf) / 2.0, 3),
                },
            }
        except (ValueError, KeyError, TypeError, IndexError) as exc:
            logger.warning("Uncalibrated measurement extraction failed: %s", exc)
            return {}

    def run(
        self,
        image_bytes: bytes,
        species: str = "cattle",
        breed: str = "Gir",
        tag_id: str | None = None,
    ) -> dict[str, Any]:
        """
        Execute full inference pipeline on input image.

        Args:
            image_bytes: Encoded raw image bytes (JPEG / PNG).
            species: Animal species ('cattle' or 'buffalo').
            breed: Animal breed name (e.g. 'Gir', 'Sahiwal', 'Murrah').
            tag_id: Optional animal identification tag.

        Returns:
            dict: Consolidated output adhering to PRD Section 13 schema.
        """
        t_start = time.perf_counter()
        quality_flags: list[str] = []
        latency_breakdown: dict[str, float] = {}

        # ---------------------------------------------------------------------
        # Step 1: Image Quality Validation
        # ---------------------------------------------------------------------
        t0 = time.perf_counter()
        quality_res = self.quality_checker.check_image(image_bytes)
        t_qc = (time.perf_counter() - t0) * 1000.0
        latency_breakdown["quality_check_ms"] = round(t_qc, 2)

        quality_flags.extend(quality_res.get("flags", []))
        is_acceptable = quality_res.get("is_acceptable", True)

        if not is_acceptable:
            t_total = (time.perf_counter() - t_start) * 1000.0
            latency_breakdown["total_ms"] = round(t_total, 2)
            logger.info("Image failed quality validation: %s", quality_flags)
            return {
                "species": species,
                "breed": breed,
                "tag_id": tag_id,
                "pipeline_version": self.pipeline_version,
                "pixels_per_cm": None,
                "quality_flags": quality_flags,
                "landmarks": {},
                "measurements": {},
                "trait_scores": {},
                "overall_score": 0.0,
                "latency_ms": latency_breakdown,
                "timing_ms": latency_breakdown,
            }

        # ---------------------------------------------------------------------
        # Step 2: ArUco Reference Marker Detection
        # ---------------------------------------------------------------------
        t0 = time.perf_counter()
        nparr = np.frombuffer(image_bytes, np.uint8)
        image_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        pixels_per_cm: float | None = None
        if image_bgr is not None:
            marker_res = detect_reference_marker(image_bgr)
            if marker_res.get("found", False) and marker_res.get("pixels_per_cm"):
                pixels_per_cm = float(marker_res["pixels_per_cm"])
            else:
                if "marker_missing" not in quality_flags:
                    quality_flags.append("marker_missing")
        else:
            if "marker_missing" not in quality_flags:
                quality_flags.append("marker_missing")

        t_marker = (time.perf_counter() - t0) * 1000.0
        latency_breakdown["marker_detection_ms"] = round(t_marker, 2)

        # ---------------------------------------------------------------------
        # Step 3: Animal Segmentation (HF Inference API / Mock Fallback)
        # ---------------------------------------------------------------------
        t0 = time.perf_counter()
        mask: np.ndarray | None = None
        seg_error: str | None = None

        try:
            mask = self.segmenter.segment_image(image_bytes)
        except Exception as exc:  # noqa: BLE001
            seg_error = str(exc)
            logger.error("HuggingFace segmentation error: %s", exc)
            if "segmentation_failed" not in quality_flags:
                quality_flags.append("segmentation_failed")
            if "timeout" in seg_error.lower() and "segmentation_timeout" not in quality_flags:
                quality_flags.append("segmentation_timeout")

        t_seg = (time.perf_counter() - t0) * 1000.0
        latency_breakdown["segmentation_ms"] = round(t_seg, 2)

        if mask is None or mask.size == 0 or np.count_nonzero(mask) == 0:
            t_total = (time.perf_counter() - t_start) * 1000.0
            latency_breakdown["total_ms"] = round(t_total, 2)
            if not seg_error and "empty_mask" not in quality_flags:
                quality_flags.append("empty_mask")

            return {
                "species": species,
                "breed": breed,
                "tag_id": tag_id,
                "pipeline_version": self.pipeline_version,
                "pixels_per_cm": pixels_per_cm,
                "quality_flags": quality_flags,
                "landmarks": {},
                "measurements": {},
                "trait_scores": {},
                "overall_score": 0.0,
                "latency_ms": latency_breakdown,
                "timing_ms": latency_breakdown,
                "error": seg_error or "Animal segmentation yielded empty mask",
            }

        # ---------------------------------------------------------------------
        # Step 4: Landmark Extraction
        # ---------------------------------------------------------------------
        t0 = time.perf_counter()
        landmarks: dict[str, Any] = {}
        lm_error: str | None = None

        try:
            if hasattr(self.landmark_extractor, "extract"):
                landmarks = self.landmark_extractor.extract(mask)
            elif hasattr(self.landmark_extractor, "extract_landmarks"):
                landmarks = self.landmark_extractor.extract_landmarks(mask)
            else:
                landmarks = self.landmark_extractor(mask)
        except (ValueError, KeyError, TypeError, cv2.error) as exc:
            lm_error = str(exc)
            logger.error("Landmark extraction failed: %s", exc)
            if "landmark_extraction_failed" not in quality_flags:
                quality_flags.append("landmark_extraction_failed")

        t_lm = (time.perf_counter() - t0) * 1000.0
        latency_breakdown["landmark_extraction_ms"] = round(t_lm, 2)

        if not landmarks:
            t_total = (time.perf_counter() - t_start) * 1000.0
            latency_breakdown["total_ms"] = round(t_total, 2)
            return {
                "species": species,
                "breed": breed,
                "tag_id": tag_id,
                "pipeline_version": self.pipeline_version,
                "pixels_per_cm": pixels_per_cm,
                "quality_flags": quality_flags,
                "landmarks": {},
                "measurements": {},
                "trait_scores": {},
                "overall_score": 0.0,
                "latency_ms": latency_breakdown,
                "timing_ms": latency_breakdown,
                "error": lm_error or "Landmark extraction returned no coordinates",
            }

        # ---------------------------------------------------------------------
        # Step 5: Measurements Calculation (Calibrated in cm vs Uncalibrated in px)
        # ---------------------------------------------------------------------
        t0 = time.perf_counter()
        measurements: dict[str, Any] = {}
        warnings: list[str] = []

        if pixels_per_cm is not None and pixels_per_cm > 0:
            try:
                raw_measurements = compute_measurements(
                    landmarks=landmarks,
                    pixels_per_cm=pixels_per_cm,
                    species=species,
                )
                warnings = raw_measurements.pop("warnings", [])
                measurements = raw_measurements
            except (ValueError, KeyError, TypeError, ZeroDivisionError) as exc:
                logger.error("Measurement computation failed: %s", exc)
                if "measurements_failed" not in quality_flags:
                    quality_flags.append("measurements_failed")
                measurements = self._compute_uncalibrated_measurements(landmarks)
                if "uncalibrated" not in quality_flags:
                    quality_flags.append("uncalibrated")
        else:
            if "uncalibrated" not in quality_flags:
                quality_flags.append("uncalibrated")
            measurements = self._compute_uncalibrated_measurements(landmarks)

        t_meas = (time.perf_counter() - t0) * 1000.0
        latency_breakdown["measurements_ms"] = round(t_meas, 2)

        # ---------------------------------------------------------------------
        # Step 6: 1-9 Linear Trait Scores & Overall Type Score
        # ---------------------------------------------------------------------
        t0 = time.perf_counter()
        trait_scores: dict[str, int] = {}
        overall_score: float = 0.0

        if measurements:
            try:
                scoring_result = self.scoring_engine.compute_scores(
                    measurements=measurements,
                    species=species,
                    breed=breed,
                )
                trait_scores = scoring_result.get("trait_scores", {})
                overall_score = float(scoring_result.get("overall_score", 0.0))
            except (ValueError, KeyError, TypeError) as exc:
                logger.warning("Scoring failed: %s", exc)
                if "scoring_failed" not in quality_flags:
                    quality_flags.append("scoring_failed")

        t_score = (time.perf_counter() - t0) * 1000.0
        latency_breakdown["scoring_ms"] = round(t_score, 2)

        # ---------------------------------------------------------------------
        # Step 7: Consolidated Output Formulation
        # ---------------------------------------------------------------------
        t_total = (time.perf_counter() - t_start) * 1000.0
        latency_breakdown["total_ms"] = round(t_total, 2)

        return {
            "species": species,
            "breed": breed,
            "tag_id": tag_id,
            "pipeline_version": self.pipeline_version,
            "pixels_per_cm": pixels_per_cm,
            "quality_flags": quality_flags,
            "landmarks": landmarks,
            "measurements": measurements,
            "trait_scores": trait_scores,
            "overall_score": overall_score,
            "latency_ms": latency_breakdown,
            "timing_ms": latency_breakdown,
            "warnings": warnings,
        }

    def predict(
        self,
        image_bytes: bytes,
        species: str = "cattle",
        breed: str = "Gir",
        tag_id: str | None = None,
    ) -> dict[str, Any]:
        """Alias for run method."""
        return self.run(image_bytes=image_bytes, species=species, breed=breed, tag_id=tag_id)


def run_pipeline(
    image_bytes: bytes,
    species: str = "cattle",
    breed: str = "Gir",
    tag_id: str | None = None,
) -> dict[str, Any]:
    """Helper function executing pipeline with default singleton instance."""
    pipeline = AnalysisPipeline()
    return pipeline.run(image_bytes=image_bytes, species=species, breed=breed, tag_id=tag_id)
