"""
Tests for Numerical Parity Evaluation, Tolerance Threshold Boundaries,
and Cryptographically Bound Certificate Issuance (M6 & P0 Requirements).
"""

import json
import pytest
from pathlib import Path
from scripts.recompute_and_audit_provenance import (
    classify_delta,
    evaluate_numerical_parity,
    emit_recomputation_certificate,
    verify_archive_checksum,
    compute_sha256,
    ChecksumVerificationEvidence,
    NumericalParityEvaluation,
    MetricParityItem,
    SampleRecomputationAuditExecution,
)


def test_delta_zero_numerical_exact_match():
    """Requirement: delta == 0.0 -> NUMERICAL_EXACT_MATCH ('数值完全一致')"""
    classification, status = classify_delta(0.0, tolerance_threshold=1e-6)
    assert classification == "NUMERICAL_EXACT_MATCH"
    assert status == "MATCH"

    eval_res = evaluate_numerical_parity([("Beta", 0.02100811, 0.02100811)], tolerance_threshold=1e-6)
    assert eval_res.is_success is True
    assert eval_res.max_absolute_delta == 0.0
    assert eval_res.overall_classification == "NUMERICAL_EXACT_MATCH"
    assert eval_res.items[0].parity_classification == "NUMERICAL_EXACT_MATCH"
    assert eval_res.items[0].status_label == "MATCH"


def test_delta_strictly_inside_tolerance_boundary():
    """Requirement: 0.0 < delta <= 1e-6 (strictly inside, e.g. 5e-7) -> WITHIN_NUMERICAL_TOLERANCE ('容差内一致')"""
    delta_inside = 5.0e-7  # 0.0000005
    classification, status = classify_delta(delta_inside, tolerance_threshold=1e-6)
    assert classification == "WITHIN_NUMERICAL_TOLERANCE"
    assert status == "MATCH"

    val_a = 0.5000000
    val_b = 0.5000005
    eval_res = evaluate_numerical_parity([("Gamma", val_a, val_b)], tolerance_threshold=1e-6)
    assert eval_res.is_success is True
    assert abs(eval_res.max_absolute_delta - 5.0e-7) < 1e-12
    assert eval_res.overall_classification == "WITHIN_NUMERICAL_TOLERANCE"
    assert eval_res.items[0].parity_classification == "WITHIN_NUMERICAL_TOLERANCE"
    assert eval_res.items[0].status_label == "MATCH"


def test_delta_exactly_on_tolerance_boundary():
    """Requirement: delta == 1.0e-6 (exactly on boundary) -> WITHIN_NUMERICAL_TOLERANCE ('容差内一致')"""
    delta_boundary = 1.0e-6  # 0.000001
    classification, status = classify_delta(delta_boundary, tolerance_threshold=1e-6)
    assert classification == "WITHIN_NUMERICAL_TOLERANCE"
    assert status == "MATCH"

    eval_res = evaluate_numerical_parity([("Gamma", 1.0, 1.000001)], tolerance_threshold=1e-6)
    assert eval_res.is_success is True
    assert abs(eval_res.max_absolute_delta - 1.0e-6) < 1e-12
    assert eval_res.overall_classification == "WITHIN_NUMERICAL_TOLERANCE"
    assert eval_res.items[0].parity_classification == "WITHIN_NUMERICAL_TOLERANCE"
    assert eval_res.items[0].status_label == "MATCH"


def test_delta_exceeding_tolerance_boundary():
    """Requirement: delta > 1.0e-6 (e.g. 1.0001e-6) -> TOLERANCE_EXCEEDED_FAILURE ('超出容差失败')"""
    delta_exceeded = 1.0001e-6  # 0.0000010001
    classification, status = classify_delta(delta_exceeded, tolerance_threshold=1e-6)
    assert classification == "TOLERANCE_EXCEEDED_FAILURE"
    assert status == "MISMATCH"

    eval_res = evaluate_numerical_parity([("Gamma", 1.0, 1.0 + 1.0001e-6)], tolerance_threshold=1e-6)
    assert eval_res.is_success is False
    assert eval_res.max_absolute_delta > 1.0e-6
    assert eval_res.overall_classification == "TOLERANCE_EXCEEDED_FAILURE"
    assert eval_res.items[0].parity_classification == "TOLERANCE_EXCEEDED_FAILURE"
    assert eval_res.items[0].status_label == "MISMATCH"


def test_mixed_evaluation_prioritizes_most_severe_classification():
    """Verifies that a mix of exact matches and tolerance matches resolves to WITHIN_NUMERICAL_TOLERANCE,
    while any single failure causes TOLERANCE_EXCEEDED_FAILURE."""
    # Mix of exact + within tolerance -> WITHIN_NUMERICAL_TOLERANCE
    mixed_pass = evaluate_numerical_parity([
        ("Linear Beta", 0.021, 0.021),           # 0.0
        ("Power Gamma", 0.500000, 0.5000003),     # 3e-7
    ], tolerance_threshold=1e-6)
    assert mixed_pass.is_success is True
    assert mixed_pass.overall_classification == "WITHIN_NUMERICAL_TOLERANCE"

    # Any failure -> TOLERANCE_EXCEEDED_FAILURE
    mixed_fail = evaluate_numerical_parity([
        ("Linear Beta", 0.021, 0.021),           # 0.0
        ("Power Gamma", 0.500000, 0.5000003),     # 3e-7
        ("Trade t-stat", 1.45, 1.46),             # 0.01 -> FAILS
    ], tolerance_threshold=1e-6)
    assert mixed_fail.is_success is False
    assert mixed_fail.overall_classification == "TOLERANCE_EXCEEDED_FAILURE"


