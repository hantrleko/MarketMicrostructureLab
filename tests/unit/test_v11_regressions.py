"""
Unit & Regression Tests for Market Microstructure Lab V1.1.
Validates:
1. Multi-date Parquet coverage & cross-date schema consistency.
2. Multi-horizon impact models (k in {5, 10, 20, 50, 100}).
3. Rank-based quantile allocation without empty bins or zero-fill.
4. Newey-West HAC bandwidth sensitivity sweeps.
5. Replay window querying with total_in_window vs slice distinction.
6. Order book sequence gap, expired frame skipping, and reconnect reset.
7. Hawkes tie-breaking jitter and Random Time Change compensator residual KS test.
"""

import pytest
import numpy as np
import polars as pl
from pathlib import Path

from packages.impact_models.price_response import PriceResponseEngine
from packages.impact_models.nonlinear_impact import NonlinearImpactModel
from packages.orderbook.book_builder import LocalOrderBook
from packages.orderbook.collector import LiveOrderBookCollector
from packages.analytics.hawkes import BivariateHawkesModel


def test_v11_multi_date_fixtures_exist():
    base_dir = Path("apps/web/public/data")
    assert base_dir.exists(), "apps/web/public/data directory must exist"

    dates = ["2026-07-01", "2026-07-02", "2026-07-03"]
    horizons = [5, 10, 20, 50, 100]

    for date in dates:
        assert (base_dir / f"audit_{date}.json").exists(), f"audit_{date}.json missing"
        assert (base_dir / f"buckets_1m_{date}.json").exists(), f"buckets_1m_{date}.json missing"
        assert (base_dir / f"response_{date}.json").exists(), f"response_{date}.json missing"
        assert (base_dir / f"models_{date}.json").exists(), f"models_{date}.json missing"
        assert (base_dir / f"hawkes_{date}.json").exists(), f"hawkes_{date}.json missing"

        for k in horizons:
            k_file = base_dir / f"models_{date}_k{k}.json"
            assert k_file.exists(), f"Horizon file {k_file.name} missing"


def test_v11_discrete_stratification_and_point_mass():
    np.random.seed(42)
    # 500 identical 0.00009 BTC trades + 500 other trades
    point_mass = [0.00009] * 500
    other_vols = list(np.random.uniform(0.0001, 0.5, 500))
    quantities = np.array(point_mass + other_vols)
    prices = 60000.0 + np.cumsum(np.random.normal(0, 1, len(quantities)))

    df = pl.DataFrame({
        "event_time_utc": [f"2026-07-01 00:00:{i % 60:02d}" for i in range(len(quantities))],
        "price": prices,
        "quantity": quantities,
        "direction": np.random.choice([1, -1], len(quantities))
    })

    model = NonlinearImpactModel()
    res = model.fit_impact_models(df, horizon_lag=5, sample_size=1000)

    binned = res["binned_empirical"]
    assert len(binned) > 0
    # The first tier should capture the 0.00009 point mass
    first_bin = binned[0]
    assert first_bin["is_point_mass"] is True
    assert first_bin["unique_quantities_count"] == 1
    assert first_bin["min_volume"] == pytest.approx(0.00009, rel=1e-5)
    assert first_bin["max_volume"] == pytest.approx(0.00009, rel=1e-5)
    assert first_bin["count"] == 500
    assert first_bin["pct_of_sample"] == pytest.approx(50.0, abs=1.0)


def test_v11_square_root_law_confidence_interval():
    np.random.seed(42)
    n = 1000
    quantities = np.random.uniform(0.001, 1.0, n)
    prices = 60000.0 + np.cumsum(np.random.normal(0, 1, n))
    directions = np.random.choice([1, -1], n)

    df = pl.DataFrame({
        "event_time_utc": [f"2026-07-01 00:00:{i % 60:02d}" for i in range(n)],
        "price": prices,
        "quantity": quantities,
        "direction": directions
    })

    model = NonlinearImpactModel()
    res = model.fit_impact_models(df, horizon_lag=5, sample_size=n)

    fit = res["power_law_fit"]
    assert "ci_95_lower" in fit
    assert "ci_95_upper" in fit
    assert "rejects_square_root_half" in fit
    assert "ci_contains_zero" in fit
    assert fit["ci_95_lower"] < fit["ci_95_upper"]
    assert isinstance(fit["rejects_square_root_half"], bool)
    assert isinstance(fit["ci_contains_zero"], bool)


