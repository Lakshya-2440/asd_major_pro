import base64
import logging
import os
import time
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import requests
import yaml

logger = logging.getLogger(__name__)

DEFAULT_CONFIG_PATH = Path(__file__).resolve().parent.parent / "configs" / "models.yaml"

DEFAULT_SEGMENTATION_CONFIG: dict[str, Any] = {
    "model_id": "facebook/detr-resnet-50-panoptic",
    "api_url": "https://api-inference.huggingface.co/models/facebook/detr-resnet-50-panoptic",
    "timeout_seconds": 30.0,
    "max_retries": 3,
    "backoff_factor": 1.5,
    "retry_status_codes": [429, 503],
    "target_labels": [
        "cow",
        "cattle",
        "ox",
        "animal",
        "bull",
        "bovine",
        "buffalo",
        "livestock",
    ],
    "morphology": {
        "kernel_size": 7,
        "smoothing_epsilon_factor": 0.002,
    },
}


def load_segmentation_config(config_path: str | Path | None = None) -> dict[str, Any]:
    """Load segmentation configuration from models.yaml or return defaults."""
    path = Path(config_path) if config_path else DEFAULT_CONFIG_PATH
    config = DEFAULT_SEGMENTATION_CONFIG.copy()

    if path.is_file():
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f) or {}
                seg_cfg = data.get("segmentation", {})
                if isinstance(seg_cfg, dict):
                    config.update(seg_cfg)
        except (OSError, yaml.YAMLError) as e:
            logger.warning("Failed to load models config from %s: %s", path, e)

    return config


def post_process_mask(
    mask: np.ndarray,
    kernel_size: int = 7,
    smoothing_epsilon_factor: float = 0.002,
) -> np.ndarray:
    """
    Post-process binary animal mask using morphological closing and boundary smoothing.

    Args:
        mask: Raw binary or grayscale mask.
        kernel_size: Morphological closing ellipse kernel diameter to close small holes.
        smoothing_epsilon_factor: Polygon approximation factor for contour smoothing.

    Returns:
        Binary numpy uint8 array with 255 for animal and 0 for background.
    """
    if mask is None or mask.size == 0:
        return np.zeros((0, 0), dtype=np.uint8)

    # Ensure binary uint8 [0, 255]
    _, binary = cv2.threshold(mask, 127, 255, cv2.THRESH_BINARY)

    # 1. Close small internal holes with cv2.morphologyEx
    ksize = max(3, kernel_size | 1)  # Ensure odd size
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (ksize, ksize))
    closed = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)

    # 2. Extract and smooth external boundary using cv2.findContours
    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return closed

    # Isolate largest connected contour
    largest_contour = max(contours, key=cv2.contourArea)

    # Smooth contour boundary with polygon approximation
    perimeter = cv2.arcLength(largest_contour, True)
    epsilon = smoothing_epsilon_factor * perimeter
    smoothed_contour = cv2.approxPolyDP(largest_contour, epsilon, True)

    processed_mask = np.zeros_like(closed)
    cv2.drawContours(processed_mask, [smoothed_contour], -1, 255, thickness=cv2.FILLED)

    return processed_mask


def generate_mock_animal_mask(height: int = 600, width: int = 800) -> np.ndarray:
    """Generate a synthetic realistic side-view cow silhouette for local mock testing."""
    mask = np.zeros((height, width), dtype=np.uint8)

    # Main torso
    cv2.ellipse(
        mask,
        (int(width * 0.48), int(height * 0.52)),
        (int(width * 0.28), int(height * 0.18)),
        0,
        0,
        360,
        255,
        -1,
    )

    # Hindquarters and rump
    cv2.circle(mask, (int(width * 0.26), int(height * 0.48)), int(height * 0.16), 255, -1)

    # Shoulder and chest
    cv2.circle(mask, (int(width * 0.65), int(height * 0.50)), int(height * 0.16), 255, -1)

    # Neck and head
    neck_pts = np.array(
        [
            [int(width * 0.68), int(height * 0.42)],
            [int(width * 0.82), int(height * 0.28)],
            [int(width * 0.88), int(height * 0.35)],
            [int(width * 0.72), int(height * 0.58)],
        ],
        dtype=np.int32,
    )
    cv2.fillPoly(mask, [neck_pts], 255)
    cv2.ellipse(
        mask,
        (int(width * 0.84), int(height * 0.34)),
        (int(width * 0.08), int(height * 0.07)),
        20,
        0,
        360,
        255,
        -1,
    )

    # Hooves reaching ground plane (~ 86% height)
    leg_w = max(4, int(width * 0.035))
    leg_bottom = int(height * 0.86)
    cv2.rectangle(mask, (int(width * 0.22), int(height * 0.55)), (int(width * 0.22) + leg_w, leg_bottom), 255, -1)
    cv2.rectangle(mask, (int(width * 0.30), int(height * 0.55)), (int(width * 0.30) + leg_w, leg_bottom), 255, -1)
    cv2.rectangle(mask, (int(width * 0.62), int(height * 0.55)), (int(width * 0.62) + leg_w, leg_bottom), 255, -1)
    cv2.rectangle(mask, (int(width * 0.70), int(height * 0.55)), (int(width * 0.70) + leg_w, leg_bottom), 255, -1)

    return mask