def test_certificate_issuance_rejects_non_execution_type():
    """CRITICAL GATE: Direct boolean passing or arbitrary types are blocked with TypeError."""
    with pytest.raises(TypeError, match="requires a genuine SampleRecomputationAuditExecution"):
        emit_recomputation_certificate("invalid_type")  # type: ignore

    with pytest.raises(TypeError, match="requires a genuine SampleRecomputationAuditExecution"):
        emit_recomputation_certificate({"all_matched": True})  # type: ignore


def test_certificate_issuance_blocks_exceeded_tolerance(tmp_path):
    """CRITICAL GATE: Exceeded tolerance blocks issuance and produces NO certificate file."""
    cert_path = tmp_path / "cert.json"
    evidence = ChecksumVerificationEvidence(
        source_url="https://data.binance.vision/data/spot/daily/trades/BTCUSDT/BTCUSDT-trades-2026-07-01.zip.CHECKSUM",
        checksum_file_name="BTCUSDT-trades-2026-07-01.zip.CHECKSUM",
        checksum_file_sha256="abc",
        expected_archive_sha256="hash123",
        actual_archive_sha256="hash123",
        is_checksum_verified=True,
        verification_message="Verified"
    )
    fail_eval = evaluate_numerical_parity([("Beta", 1.0, 1.0001)], tolerance_threshold=1e-6)
    assert not fail_eval.is_success

    execution = SampleRecomputationAuditExecution(
        run_id="run-1",
        execution_timestamp_utc="2026-10-23T00:00:00Z",
        target_date="2026-07-01",
        target_horizon_lag=20,
        git_commit="HEAD",
        checksum_evidence=evidence,
        sample_identity={"symbol": "BTCUSDT"},
        numerical_parity=fail_eval,
        stage_scopes={"coverage_level": "SAMPLE_LEVEL_250K_TRADES", "is_full_day_production_reconciled": False}
    )

    with pytest.raises(ValueError, match="Numerical parity delta .* exceeds tolerance"):
        emit_recomputation_certificate(execution, cert_output_path=cert_path)

    assert not cert_path.exists()


def test_certificate_issuance_success_records_scope_and_breakdown(tmp_path):
    """CRITICAL GATE: Legitimate issuance records 1.1.0 schema, SAMPLE_LEVEL_250K_TRADES,
    is_full_day_production_reconciled=False, and full numerical breakdown."""
    cert_path = tmp_path / "cert.json"
    evidence = ChecksumVerificationEvidence(
        source_url="https://data.binance.vision/data/spot/daily/trades/BTCUSDT/BTCUSDT-trades-2026-07-01.zip.CHECKSUM",
        checksum_file_name="BTCUSDT-trades-2026-07-01.zip.CHECKSUM",
        checksum_file_sha256="chkhash456",
        expected_archive_sha256="ziphash789",
        actual_archive_sha256="ziphash789",
        is_checksum_verified=True,
        verification_message="Official checksum verified successfully against Binance Vision digest."
    )
    pass_eval = evaluate_numerical_parity([
        ("Linear Beta", 0.02100811, 0.02100811),
        ("Power Gamma", 0.50000000, 0.50000040),  # 4e-7 -> WITHIN_NUMERICAL_TOLERANCE
    ], tolerance_threshold=1e-6)

    execution = SampleRecomputationAuditExecution(
        run_id="run-certified-1",
        execution_timestamp_utc="2026-10-23T12:00:00Z",
        target_date="2026-07-01",
        target_horizon_lag=20,
        git_commit="88da0c2",
        checksum_evidence=evidence,
        sample_identity={
            "symbol": "BTCUSDT",
            "selected_row_count": 250000,
            "window_start_index": 1041712
        },
        numerical_parity=pass_eval,
        stage_scopes={
            "coverage_level": "SAMPLE_LEVEL_250K_TRADES",
            "is_full_day_production_reconciled": False
        }
    )

    cert_data = emit_recomputation_certificate(execution, cert_output_path=cert_path)
    assert cert_path.exists()

    # Verify JSON content matches certificate contract
    loaded = json.loads(cert_path.read_text(encoding="utf-8"))
    assert loaded["schema_version"] == "1.1.0"
    assert loaded["audit_scope"]["coverage_level"] == "SAMPLE_LEVEL_250K_TRADES"
    assert loaded["audit_scope"]["is_full_day_production_reconciled"] is False
    assert loaded["stage_verification_status"]["selected_sample_numerical_recomputation"] == "VERIFIED_SAMPLE_LEVEL_MATCH"
    assert loaded["stage_verification_status"]["full_production_tick_level_reconciliation"] == "UNVERIFIED_NOT_EXECUTED"
    assert loaded["raw_archive_provenance"]["official_checksum_url"] == "https://data.binance.vision/data/spot/daily/trades/BTCUSDT/BTCUSDT-trades-2026-07-01.zip.CHECKSUM"
    assert loaded["raw_archive_provenance"]["official_checksum_file_sha256"] == "chkhash456"
    assert loaded["numerical_parity"]["overall_classification"] == "WITHIN_NUMERICAL_TOLERANCE"
    assert loaded["numerical_parity"]["classification_label"] == "容差内一致"
    assert loaded["numerical_parity"]["max_absolute_delta"] == pytest.approx(4e-7)
    assert loaded["overall_verdict"] == "SAMPLE_RECOMPUTATION_PASS_FULL_DAY_UNRECONCILED"