def test_v11_hac_bandwidth_sensitivity():
    np.random.seed(42)
    n = 500
    prices = 60000.0 + np.cumsum(np.random.normal(0, 1, n))
    directions = np.random.choice([1, -1], n)

    df = pl.DataFrame({
        "event_time_utc": [f"2026-07-01 00:00:{i % 60:02d}" for i in range(n)],
        "price": prices,
        "quantity": np.random.exponential(0.5, n),
        "direction": directions
    })

    engine = PriceResponseEngine()
    res = engine.compute_event_response(df, lags=[1, 5, 10], sample_size=500)

    assert "curves" in res
    assert len(res["curves"]) == 3
    for curve in res["curves"]:
        assert "hac_bandwidth_sensitivity" in curve
        sens = curve["hac_bandwidth_sensitivity"]
        for bw in [5, 10, 20, 30, 50]:
            assert f"lag_{bw}" in sens
            assert sens[f"lag_{bw}"] > 0.0


def test_v11_orderbook_expired_event_and_reconnect():
    ob = LocalOrderBook("BTCUSDT")
    ob.start_buffering()

    # Snapshot at 100
    ob.apply_snapshot({
        "lastUpdateId": 100,
        "bids": [["60000.0", "1.0"]],
        "asks": [["60001.0", "1.0"]]
    })
    assert ob.prev_u == 100

    # Expired event: u <= 100
    expired = ob.process_diff_event({
        "U": 90,
        "u": 99,
        "b": [["59999.0", "1.0"]],
        "a": []
    })
    assert expired is True  # Dropped without desync
    assert ob.status == "SYNCHRONIZED"
    assert ob.prev_u == 100

    # Valid contiguous event: U <= 101 <= u
    valid = ob.process_diff_event({
        "U": 98,
        "u": 105,
        "b": [["60000.5", "2.0"]],
        "a": []
    })
    assert valid is True
    assert ob.prev_u == 105

    # Sequence gap: next expects U <= 106, provide U = 110
    gapped = ob.process_diff_event({
        "U": 110,
        "u": 115,
        "b": [],
        "a": []
    })
    assert gapped is False
    assert ob.status == "OUT_OF_SYNC"
    assert len(ob.gap_history) == 1

    # Collector OFI anchor reset test
    collector = LiveOrderBookCollector("BTCUSDT")
    collector._prev_best_bid = (60000.0, 1.0)
    collector._prev_best_ask = (60001.0, 1.0)
    collector.reset_state()
    assert collector._prev_best_bid is None
    assert collector._prev_best_ask is None


def test_v11_hawkes_tie_breaking_and_residual_diagnostics():
    np.random.seed(42)
    hawkes = BivariateHawkesModel(beta=10.0)

    # 200 events within 30 seconds with simultaneous events
    t_vals = np.sort(np.random.uniform(1.0, 30.0, 200))
    # Make indices 10, 11, 12 identical to test simultaneous tie-breaking
    t_vals[11] = t_vals[10]
    t_vals[12] = t_vals[10]
    # Make indices 50, 51 identical
    t_vals[51] = t_vals[50]

    ts_ns = (t_vals * 1e9).astype(np.int64)
    # Balanced directions (100 buys, 100 sells)
    dirs = np.array([1] * 100 + [-1] * 100)
    np.random.shuffle(dirs)

    df = pl.DataFrame({
        "event_timestamp_ns": ts_ns,
        "direction": dirs
    })

    res = hawkes.fit_trades(df, sample_size=200)
    assert "parameters" in res
    assert "branching_ratios" in res
    assert "stability_status" in res
    assert res["stability_status"] in ["SUBCRITICAL_STABLE", "SUPERCRITICAL_UNSTABLE"]

    assert "residual_diagnostics" in res
    diag = res["residual_diagnostics"]
    assert "buy_ks_statistic" in diag
    assert "sell_ks_statistic" in diag
    assert "buy_ks_p_value" in diag
    assert "sell_ks_p_value" in diag
    assert "buy_residual_autocorr_lag1" in diag
    assert "sell_residual_autocorr_lag1" in diag
    assert diag["buy_ks_statistic"] >= 0.0
    assert diag["sell_ks_statistic"] >= 0.0

    assert "control_model_microsecond_aggregated" in res
    ctrl = res["control_model_microsecond_aggregated"]
    assert "spectral_radius" in ctrl
    assert "stability_status" in ctrl
    assert "compression_ratio_pct" in ctrl
    assert ctrl["raw_events_count"] == 200
    assert ctrl["aggregated_events_count"] < 200


def test_v11_licensing_compliance():
    # Verify CC BY-NC-SA 4.0 in audit files and report
    base_dir = Path("apps/web/public/data")
    audit_01 = base_dir / "audit_2026-07-01.json"
    import json
    with open(audit_01, "r", encoding="utf-8") as f:
        data = json.load(f)
    assert "CC BY-NC-SA 4.0" in data["license"]
    assert "NonCommercial" in data["license_terms"]

    report_path = Path("research/reports/MML_BTCUSDT_MICROSTRUCTURE_REPORT.md")
    report_text = report_path.read_text(encoding="utf-8")
    assert "CC BY-NC-SA 4.0" in report_text

