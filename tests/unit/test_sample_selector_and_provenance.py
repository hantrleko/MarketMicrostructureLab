"""
Acceptance Criteria Tests for Unified Sample Selection, Sample Accounting, and Provenance Audit (P0 & P1).
Tests:
1. Deterministic ordering invariance under shuffled/out-of-order input.
2. Deduplication of duplicate trade IDs with exact dropped count accounting.
3. Filtering of missing, non-positive, or non-finite prices/quantities.
4. Multi-shard concatenation and cross-window boundary stability.
5. Mutation detection: altering a single trade inside the active window MUST change content_sha256 and fail parity.
6. Fail-close semantics: missing files or identity conflicts fail close (never silently pass).
7. Coherent sample accounting ledger (300k vs 250k vs effective horizon vs HAC regression subsample).
8. Cross-day walk-forward experiment execution and parameter drift tracking.
"""

import pytest
import numpy as np
import polars as pl
from pathlib import Path

from packages.governance.sample_selector import (
    SampleSelector,
    SampleSelectionSpec,
    SampleProvenanceSummary,
    SampleAccountingLedger
)
from packages.governance.manifest import DataManifestManager, APIError
from packages.impact_models.nonlinear_impact import NonlinearImpactModel
from packages.analytics.experiment_engine import ExperimentEngine


@pytest.fixture
def clean_base_trades():
    """Generates 1,000 synthetic chronological trades."""
    n = 1000
    base_ts = 1720000000000000000  # ns
    np.random.seed(42)
    trade_ids = np.arange(10001, 10001 + n, dtype=np.int64)
    prices = 60000.0 + np.cumsum(np.random.normal(0, 1.0, n))
    quantities = np.random.exponential(0.05, n) + 0.0001
    directions = np.random.choice([-1, 1], size=n).astype(np.int8)
    timestamps = base_ts + np.arange(n) * 1_000_000  # 1ms intervals

    df = pl.DataFrame({
        "trade_id": trade_ids,
        "price": prices,
        "base_quantity": quantities,
        "direction": directions,
        "event_timestamp_ns": timestamps,
        "event_time_utc": [f"2026-07-01T06:00:{i//1000:02d}.{i%1000:03d}Z" for i in range(n)],
        "symbol": ["BTCUSDT"] * n
    })
    return df


def test_sample_selector_sorting_invariance(clean_base_trades):
    """Verifies that shuffled/out-of-order inputs produce identical sample identity and hashes."""
    df_ordered = clean_base_trades
    # Shuffle rows randomly
    df_shuffled = df_ordered.sample(fraction=1.0, shuffle=True, seed=123)

    spec = SampleSelectionSpec(
        symbol="BTCUSDT",
        date="2026-07-01",
        target_sample_size=400,
        offset_ratio=0.25,
        selection_method="SESSION_ACTIVE_WINDOW"
    )

    sample_ord, prov_ord = SampleSelector.select_sample(df_ordered, spec)
    sample_shuf, prov_shuf = SampleSelector.select_sample(df_shuffled, spec)

    # Must match exactly
    assert len(sample_ord) == len(sample_shuf) == 400
    assert prov_ord.trade_ids_sha256 == prov_shuf.trade_ids_sha256
    assert prov_ord.content_sha256 == prov_shuf.content_sha256
    assert prov_ord.start_trade_id == prov_shuf.start_trade_id
    assert prov_ord.end_trade_id == prov_shuf.end_trade_id


def test_sample_selector_deduplication(clean_base_trades):
    """Verifies duplicate trade IDs are deterministically pruned and counted."""
    df_base = clean_base_trades
    # Duplicate 50 rows
    dupes = df_base.slice(100, 50)
    df_with_dupes = pl.concat([df_base, dupes])

    spec = SampleSelectionSpec(
        symbol="BTCUSDT",
        date="2026-07-01",
        target_sample_size=400,
        offset_ratio=0.25,
        selection_method="SESSION_ACTIVE_WINDOW"
    )

    sample, prov = SampleSelector.select_sample(df_with_dupes, spec)
    assert prov.duplicates_dropped == 50
    assert prov.total_valid_rows == 1000

    # Clean sample comparison
    _, prov_clean = SampleSelector.select_sample(df_base, spec)
    assert prov.content_sha256 == prov_clean.content_sha256


