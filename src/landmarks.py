import logging
from typing import Any

import cv2
import numpy as np

logger = logging.getLogger(__name__)


def detect_animal_orientation(mask: np.ndarray) -> str:
    """
    Determine whether animal is left-facing or right-facing by analyzing
    horizontal centroid bias vs bounding box center and upper taper.

    Args:
        mask: Binary mask of animal silhouette.

    Returns:
        str: 'left-facing' or 'right-facing'.
    """
    if mask is None or mask.size == 0 or np.count_nonzero(mask) == 0:
        return "right-facing"

    moments = cv2.moments(mask)
    if moments["m00"] == 0:
        return "right-facing"

    cx = moments["m10"] / moments["m00"]

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return "right-facing"

    cnt = max(contours, key=cv2.contourArea)
    bx, _by, bw, bh = cv2.boundingRect(cnt)
    if bw <= 0 or bh <= 0:
        return "right-facing"

    bx_center = bx + bw / 2.0

    # Heavy rear pelvic mass pulls centroid cx away from head
    centroid_bias = cx - bx_center  # negative if rear is on left (head on right)

    # Upper taper / vertical profile: head/snout has narrower vertical span than bulky rear
    strip_w = max(5, int(bw * 0.12))
    left_strip = mask[:, bx : bx + strip_w]
    right_strip = mask[:, bx + bw - strip_w : bx + bw]

    left_span = (np.max(np.where(left_strip)[0]) - np.min(np.where(left_strip)[0])) if np.any(left_strip) else 0
    right_span = (np.max(np.where(right_strip)[0]) - np.min(np.where(right_strip)[0])) if np.any(right_strip) else 0

    score = 0.0
    if centroid_bias < 0:
        score += 1.0  # Head is on right
    else:
        score -= 1.0  # Head is on left

    if right_span < left_span:
        score += 1.0  # Right side is tapered (head on right)
    elif left_span < right_span:
        score -= 1.0  # Left side is tapered (head on left)

    return "right-facing" if score >= 0 else "left-facing"


def compute_point_confidence(
    pt: tuple[int, int] | list[int] | np.ndarray,
    contour_pts: np.ndarray,
    k: int = 7,
) -> float:
    """
    Compute confidence score based on local contour curvature and smoothness.

    Args:
        pt: Landmark coordinate (x, y).
        contour_pts: Nx2 array of points along external boundary contour.
        k: Window size of neighboring contour points.

    Returns:
        float: Confidence score in range [0.70, 0.99].
    """
    if contour_pts is None or len(contour_pts) < 3:
        return 0.85

    p_arr = np.array(pt, dtype=np.float32).reshape(2)
    dists = np.linalg.norm(contour_pts - p_arr, axis=1)
    idx = int(np.argmin(dists))
    n = len(contour_pts)

    p_prev = contour_pts[(idx - k) % n]
    p_curr = contour_pts[idx]
    p_next = contour_pts[(idx + k) % n]

    v1 = p_prev - p_curr
    v2 = p_next - p_curr
    n1 = float(np.linalg.norm(v1))
    n2 = float(np.linalg.norm(v2))

    if n1 == 0 or n2 == 0:
        return 0.85

    cos_theta = np.dot(v1, v2) / (n1 * n2)
    cos_theta = np.clip(cos_theta, -1.0, 1.0)
    theta = np.arccos(cos_theta)

    # Sharpness: prominent apex features (hooves, pin bone) have lower theta
    sharpness = float(1.0 - (theta / np.pi))
    confidence = 0.80 + 0.18 * sharpness
    return float(round(confidence, 3))


