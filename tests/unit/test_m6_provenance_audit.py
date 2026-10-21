import pytest
from scripts.recompute_and_audit_provenance import (
    audit_raw_archives,
    audit_normalized_parquets,
    audit_model_json_artifacts,
    audit_live_recomputation,
    RAW_DIR,
    NORMALIZED_DIR,
    DATES,
)


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
