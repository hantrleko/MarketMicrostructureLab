"""
Unit tests for Price Response Engine and Nonlinear Impact Models.
"""

import pytest
import numpy as np
import polars as pl
from packages.impact_models.price_response import PriceResponseEngine
from packages.impact_models.nonlinear_impact import NonlinearImpactModel


def test_price_response_formula():
    engine = PriceResponseEngine()
    # If price moves strictly in the direction of the trade:
    # BUY at 100, then at lag 1 price is 101 -> ret = ln(101/100) > 0, eps = +1 -> eps * ret > 0
    # SELL at 101, then at lag 1 price is 100 -> ret = ln(100/101) < 0, eps = -1 -> eps * ret > 0
    df = pl.DataFrame({
        "symbol": ["TEST"] * 10,
        "price": [100.0, 101.0, 100.0, 101.0, 100.0, 101.0, 100.0, 101.0, 100.0, 101.0],
        "direction": [1, -1, 1, -1, 1, -1, 1, -1, 1, -1],
        "base_quantity": [1.0] * 10
    })
    res = engine.compute_event_response(df, lags=[1], sample_size=10)
    curve_1 = res["curves"][0]
    # Response must be strictly positive
    assert curve_1["response_bps"] > 0
    assert curve_1["lag_events"] == 1


def test_nonlinear_impact_models():
    model = NonlinearImpactModel()
    # Synthetic dataset with 100 points
    n = 100
    prices = [100.0 + np.sin(i * 0.1) for i in range(n)]
    df = pl.DataFrame({
        "price": prices,
        "direction": [1 if i % 2 == 0 else -1 for i in range(n)],
        "base_quantity": [0.1 + (i % 10) * 0.05 for i in range(n)]
    })
    fit = model.fit_impact_models(df, horizon_lag=5, sample_size=n)
    assert "linear_model" in fit
    assert "logarithmic_model" in fit
    assert "power_law_model" in fit
    assert "hypothesis_test_sqrt_law" in fit["power_law_model"]


def test_inestimable_on_constant_price_counterexample():
    """
    CRITICAL INTEGRITY TEST:
    When prices are invariant (constant), the model must strictly report NOT_ESTIMABLE.
    It MUST NOT fabricate gamma=0, SE=0.05, CI=[-0.1, 0.1], nor state 'reject 0.5 (p < 0.001)'.
    """
    model = NonlinearImpactModel()
    n = 500
    df = pl.DataFrame({
        "symbol": ["BTCUSDT"] * n,
        "price": [60000.0] * n,  # Zero variance in price
        "direction": [1 if i % 2 == 0 else -1 for i in range(n)],
        "base_quantity": [0.01 * (i % 10 + 1) for i in range(n)],
        "event_timestamp_ns": [1720000000000000000 + i * 1000000 for i in range(n)],
        "event_time_utc": ["2026-07-01T00:00:00Z"] * n
    })
    fit = model.fit_impact_models(df, horizon_lag=10)
    
    pow_model = fit["power_law_model"]
    assert pow_model["status"] == "NOT_ESTIMABLE"
    assert pow_model["is_estimable"] is False
    assert pow_model["gamma"] is None
    assert pow_model["gamma_se"] is None
    assert pow_model["ci_95_lower"] is None
    assert pow_model["ci_95_upper"] is None
    assert pow_model["rejects_square_root_half"] is False

    test_sqrt = pow_model["hypothesis_test_sqrt_law"]
    assert test_sqrt["status"] == "NOT_ESTIMABLE"
    assert test_sqrt["gamma_estimate"] is None
    assert test_sqrt["gamma_estimate_wls"] is None
    assert test_sqrt["is_rejected_at_5pct"] is False
    assert test_sqrt["confidence_interval_95"] is None

    # Text interpretation must explicitly flag NOT_ESTIMABLE and must NOT claim false rejection
    interp = test_sqrt["interpretation"]
    assert "NOT_ESTIMABLE" in interp
    assert "reject 0.5 (p < 0.001)" not in interp