def extract_animal_mask_cv(image: np.ndarray) -> np.ndarray | None:
    """
    Extract real animal foreground silhouette directly from image pixels using
    adaptive morphology, edge gradient analysis, and GrabCut segmentation.
    """
    if image is None or image.size == 0:
        return None
    h, w = image.shape[:2]
    try:
        max_dim = 640
        scale = 1.0
        if max(h, w) > max_dim:
            scale = max_dim / float(max(h, w))
            small = cv2.resize(image, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
        else:
            small = image

        sh, sw = small.shape[:2]
        mask = np.zeros((sh, sw), np.uint8)
        bgd_model = np.zeros((1, 65), np.float64)
        fgd_model = np.zeros((1, 65), np.float64)
        margin_x = max(3, int(sw * 0.05))
        margin_y = max(3, int(sh * 0.05))
        rect = (margin_x, margin_y, sw - 2 * margin_x, sh - 2 * margin_y)
        cv2.grabCut(small, mask, rect, bgd_model, fgd_model, 2, cv2.GC_INIT_WITH_RECT)
        fg_mask = np.where((mask == 2) | (mask == 0), 0, 255).astype(np.uint8)

        num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(fg_mask)
        if num_labels > 1:
            largest_label = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
            fg_mask = (labels == largest_label).astype(np.uint8) * 255

        if scale != 1.0:
            fg_mask = cv2.resize(fg_mask, (w, h), interpolation=cv2.INTER_NEAREST)

        return fg_mask
    except Exception as e:
        logger.warning("Local CV GrabCut segmentation failed: %s", e)
        return None


class HuggingFaceSegmenter:
    """Hugging Face Inference API client for animal instance and panoptic segmentation."""

    def __init__(
        self,
        token: str | None = None,
        model_id: str | None = None,
        config_path: str | Path | None = None,
        mock: bool | None = None,
        timeout: float | None = None,
        max_retries: int | None = None,
        backoff_factor: float | None = None,
    ) -> None:
        """
        Initialize segmenter with API credentials or fallback to mock mode.

        Args:
            token: Optional Hugging Face access token (defaults to HF_TOKEN env var).
            model_id: Hosted model ID on Hugging Face hub.
            config_path: Path to models.yaml configuration file.
            mock: If True, forces mock fallback mode without making network requests.
                  If None, automatically enables mock mode when HF_TOKEN is absent.
            timeout: HTTP request timeout in seconds.
            max_retries: Maximum number of retry attempts for 503 or 429 status codes.
            backoff_factor: Exponential backoff base factor in seconds.
        """
        cfg = load_segmentation_config(config_path)

        self.model_id = model_id or cfg.get("model_id", "facebook/detr-resnet-50-panoptic")
        self.api_url = cfg.get("api_url") or f"https://api-inference.huggingface.co/models/{self.model_id}"
        self.timeout_seconds = timeout or float(cfg.get("timeout_seconds", 30.0))
        self.max_retries = max_retries or int(cfg.get("max_retries", 3))
        self.backoff_factor = backoff_factor if backoff_factor is not None else float(cfg.get("backoff_factor", 1.5))
        self.retry_status_codes = list(cfg.get("retry_status_codes", [429, 503]))
        self.target_labels = [label.lower() for label in cfg.get("target_labels", ["cow", "cattle", "ox", "animal"])]

        morph_cfg = cfg.get("morphology", {})
        self.kernel_size = int(morph_cfg.get("kernel_size", 7))
        self.smoothing_epsilon_factor = float(morph_cfg.get("smoothing_epsilon_factor", 0.002))

        # Check credentials and determine mock mode
        self.token = token or os.getenv("HF_TOKEN")
        env_mock = os.getenv("MOCK_SEGMENTATION", "").lower() in ("1", "true", "yes")
        self.explicit_mock = mock is True

        if mock is True or env_mock or not self.token:
            self.is_mock = True
            logger.info("HuggingFaceSegmenter operating in mock fallback mode.")
        else:
            self.is_mock = False

        self.session = requests.Session()

    def _call_api_with_retry(self, image_bytes: bytes) -> Any:
        """Call HF Inference API with exponential backoff retry on 503 and 429 errors."""
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/octet-stream",
        }

        last_exception: Exception | None = None

        for attempt in range(1, self.max_retries + 1):
            try:
                response = self.session.post(
                    self.api_url,
                    headers=headers,
                    data=image_bytes,
                    timeout=self.timeout_seconds,
                )

                if response.status_code == 200:
                    content_type = response.headers.get("content-type", "")
                    if "application/json" in content_type:
                        return response.json()
                    return response.content

                if response.status_code in self.retry_status_codes:
                    if attempt >= self.max_retries:
                        logger.error(
                            "HF Inference API failed with %d after %d attempts",
                            response.status_code,
                            attempt,
                        )
                        response.raise_for_status()

                    wait_time = self.backoff_factor * (2 ** (attempt - 1))
                    try:
                        err_payload = response.json()
                        if isinstance(err_payload, dict) and "estimated_time" in err_payload:
                            wait_time = max(wait_time, float(err_payload["estimated_time"]))
                    except (ValueError, requests.exceptions.JSONDecodeError):
                        logger.debug("Response payload is not valid JSON.")

                    logger.warning(
                        "HF Inference API returned %d (attempt %d/%d). Retrying in %.2fs...",
                        response.status_code,
                        attempt,
                        self.max_retries,
                        wait_time,
                    )
                    time.sleep(wait_time)
                    continue

                response.raise_for_status()

            except requests.exceptions.RequestException as exc:
                last_exception = exc
                if attempt >= self.max_retries:
                    raise
                wait_time = self.backoff_factor * (2 ** (attempt - 1))
                logger.warning(
                    "HF Inference API network error: %s (attempt %d/%d). Retrying in %.2fs...",
                    exc,
                    attempt,
                    self.max_retries,
                    wait_time,
                )
                time.sleep(wait_time)

        if last_exception:
            raise last_exception
        raise RuntimeError("HF Inference API request failed after retries.")

    def _parse_api_response(
        self,
        response_data: Any,
        height: int,
        width: int,
    ) -> np.ndarray:
        """
        Parse binary mask or polygon outputs and isolate the largest target animal component.
        """
        # If response is direct raw image bytes
        if isinstance(response_data, bytes):
            nparr = np.frombuffer(response_data, np.uint8)
            decoded = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)
            if decoded is not None:
                if decoded.shape != (height, width):
                    decoded = cv2.resize(decoded, (width, height), interpolation=cv2.INTER_NEAREST)
                return decoded

        # If response is a list of detected segments/masks
        if isinstance(response_data, list):
            candidate_masks: list[np.ndarray] = []

            # 1. Filter by target labels
            target_items = [
                item
                for item in response_data
                if isinstance(item, dict)
                and any(target in item.get("label", "").lower() for target in self.target_labels)
            ]
            items_to_process = target_items if target_items else [item for item in response_data if isinstance(item, dict)]

            for item in items_to_process:
                # Case A: Base64 mask
                if "mask" in item and isinstance(item["mask"], str):
                    mask_str = item["mask"]
                    if "," in mask_str:
                        mask_str = mask_str.split(",", 1)[1]
                    try:
                        mask_bytes = base64.b64decode(mask_str)
                        nparr = np.frombuffer(mask_bytes, np.uint8)
                        decoded_mask = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)
                        if decoded_mask is not None:
                            if decoded_mask.shape != (height, width):
                                decoded_mask = cv2.resize(decoded_mask, (width, height), interpolation=cv2.INTER_NEAREST)
                            candidate_masks.append(decoded_mask)
                    except (ValueError, cv2.error) as err:
                        logger.warning("Failed to decode base64 mask: %s", err)

                # Case B: Polygon coordinates
                elif "polygon" in item or "polygons" in item:
                    poly_mask = np.zeros((height, width), dtype=np.uint8)
                    polys = item.get("polygons") or [item.get("polygon")]
                    for poly in polys:
                        if not poly:
                            continue
                        pts = np.array(poly, dtype=np.float32)
                        if pts.size >= 6:
                            # Rescale if normalized (0.0 - 1.0)
                            if np.max(pts) <= 1.0 and pts.max() > 0:
                                pts[:, 0] = pts[:, 0] * width
                                pts[:, 1] = pts[:, 1] * height
                            pts_int = pts.astype(np.int32).reshape((-1, 1, 2))
                            cv2.fillPoly(poly_mask, [pts_int], 255)
                    candidate_masks.append(poly_mask)

            if candidate_masks:
                # Select the largest connected component belonging to target animal
                best_component = np.zeros((height, width), dtype=np.uint8)
                max_area = 0

                for c_mask in candidate_masks:
                    _, binary_c = cv2.threshold(c_mask, 127, 255, cv2.THRESH_BINARY)
                    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(binary_c)
                    for label_idx in range(1, num_labels):
                        area = stats[label_idx, cv2.CC_STAT_AREA]
                        if area > max_area:
                            max_area = area
                            best_component = (labels == label_idx).astype(np.uint8) * 255

                return best_component

        # If response is a dict with mask or submasks
        if isinstance(response_data, dict) and "mask" in response_data and isinstance(response_data["mask"], str):
            return self._parse_api_response([response_data], height, width)

        logger.warning("No animal masks could be extracted from HF response. Returning empty mask.")
        return np.zeros((height, width), dtype=np.uint8)

    def segment_image(self, image: np.ndarray | bytes | bytearray) -> np.ndarray:
        """
        Obtain binary segmentation mask isolating animal from background.

        Args:
            image: Input image (BGR/RGB numpy array or raw encoded bytes).

        Returns:
            np.ndarray: Post-processed binary mask (uint8, 255 for animal, 0 for background).
        """
        # Resolve dimensions and image bytes
        if isinstance(image, (bytes, bytearray)):
            image_bytes = bytes(image)
            nparr = np.frombuffer(image_bytes, np.uint8)
            decoded = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if decoded is None:
                raise ValueError("Could not decode image bytes.")
            height, width = decoded.shape[:2]
        elif isinstance(image, np.ndarray):
            if image.size == 0:
                raise ValueError("Input image array is empty.")
            decoded = image
            height, width = image.shape[:2]
            success, buffer = cv2.imencode(".jpg", image)
            if not success:
                raise ValueError("Failed to encode image to JPEG bytes.")
            image_bytes = buffer.tobytes()
        else:
            raise TypeError(f"Unsupported image type: {type(image)}")

        # Explicit mock requested for testing
        if self.explicit_mock or self.is_mock:
            raw_mask = generate_mock_animal_mask(height, width)
            return post_process_mask(
                raw_mask,
                kernel_size=self.kernel_size,
                smoothing_epsilon_factor=self.smoothing_epsilon_factor,
            )

        # Call real Hugging Face Inference API
        api_response = self._call_api_with_retry(image_bytes)
        parsed_mask = self._parse_api_response(api_response, height, width)

        # Post-process mask
        return post_process_mask(
            parsed_mask,
            kernel_size=self.kernel_size,
            smoothing_epsilon_factor=self.smoothing_epsilon_factor,
        )

    def segment(self, image: np.ndarray | bytes | bytearray) -> np.ndarray:
        """Alias for segment_image."""
        return self.segment_image(image)

    def get_mask(self, image: np.ndarray | bytes | bytearray) -> np.ndarray:
        """Alias for segment_image."""
        return self.segment_image(image)

    def __call__(self, image: np.ndarray | bytes | bytearray) -> np.ndarray:
        """Callable wrapper for segment_image."""
        return self.segment_image(image)
