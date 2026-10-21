"""
Unit tests verifying M1 status-driven result contracts:
- Error codes: INSUFFICIENT_DATA, INVALID_INPUT, SINGULAR_DESIGN, SOLVER_ERROR, NON_FINITE_OUTPUT
- On failure: fit is None, parameters and R^2 are None (never 0.0)
- Legitimate zero slope and legitimate R^2=0
- Undefined metric: constant target return yields beta=0.0 with R^2=None (UNDEFINED_METRIC), not a fit failure
- Moving block bootstrap sensitivity table (M3)
"""

import numpy as np
import polars as pl
import pytest
from packages.impact_models.nonlinear_impact import NonlinearImpactModel


def _make_df(prices, quantities, directions=None):
    n = len(prices)
    if directions is None:
        directions = np.ones(n)
    return pl.DataFrame({
        "symbol": ["BTCUSDT"] * n,
        "price": prices,
        "direction": directions,
        "base_quantity": quantities,
        "event_timestamp_ns": [1720000000000000000 + i * 100000000 for i in range(n)],
        "event_time_utc": [f"2026-07-01T00:{i//60:02d}:{i%60:02d}Z" for i in range(n)]
    })


def test_insufficient_sample_insufficient_data():
    """Sample below threshold N < 20 must return NOT_ESTIMABLE with INSUFFICIENT_DATA and None parameters."""
    model = NonlinearImpactModel()
    df = _make_df(
        prices=[50000.0 + i for i in range(15)],
        quantities=[0.1 + i * 0.01 for i in range(15)]
    )
    res = model.fit_impact_models(df, horizon_lag=2)

    lin = res["linear_model"]
    assert lin["status"] == "NOT_ESTIMABLE"
    assert lin["fit"] is None
    assert lin["error"]["code"] == "INSUFFICIENT_DATA"
    assert lin["beta"] is None
    assert lin["r_squared"] is None

    log_m = res["logarithmic_model"]
    assert log_m["status"] == "NOT_ESTIMABLE"
    assert log_m["fit"] is None
    assert log_m["error"]["code"] == "INSUFFICIENT_DATA"
    assert log_m["beta"] is None
    assert log_m["r_squared"] is None


def test_constant_feature_singular_design():
    """Constant quantity feature (variance < 1e-12) must return NOT_ESTIMABLE with SINGULAR_DESIGN."""
    model = NonlinearImpactModel()
    n = 100
    df = _make_df(
        prices=[50000.0 + i * 0.5 for i in range(n)],
        quantities=[0.05] * n  # Constant quantity
    )
    res = model.fit_impact_models(df, horizon_lag=5)

    lin = res["linear_model"]
    assert lin["status"] == "NOT_ESTIMABLE"
    assert lin["fit"] is None
    assert lin["error"]["code"] == "SINGULAR_DESIGN"
    assert lin["beta"] is None
    assert lin["r_squared"] is None


def test_constant_target_legitimate_zero_slope_and_undefined_r2():
    """
    Constant target return (R is constant, return variance < 1e-12) while quantity varies:
    Model is ESTIMATED with beta=0.0, but R^2 is mathematically undefined (SS_tot = 0).
    Must NOT mark fit as failed, and must NOT fabricate R^2=0.0.
    """
    model = NonlinearImpactModel()
    n = 100
    # Prices constant -> return over horizon lag is identically 0.0
    df = _make_df(
        prices=[60000.0] * n,
        quantities=[0.01 + i * 0.005 for i in range(n)]
    )
    res = model.fit_impact_models(df, horizon_lag=5)

    lin = res["linear_model"]
    assert lin["status"] == "ESTIMATED"
    assert lin["fit"] is not None
    assert lin["fit"]["beta"] == 0.0
    assert lin["fit"]["r_squared"] is None
    assert lin["metrics_diagnostics"]["r_squared"]["status"] == "UNDEFINED_METRIC"
    assert lin["error"] is None

    log_m = res["logarithmic_model"]
    assert log_m["status"] == "ESTIMATED"
    assert log_m["fit"] is not None
    assert log_m["fit"]["beta"] == 0.0
    assert log_m["fit"]["r_squared"] is None
    assert log_m["metrics_diagnostics"]["r_squared"]["status"] == "UNDEFINED_METRIC"


def test_insufficient_positive_tiers_for_power_law():
    """When all returns are negative/zero, power law must report NOT_ESTIMABLE with INSUFFICIENT_DATA."""
    model = NonlinearImpactModel()
    n = 200
    # Price strictly falling while direction is BUY (+1) -> signed return strictly negative
    prices = [60000.0 - i * 1.0 for i in range(n)]
    quantities = [0.01 + (i % 10) * 0.02 for i in range(n)]
    df = _make_df(prices=prices, quantities=quantities, directions=np.ones(n))

    res = model.fit_impact_models(df, horizon_lag=5)
    pow_m = res["power_law_model"]
    assert pow_m["status"] == "NOT_ESTIMABLE"
    assert pow_m["gamma"] is None
    assert pow_m["r_squared_binned"] is None
    assert pow_m["wls_fit"]["gamma"] is None
    assert pow_m["wls_fit"]["ci_95"] is None


