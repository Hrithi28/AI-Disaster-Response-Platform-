from fastapi.testclient import TestClient

from app.main import app


def client():
    return TestClient(app)


def test_health_and_models():
    with client() as c:
        assert c.get("/health").json()["status"] == "ok"
        info = c.get("/models").json()
        assert info["severity"]["metrics"]["accuracy"] > 0.7
        assert info["report_classifier"]["accuracy"] > 0.65  # measured on REAL held-out messages


def test_severity_ordering():
    with client() as c:
        mild = c.post("/predict/severity", json={"disaster_type": "flood", "rainfall_mm": 20, "water_level_m": 0.2,
                                                  "affected_people": 10, "injured": 0, "infrastructure_damage": 0.05}).json()
        bad = c.post("/predict/severity", json={"disaster_type": "flood", "rainfall_mm": 320, "water_level_m": 3.8,
                                                 "population_density": 25000, "affected_people": 15000, "injured": 300,
                                                 "infrastructure_damage": 0.9, "report_count": 150}).json()
        assert bad["severity"] > mild["severity"]
        assert 0 <= mild["score"] <= 100


def test_report_classification():
    with client() as c:
        r = c.post("/classify/report", json={"text": "URGENT 12 people trapped on rooftop in Velachery, water rising fast"}).json()
        assert r["category"] == "rescue"
        assert r["urgency_label"] == "high"
        assert "Velachery" in r["entities"]["locations"]
        assert r["entities"]["people_count"] == 12


def test_anomaly_and_zones():
    with client() as c:
        assert c.post("/anomaly/sensor", json={"sensor_type": "water_level", "value": 4.5, "previous": 1.3}).json()["anomaly"]
        assert not c.post("/anomaly/sensor", json={"sensor_type": "water_level", "value": 1.1}).json()["anomaly"]
        pts = [{"id": i, "lat": 12.98 + i * 0.002, "lng": 80.22, "severity": 4} for i in range(4)]
        pts.append({"id": 99, "lat": 13.2, "lng": 80.3, "severity": 2})
        zones = c.post("/zones", json={"points": pts}).json()
        assert len(zones) == 1 and zones[0]["incident_count"] == 4


def test_tamil_classification_offline():
    with client() as c:
        r = c.post("/classify/report", json={"text": "வேளச்சேரியில் 10 பேர் வெள்ளத்தில் சிக்கியுள்ளோம், உடனே உதவி தேவை"}).json()
        assert r["language"] == "ta"
        assert r["category"] == "rescue"
        assert "Velachery" in r["entities"]["locations"]
        assert r["entities"]["people_count"] == 10
        m = c.post("/classify/report", json={"text": "சைதாப்பேட்டையில் 4 பேர் காயமடைந்துள்ளனர், ஆம்புலன்ஸ் தேவை"}).json()
        assert m["category"] == "medical"


def test_explainability_points_at_the_right_features():
    with client() as c:
        e = c.post("/explain/severity", json={"disaster_type": "flood", "rainfall_mm": 300, "water_level_m": 3.5, "affected_people": 8000,
                                              "injured": 150, "infrastructure_damage": 0.8, "population_density": 25000, "report_count": 80}).json()
        top = [x["feature"] for x in e["contributions"][:4]]
        assert any(f in top for f in ("water_level_m", "rainfall_mm", "injured", "affected_people"))
        assert e["contributions"][0]["contribution"] > 0
        p = c.post("/predict/severity", json={"disaster_type": "flood", "rainfall_mm": 300, "water_level_m": 3.5}).json()
        assert "explanation" in p


def test_model_comparison_has_confusion_matrices():
    with client() as c:
        cmp = c.get("/models/comparison").json()
        assert len(cmp["report_classifier"]["models"]) == 4
        assert len(cmp["severity"]["models"]) == 4
        m = cmp["severity"]["models"][0]
        assert len(m["confusion_matrix"]) == 5 and 0 <= m["within_one_level"] <= 1


def test_humaid_loader_maps_labels(tmp_path, monkeypatch):
    from app import models
    d = tmp_path / "humaid"
    d.mkdir()
    (d / "sample_train.tsv").write_text(
        "tweet_id\ttweet_text\tclass_label\n"
        "1\tPeople trapped need rescue near the river http://x.co\tmissing_or_found_people\n"
        "2\tSeveral injured after building collapse\tinjured_or_dead_people\n"
        "3\tPrayers for everyone\tsympathy_and_support\n"
        "4\tno idea\tdont_know_cant_judge\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(models, "HUMAID_DIR", d)
    texts, labels = models.load_humaid()
    assert labels == ["rescue", "medical", "info"]
    assert "http" not in texts[0]
