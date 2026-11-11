import io

from fastapi.testclient import TestClient

from src.main import app

client = TestClient(app)


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "analysis-service"
    assert data["version"] == "0.2.0"


def test_dummy_predict_endpoint():
    dummy_image = io.BytesIO(b"fake image bytes")
    response = client.post(
        "/predict",
        files={"side_view": ("test.jpg", dummy_image, "image/jpeg")},
        data={"species": "buffalo", "breed": "Murrah", "tag_id": "TAG-1234"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["species"] == "buffalo"
    assert data["breed"] == "Murrah"
    assert data["pipeline_version"] == "0.2.0"
    assert isinstance(data["quality_flags"], list)
    assert isinstance(data["landmarks"], dict)
    assert isinstance(data["measurements"], dict)
    assert isinstance(data["trait_scores"], dict)
    assert "overall_score" in data
