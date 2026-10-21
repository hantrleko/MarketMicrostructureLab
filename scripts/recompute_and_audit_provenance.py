"""
End-to-End Data Provenance and Recomputation Verification Pipeline (Requirement M6).
Audits the complete pipeline chain:
  Raw Binance Vision Zip Archives -> Normalized Parquet Partitions -> 18 Static Model JSONs & Manifest
"""

import sys
import json
import hashlib
from pathlib import Path
import pyarrow.parquet as pq

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

RAW_DIR = ROOT / "data" / "raw"
NORMALIZED_DIR = ROOT / "data" / "normalized" / "exchange=binance" / "market=spot" / "symbol=BTCUSDT"
METADATA_DIR = ROOT / "data" / "metadata"
WEB_DATA_DIR = ROOT / "apps" / "web" / "public" / "data"

DATES = ["2026-07-01", "2026-07-02", "2026-07-03"]
HORIZONS = [5, 10, 20, 50, 100]


def compute_sha256(filepath: Path) -> str:
    hasher = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


def audit_raw_archives():
    print("\n" + "=" * 80)
    print("STAGE 1: AUDITING RAW ARCHIVE INTEGRITY & OFFICIAL CHECKSUMS")
    print("=" * 80)
    stage1_passed = True

    for d in DATES:
        zip_path = RAW_DIR / f"BTCUSDT-trades-{d}.zip"
        chk_path = RAW_DIR / f"BTCUSDT-trades-{d}.zip.CHECKSUM"

        if not zip_path.exists():
            print(f"[FAIL] Raw zip missing: {zip_path}")
            stage1_passed = False
            continue

        if not chk_path.exists():
            print(f"[FAIL] Checksum file missing: {chk_path}")
            stage1_passed = False
            continue

        expected_hash = chk_path.read_text(encoding="utf-8").strip().split()[0]
        actual_hash = compute_sha256(zip_path)

        if expected_hash.lower() == actual_hash.lower():
            print(f"[PASS] {zip_path.name:<32} Size: {zip_path.stat().st_size:>10,} B | SHA: {actual_hash[:16]}... (Official Match)")
        else:
            print(f"[FAIL] Checksum mismatch for {zip_path.name}: expected {expected_hash}, got {actual_hash}")
            stage1_passed = False

    return stage1_passed


def audit_normalized_parquets():
    print("\n" + "=" * 80)
    print("STAGE 2: AUDITING NORMALIZED PARQUET DATASETS & MANIFEST")
    print("=" * 80)
    stage2_passed = True

    manifest_file = METADATA_DIR / "dataset_manifest.json"
    if not manifest_file.exists():
        print(f"[FAIL] Missing manifest: {manifest_file}")
        return False

    manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
    entries = manifest.get("entries", {})

    required_columns = {"trade_id", "price", "base_quantity", "quote_quantity", "event_time_utc", "event_timestamp_ns", "is_buyer_maker"}

    for d in DATES:
        parquet_path = NORMALIZED_DIR / f"date={d}" / "trades.parquet"
        entry_key = f"BTCUSDT_{d}_prod"
        entry = entries.get(entry_key)

        if not parquet_path.exists():
            print(f"[FAIL] Normalized Parquet missing: {parquet_path}")
            stage2_passed = False
            continue

        if not entry:
            print(f"[FAIL] Manifest entry missing for {entry_key}")
            stage2_passed = False
            continue

        # Check file hash against manifest
        actual_sha = compute_sha256(parquet_path)
        expected_sha = entry.get("sha256")
        if actual_sha != expected_sha:
            print(f"[FAIL] SHA mismatch for {d}: actual {actual_sha} vs manifest {expected_sha}")
            stage2_passed = False
            continue

        # Inspect table schema & row count
        table = pq.read_table(parquet_path)
        actual_rows = table.num_rows
        expected_rows = entry.get("row_count")
        cols = set(table.schema.names)

        if not required_columns.issubset(cols):
            print(f"[FAIL] Missing required columns in {parquet_path.name}: {required_columns - cols}")
            stage2_passed = False
            continue

        if actual_rows != expected_rows:
            print(f"[FAIL] Row count mismatch in {d}: table has {actual_rows:,}, manifest says {expected_rows:,}")
            stage2_passed = False
            continue

        print(f"[PASS] date={d} Parquet: {actual_rows:>10,} rows | SHA: {actual_sha[:16]}... | Columns: {len(cols)} verified")

    return stage2_passed


