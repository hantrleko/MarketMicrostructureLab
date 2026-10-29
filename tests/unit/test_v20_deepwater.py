"""
Unit tests for Eugene Finance Market Microstructure Lab (MML) V2.0 Deep Water Suite:
- Volume-Synchronized Probability of Toxicity (VPIN)
- Market Maker Glosten-Milgrom Adverse Selection & PnL Decomposition
- Spot vs Perpetual Futures Cross-Market Lead-Lag & Hasbrouck Information Share
- FastAPI V2.0 endpoints verification
"""

import pytest
import numpy as np
import polars as pl
from packages.analytics.toxicity import VPINCalculator, MarketMakerPnLDecomposer, CrossMarketLeadLagAnalyzer
from packages.analytics.trade_flow import TradeFlowAnalytics


@pytest.fixture
def sample_trades_df():
    """Generates synthetic high-frequency trades with known microstructure properties."""
    np.random.seed(42)
    n = 2000
    base_time = 1782864000000000000  # ns

    # Timestamps in ascending order
    deltas = np.random.exponential(scale=50_000_000, size=n)  # 50ms average
    timestamps_ns = base_time + np.cumsum(deltas).astype(np.int64)

    # Random walk price with drift
    directions = np.random.choice([1, -1], size=n, p=[0.52, 0.48])
    price_innovations = 0.05 * directions + np.random.normal(0, 0.08, size=n)
    prices = 60000.0 + np.cumsum(price_innovations)

    quantities = np.random.exponential(scale=0.25, size=n) + 0.01

    time_utcs = [f"2026-07-01T00:{i//60:02d}:{i%60:02d}.000000Z" for i in range(n)]

    return pl.DataFrame({
        "trade_id": np.arange(1, n + 1, dtype=np.int64),
        "event_time_utc": time_utcs,
        "event_timestamp_ns": timestamps_ns,
        "price": prices,
        "base_quantity": quantities,
        "direction": directions,
        "is_buyer_maker": directions < 0
    })


def test_vpin_calculation_bounds_and_conservation(sample_trades_df):
    """Verifies that VPIN values are bounded in [0, 1] and volume is conserved."""
    calc = VPINCalculator(bucket_size_btc=2.0, window_buckets=10)
    res = calc.compute_vpin(sample_trades_df, bucket_size_btc=2.0, window_buckets=10)

    assert res["status"] == "COMPUTED"
    assert res["total_buckets"] > 10
    assert len(res["vpin_series"]) == res["total_buckets"]

    # Verify that valid VPINs are in [0, 1]
    valid_vpins = [b["vpin"] for b in res["vpin_series"] if b["vpin"] is not None]
    assert len(valid_vpins) > 0
    for v in valid_vpins:
        assert 0.0 <= v <= 1.0

    # Summary statistics checks
    summary = res["summary"]
    assert 0.0 <= summary["mean_vpin"] <= 1.0
    assert 0.0 <= summary["min_vpin"] <= summary["max_vpin"] <= 1.0
    assert summary["regime"] in ["LOW_TOXICITY_HOMOGENEOUS", "MODERATE_INFORMED", "SEVERE_TOXIC_TSUNAMI"]

    # CDF monotonicity check
    cdf = summary["cdf_distribution"]
    assert len(cdf) > 0
    for i in range(1, len(cdf)):
        assert cdf[i]["vpin_threshold"] >= cdf[i - 1]["vpin_threshold"]
        assert cdf[i]["percentile"] > cdf[i - 1]["percentile"]


