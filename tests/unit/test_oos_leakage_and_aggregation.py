"""
Unit tests verifying elimination of out-of-sample (OOS) parameter leakage,
purged walk-forward non-overlapping test partitions, and dual OOS aggregation.
"""

import numpy as np
import polars as pl
import pytest
from packages.impact_models.nonlinear_impact import NonlinearImpactModel


def _generate_synthetic_trade_flow(n: int = 1000, seed: int = 42) -> pl.DataFrame:
    np.random.seed(seed)
    directions = np.random.choice([1, -1], size=n)
    quantities = np.random.exponential(scale=0.1, size=n) + 0.0001
    price_innovations = directions * (quantities ** 0.3) * 0.5 + np.random.normal(0, 0.02, n)
    prices = 60000.0 + np.cumsum(price_innovations)

    return pl.DataFrame({
        "symbol": ["BTCUSDT"] * n,
        "price": prices,
        "direction": directions,
        "base_quantity": quantities,
        "event_timestamp_ns": [1720000000000000000 + i * 100000000 for i in range(n)],
        "event_time_utc": [f"2026-07-01T00:{i//60:02d}:{i%60:02d}Z" for i in range(n)]
    })


def _assert_approx_equal(actual, expected, rel=1e-9):
    if expected is None:
        assert actual is None
    else:
        assert actual == pytest.approx(expected, rel=rel)


def test_oos_leakage_invariance_on_test_y_mutation():
    """
    Modifying test set returns (y) must leave all training-fitted parameters
    (in single hold-out and every walk-forward fold) strictly unchanged.
    Test metrics (R^2) are allowed to change.
    """
    df_base = _generate_synthetic_trade_flow(n=1000, seed=42)
    k = 10
    model = NonlinearImpactModel()

    fit_base = model.fit_impact_models(df_base, horizon_lag=k)
    oos_base = fit_base["out_of_sample_validation"]
    wf_base = fit_base["walk_forward_validation"]

    # Record baseline training fitted parameters
    base_oos_gamma = oos_base["power_law_train_fit"]["gamma_train"]
    base_oos_alpha = oos_base["power_law_train_fit"]["alpha_train"]
    base_wf_folds = wf_base["folds"]

    # Mutate test y: add price shocks only to test region (index >= 550)
    # Note: OOS train ends at half - k = 485; mutating index >= 550 strictly isolates test set
    prices_mut = df_base["price"].to_numpy().copy()
    prices_mut[550:] += np.sin(np.linspace(0, 10, len(prices_mut) - 550)) * 50.0

    df_mut = df_base.with_columns(pl.Series("price", prices_mut))
    fit_mut = model.fit_impact_models(df_mut, horizon_lag=k)
    oos_mut = fit_mut["out_of_sample_validation"]
    wf_mut = fit_mut["walk_forward_validation"]

    # Assert training-fitted parameters are 100% invariant
    _assert_approx_equal(oos_mut["power_law_train_fit"]["gamma_train"], base_oos_gamma)
    _assert_approx_equal(oos_mut["power_law_train_fit"]["alpha_train"], base_oos_alpha)

    # For walk-forward fold 1 (train ends at 396 - 10 = 386), mutating index >= 550 cannot affect fold 1
    _assert_approx_equal(wf_mut["folds"][0]["log_model"]["beta"], base_wf_folds[0]["log_model"]["beta"])
    _assert_approx_equal(wf_mut["folds"][0]["power_law_model"]["gamma"], base_wf_folds[0]["power_law_model"]["gamma"])

    # Test metrics evaluate on modified y and thus differ
    assert oos_mut["log_model_oos_r2"] != oos_base["log_model_oos_r2"]


def test_oos_leakage_invariance_on_test_x_mutation():
    """
    Modifying test set features (X, base_quantity) must leave all training-fitted
    parameters strictly unchanged.
    """
    df_base = _generate_synthetic_trade_flow(n=1000, seed=123)
    k = 10
    model = NonlinearImpactModel()

    fit_base = model.fit_impact_models(df_base, horizon_lag=k)
    oos_base = fit_base["out_of_sample_validation"]
    wf_base = fit_base["walk_forward_validation"]

    base_oos_gamma = oos_base["power_law_train_fit"]["gamma_train"]
    base_oos_alpha = oos_base["power_law_train_fit"]["alpha_train"]

    # Mutate test X: alter quantities in test region only (index >= 550)
    qty_mut = df_base["base_quantity"].to_numpy().copy()
    qty_mut[550:] = qty_mut[550:] * 3.5 + 0.05

    df_mut = df_base.with_columns(pl.Series("base_quantity", qty_mut))
    fit_mut = model.fit_impact_models(df_mut, horizon_lag=k)
    oos_mut = fit_mut["out_of_sample_validation"]
    wf_mut = fit_mut["walk_forward_validation"]

    # Assert training-fitted parameters are strictly invariant
    _assert_approx_equal(oos_mut["power_law_train_fit"]["gamma_train"], base_oos_gamma)
    _assert_approx_equal(oos_mut["power_law_train_fit"]["alpha_train"], base_oos_alpha)

    # Fold 1 train parameters invariant
    _assert_approx_equal(wf_mut["folds"][0]["log_model"]["beta"], wf_base["folds"][0]["log_model"]["beta"])
    _assert_approx_equal(wf_mut["folds"][0]["power_law_model"]["gamma"], wf_base["folds"][0]["power_law_model"]["gamma"])


