import logging
from pathlib import Path
from typing import Any, Optional, Union

import cv2
import numpy as np
import yaml

logger = logging.getLogger(__name__)

DEFAULT_CONFIG_PATH = Path(__file__).resolve().parent.parent / "configs" / "quality_config.yaml"

DEFAULT_THRESHOLDS: dict[str, Any] = {
    "blur_threshold": 100.0,
    "min_brightness": 40.0,
    "max_brightness": 220.0,
    "saturation_threshold": 250,
    "max_saturation_ratio": 0.15,
    "min_width": 800,
    "min_height": 600,
    "require_landscape": True,
}


class ImageQualityChecker:
    """Automated image quality validation using OpenCV."""

    def __init__(
        self,
        config_path: Optional[Union[str, Path]] = None,
        config: Optional[dict[str, Any]] = None,
    ) -> None:
        """Initialize thresholds from YAML configuration file and/or dictionary overrides."""
        self.thresholds: dict[str, Any] = DEFAULT_THRESHOLDS.copy()

        # Load from config file if available
        path_to_load = Path(config_path) if config_path else DEFAULT_CONFIG_PATH
        if path_to_load.is_file():
            try:
                with open(path_to_load, "r", encoding="utf-8") as f:
                    file_data = yaml.safe_load(f) or {}
                    self._merge_config(file_data)
            except Exception as e:
                logger.warning("Failed to load quality config from %s: %s", path_to_load, e)

        # Apply direct config dictionary overrides if supplied
        if config:
            self._merge_config(config)

    def _merge_config(self, cfg: dict[str, Any]) -> None:
        """Parse and merge flat or nested config mappings into active thresholds."""
        if not isinstance(cfg, dict):
            return

        # Blur settings
        blur_cfg = cfg.get("blur")
        if isinstance(blur_cfg, dict) and "threshold" in blur_cfg:
            self.thresholds["blur_threshold"] = float(blur_cfg["threshold"])
        elif "blur_threshold" in cfg:
            self.thresholds["blur_threshold"] = float(cfg["blur_threshold"])

        # Lighting settings
        lighting_cfg = cfg.get("lighting")
        if isinstance(lighting_cfg, dict):
            if "min_brightness" in lighting_cfg:
                self.thresholds["min_brightness"] = float(lighting_cfg["min_brightness"])
            if "max_brightness" in lighting_cfg:
                self.thresholds["max_brightness"] = float(lighting_cfg["max_brightness"])
            if "saturation_threshold" in lighting_cfg:
                self.thresholds["saturation_threshold"] = int(lighting_cfg["saturation_threshold"])
            if "max_saturation_ratio" in lighting_cfg:
                self.thresholds["max_saturation_ratio"] = float(lighting_cfg["max_saturation_ratio"])

        if "min_brightness" in cfg:
            self.thresholds["min_brightness"] = float(cfg["min_brightness"])
        if "max_brightness" in cfg:
            self.thresholds["max_brightness"] = float(cfg["max_brightness"])
        if "saturation_threshold" in cfg:
            self.thresholds["saturation_threshold"] = int(cfg["saturation_threshold"])
        if "max_saturation_ratio" in cfg:
            self.thresholds["max_saturation_ratio"] = float(cfg["max_saturation_ratio"])

        # Resolution and orientation settings
        res_cfg = cfg.get("resolution")
        if isinstance(res_cfg, dict):
            if "min_width" in res_cfg:
                self.thresholds["min_width"] = int(res_cfg["min_width"])
            if "min_height" in res_cfg:
                self.thresholds["min_height"] = int(res_cfg["min_height"])
            if "require_landscape" in res_cfg:
                self.thresholds["require_landscape"] = bool(res_cfg["require_landscape"])

        if "min_width" in cfg:
            self.thresholds["min_width"] = int(cfg["min_width"])
        if "min_height" in cfg:
            self.thresholds["min_height"] = int(cfg["min_height"])
        if "require_landscape" in cfg:
            self.thresholds["require_landscape"] = bool(cfg["require_landscape"])

    def check_image(self, image_bytes: Union[bytes, bytearray, np.ndarray]) -> dict[str, Any]:
        """
        Validate quality metrics of an input image.

        Args:
            image_bytes: Raw encoded image bytes or decoded numpy ndarray image.

        Returns:
            Dict containing is_acceptable (bool), flags (list[str]), and metrics (dict).
        """
        image: Optional[np.ndarray] = None

        if isinstance(image_bytes, np.ndarray):
            image = image_bytes
        elif isinstance(image_bytes, (bytes, bytearray)):
            if len(image_bytes) == 0:
                return {
                    "is_acceptable": False,
                    "flags": ["invalid_image"],
                    "metrics": {
                        "laplacian_var": 0.0,
                        "mean_brightness": 0.0,
                        "dimensions": [0, 0],
                    },
                }
            nparr = np.frombuffer(image_bytes, np.uint8)
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        else:
            return {
                "is_acceptable": False,
                "flags": ["invalid_image"],
                "metrics": {
                    "laplacian_var": 0.0,
                    "mean_brightness": 0.0,
                    "dimensions": [0, 0],
                },
            }

        if image is None or image.size == 0:
            return {
                "is_acceptable": False,
                "flags": ["invalid_image"],
                "metrics": {
                    "laplacian_var": 0.0,
                    "mean_brightness": 0.0,
                    "dimensions": [0, 0],
                },
            }

        # Resolve grayscale and dimensions
        if len(image.shape) == 2:
            height, width = image.shape
            gray = image
        elif len(image.shape) == 3:
            height, width = image.shape[:2]
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            return {
                "is_acceptable": False,
                "flags": ["invalid_image"],
                "metrics": {
                    "laplacian_var": 0.0,
                    "mean_brightness": 0.0,
                    "dimensions": [0, 0],
                },
            }

        # 1. Blur detection via Laplacian variance
        laplacian = cv2.Laplacian(gray, cv2.CV_64F)
        laplacian_var = float(laplacian.var())

        # 2. Lighting calculation (mean luminance & pixel saturation)
        mean_brightness = float(np.mean(gray))
        sat_threshold = self.thresholds["saturation_threshold"]
        saturated_pixels_ratio = float(np.count_nonzero(gray > sat_threshold) / gray.size)

        # 3. Dimensions [width, height]
        dimensions = [int(width), int(height)]

        flags: list[str] = []

        # Check blur
        if laplacian_var < self.thresholds["blur_threshold"]:
            flags.append("blurry")

        # Check under-exposure
        if mean_brightness < self.thresholds["min_brightness"]:
            flags.append("too_dark")

        # Check over-exposure
        if (
            mean_brightness > self.thresholds["max_brightness"]
            or saturated_pixels_ratio > self.thresholds["max_saturation_ratio"]
        ):
            flags.append("too_bright")

        # Check resolution & orientation
        if self.thresholds["require_landscape"] and width <= height:
            flags.append("wrong_orientation")

        if width < self.thresholds["min_width"] or height < self.thresholds["min_height"]:
            flags.append("low_resolution")

        is_acceptable = len(flags) == 0

        return {
            "is_acceptable": is_acceptable,
            "flags": flags,
            "metrics": {
                "laplacian_var": laplacian_var,
                "mean_brightness": mean_brightness,
                "dimensions": dimensions,
            },
        }
