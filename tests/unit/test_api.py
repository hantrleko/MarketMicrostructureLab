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

def test_fixture_fallback_mode(monkeypatch, tmp_path):
    """Verify system enters RESEARCH_FIXTURE_FALLBACK mode when normalized parquet is absent"""
    import apps.api.main as api_main
    empty_dir = tmp_path / "empty_normalized"
    empty_dir.mkdir()
    monkeypatch.setattr(api_main, "NORMALIZED_DIR", empty_dir)
    
    mode_info = api_main.get_system_runtime_mode()
    assert mode_info["runtime_mode"] == "RESEARCH_FIXTURE_FALLBACK"
    assert mode_info["has_normalized_data"] is False
    assert mode_info["has_fixtures"] is True
    assert "Fixture" in mode_info["data_layer_description"]

    # Test that get_trades_df successfully falls back to fixture
    df = api_main.get_trades_df("BTCUSDT", "2026-07-01")
    assert df is not None
    assert len(df) > 0
    assert "price" in df.columns

def test_missing_date_strictly_fails_with_404_no_cross_date_fallback(monkeypatch, tmp_path):
    """Verify that requesting a missing date strictly raises 404 and NEVER silently falls back to 2026-07-01"""
    import apps.api.main as api_main
    empty_dir = tmp_path / "empty_normalized"
    empty_dir.mkdir()
    monkeypatch.setattr(api_main, "NORMALIZED_DIR", empty_dir)

    # Request non-existent date
    with pytest.raises(Exception) as exc_info:
        api_main.get_trades_df("BTCUSDT", "2026-07-99")
    assert "404" in str(exc_info.value) or "not found" in str(exc_info.value).lower()


def test_unsupported_symbol_returns_422_no_crosstalk():
    """Requesting an unsupported symbol (e.g. ETHUSDT) must return HTTP 422 with UNSUPPORTED_SYMBOL, never BTCUSDT data."""
    resp = client.get("/api/v1/flow/buckets?symbol=ETHUSDT&date=2026-07-01")
    assert resp.status_code == 422
    data = resp.json()
    assert "error" in data
    assert data["error"]["code"] == "UNSUPPORTED_SYMBOL"
    assert "ETHUSDT" in data["error"]["message"]
    assert "request_id" in data["error"]


def test_missing_date_returns_404_dataset_not_found():
    """Requesting an unavailable date (e.g. 2026-07-99) must return HTTP 404 with DATASET_NOT_FOUND."""
    resp = client.get("/api/v1/flow/buckets?symbol=BTCUSDT&date=2026-07-99")
    assert resp.status_code == 404
    data = resp.json()
    assert "error" in data
    assert data["error"]["code"] == "DATASET_NOT_FOUND"
    assert "request_id" in data["error"]


def test_production_fail_close_blocks_fixtures(monkeypatch, tmp_path):
    """When MML_ENV=production, missing normalized datasets must fail-close (404) and never fallback to fixtures."""
    import apps.api.main as api_main
    empty_dir = tmp_path / "empty_normalized"
    empty_dir.mkdir()
    monkeypatch.setattr(api_main, "NORMALIZED_DIR", empty_dir)
    monkeypatch.setenv("MML_ENV", "production")

    resp = client.get("/api/v1/flow/buckets?symbol=BTCUSDT&date=2026-07-01")
    assert resp.status_code == 404
    data = resp.json()
    assert "error" in data
    assert data["error"]["code"] == "DATASET_NOT_FOUND"
    assert data["error"]["details"].get("mode") == "PRODUCTION_FAIL_CLOSE"


def test_content_identity_mismatch_raises_500():
    """If a dataset content has mismatched symbols or dates, it must raise 500 DATA_IDENTITY_MISMATCH."""
    import polars as pl
    from packages.governance.manifest import DataManifestManager, ManifestEntry

    mgr = DataManifestManager()
    dummy_entry = ManifestEntry(
        symbol="BTCUSDT",
        date="2026-07-01",
        source_type="TEST",
        file_path="dummy.parquet",
        row_count=1,
        sha256="abc",
        min_event_time_utc="2026-07-01 00:00:00",
        max_event_time_utc="2026-07-01 00:00:00",
        min_timestamp_ns="0",
        max_timestamp_ns="0",
        is_fixture=False,
        provenance="TEST"
    )

    # Symbol mismatch
    mismatched_df = pl.DataFrame({
        "symbol": ["ETHUSDT"],
        "event_time_utc": ["2026-07-01 00:00:00"]
    })
    with pytest.raises(Exception) as exc_info:
        mgr.validate_content_identity(mismatched_df, "BTCUSDT", "2026-07-01", dummy_entry)
    assert exc_info.value.code == "DATA_IDENTITY_MISMATCH"

    # Date mismatch
    mismatched_date_df = pl.DataFrame({
        "symbol": ["BTCUSDT"],
        "event_time_utc": ["2026-07-02 00:00:00"]
    })
    with pytest.raises(Exception) as exc_info:
        mgr.validate_content_identity(mismatched_date_df, "BTCUSDT", "2026-07-01", dummy_entry)
    assert exc_info.value.code == "DATA_IDENTITY_MISMATCH"


def test_nanosecond_precision_and_string_serialization():
    """Verify that trade_id and event_timestamp_ns are serialized as strings preserving 64-bit int precision."""
    resp = client.get("/api/v1/replay/window?symbol=BTCUSDT&date=2026-07-01&limit=10")
    assert resp.status_code == 200
    data = resp.json()
    assert "trades" in data
    assert len(data["trades"]) > 0
    trade = data["trades"][0]
    # nanosecond timestamp must be a string and have 19 digits (e.g. 1782864000...)
    assert isinstance(trade["event_timestamp_ns"], str)
    assert len(trade["event_timestamp_ns"]) >= 19
    int_ns = int(trade["event_timestamp_ns"])
    assert str(int_ns) == trade["event_timestamp_ns"]

    # trade_id must be a string to avoid IEEE 754 truncation in JS
    assert isinstance(trade["trade_id"], str)
    int_id = int(trade["trade_id"])
    assert str(int_id) == trade["trade_id"]

    # identity block must be present
    assert "identity" in data
    assert data["identity"]["symbol"] == "BTCUSDT"
    assert data["identity"]["date"] == "2026-07-01"



