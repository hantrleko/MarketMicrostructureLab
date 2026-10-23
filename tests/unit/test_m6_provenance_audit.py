import pytest
import hashlib
from scripts.recompute_and_audit_provenance import (
    audit_raw_archives,
    audit_normalized_parquets,
    audit_model_json_artifacts,
    audit_live_recomputation,
    verify_archive_checksum,
    emit_recomputation_certificate,
    compute_sha256,
    RAW_DIR,
    NORMALIZED_DIR,
    DATES,
)


def test_raw_archive_checksum_fails_on_corrupted_hash(tmp_path):
    """Verifies that archive checksum verification strictly fails when hash does not match."""
    zip_file = tmp_path / "test-archive.zip"
    chk_file = tmp_path / "test-archive.zip.CHECKSUM"

    zip_file.write_bytes(b"PK\x03\x04dummy_zip_content")
    chk_file.write_text("0000000000000000000000000000000000000000000000000000000000000000  test-archive.zip\n", encoding="utf-8")

    is_valid, actual_sha, exp_sha, msg = verify_archive_checksum(zip_file, chk_file)
    assert is_valid is False
    assert "Hash mismatch" in msg
    assert actual_sha != exp_sha


def test_raw_archive_checksum_fails_on_missing_checksum_file(tmp_path):
    """Verifies that archive checksum verification strictly fails when .CHECKSUM is absent."""
    zip_file = tmp_path / "test-archive.zip"
    chk_file = tmp_path / "test-archive.zip.CHECKSUM"

    zip_file.write_bytes(b"PK\x03\x04dummy_zip_content")
    # chk_file does not exist

    is_valid, actual_sha, exp_sha, msg = verify_archive_checksum(zip_file, chk_file)
    assert is_valid is False
    assert "missing" in msg.lower()


def test_certificate_cannot_be_generated_with_unverified_checksum(tmp_path):
    """
    CRITICAL QUALITY GATE:
    Verifies that emit_recomputation_certificate strictly blocks certificate issuance
    if archive checksum is unverified or mismatched.
    """
    zip_file = tmp_path / "test-archive.zip"
    chk_file = tmp_path / "test-archive.zip.CHECKSUM"
    cert_file = tmp_path / "recomputation_certificate.json"

    zip_file.write_bytes(b"PK\x03\x04dummy_zip_content")
    chk_file.write_text("badhash123  test-archive.zip\n", encoding="utf-8")

    with pytest.raises(ValueError, match="Checksum verification failed"):
        emit_recomputation_certificate(
            raw_zip=zip_file,
            chk_path=chk_file,
            date_str="2026-07-01",
            horizon=20,
            sample_identity={"test": 1},
            all_matched=True,
            cert_output_path=cert_file
        )

    # Certificate must NOT be created
    assert not cert_file.exists(), "Certificate must not exist after verification failure"


def test_certificate_cannot_be_generated_with_numerical_discrepancy(tmp_path):
    """Verifies that emit_recomputation_certificate strictly blocks when parity is not matched."""
    zip_file = tmp_path / "test-archive.zip"
    chk_file = tmp_path / "test-archive.zip.CHECKSUM"
    cert_file = tmp_path / "recomputation_certificate.json"

    zip_file.write_bytes(b"PK\x03\x04dummy_zip_content")
    real_sha = compute_sha256(zip_file)
    chk_file.write_text(f"{real_sha}  test-archive.zip\n", encoding="utf-8")

    with pytest.raises(ValueError, match="Numerical parity delta exceeds tolerance"):
        emit_recomputation_certificate(
            raw_zip=zip_file,
            chk_path=chk_file,
            date_str="2026-07-01",
            horizon=20,
            sample_identity={"test": 1},
            all_matched=False,
            cert_output_path=cert_file
        )

    assert not cert_file.exists()


@pytest.mark.production_data
def test_m6_raw_archives_checksums():
    missing_zips = [d for d in DATES if not (RAW_DIR / f"BTCUSDT-trades-{d}.zip").exists()]
    if missing_zips:
        pytest.skip(
            f"Production raw Binance ZIP archives not found in checkout: {missing_zips}. "
            "Clean clones exclude raw archives (run scripts/download_and_normalize.py to acquire)."
        )
    assert audit_raw_archives() is True, "Stage 1 raw archive checksum audit failed"


@pytest.mark.production_data
def test_m6_normalized_parquets_schema_and_manifest():
    missing_parquets = [d for d in DATES if not (NORMALIZED_DIR / f"date={d}" / "trades.parquet").exists()]
    if missing_parquets:
        pytest.skip(
            f"Production normalized Parquet datasets not found in checkout: {missing_parquets}. "
            "Clean clones exclude 85MB+ parquets (run scripts/download_and_normalize.py to generate)."
        )
    assert audit_normalized_parquets() is True, "Stage 2 normalized Parquet audit failed"


def test_m6_model_json_artifacts_contract_and_manifest():
    """Verifies static JSON contract and manifest integrity. Fully runnable in clean checkout."""
    assert audit_model_json_artifacts() is True, "Stage 3 static model JSON audit failed"


@pytest.mark.production_data
def test_m6_live_recomputation_numerical_parity():
    """Live end-to-end recomputation verification comparing live engine fit to static artifact."""
    target_parquet = NORMALIZED_DIR / "date=2026-07-01" / "trades.parquet"
    if not target_parquet.exists():
        pytest.skip(
            "Production normalized Parquet not found in checkout for live recomputation test. "
            "(Run scripts/download_and_normalize.py to acquire)."
        )
    assert audit_live_recomputation(date_str="2026-07-01", horizon=20) is True, (
        "Stage 4 live recomputation numerical parity check failed"
    )