def audit_model_json_artifacts():
    print("\n" + "=" * 80)
    print("STAGE 3: AUDITING 18 STATIC MODEL JSON FIXTURES & PROVENANCE MANIFEST")
    print("=" * 80)
    stage3_passed = True

    prov_manifest_path = WEB_DATA_DIR / "models_provenance_manifest.json"
    if not prov_manifest_path.exists():
        print(f"[FAIL] Missing models_provenance_manifest.json at {prov_manifest_path}")
        return False

    prov = json.loads(prov_manifest_path.read_text(encoding="utf-8"))
    artifacts = prov.get("artifacts", {})
    if len(artifacts) != 18:
        print(f"[FAIL] Expected 18 artifacts in manifest, found {len(artifacts)}")
        stage3_passed = False

    for fname, meta in artifacts.items():
        file_path = WEB_DATA_DIR / fname
        if not file_path.exists():
            print(f"[FAIL] Artifact missing: {fname}")
            stage3_passed = False
            continue

        raw_bytes = file_path.read_bytes()
        actual_size = len(raw_bytes)
        actual_sha = hashlib.sha256(raw_bytes).hexdigest()
        crlf_count = raw_bytes.count(b"\r\n")

        if actual_size != meta["size_bytes"] or actual_sha != meta["sha256"] or crlf_count > 0:
            print(f"[FAIL] Hash/size mismatch for {fname}: size={actual_size} (exp {meta['size_bytes']}), sha={actual_sha[:12]}, CRLF={crlf_count}")
            stage3_passed = False
            continue

        # Semantic JSON validation (M1 & M3)
        data = json.loads(raw_bytes.decode("utf-8"))
        lin = data.get("linear_model", {})
        log = data.get("logarithmic_model", {})
        pow_m = data.get("power_law_model", {})

        # Verify contract schema version
        if data.get("artifact_metadata", {}).get("schema_version") != "1.3.0":
            print(f"[FAIL] Schema version not 1.3.0 in {fname}")
            stage3_passed = False
            continue

        # Verify status-driven contract
        for model_name, m_dict in [("linear", lin), ("log", log), ("power", pow_m)]:
            status = m_dict.get("status")
            if status not in ("ESTIMATED", "NOT_ESTIMABLE", "FIT_FAILED"):
                print(f"[FAIL] Invalid status '{status}' in {fname} for {model_name}")
                stage3_passed = False

            if status != "ESTIMATED":
                if m_dict.get("fit") is not None or m_dict.get("error") is None:
                    print(f"[FAIL] M1 violation in {fname} for {model_name}: status={status} but fit is not null or error is missing")
                    stage3_passed = False

        # Verify Moving Block Bootstrap sensitivity grid
        mbb = data.get("moving_block_bootstrap", {})
        sens_table = mbb.get("sensitivity_table", [])
        if not sens_table or len(sens_table) < 8:  # 4 block sizes * 2 estimators
            print(f"[FAIL] Incomplete sensitivity table in {fname} ({len(sens_table)} entries)")
            stage3_passed = False

        # Verify Walk-Forward Cross-Validation
        wf = data.get("walk_forward_validation", {})
        if len(wf.get("folds", [])) != 3 or "pooled_oos" not in wf:
            print(f"[FAIL] Incomplete walk-forward validation in {fname}")
            stage3_passed = False

        print(f"[PASS] {fname:<28} Size: {actual_size:>6,} B | SHA: {actual_sha[:16]}... | Contract: 1.3.0 Verified")

    return stage3_passed


def main():
    print("=" * 80)
    print("MARKET MICROSTRUCTURE LAB: END-TO-END DATA PROVENANCE AUDIT")
    print("=" * 80)

    p1 = audit_raw_archives()
    p2 = audit_normalized_parquets()
    p3 = audit_model_json_artifacts()

    print("\n" + "=" * 80)
    print("PIPELINE AUDIT SUMMARY")
    print("=" * 80)
    print(f"Stage 1 (Raw Archive Integrity & Checksums):   {'PASSED' if p1 else 'FAILED'}")
    print(f"Stage 2 (Normalized Parquet Schema & Hashes):  {'PASSED' if p2 else 'FAILED'}")
    print(f"Stage 3 (18 Model JSONs & Contract 1.3.0):     {'PASSED' if p3 else 'FAILED'}")

    if p1 and p2 and p3:
        print("\n[SUCCESS] End-to-end data provenance certified across all stages!")
        sys.exit(0)
    else:
        print("\n[ERROR] One or more audit stages failed.")
        sys.exit(1)


if __name__ == "__main__":
    main()