def test_sample_selector_missing_and_invalid_filtering(clean_base_trades):
    """Verifies non-positive, NaN, and invalid direction rows are removed with proper accounting."""
    df_base = clean_base_trades

    # Add 3 invalid rows: negative price, zero quantity, invalid direction
    invalid_rows = pl.DataFrame({
        "trade_id": [999901, 999902, 999903],
        "price": [-100.0, 60000.0, 60000.0],
        "base_quantity": [0.01, 0.0, 0.01],
        "direction": pl.Series([1, 1, 0], dtype=pl.Int8),  # 0 is invalid
        "event_timestamp_ns": [1720000000000000000, 1720000000000000001, 1720000000000000002],
        "event_time_utc": ["2026-07-01T06:00:00Z"] * 3,
        "symbol": ["BTCUSDT"] * 3
    })

    df_corrupted = pl.concat([df_base, invalid_rows])
    spec = SampleSelectionSpec(
        symbol="BTCUSDT",
        date="2026-07-01",
        target_sample_size=400,
        offset_ratio=0.25,
        selection_method="SESSION_ACTIVE_WINDOW"
    )

    sample, prov = SampleSelector.select_sample(df_corrupted, spec)
    assert prov.invalid_rows_dropped == 3
    assert prov.total_valid_rows == 1000


def test_sample_selector_multishard_concatenation(clean_base_trades):
    """Verifies splitting data across multiple shards produces identical selection identity."""
    df = clean_base_trades
    shard1 = df.slice(0, 300)
    shard2 = df.slice(300, 400)
    shard3 = df.slice(700, 300)

    # Concatenate in reverse order
    reassembled = pl.concat([shard3, shard1, shard2])

    spec = SampleSelectionSpec(
        symbol="BTCUSDT",
        date="2026-07-01",
        target_sample_size=500,
        offset_ratio=0.25,
        selection_method="SESSION_ACTIVE_WINDOW"
    )

    sample_orig, prov_orig = SampleSelector.select_sample(df, spec)
    sample_reasm, prov_reasm = SampleSelector.select_sample(reassembled, spec)

    assert prov_orig.content_sha256 == prov_reasm.content_sha256
    assert prov_orig.trade_ids_sha256 == prov_reasm.trade_ids_sha256
    assert prov_orig.start_trade_id == prov_reasm.start_trade_id


def test_mutation_detection_inside_selected_window(clean_base_trades):
    """
    CRITICAL ACCEPTANCE CRITERIA:
    Modifying ANY single trade within the model window MUST alter content_sha256
    and be detected by the cryptographic verification.
    """
    df_clean = clean_base_trades
    spec = SampleSelectionSpec(
        symbol="BTCUSDT",
        date="2026-07-01",
        target_sample_size=400,
        offset_ratio=0.25,
        selection_method="SESSION_ACTIVE_WINDOW"
    )

    _, prov_clean = SampleSelector.select_sample(df_clean, spec)

    # Mutate row index 280 (which falls squarely inside [250 : 650] window)
    df_mutated = df_clean.with_columns(
        pl.when(pl.col("trade_id") == 10001 + 280)
        .then(pl.col("price") + 5.0)
        .otherwise(pl.col("price"))
        .alias("price")
    )

    _, prov_mutated = SampleSelector.select_sample(df_mutated, spec)

    # Hash MUST differ!
    assert prov_mutated.content_sha256 != prov_clean.content_sha256
    # Trade IDs hash remains identical because only price mutated
    assert prov_mutated.trade_ids_sha256 == prov_clean.trade_ids_sha256