def extract_landmarks(
    mask: np.ndarray,
    orientation: str | None = None,
) -> dict[str, dict[str, Any]]:
    """
    Extract side-view anatomical landmarks from an animal binary segmentation mask.

    Args:
        mask: Binary mask array (uint8, 255 for animal, 0 for background).
        orientation: Optional explicit animal side orientation ('left-facing' or 'right-facing').
                     If None, automatically detected.

    Returns:
        dict: Anatomical landmarks dictionary with x, y, confidence for:
              withers, shoulder_point, hip_point, pin_bone, brisket, front_hoof, rear_hoof.
    """
    if mask is None or mask.size == 0 or np.count_nonzero(mask) == 0:
        raise ValueError("Input mask is empty or contains no foreground object.")

    # Ensure binary uint8
    _, binary = cv2.threshold(mask, 127, 255, cv2.THRESH_BINARY)

    # Isolate primary contour
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not contours:
        raise ValueError("No contours found in segmentation mask.")

    cnt = max(contours, key=cv2.contourArea)
    pts = cnt.reshape(-1, 2)
    bx, by, bw, bh = cv2.boundingRect(cnt)

    if bw <= 0 or bh <= 0:
        raise ValueError("Invalid contour bounding box dimensions.")

    # Resolve orientation
    if orientation:
        clean_orient = orientation.strip().lower()
        active_orient = "left-facing" if "left" in clean_orient else "right-facing"
    else:
        active_orient = detect_animal_orientation(binary)

    is_right = active_orient == "right-facing"

    # Normalized longitudinal body coordinate u in [0.0, 1.0] (0.0 = rear, 1.0 = head)
    def to_u(px: float) -> float:
        return (px - bx) / bw if is_right else (bx + bw - px) / bw

    # Dorsal (min y) and ventral (max y) profiles
    dorsal: dict[int, int] = {}
    ventral: dict[int, int] = {}
    for px, py in pts:
        if px not in dorsal or py < dorsal[px]:
            dorsal[px] = int(py)
        if px not in ventral or py > ventral[px]:
            ventral[px] = int(py)

    # 1. Withers: highest dorsal point of backline in anterior half (u in [0.45, 0.72], min Y)
    w_candidates = [px for px in dorsal if 0.45 <= to_u(px) <= 0.72]
    if not w_candidates:
        w_candidates = [px for px in dorsal if 0.40 <= to_u(px) <= 0.80]
    withers_x = min(w_candidates, key=lambda px: dorsal[px])
    withers_pt = [int(withers_x), int(dorsal[withers_x])]

    # 2. Hip point (hook bone): dorsal transition between loin and rump (u in [0.22, 0.45], min Y)
    h_candidates = [px for px in dorsal if 0.22 <= to_u(px) <= 0.45]
    if not h_candidates:
        h_candidates = [px for px in dorsal if 0.15 <= to_u(px) <= 0.50]
    hip_x = min(h_candidates, key=lambda px: dorsal[px])
    hip_pt = [int(hip_x), int(dorsal[hip_x])]

    # 3. Pin bone: most posterior structural point along pelvic slope (u in [0.0, 0.20], height v in [0.35, 0.65])
    pin_candidates = [
        p
        for p in pts
        if to_u(p[0]) <= 0.22 and (by + 0.30 * bh) <= p[1] <= (by + 0.65 * bh)
    ]
    if not pin_candidates:
        pin_candidates = [p for p in pts if to_u(p[0]) <= 0.25]
    pin_pt = min(pin_candidates, key=lambda p: to_u(p[0]))

    # 4. Shoulder point: anterior-most prominent contour point of chest/shoulder junction (u in [0.65, 0.90], height v in [0.35, 0.65])
    shoulder_candidates = [
        p
        for p in pts
        if 0.65 <= to_u(p[0]) <= 0.92 and (by + 0.30 * bh) <= p[1] <= (by + 0.68 * bh)
    ]
    if not shoulder_candidates:
        shoulder_candidates = [p for p in pts if to_u(p[0]) >= 0.60]
    shoulder_pt = max(shoulder_candidates, key=lambda p: to_u(p[0]))

    # 5. Rear hoof: lowest contact point with ground plane in posterior leg zone (u in [0.15, 0.42], max Y)
    rear_hoof_candidates = [
        p
        for p in pts
        if 0.15 <= to_u(p[0]) <= 0.42 and p[1] >= (by + 0.65 * bh)
    ]
    if not rear_hoof_candidates:
        rear_hoof_candidates = [p for p in pts if to_u(p[0]) <= 0.45]
    rear_hoof_pt = max(rear_hoof_candidates, key=lambda p: p[1])

    # 6. Front hoof: lowest contact point with ground plane in anterior leg zone (u in [0.55, 0.85], max Y)
    front_hoof_candidates = [
        p
        for p in pts
        if 0.55 <= to_u(p[0]) <= 0.85 and p[1] >= (by + 0.65 * bh)
    ]
    if not front_hoof_candidates:
        front_hoof_candidates = [p for p in pts if to_u(p[0]) >= 0.50]
    front_hoof_pt = max(front_hoof_candidates, key=lambda p: p[1])

    # 7. Brisket: lowest ventral point of chest floor between front legs and belly line (u in [0.42, 0.68], exclude lower leg extension)
    brisket_candidates = [
        p
        for p in pts
        if 0.42 <= to_u(p[0]) <= 0.68 and (by + 0.40 * bh) <= p[1] <= (by + 0.78 * bh)
    ]
    if not brisket_candidates:
        brisket_candidates = [
            p
            for p in pts
            if 0.38 <= to_u(p[0]) <= 0.72 and p[1] <= (by + 0.80 * bh)
        ]
    brisket_pt = max(brisket_candidates, key=lambda p: p[1])

    raw_landmarks = {
        "withers": withers_pt,
        "shoulder_point": shoulder_pt,
        "hip_point": hip_pt,
        "pin_bone": pin_pt,
        "brisket": brisket_pt,
        "front_hoof": front_hoof_pt,
        "rear_hoof": rear_hoof_pt,
    }

    result: dict[str, dict[str, Any]] = {}
    for name, pt in raw_landmarks.items():
        conf = compute_point_confidence(pt, pts)
        result[name] = {
            "x": int(pt[0]),
            "y": int(pt[1]),
            "confidence": float(conf),
        }

    return result


class LandmarkExtractor:
    """Class wrapper for geometric landmark extraction."""

    def __init__(self, default_orientation: str | None = None) -> None:
        self.default_orientation = default_orientation

    def detect_orientation(self, mask: np.ndarray) -> str:
        """Detect side orientation of animal in mask."""
        return detect_animal_orientation(mask)

    def extract_landmarks(
        self,
        mask: np.ndarray,
        orientation: str | None = None,
    ) -> dict[str, dict[str, Any]]:
        """Extract landmarks using instance or override orientation."""
        active_orient = orientation or self.default_orientation
        return extract_landmarks(mask, orientation=active_orient)

    def __call__(
        self,
        mask: np.ndarray,
        orientation: str | None = None,
    ) -> dict[str, dict[str, Any]]:
        """Callable wrapper for extract_landmarks."""
        return self.extract_landmarks(mask, orientation=orientation)
