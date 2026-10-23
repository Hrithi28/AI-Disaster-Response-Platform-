"""FastAPI entrypoint for the AI/ML engine.

Run:  uvicorn app.main:app --port 8000 --reload
Docs: http://localhost:8000/docs
"""
from __future__ import annotations

import time
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .data import DISASTER_TYPES
from .models import explain_severity, registry, risk_zones

DisasterType = Literal["flood", "cyclone", "earthquake", "fire", "landslide"]


@asynccontextmanager
async def lifespan(_: FastAPI):
    t = time.time()
    registry.load_or_train()
    print(f"[ml] models ready in {time.time() - t:.1f}s  severity={registry.severity.metrics}")
    yield


app = FastAPI(title="Disaster Response AI/ML Engine", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class IncidentFeatures(BaseModel):
    disaster_type: DisasterType = "flood"
    rainfall_mm: float = Field(0, ge=0)
    wind_kmph: float = Field(0, ge=0)
    magnitude: float = Field(0, ge=0, le=10)
    water_level_m: float = Field(0, ge=0)
    population_density: float = Field(5000, ge=0)
    affected_people: int = Field(0, ge=0)
    injured: int = Field(0, ge=0)
    infrastructure_damage: float = Field(0, ge=0, le=1)
    report_count: int = Field(1, ge=0)


class ReportIn(BaseModel):
    text: str = Field(..., min_length=3, max_length=2000)


class BatchReportsIn(BaseModel):
    texts: list[str]


class SensorIn(BaseModel):
    sensor_type: Literal["rain_gauge", "water_level", "seismic", "wind"]
    value: float
    previous: float | None = None


class Point(BaseModel):
    id: str | int | None = None
    lat: float
    lng: float
    severity: int = 3


class ZonesIn(BaseModel):
    points: list[Point]
    eps_km: float = 2.5
    min_samples: int = 2


class FeedbackIn(BaseModel):
    features: IncidentFeatures
    actual_severity: int = Field(..., ge=1, le=5)


@app.get("/health")
def health():
    return {"status": "ok", "model_version": registry.severity.version, "feedback_samples": registry.feedback_count()}


@app.get("/models")
def models_info():
    return {
        "severity": {"version": registry.severity.version, "metrics": registry.severity.metrics,
                     "feature_importance": registry.severity.feature_importance(), "trained_at": registry.severity.trained_at},
        "report_classifier": registry.reports.metrics,
        "anomaly_detector": {"sensors": list(registry.anomaly.models)},
        "disaster_types": DISASTER_TYPES,
        "feedback_samples": registry.feedback_count(),
    }


@app.post("/predict/severity")
def predict_severity(body: IncidentFeatures):
    out = registry.severity.predict(body.model_dump())
    out["explanation"] = explain_severity(registry.severity, body.model_dump())["contributions"][:4]
    return out


@app.post("/explain/severity")
def explain(body: IncidentFeatures):
    return explain_severity(registry.severity, body.model_dump())


@app.get("/models/comparison")
def comparison():
    return registry.get_comparison()


@app.post("/classify/report")
def classify_report(body: ReportIn):
    return registry.reports.classify(body.text)


@app.post("/classify/batch")
def classify_batch(body: BatchReportsIn):
    return [registry.reports.classify(t) for t in body.texts[:200]]


@app.post("/anomaly/sensor")
def sensor_anomaly(body: SensorIn):
    return registry.anomaly.score(body.sensor_type, body.value, body.previous)


@app.post("/zones")
def zones(body: ZonesIn):
    return risk_zones([p.model_dump() for p in body.points], body.eps_km, body.min_samples)


@app.post("/feedback")
def feedback(body: FeedbackIn):
    n = registry.add_feedback(body.features.model_dump(), body.actual_severity)
    return {"stored": True, "feedback_samples": n}


@app.post("/retrain")
def retrain():
    return registry.retrain()