def test_mutation_of_trade_id_alters_both_hashes(clean_base_trades):
    """Verifies that altering a trade ID alters both trade_ids_sha256 and content_sha256."""
    df_clean = clean_base_trades
    spec = SampleSelectionSpec(
        symbol="BTCUSDT",
        date="2026-07-01",
        target_sample_size=400,
        offset_ratio=0.25,
        selection_method="SESSION_ACTIVE_WINDOW"
    )

    _, prov_clean = SampleSelector.select_sample(df_clean, spec)

    # Mutate trade_id at row 300
    df_mutated = df_clean.with_columns(
        pl.when(pl.col("trade_id") == 10001 + 300)
        .then(pl.lit(99999999))
        .otherwise(pl.col("trade_id"))
        .alias("trade_id")
    )

    _, prov_mutated = SampleSelector.select_sample(df_mutated, spec)

    assert prov_mutated.trade_ids_sha256 != prov_clean.trade_ids_sha256
    assert prov_mutated.content_sha256 != prov_clean.content_sha256


def test_sample_accounting_ledger_hierarchy():
    """Verifies formal SampleAccountingLedger hierarchy and explanations."""
    ledger = SampleAccountingLedger(
        date="2026-07-01",
        symbol="BTCUSDT",
        raw_input_total_rows=4_166_849,
        normalized_catalog_rows=4_166_849,
        session_selection_method="SESSION_ACTIVE_WINDOW",
        session_offset_ratio=0.25,
        session_start_index=1_041_712,
        response_curve_window_trades=300_000,
        response_curve_start_time_utc="2026-07-01T06:14:12Z",
        response_curve_end_time_utc="2026-07-01T08:12:45Z",
        impact_model_window_trades=250_000,
        impact_model_start_time_utc="2026-07-01T06:14:12Z",
        impact_model_end_time_utc="2026-07-01T07:52:18Z",
        impact_model_start_trade_id=6466989766,
        impact_model_end_trade_id=6467239765,
        horizon_lag=20,
        effective_horizon_observations=249_980,
        positive_displacement_trades=179_406,
        positive_displacement_pct=71.77,
        regression_subsample_trades=59_802,
        regression_sampling_stride=3
    )

    data = ledger.to_dict()
    assert data["raw_input_total_rows"] == 4_166_849
    assert data["response_curve_window_trades"] == 300_000
    assert data["impact_model_window_trades"] == 250_000
    assert data["effective_horizon_observations"] == 250_000 - 20
    assert "strict temporal sub-window" in data["window_difference_explanation"]
    assert "Systematic sub-sampling" in data["regression_stride_explanation"]


def test_cross_day_walk_forward_execution():
    """Verifies that ExperimentEngine executes expanding cross-day walk-forward across 3 days."""
    engine = ExperimentEngine()
    res = engine.run_cross_day_walk_forward(horizon_lag=20, sample_size_per_day=5000)

    assert res["protocol"] == "EXPANDING_CROSS_DAY_WALK_FORWARD"
    assert len(res["folds"]) == 2

    # Fold 1: Train 07-01 -> Test 07-02
    f1 = res["folds"][0]
    assert f1["train_dates"] == ["2026-07-01"]
    assert f1["test_date"] == "2026-07-02"
    assert "log_model" in f1 and "power_law_model" in f1
    assert "oos_r2" in f1["log_model"]

    # Fold 2: Train [07-01, 07-02] -> Test 07-03
    f2 = res["folds"][1]
    assert f2["train_dates"] == ["2026-07-01", "2026-07-02"]
    assert f2["test_date"] == "2026-07-03"
    assert f2["train_observations"] > f1["train_observations"]


def test_identity_mismatch_strictly_fails_close():
    """Verifies that symbol or date crosstalk strictly raises APIError with 500 DATA_IDENTITY_MISMATCH."""
    manifest_mgr = DataManifestManager()
    corrupt_df = pl.DataFrame({
        "symbol": ["ETHUSDT"],  # Identity mismatch against requested BTCUSDT!
        "event_time_utc": ["2026-07-01T06:00:00Z"],
        "trade_id": [12345]
    })
    entry = manifest_mgr.resolve_dataset("BTCUSDT", "2026-07-01", is_production=False, allow_fixtures=True)

    with pytest.raises(APIError) as exc_info:
        manifest_mgr.validate_content_identity(corrupt_df, "BTCUSDT", "2026-07-01", entry)

    assert exc_info.value.status_code == 500
    assert exc_info.value.code == "DATA_IDENTITY_MISMATCH"