def test_inestimable_on_pure_negative_response_counterexample():
    """
    When prices systematically move against trade direction (no positive tiers),
    power-law model must be NOT_ESTIMABLE.
    """
    model = NonlinearImpactModel()
    n = 300
    # Price falls on BUYs, rises on SELLs -> signed return R < 0
    df = pl.DataFrame({
        "symbol": ["BTCUSDT"] * n,
        "price": [60000.0 - (i if i % 2 == 0 else -i) * 0.5 for i in range(n)],
        "direction": [1 if i % 2 == 0 else -1 for i in range(n)],
        "base_quantity": [0.05 + (i % 5) * 0.02 for i in range(n)],
        "event_timestamp_ns": [1720000000000000000 + i * 1000000 for i in range(n)],
        "event_time_utc": ["2026-07-01T00:00:00Z"] * n
    })
    fit = model.fit_impact_models(df, horizon_lag=5)
    pow_model = fit["power_law_model"]
    assert pow_model["status"] == "NOT_ESTIMABLE"
    assert pow_model["is_estimable"] is False
    assert pow_model["gamma"] is None


def test_inestimable_on_insufficient_sample_counterexample():
    """
    Sample with only 10 trades when horizon lag is 5 must report NOT_ESTIMABLE.
    """
    model = NonlinearImpactModel()
    df = pl.DataFrame({
        "symbol": ["BTCUSDT"] * 10,
        "price": [60000.0 + i for i in range(10)],
        "direction": [1] * 10,
        "base_quantity": [0.1] * 10
    })
    fit = model.fit_impact_models(df, horizon_lag=5)
    assert fit["power_law_model"]["status"] == "NOT_ESTIMABLE"


def test_moving_block_bootstrap_and_purged_oos_on_valid_data():
    """
    On valid varying trade data:
    1. Moving Block Bootstrap must evaluate multiple block sizes (100, 250, 500).
    2. OOS validation must apply purging across the split boundary.
    """
    np.random.seed(42)
    n = 1000
    # Simulate upward drift on BUYs, downward on SELLs with volume elasticity
    directions = np.random.choice([1, -1], size=n)
    quantities = np.random.exponential(scale=0.1, size=n) + 0.0001
    price_innovations = directions * (quantities ** 0.3) * 0.5 + np.random.normal(0, 0.05, n)
    prices = 60000.0 + np.cumsum(price_innovations)

    df = pl.DataFrame({
        "symbol": ["BTCUSDT"] * n,
        "price": prices,
        "direction": directions,
        "base_quantity": quantities,
        "event_timestamp_ns": [1720000000000000000 + i * 100000000 for i in range(n)],
        "event_time_utc": [f"2026-07-01T00:{i//60:02d}:{i%60:02d}Z" for i in range(n)]
    })

    model = NonlinearImpactModel()
    fit = model.fit_impact_models(df, horizon_lag=10)

    # 1. Verify Purged OOS & Dual Comparison
    oos = fit["out_of_sample_validation"]
    assert oos["purging_applied"] is True
    assert oos["purged_boundary_trades"] == 10
    assert oos["model_specification"].startswith("Logarithmic Specification")
    assert oos["is_power_law_oos"] is False
    assert "power_law_oos_r2" in oos

    # 2. Verify Walk-Forward Purged Evaluation
    assert "walk_forward_validation" in fit
    wf = fit["walk_forward_validation"]
    assert wf["folds_count"] > 0
    assert "mean_log_oos_r2" in wf
    assert wf["purged_trades_per_boundary"] == 10

    # 3. Verify Moving Block Bootstrap
    mbb = fit["moving_block_bootstrap"]
    assert "block_sizes_evaluated" in mbb
    assert 250 in mbb["block_sizes_evaluated"]
    assert "results_by_block_size" in mbb

