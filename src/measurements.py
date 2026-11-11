import logging
import math
from typing import Any

logger = logging.getLogger(__name__)

# Biological plausibility bounds for cattle and buffalo (cm and degrees)
DEFAULT_BIOLOGICAL_RANGES: dict[str, dict[str, tuple[float, float]]] = {
    "cattle": {
        "height_at_withers_cm": (100.0, 170.0),
        "body_length_cm": (110.0, 210.0),
        "body_depth_cm": (50.0, 100.0),
        "rump_angle_deg": (-5.0, 25.0),
    },
    "buffalo": {
        "height_at_withers_cm": (110.0, 165.0),
        "body_length_cm": (115.0, 210.0),
        "body_depth_cm": (55.0, 105.0),
        "rump_angle_deg": (-5.0, 25.0),
    },
}

REQUIRED_LANDMARKS = (
    "withers",
    "front_hoof",
    "shoulder_point",
    "pin_bone",
    "brisket",
    "hip_point",
)


def _extract_coord(pt: Any, landmark_name: str) -> tuple[float, float, float]:
    """Extract (x, y, confidence) from dictionary, object, or coordinate tuple."""
    if pt is None:
        raise ValueError(f"Landmark '{landmark_name}' is None.")

    if isinstance(pt, dict):
        if "x" not in pt or "y" not in pt:
            raise ValueError(f"Landmark '{landmark_name}' missing 'x' or 'y' coordinates.")
        try:
            x = float(pt["x"])
            y = float(pt["y"])
            conf = float(pt.get("confidence", 1.0))
            return x, y, conf
        except (ValueError, TypeError) as err:
            raise ValueError(f"Invalid non-numeric coordinates for '{landmark_name}': {err}") from err

    if hasattr(pt, "x") and hasattr(pt, "y"):
        try:
            x = float(pt.x)
            y = float(pt.y)
            conf = float(getattr(pt, "confidence", 1.0))
            return x, y, conf
        except (ValueError, TypeError) as err:
            raise ValueError(f"Invalid non-numeric coordinates for '{landmark_name}': {err}") from err

    if isinstance(pt, (list, tuple)) and len(pt) >= 2:
        try:
            x = float(pt[0])
            y = float(pt[1])
            conf = float(pt[2]) if len(pt) >= 3 else 1.0
            return x, y, conf
        except (ValueError, TypeError) as err:
            raise ValueError(f"Invalid non-numeric coordinates for '{landmark_name}': {err}") from err

    raise TypeError(f"Unsupported landmark coordinate format for '{landmark_name}': {type(pt)}")


def validate_biological_ranges(
    measurements: dict[str, Any],
    species: str = "cattle",
) -> list[str]:
    """
    Validate measurement values against biological physiological ranges.

    Args:
        measurements: Dictionary of computed measurements.
        species: Animal species ('cattle' or 'buffalo').

    Returns:
        list[str]: Warning messages for any metrics falling outside norms.
    """
    norm_species = species.lower().strip()
    ranges = DEFAULT_BIOLOGICAL_RANGES.get(norm_species, DEFAULT_BIOLOGICAL_RANGES["cattle"])
    warnings: list[str] = []

    for metric_name, (min_val, max_val) in ranges.items():
        if metric_name in measurements and isinstance(measurements[metric_name], dict):
            val = measurements[metric_name].get("value")
            if val is not None and isinstance(val, (int, float)) and (val < min_val or val > max_val):
                msg = (
                    f"{metric_name} ({val:.1f}) falls outside plausible biological range "
                    f"[{min_val:.1f} - {max_val:.1f}] for {norm_species}"
                )
                warnings.append(msg)

    return warnings


