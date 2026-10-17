"""
Integration and schema test for FastAPI endpoints.
"""

import pytest
from fastapi.testclient import TestClient
from apps.api.main import app

client = TestClient(app)

def test_metadata_datasets():
    resp = client.get("/api/v1/metadata/datasets")
    assert resp.status_code == 200
    data = resp.json()
    assert "datasets" in data
    assert len(data["datasets"]) >= 3
    # 2026-07-01 should be NORMALIZED
    d1 = next(d for d in data["datasets"] if d["date"] == "2026-07-01")
    assert d1["status"] == "NORMALIZED"
    assert d1["records"] == 4166849
    assert d1["audit_passed"] is True

def test_integrity_audit():
    resp = client.get("/api/v1/integrity/audit?symbol=BTCUSDT&date=2026-07-01")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "PASSED"
    assert data["checks"]["duplicate_trade_ids"] == 0

def test_flow_buckets():
    resp = client.get("/api/v1/flow/buckets?symbol=BTCUSDT&date=2026-07-01&interval=1h")
    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 24 # 24 hours in a day
    assert "buckets" in data

def test_price_response_endpoint():
    resp = client.get("/api/v1/impact/response?symbol=BTCUSDT&date=2026-07-01")
    assert resp.status_code == 200
    data = resp.json()
    assert "curves" in data
    assert len(data["curves"]) > 0

def test_orderbook_status_endpoint():
    resp = client.get("/api/v1/orderbook/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "IDLE"
    assert data["is_valid"] is False