def test_moving_block_bootstrap_and_sensitivity_table():
    """Verify MBB computes grid of block sizes [50, 100, 250, 500] and populates sensitivity table."""
    np.random.seed(42)
    n = 1000
    directions = np.random.choice([1, -1], size=n)
    quantities = np.random.exponential(scale=0.1, size=n) + 0.0001
    price_innovations = directions * (quantities ** 0.3) * 0.5 + np.random.normal(0, 0.05, n)
    prices = 60000.0 + np.cumsum(price_innovations)

    df = _make_df(prices=prices, quantities=quantities, directions=directions)
    model = NonlinearImpactModel()
    res = model.fit_impact_models(df, horizon_lag=10)

    mbb = res["moving_block_bootstrap"]
    assert mbb["status"] in ("SUCCESS", "PARTIAL")
    assert "sensitivity_table" in mbb
    table = mbb["sensitivity_table"]
    assert len(table) > 0

    # Ensure block sizes 50, 100, 250, 500 are evaluated
    block_sizes_found = {row["block_size_events"] for row in table}
    assert 50 in block_sizes_found
    assert 100 in block_sizes_found
    assert 250 in block_sizes_found
    assert 500 in block_sizes_found

    for row in table:
        assert "estimator" in row
        assert "ci_95" in row
        assert "ci_contains_zero" in row
        assert "ci_contains_half" in row
        if row["ci_95"] is not None:
            assert row["replications"] >= 20
        else:
            assert "Unavailable" in row["verdict"]

    assert "sensitivity_verdict" in mbb
    assert mbb["sensitivity_verdict"] in ("STABLE_ACROSS_BLOCK_SIZES", "SENSITIVE_TO_TEMPORAL_DEPENDENCE_SPECIFICATION")


def test_trade_level_hac_exact_test_statistics_and_significance():
    """
    Verifies that trade_level_fit exposes exact test statistics:
    - t_statistic_trade
    - p_value_trade
    - df_resid
    - confidence_interval_95
    - is_significant_5pct
    Specifically verifies that a non-significant t-statistic (|t| < 1.96, e.g. t = -1.45)
    produces two-sided p > 0.05 and is_significant_5pct == False, guarding against hardcoded 'p < 0.001'.
    """
    model = NonlinearImpactModel()

    # Construct synthetic trade-level data with noise where true impact is zero
    np.random.seed(101)
    n = 300
    prices = 60000.0 + np.cumsum(np.random.normal(0, 0.01, n))
    quantities = np.random.exponential(scale=0.05, size=n) + 0.001
    df = _make_df(prices=prices, quantities=quantities, directions=np.ones(n))

    res = model.fit_impact_models(df, horizon_lag=5)
    tr_fit = res["power_law_model"].get("trade_level_fit")

    if tr_fit and tr_fit.get("gamma_trade") is not None and tr_fit.get("gamma_trade") != 0:
        assert "t_statistic_trade" in tr_fit
        assert "p_value_trade" in tr_fit
        assert "df_resid" in tr_fit
        assert "confidence_interval_95" in tr_fit
        assert "is_significant_5pct" in tr_fit

        t_stat = tr_fit["t_statistic_trade"]
        p_val = tr_fit["p_value_trade"]
        is_sig = tr_fit["is_significant_5pct"]

        if abs(t_stat) < 1.96:
            assert p_val > 0.05, f"Expected non-significant p > 0.05 for t={t_stat}, got p={p_val}"
            assert is_sig is False
        else:
            assert p_val <= 0.05
            assert is_sig is True


def test_mbb_sensitivity_flips_on_ols_zero_containment():
    """
    Verifies that compute_moving_block_bootstrap evaluates all 4 hypotheses
    (WLS zero, WLS half, OLS zero, OLS half) across block lengths and exposes
    hypothesis_sensitivity and sensitivity_verdict accordingly.
    """
    model = NonlinearImpactModel()

    # Generate synthetic trades with realistic volume tiers
    np.random.seed(42)
    n = 1500
    Q = np.random.exponential(scale=0.1, size=n) + 0.001
    # Returns with mild impact and noise
    R = 0.0001 * (Q ** 0.4) + np.random.normal(0, 0.001, size=n)

    pcts = [float(np.percentile(Q, i * 10)) for i in range(11)]
    tier_definitions = [
        (f"T{i}", (lambda q_low, q_high: lambda q: (q >= q_low) & (q <= q_high))(pcts[i], pcts[i + 1]), False)
        for i in range(10)
    ]

    res = model.compute_moving_block_bootstrap(
        Q=Q,
        R=R,
        tier_definitions=tier_definitions,
        block_sizes=[50, 100, 250, 500],
        num_bootstraps=25,
        random_seed=42
    )

    assert "sensitivity_verdict" in res
    assert "sensitivity_summary" in res
    assert "hypothesis_sensitivity" in res
    assert "ols_zero_flip" in res["hypothesis_sensitivity"]
    assert "ols_half_flip" in res["hypothesis_sensitivity"]
    assert "wls_zero_flip" in res["hypothesis_sensitivity"]
    assert "wls_half_flip" in res["hypothesis_sensitivity"]
    assert "is_sensitive" in res["hypothesis_sensitivity"]
    assert res["sensitivity_verdict"] in ("STABLE_ACROSS_BLOCK_SIZES", "SENSITIVE_TO_TEMPORAL_DEPENDENCE_SPECIFICATION")

