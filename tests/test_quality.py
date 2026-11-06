from pathlib import Path

import cv2
import numpy as np
import yaml

from src.quality import DEFAULT_THRESHOLDS, ImageQualityChecker


def encode_image(img: np.ndarray, ext: str = ".jpg") -> bytes:
    """Encode numpy image array into compressed image bytes."""
    success, buffer = cv2.imencode(ext, img)
    assert success, "Failed to encode image to bytes"
    return buffer.tobytes()


def make_sharp_image(width: int = 800, height: int = 600) -> np.ndarray:
    """Generate high-contrast checkerboard image with sharp edges and balanced luminance."""
    img = np.zeros((height, width, 3), dtype=np.uint8)
    tile_size = 20
    for y in range(0, height, tile_size):
        for x in range(0, width, tile_size):
            if (x // tile_size + y // tile_size) % 2 == 0:
                img[y : y + tile_size, x : x + tile_size] = [200, 200, 200]
            else:
                img[y : y + tile_size, x : x + tile_size] = [60, 60, 60]
    return img


def make_blurred_image(
    width: int = 800, height: int = 600, ksize: tuple[int, int] = (45, 45)
) -> np.ndarray:
    """Generate heavily blurred image using Gaussian blur on sharp pattern."""
    sharp = make_sharp_image(width, height)
    return cv2.GaussianBlur(sharp, ksize, 0)


def make_dark_image(
    width: int = 800, height: int = 600, brightness: int = 20
) -> np.ndarray:
    """Generate under-exposed dark image with mean brightness < 40."""
    return np.full((height, width, 3), brightness, dtype=np.uint8)


def make_bright_image(
    width: int = 800, height: int = 600, brightness: int = 235
) -> np.ndarray:
    """Generate over-exposed bright image with mean brightness > 220."""
    return np.full((height, width, 3), brightness, dtype=np.uint8)


def make_saturated_image(
    width: int = 800, height: int = 600, sat_ratio: float = 0.20
) -> np.ndarray:
    """Generate image where mean brightness <= 220 but > 15% pixels are saturated (> 250)."""
    img = np.full((height, width, 3), 120, dtype=np.uint8)
    sat_rows = int(height * sat_ratio)
    img[:sat_rows, :] = 255
    return img


def test_sharp_image_acceptable() -> None:
    """Verify sharp, well-exposed, landscape 800x600 image passes all checks."""
    checker = ImageQualityChecker()
    img = make_sharp_image(800, 600)
    img_bytes = encode_image(img)

    result = checker.check_image(img_bytes)

    assert result["is_acceptable"] is True
    assert result["flags"] == []
    assert result["metrics"]["laplacian_var"] >= DEFAULT_THRESHOLDS["blur_threshold"]
    assert DEFAULT_THRESHOLDS["min_brightness"] <= result["metrics"]["mean_brightness"] <= DEFAULT_THRESHOLDS["max_brightness"]
    assert result["metrics"]["dimensions"] == [800, 600]


def test_blurred_image_flagged() -> None:
    """Verify Gaussian-blurred image is flagged blurry."""
    checker = ImageQualityChecker()
    img = make_blurred_image(800, 600)
    img_bytes = encode_image(img)

    result = checker.check_image(img_bytes)

    assert result["is_acceptable"] is False
    assert "blurry" in result["flags"]
    assert result["metrics"]["laplacian_var"] < DEFAULT_THRESHOLDS["blur_threshold"]


def test_pure_dark_image_flagged() -> None:
    """Verify under-exposed image with mean < 40 is flagged too_dark."""
    checker = ImageQualityChecker()
    img = make_dark_image(800, 600, brightness=15)
    img_bytes = encode_image(img)

    result = checker.check_image(img_bytes)

    assert result["is_acceptable"] is False
    assert "too_dark" in result["flags"]
    assert result["metrics"]["mean_brightness"] < 40.0


def test_bright_image_by_mean_luminance_flagged() -> None:
    """Verify over-exposed image with mean > 220 is flagged too_bright."""
    checker = ImageQualityChecker()
    img = make_bright_image(800, 600, brightness=240)
    img_bytes = encode_image(img)

    result = checker.check_image(img_bytes)

    assert result["is_acceptable"] is False
    assert "too_bright" in result["flags"]
    assert result["metrics"]["mean_brightness"] > 220.0


def test_bright_image_by_saturation_flagged() -> None:
    """Verify image with >15% saturated pixels (>250) is flagged too_bright even with mean <= 220."""
    checker = ImageQualityChecker()
    img = make_saturated_image(800, 600, sat_ratio=0.25)
    img_bytes = encode_image(img)

    result = checker.check_image(img_bytes)

    assert result["is_acceptable"] is False
    assert "too_bright" in result["flags"]
    assert result["metrics"]["mean_brightness"] <= 220.0


def test_low_resolution_flagged() -> None:
    """Verify resolution below 800x600 is flagged low_resolution."""
    checker = ImageQualityChecker()
    img = make_sharp_image(640, 480)
    img_bytes = encode_image(img)

    result = checker.check_image(img_bytes)

    assert result["is_acceptable"] is False
    assert "low_resolution" in result["flags"]
    assert result["metrics"]["dimensions"] == [640, 480]


def test_portrait_orientation_flagged() -> None:
    """Verify portrait orientation (width < height) is flagged wrong_orientation."""
    checker = ImageQualityChecker()
    img = make_sharp_image(800, 1000)
    img_bytes = encode_image(img)

    result = checker.check_image(img_bytes)

    assert result["is_acceptable"] is False
    assert "wrong_orientation" in result["flags"]
    assert "low_resolution" not in result["flags"]
    assert result["metrics"]["dimensions"] == [800, 1000]


def test_square_image_flagged_wrong_orientation() -> None:
    """Verify 800x800 square image is not landscape and flagged wrong_orientation."""
    checker = ImageQualityChecker()
    img = make_sharp_image(800, 800)
    img_bytes = encode_image(img)

    result = checker.check_image(img_bytes)

    assert result["is_acceptable"] is False
    assert "wrong_orientation" in result["flags"]


def test_configurable_via_yaml(tmp_path: Path) -> None:
    """Verify checker loads custom thresholds from YAML configuration file."""
    custom_yaml = tmp_path / "custom_quality.yaml"
    custom_yaml.write_text(
        yaml.dump(
            {
                "blur": {"threshold": 5000.0},
                "lighting": {
                    "min_brightness": 100.0,
                    "max_brightness": 180.0,
                    "saturation_threshold": 240,
                    "max_saturation_ratio": 0.05,
                },
                "resolution": {
                    "min_width": 1024,
                    "min_height": 768,
                    "require_landscape": True,
                },
            }
        ),
        encoding="utf-8",
    )

    checker = ImageQualityChecker(config_path=custom_yaml)
    assert checker.thresholds["blur_threshold"] == 5000.0
    assert checker.thresholds["min_brightness"] == 100.0
    assert checker.thresholds["max_brightness"] == 180.0
    assert checker.thresholds["min_width"] == 1024
    assert checker.thresholds["min_height"] == 768

    # 800x600 image will now fail low_resolution because min_width=1024
    img = make_sharp_image(800, 600)
    result = checker.check_image(encode_image(img))
    assert result["is_acceptable"] is False
    assert "low_resolution" in result["flags"]


def test_dict_config_override() -> None:
    """Verify dictionary overrides threshold values."""
    img = make_blurred_image(640, 480)
    checker_lenient = ImageQualityChecker(config={"blur_threshold": 0.1, "min_width": 500, "min_height": 400})
    result = checker_lenient.check_image(encode_image(img))
    assert "blurry" not in result["flags"]
    assert "low_resolution" not in result["flags"]


def test_invalid_and_corrupt_bytes() -> None:
    """Verify invalid or empty image bytes return is_acceptable=False and invalid_image flag."""
    checker = ImageQualityChecker()

    res_empty = checker.check_image(b"")
    assert res_empty["is_acceptable"] is False
    assert res_empty["flags"] == ["invalid_image"]

    res_corrupt = checker.check_image(b"not an actual image payload")
    assert res_corrupt["is_acceptable"] is False
    assert res_corrupt["flags"] == ["invalid_image"]


def test_direct_numpy_array_input() -> None:
    """Verify passing numpy ndarray directly into check_image works seamlessly."""
    checker = ImageQualityChecker()
    img = make_sharp_image(800, 600)

    result = checker.check_image(img)
    assert result["is_acceptable"] is True
    assert result["flags"] == []
    assert result["metrics"]["dimensions"] == [800, 600]
