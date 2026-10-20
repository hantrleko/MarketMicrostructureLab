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

def test_orderbook_control_default_deny(monkeypatch):
    """Management endpoint must default-deny (HTTP 503) if ORDERBOOK_ADMIN_KEY is not configured"""
    monkeypatch.delenv("ORDERBOOK_ADMIN_KEY", raising=False)
    resp = client.post("/api/v1/orderbook/control", json={"action": "start"})
    assert resp.status_code == 503
    assert "ORDERBOOK_ADMIN_KEY" in resp.json()["detail"]

def test_orderbook_control_forbidden_with_invalid_key(monkeypatch):
    """Management endpoint must reject invalid or missing keys with HTTP 403 when configured"""
    monkeypatch.setenv("ORDERBOOK_ADMIN_KEY", "super_secret_test_key_999")
    # Missing key
    resp_missing = client.post("/api/v1/orderbook/control", json={"action": "start"})
    assert resp_missing.status_code == 403

    # Wrong key
    resp_wrong = client.post(
        "/api/v1/orderbook/control",
        json={"action": "start"},
        headers={"X-Admin-Key": "wrong_key"}
    )
    assert resp_wrong.status_code == 403

def test_orderbook_control_authorized_stop(monkeypatch):
    """Management endpoint accepts valid credentials via header or payload"""
    test_key = "super_secret_test_key_999"
    monkeypatch.setenv("ORDERBOOK_ADMIN_KEY", test_key)
    resp = client.post(
        "/api/v1/orderbook/control",
        json={"action": "stop"},
        headers={"X-Admin-Key": test_key}
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "SUCCESS"
    assert resp.json()["action"] == "stop"

def test_system_info_and_health_endpoint():
    """Health and system info endpoints expose runtime mode, version, and commit"""
    for endpoint in ["/api/v1/health", "/api/v1/system/info"]:
        resp = client.get(endpoint)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "HEALTHY"
        assert "runtime_mode" in data
        assert "data_layer_description" in data
        assert "build_commit" in data
        assert "data_version" in data
        assert data["runtime_mode"] in ["FULL_PARQUET_PRODUCTION", "RESEARCH_FIXTURE_FALLBACK", "STATIC_ONLY"]