def test_purge_and_label_coverage_separation():
    """
    Verify that lookahead purge buffer strictly prevents label overlap:
    For horizon k, last training observation at tr_end must satisfy tr_end + k <= te_start.
    """
    df = _generate_synthetic_trade_flow(n=1000, seed=99)
    k = 20
    model = NonlinearImpactModel()
    fit = model.fit_impact_models(df, horizon_lag=k)

    wf = fit["walk_forward_validation"]
    for f in wf["folds"]:
        tr_start, tr_end = f["train_indices"]
        te_start, te_end = f["test_indices"]

        # Assert purge buffer separation
        assert tr_end + k <= te_start, (
            f"Fold {f['fold']} violation: tr_end={tr_end}, k={k}, te_start={te_start}"
        )
        assert f["purged_observations"] == k


def test_non_overlapping_test_partitions_and_unique_pooled_metrics():
    """
    Verify that walk-forward test partitions are 100% mutually disjoint (non-overlapping),
    and that pooled OOS metrics concatenate exactly these unique predictions.
    """
    df = _generate_synthetic_trade_flow(n=1000, seed=77)
    k = 15
    model = NonlinearImpactModel()
    fit = model.fit_impact_models(df, horizon_lag=k)

    wf = fit["walk_forward_validation"]
    folds = wf["folds"]
    assert len(folds) == 3

    # Check non-overlapping test partitions
    intervals = [f["test_indices"] for f in folds]
    for i in range(len(intervals) - 1):
        # Current test end equals or precedes next test start
        assert intervals[i][1] <= intervals[i + 1][0]
        # Zero intersection
        set1 = set(range(intervals[i][0], intervals[i][1]))
        set2 = set(range(intervals[i + 1][0], intervals[i + 1][1]))
        assert len(set1 & set2) == 0

    # Total unique predictions in pooled metrics must equal sum of fold test observations
    pooled = wf["pooled_oos"]
    sum_test_obs = sum(f["test_observations"] for f in folds)
    assert pooled["total_unique_predictions"] == sum_test_obs
    assert pooled["total_purged_boundary_trades"] == len(folds) * k
    assert pooled["denominator_ss_tot"] > 0
    assert "log_oos_r2" in pooled

    # Verify identical sample identity, observation count, and target definition for Log vs Power-Law
    for f in folds:
        assert f["train_observations"] > 0
        assert f["test_observations"] > 0
        assert f["purged_observations"] == k
        # Target returns and feature matrices evaluate the same horizon k
        assert "log_model" in f and "power_law_model" in f
        assert "log_oos_r2" in f and "power_oos_r2" in f


def test_inestimable_fold_retains_status_without_fallback():
    """
    If a training fold cannot estimate the power-law model (e.g. insufficient positive tiers),
    it must report NOT_ESTIMABLE with None parameters, and never fallback to full-sample fit.
    """
    model = NonlinearImpactModel()
    # Degenerate data: identical trade sizes and zero price variation
    df = pl.DataFrame({
        "symbol": ["BTCUSDT"] * 400,
        "price": [50000.0] * 400,
        "direction": [1] * 400,
        "base_quantity": [0.01] * 400
    })
    fit = model.fit_impact_models(df, horizon_lag=5)
    wf = fit["walk_forward_validation"]

    # Must be handled gracefully with NOT_ESTIMABLE or failed folds
    assert wf["folds_count"] == 3
    for f in wf["folds"]:
        assert f["status"] in ("NOT_ESTIMABLE", "PARTIAL")
        if f["power_law_model"]["status"] != "ESTIMATED":
            assert f["power_law_model"]["gamma"] is None
            assert f["power_oos_r2"] is None
        if f["log_model"]["status"] != "ESTIMATED":
            assert f["log_model"]["beta"] is None
            assert f["log_oos_r2"] is None


def test_raw_unconstrained_negative_oos_r2_not_clamped():
    """
    Ensure out-of-sample R^2 is strictly unconstrained and never clamped to -1.0.
    Under severe out-of-sample regime shifts, R^2 can be < -1.0.
    """
    n = 1000
    k = 10
    np.random.seed(42)

    # In training split (first 500), large positive relationship between quantity and return
    # In test split (last 500), opposite relationship with high leverage to produce R^2 < -1.0
    q = np.random.exponential(scale=1.0, size=n) + 0.1
    directions = np.ones(n)

    # Train (first 500): positive return slope
    # Test (last 500): negative return slope with high magnitude
    r_innov = np.zeros(n)
    r_innov[:500] = 5.0 * np.log(q[:500]) + np.random.normal(0, 0.1, 500)
    r_innov[500:] = -15.0 * np.log(q[500:]) + np.random.normal(0, 0.1, 500)

    # Convert innovations to prices
    prices = 60000.0 + np.cumsum(r_innov)

    df = pl.DataFrame({
        "symbol": ["BTCUSDT"] * n,
        "price": prices,
        "direction": directions,
        "base_quantity": q,
        "event_timestamp_ns": [1720000000000000000 + i * 100000000 for i in range(n)],
        "event_time_utc": [f"2026-07-01T00:{i//60:02d}:{i%60:02d}Z" for i in range(n)]
    })

    model = NonlinearImpactModel()
    fit = model.fit_impact_models(df, horizon_lag=k)
    oos = fit["out_of_sample_validation"]

    # Verify that single hold-out log_model_oos_r2 is strictly less than -1.0 and not clamped
    assert oos["log_model_oos_r2"] is not None
    assert oos["log_model_oos_r2"] < -1.0, f"Expected R^2 < -1.0, got {oos['log_model_oos_r2']}"

    # Also check walk-forward folds
    wf = fit["walk_forward_validation"]
    assert len(wf["folds"]) == 3
    # At least one fold spanning the regime shift will have R^2 < -1.0
    fold_r2s = [f["log_oos_r2"] for f in wf["folds"] if f["log_oos_r2"] is not None]
    assert any(r2 < -1.0 for r2 in fold_r2s), f"Expected at least one fold with R^2 < -1.0, got {fold_r2s}"

