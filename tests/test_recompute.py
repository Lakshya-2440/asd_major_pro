from fastapi.testclient import TestClient

from src.main import app

client = TestClient(app)


def make_valid_landmarks() -> dict[str, dict[str, int]]:
    """Return valid landmark coordinates for cattle measurements."""
    return {
        "withers": {"x": 400, "y": 100},
        "front_hoof": {"x": 400, "y": 380},
        "shoulder_point": {"x": 550, "y": 150},
        "pin_bone": {"x": 250, "y": 190},
        "brisket": {"x": 410, "y": 250},
        "hip_point": {"x": 310, "y": 180},
    }


def test_recompute_success_gir_cattle():
    """Verify successful recompute for Gir cattle with adjusted points."""
    payload = {
        "landmarks": make_valid_landmarks(),
        "pixels_per_cm": 2.0,
        "species": "cattle",
        "breed": "Gir",
    }
    response = client.post("/recompute", json=payload)
    assert response.status_code == 200
    data = response.json()

    # Check measurements
    assert "measurements" in data
    measurements = data["measurements"]
    for metric in ["height_at_withers_cm", "body_length_cm", "body_depth_cm", "rump_angle_deg"]:
        assert metric in measurements
        assert isinstance(measurements[metric]["value"], (int, float))
        assert measurements[metric]["source"] == "user_adjusted"
        assert "unit" in measurements[metric]

    # Height should be |380 - 100| / 2 = 140.0 cm
    assert measurements["height_at_withers_cm"]["value"] == 140.0

    # Check trait scores
    assert "trait_scores" in data
    trait_scores = data["trait_scores"]
    for trait in ["stature", "body_length", "body_depth", "rump_angle"]:
        assert trait in trait_scores
        score_info = trait_scores[trait]
        assert isinstance(score_info["score"], int)
        assert 1 <= score_info["score"] <= 9
        assert score_info["source"] == "user_adjusted"

    # Check overall score
    assert "overall_score" in data
    assert isinstance(data["overall_score"], (int, float))
    assert 50.0 <= data["overall_score"] <= 100.0


def test_recompute_success_murrah_buffalo():
    """Verify successful recompute for Murrah buffalo with adjusted points."""
    payload = {
        "landmarks": make_valid_landmarks(),
        "pixels_per_cm": 2.0,
        "species": "buffalo",
        "breed": "Murrah",
    }
    response = client.post("/recompute", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert "measurements" in data
    assert "trait_scores" in data
    trait_scores = data["trait_scores"]
    assert 50.0 <= data["overall_score"] <= 100.0
    for trait in ["stature", "body_length", "body_depth", "rump_angle"]:
        assert trait_scores[trait]["source"] == "user_adjusted"


def test_recompute_missing_landmark_raises_422():
    """Verify HTTP 422 when a required landmark is omitted."""
    landmarks = make_valid_landmarks()
    del landmarks["pin_bone"]

    payload = {
        "landmarks": landmarks,
        "pixels_per_cm": 2.0,
        "species": "cattle",
        "breed": "Gir",
    }
    response = client.post("/recompute", json=payload)
    assert response.status_code == 422
    data = response.json()
    assert "detail" in data
    assert "pin_bone" in str(data["detail"]).lower()


def test_recompute_empty_landmarks_raises_422():
    """Verify HTTP 422 when landmarks dictionary is empty."""
    payload = {
        "landmarks": {},
        "pixels_per_cm": 2.0,
        "species": "cattle",
        "breed": "Gir",
    }
    response = client.post("/recompute", json=payload)
    assert response.status_code == 422


def test_recompute_pixels_per_cm_zero_raises_422():
    """Verify HTTP 422 when pixels_per_cm is zero."""
    payload = {
        "landmarks": make_valid_landmarks(),
        "pixels_per_cm": 0.0,
        "species": "cattle",
        "breed": "Gir",
    }
    response = client.post("/recompute", json=payload)
    assert response.status_code == 422


def test_recompute_pixels_per_cm_negative_raises_422():
    """Verify HTTP 422 when pixels_per_cm is negative."""
    payload = {
        "landmarks": make_valid_landmarks(),
        "pixels_per_cm": -2.5,
        "species": "cattle",
        "breed": "Gir",
    }
    response = client.post("/recompute", json=payload)
    assert response.status_code == 422


def test_recompute_unsupported_species_raises_422():
    """Verify HTTP 422 when species is unsupported."""
    payload = {
        "landmarks": make_valid_landmarks(),
        "pixels_per_cm": 2.0,
        "species": "equine",
        "breed": "Arabian",
    }
    response = client.post("/recompute", json=payload)
    assert response.status_code == 422
    data = response.json()
    assert "detail" in data
    assert "unsupported species" in str(data["detail"]).lower()


def test_recompute_unsupported_breed_raises_422():
    """Verify HTTP 422 when breed is unsupported for valid species."""
    payload = {
        "landmarks": make_valid_landmarks(),
        "pixels_per_cm": 2.0,
        "species": "cattle",
        "breed": "UnknownBreed",
    }
    response = client.post("/recompute", json=payload)
    assert response.status_code == 422
    data = response.json()
    assert "detail" in data
    assert "unsupported breed" in str(data["detail"]).lower()


def test_recompute_coordinate_adjustments_change_output():
    """Verify that moving a landmark coordinate updates measurements and scoring."""
    base_landmarks = make_valid_landmarks()
    payload_original = {
        "landmarks": base_landmarks,
        "pixels_per_cm": 2.0,
        "species": "cattle",
        "breed": "Gir",
    }
    resp1 = client.post("/recompute", json=payload_original)
    assert resp1.status_code == 200
    res1 = resp1.json()

    # Move withers higher (lower y)
    adjusted_landmarks = dict(base_landmarks)
    adjusted_landmarks["withers"] = {"x": 400, "y": 60}  # was 100
    payload_adjusted = {
        "landmarks": adjusted_landmarks,
        "pixels_per_cm": 2.0,
        "species": "cattle",
        "breed": "Gir",
    }
    resp2 = client.post("/recompute", json=payload_adjusted)
    assert resp2.status_code == 200
    res2 = resp2.json()

    # Height should increase from 140 to |380 - 60| / 2 = 160.0
    assert res1["measurements"]["height_at_withers_cm"]["value"] == 140.0
    assert res2["measurements"]["height_at_withers_cm"]["value"] == 160.0
    assert res2["measurements"]["height_at_withers_cm"]["value"] > res1["measurements"]["height_at_withers_cm"]["value"]