def test_glosten_milgrom_identity():
    """Verifies Glosten-Milgrom identity: Effective Spread == Realized Spread + Adverse Selection."""
    n = 1500
    base_time = 1782864000000000000
    timestamps_ns = base_time + np.arange(n) * 100_000_000  # 100ms interval
    prices = 60000.0 + np.cumsum(np.random.normal(0, 0.5, size=n))
    directions = np.random.choice([1, -1], size=n)
    quantities = np.ones(n) * 0.1

    df = pl.DataFrame({
        "trade_id": np.arange(1, n + 1, dtype=np.int64),
        "event_time_utc": [f"2026-07-01T00:00:{i%60:02d}Z" for i in range(n)],
        "event_timestamp_ns": timestamps_ns,
        "price": prices,
        "base_quantity": quantities,
        "direction": directions
    })

    decomposer = MarketMakerPnLDecomposer()
    horizons = [1, 5, 10, 30]
    res = decomposer.decompose(df, horizons_sec=horizons)

    assert res["status"] == "COMPUTED"
    assert len(res["horizons"]) == len(horizons)

    for h in res["horizons"]:
        eff = h["effective_spread_bps"]
        as_cost = h["adverse_selection_bps"]
        realized = h["realized_spread_bps"]
        # Identity: eff == realized + as_cost (within float precision 0.01 bps)
        assert abs(eff - (realized + as_cost)) < 0.02, f"Failed at horizon {h['horizon_sec']}"

    # Waterfall checks
    wf = res["waterfall_attribution"]
    assert "gross_spread_captured_usd" in wf
    assert "toxic_flow_adverse_selection_loss_usd" in wf
    assert "net_market_making_pnl_usd" in wf

    # Top toxic trades checks
    top_toxic = res["top_toxic_trades"]
    assert len(top_toxic) <= 10
    for t in top_toxic:
        assert t["direction"] in ["BUY", "SELL"]
        assert t["dollar_impact_usd"] >= 0


def test_cross_market_lead_lag():
    """Verifies lead-lag peak, Hasbrouck Information Share, and Gonzalo-Granger bounds."""
    analyzer = CrossMarketLeadLagAnalyzer()
    df = pl.DataFrame({
        "trade_id": np.arange(1, 101, dtype=np.int64),
        "price": np.linspace(60000, 60100, 100)
    })

    res = analyzer.analyze(df, futures_lead_ms=180, max_lag_ms=1500, step_ms=50)

    assert res["status"] == "COMPUTED"
    assert res["leader_market"] == "Binance Perpetual Futures (BTCUSDT.P)"
    assert res["peak_lead_ms"] == 180
    assert 0.6 <= res["peak_cross_correlation"] <= 0.8

    # Check Hasbrouck bounds
    hb = res["hasbrouck_information_share"]
    assert 0 < hb["futures_lower_bound_pct"] <= hb["futures_upper_bound_pct"] <= 100
    assert 0 < hb["spot_lower_bound_pct"] <= hb["spot_upper_bound_pct"] <= 100

    # Check Gonzalo-Granger share sums to 100%
    gg = res["gonzalo_granger_component_share"]
    assert abs((gg["futures_component_share_pct"] + gg["spot_component_share_pct"]) - 100.0) < 0.01


def test_fastapi_v20_endpoints():
    """Verifies that FastAPI exposes the new V2.0 endpoints."""
    from fastapi.testclient import TestClient
    from apps.api.main import app

    client = TestClient(app)

    # 1. VPIN endpoint
    r_vpin = client.get("/api/v1/analytics/vpin?symbol=BTCUSDT&date=2026-07-01")
    assert r_vpin.status_code == 200
    vpin_json = r_vpin.json()
    assert vpin_json["status"] == "COMPUTED"
    assert "summary" in vpin_json

    # 2. Adverse Selection endpoint
    r_as = client.get("/api/v1/analytics/adverse_selection?symbol=BTCUSDT&date=2026-07-01")
    assert r_as.status_code == 200
    as_json = r_as.json()
    assert as_json["status"] == "COMPUTED"
    assert "waterfall_attribution" in as_json

    # 3. Lead-Lag endpoint
    r_ll = client.get("/api/v1/analytics/lead_lag?symbol=BTCUSDT&date=2026-07-01")
    assert r_ll.status_code == 200
    ll_json = r_ll.json()
    assert ll_json["status"] == "COMPUTED"
    assert ll_json["peak_lead_ms"] == 180
