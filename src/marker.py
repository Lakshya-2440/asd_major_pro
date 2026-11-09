import logging
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import yaml

logger = logging.getLogger(__name__)

DEFAULT_CONFIG_PATH = Path(__file__).resolve().parent.parent / "configs" / "marker_config.yaml"
DEFAULT_DICTIONARY_NAME = "DICT_4X4_50"
DEFAULT_MARKER_REAL_SIZE_CM = 10.0
DEFAULT_MIN_AREA_RATIO = 0.0005  # 0.05% of frame area

SUPPORTED_DICTIONARIES: dict[str, int] = {
    "DICT_4X4_50": cv2.aruco.DICT_4X4_50,
    "DICT_4X4_100": cv2.aruco.DICT_4X4_100,
    "DICT_4X4_250": cv2.aruco.DICT_4X4_250,
    "DICT_4X4_1000": cv2.aruco.DICT_4X4_1000,
    "DICT_5X5_50": cv2.aruco.DICT_5X5_50,
    "DICT_5X5_100": cv2.aruco.DICT_5X5_100,
    "DICT_5X5_250": cv2.aruco.DICT_5X5_250,
    "DICT_5X5_1000": cv2.aruco.DICT_5X5_1000,
    "DICT_6X6_50": cv2.aruco.DICT_6X6_50,
    "DICT_6X6_100": cv2.aruco.DICT_6X6_100,
    "DICT_6X6_250": cv2.aruco.DICT_6X6_250,
    "DICT_6X6_1000": cv2.aruco.DICT_6X6_1000,
    "DICT_7X7_50": cv2.aruco.DICT_7X7_50,
    "DICT_7X7_100": cv2.aruco.DICT_7X7_100,
    "DICT_7X7_250": cv2.aruco.DICT_7X7_250,
    "DICT_7X7_1000": cv2.aruco.DICT_7X7_1000,
    "DICT_ARUCO_ORIGINAL": cv2.aruco.DICT_ARUCO_ORIGINAL,
}


def load_marker_config(config_path: str | Path | None = None) -> dict[str, Any]:
    """Load default marker detection configuration from YAML file."""
    path = Path(config_path) if config_path else DEFAULT_CONFIG_PATH
    config: dict[str, Any] = {
        "dictionary": DEFAULT_DICTIONARY_NAME,
        "marker_real_size_cm": DEFAULT_MARKER_REAL_SIZE_CM,
        "min_area_ratio": DEFAULT_MIN_AREA_RATIO,
        "primary_id": None,
    }
    if path.is_file():
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f) or {}
                for key in ["dictionary", "marker_real_size_cm", "min_area_ratio", "primary_id"]:
                    if key in data and data[key] is not None:
                        config[key] = data[key]
        except (OSError, yaml.YAMLError) as e:
            logger.warning("Failed to load marker config from %s: %s", path, e)
    return config


def get_aruco_dictionary(
    dict_spec: int | str | cv2.aruco.Dictionary,
) -> cv2.aruco.Dictionary:
    """Resolve ArUco dictionary instance from name string, integer ID, or Dictionary object."""
    if isinstance(dict_spec, cv2.aruco.Dictionary):
        return dict_spec

    if isinstance(dict_spec, str):
        clean_name = dict_spec.strip().upper()
        if not clean_name.startswith("DICT_"):
            clean_name = f"DICT_{clean_name}"
        if clean_name in SUPPORTED_DICTIONARIES:
            dict_id = SUPPORTED_DICTIONARIES[clean_name]
            return cv2.aruco.getPredefinedDictionary(dict_id)
        raise ValueError(
            f"Unsupported ArUco dictionary: '{dict_spec}'. "
            f"Supported options: {list(SUPPORTED_DICTIONARIES.keys())}"
        )

    if isinstance(dict_spec, (int, np.integer)):
        return cv2.aruco.getPredefinedDictionary(int(dict_spec))

    raise TypeError(f"Invalid dictionary specification type: {type(dict_spec)}")