def compute_measurements(
    landmarks: dict[str, Any],
    pixels_per_cm: float,
    species: str = "cattle",
) -> dict[str, Any]:
    """
    Compute physical body measurements and angles from extracted landmarks and scale factor.

    Calculations:
    - Stature (Height at withers): Vertical distance from withers to front hoof ground level in cm.
    - Body length: Euclidean distance from shoulder point to pin bone in cm.
    - Body depth: Vertical distance from dorsal spine behind withers down to brisket floor in cm.
    - Rump angle: Angle (in degrees) of line connecting hip point to pin bone relative to horizontal.

    Args:
        landmarks: Dictionary mapping landmark names to coordinates.
        pixels_per_cm: Scaling factor (pixels per centimeter).
        species: Animal species ('cattle' or 'buffalo') for physiological range checks.

    Returns:
        dict: Calculated body measurements, confidences, units, and physiological warnings.
    """
    if pixels_per_cm <= 0:
        raise ValueError(f"pixels_per_cm must be positive and non-zero, got {pixels_per_cm}")

    if not isinstance(landmarks, dict):
        raise TypeError(f"landmarks must be a dictionary, got {type(landmarks)}")

    # Check required landmark presence
    for req in REQUIRED_LANDMARKS:
        if req not in landmarks:
            raise ValueError(f"Missing required landmark: '{req}'")

    # Extract coordinates
    _wx, wy, w_conf = _extract_coord(landmarks["withers"], "withers")
    _fhx, fhy, fh_conf = _extract_coord(landmarks["front_hoof"], "front_hoof")
    sx, sy, s_conf = _extract_coord(landmarks["shoulder_point"], "shoulder_point")
    px, py, p_conf = _extract_coord(landmarks["pin_bone"], "pin_bone")
    _bx, by, b_conf = _extract_coord(landmarks["brisket"], "brisket")
    hx, hy, h_conf = _extract_coord(landmarks["hip_point"], "hip_point")

    # 1. Stature (Height at withers) in cm
    height_px = abs(fhy - wy)
    height_cm = round(height_px / pixels_per_cm, 2)
    height_conf = round((w_conf + fh_conf) / 2.0, 3)

    # 2. Body length in cm (Euclidean distance from shoulder point to pin bone)
    length_px = math.hypot(sx - px, sy - py)
    length_cm = round(length_px / pixels_per_cm, 2)
    length_conf = round((s_conf + p_conf) / 2.0, 3)

    # 3. Body depth in cm (Vertical distance from withers dorsal level down to brisket floor)
    depth_px = abs(by - wy)
    depth_cm = round(depth_px / pixels_per_cm, 2)
    depth_conf = round((w_conf + b_conf) / 2.0, 3)

    # 4. Rump angle in degrees (Slope angle connecting hip point to pin bone relative to horizontal)
    dx = abs(px - hx)
    dy = py - hy  # Positive when pin bone is lower than hip in image coordinates
    if dx > 0:
        angle_rad = math.atan2(dy, dx)
        angle_deg = round(math.degrees(angle_rad), 2)
    else:
        angle_deg = 90.0 if dy > 0 else ( -90.0 if dy < 0 else 0.0 )
    rump_conf = round((h_conf + p_conf) / 2.0, 3)

    result: dict[str, Any] = {
        "height_at_withers_cm": {
            "value": float(height_cm),
            "unit": "cm",
            "confidence": float(height_conf),
        },
        "body_length_cm": {
            "value": float(length_cm),
            "unit": "cm",
            "confidence": float(length_conf),
        },
        "body_depth_cm": {
            "value": float(depth_cm),
            "unit": "cm",
            "confidence": float(depth_conf),
        },
        "rump_angle_deg": {
            "value": float(angle_deg),
            "unit": "deg",
            "confidence": float(rump_conf),
        },
    }

    # Biological physiological range validation
    warnings = validate_biological_ranges(result, species=species)
    result["warnings"] = warnings

    # Attach individual warnings into corresponding measurement dictionaries
    norm_species = species.lower().strip()
    ranges = DEFAULT_BIOLOGICAL_RANGES.get(norm_species, DEFAULT_BIOLOGICAL_RANGES["cattle"])

    for metric_name, (min_v, max_v) in ranges.items():
        if metric_name in result:
            val = result[metric_name]["value"]
            if val < min_v or val > max_v:
                result[metric_name]["warning"] = (
                    f"Value {val:.1f} falls outside biological range [{min_v:.1f} - {max_v:.1f}]"
                )
            else:
                result[metric_name]["warning"] = None

    return result


class BodyMeasurementCalculator:
    """Class wrapper for computing animal body measurements."""

    def __init__(self, species: str = "cattle") -> None:
        self.species = species

    def compute(
        self,
        landmarks: dict[str, Any],
        pixels_per_cm: float,
        species: str | None = None,
    ) -> dict[str, Any]:
        """Compute measurements using instance or override species."""
        active_species = species or self.species
        return compute_measurements(
            landmarks=landmarks,
            pixels_per_cm=pixels_per_cm,
            species=active_species,
        )

    def __call__(
        self,
        landmarks: dict[str, Any],
        pixels_per_cm: float,
        species: str | None = None,
    ) -> dict[str, Any]:
        """Callable alias for compute."""
        return self.compute(landmarks, pixels_per_cm, species=species)
