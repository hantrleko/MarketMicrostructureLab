import pytest
from scripts.recompute_and_audit_provenance import (
    audit_raw_archives,
    audit_normalized_parquets,
    audit_model_json_artifacts,
)


def test_m6_raw_archives_checksums():
    assert audit_raw_archives() is True, "Stage 1 raw archive checksum audit failed"


def test_m6_normalized_parquets_schema_and_manifest():
    assert audit_normalized_parquets() is True, "Stage 2 normalized Parquet audit failed"


def test_m6_model_json_artifacts_contract_and_manifest():
    assert audit_model_json_artifacts() is True, "Stage 3 static model JSON audit failed"