def detect_reference_marker(
    image: np.ndarray | bytes | bytearray,
    marker_real_size_cm: float | None = None,
    dictionary: int | str | cv2.aruco.Dictionary | None = None,
    primary_id: int | None = None,
    min_area_ratio: float | None = None,
    config_path: str | Path | None = None,
) -> dict[str, Any]:
    """
    Detect ArUco reference marker and calculate real-world pixel-to-centimeter scale.

    Args:
        image: Input image (BGR, Grayscale, or encoded bytes).
        marker_real_size_cm: Real-world physical edge length of marker in cm.
        dictionary: ArUco dictionary (e.g. cv2.aruco.DICT_4X4_50 or 'DICT_5X5_100').
        primary_id: Target marker ID if multiple markers detected.
        min_area_ratio: Minimum marker area ratio relative to frame (< 0.05% rejected).
        config_path: Optional path to YAML configuration file.

    Returns:
        dict: Success returns found, pixels_per_cm, corners, confidence, bbox, center.
              Failure returns found=False, pixels_per_cm=None, error message.
    """
    cfg = load_marker_config(config_path)

    active_dict = dictionary if dictionary is not None else cfg["dictionary"]
    active_size_cm = marker_real_size_cm if marker_real_size_cm is not None else cfg["marker_real_size_cm"]
    active_min_area_ratio = min_area_ratio if min_area_ratio is not None else cfg["min_area_ratio"]
    active_primary_id = primary_id if primary_id is not None else cfg["primary_id"]

    if active_size_cm <= 0:
        raise ValueError(f"marker_real_size_cm must be positive, got {active_size_cm}")

    # Decode bytes if needed
    if isinstance(image, (bytes, bytearray)):
        if len(image) == 0:
            return {"found": False, "pixels_per_cm": None, "error": "Invalid image: empty bytes"}
        nparr = np.frombuffer(image, np.uint8)
        decoded = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if decoded is None:
            return {"found": False, "pixels_per_cm": None, "error": "Invalid image: decoding failed"}
        image = decoded

    if not isinstance(image, np.ndarray) or image.size == 0:
        return {"found": False, "pixels_per_cm": None, "error": "Invalid image: must be non-empty numpy array"}

    # Convert to grayscale
    if len(image.shape) == 3 and image.shape[2] == 4:
        gray = cv2.cvtColor(image, cv2.COLOR_BGRA2GRAY)
    elif len(image.shape) == 3 and image.shape[2] == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    elif len(image.shape) == 2:
        gray = image
    else:
        return {"found": False, "pixels_per_cm": None, "error": "Invalid image shape"}

    frame_area = float(gray.shape[0] * gray.shape[1])
    if frame_area <= 0:
        return {"found": False, "pixels_per_cm": None, "error": "Invalid frame dimensions"}

    aruco_dict = get_aruco_dictionary(active_dict)
    detector_params = cv2.aruco.DetectorParameters()

    # Detect markers using modern ArucoDetector if available
    if hasattr(cv2.aruco, "ArucoDetector"):
        detector = cv2.aruco.ArucoDetector(aruco_dict, detector_params)
        corners, ids, _ = detector.detectMarkers(gray)
    else:
        corners, ids, _ = cv2.aruco.detectMarkers(gray, aruco_dict, parameters=detector_params)

    if ids is None or len(corners) == 0:
        return {
            "found": False,
            "pixels_per_cm": None,
            "error": "Reference marker not detected",
        }

    # Filter detected markers by area threshold (< 0.05% of frame rejected)
    valid_candidates: list[dict[str, Any]] = []
    for i, marker_id in enumerate(ids.flatten()):
        c = corners[i].reshape(4, 2)
        marker_area = float(cv2.contourArea(c.astype(np.float32)))
        if marker_area >= active_min_area_ratio * frame_area:
            valid_candidates.append({
                "index": i,
                "id": int(marker_id),
                "area": marker_area,
                "corners": c,
            })

    if not valid_candidates:
        return {
            "found": False,
            "pixels_per_cm": None,
            "error": "Reference marker not detected: marker area too small (< 0.05% of frame)",
        }

    # Pick primary by ID: prefer exact primary_id if present, else lowest ID
    if active_primary_id is not None:
        matches = [m for m in valid_candidates if m["id"] == active_primary_id]
        selected = matches[0] if matches else min(valid_candidates, key=lambda m: m["id"])
    else:
        selected = min(valid_candidates, key=lambda m: m["id"])

    c = selected["corners"]

    # Compute perimeter and mean edge length across all 4 edges
    e0 = float(np.linalg.norm(c[1] - c[0]))
    e1 = float(np.linalg.norm(c[2] - c[1]))
    e2 = float(np.linalg.norm(c[3] - c[2]))
    e3 = float(np.linalg.norm(c[0] - c[3]))

    perimeter = e0 + e1 + e2 + e3
    edge_length_px = perimeter / 4.0

    # Calculate pixels per cm
    pixels_per_cm = float(edge_length_px / active_size_cm)

    # Compute bounding box and center coordinate
    bx, by, bw, bh = cv2.boundingRect(c.astype(np.float32))
    bbox = [float(bx), float(by), float(bw), float(bh)]
    center = [float(np.mean(c[:, 0])), float(np.mean(c[:, 1]))]
    corners_list = [[float(pt[0]), float(pt[1])] for pt in c]

    return {
        "found": True,
        "pixels_per_cm": pixels_per_cm,
        "corners": corners_list,
        "confidence": 1.0,
        "bbox": bbox,
        "center": center,
        "marker_id": selected["id"],
        "perimeter": float(perimeter),
        "edge_length_px": float(edge_length_px),
    }


class ArucoMarkerDetector:
    """Class wrapper for reference marker detection with persistent configuration."""

    def __init__(
        self,
        marker_real_size_cm: float = 10.0,
        dictionary: int | str | cv2.aruco.Dictionary = DEFAULT_DICTIONARY_NAME,
        primary_id: int | None = None,
        min_area_ratio: float = DEFAULT_MIN_AREA_RATIO,
        config_path: str | Path | None = None,
    ) -> None:
        self.marker_real_size_cm = marker_real_size_cm
        self.dictionary = dictionary
        self.primary_id = primary_id
        self.min_area_ratio = min_area_ratio
        self.config_path = config_path

    def detect(
        self,
        image: np.ndarray | bytes | bytearray,
        marker_real_size_cm: float | None = None,
    ) -> dict[str, Any]:
        """Detect marker in image using instance configuration."""
        size_cm = marker_real_size_cm if marker_real_size_cm is not None else self.marker_real_size_cm
        return detect_reference_marker(
            image=image,
            marker_real_size_cm=size_cm,
            dictionary=self.dictionary,
            primary_id=self.primary_id,
            min_area_ratio=self.min_area_ratio,
            config_path=self.config_path,
        )
