"""
End-to-End Data Provenance and Recomputation Verification Pipeline (Requirement M6).
Audits the complete pipeline chain:
  Stage 1: Raw Binance Vision Zip Archives Checksums
  Stage 2: Normalized Parquet Partitions Schema & Hash Verification
  Stage 3: 18 Static Model JSONs & Manifest Contract Verification
  Stage 4: Live End-to-End Recomputation Benchmark & Parameter Parity Verification (< 1e-6)
"""

import sys
import json
import hashlib
import argparse
from pathlib import Path
import pyarrow.parquet as pq
import polars as pl

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

from packages.impact_models.nonlinear_impact import NonlinearImpactModel

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


def audit_raw_archives() -> bool:
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


def audit_normalized_parquets() -> bool:
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


def audit_model_json_artifacts() -> bool:
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


def audit_live_recomputation(date_str: str = "2026-07-01", horizon: int = 20) -> bool:
    print("\n" + "=" * 80)
    print(f"STAGE 4: LIVE END-TO-END RECOMPUTATION BENCHMARK (date={date_str}, k={horizon})")
    print("=" * 80)
    parquet_path = NORMALIZED_DIR / f"date={date_str}" / "trades.parquet"
    if not parquet_path.exists():
        print(f"[FAIL] Normalized Parquet missing for recomputation: {parquet_path}")
        return False

    static_path = WEB_DATA_DIR / f"models_{date_str}_k{horizon}.json"
    if not static_path.exists():
        print(f"[FAIL] Static model JSON fixture missing: {static_path}")
        return False

    print(f"[*] Loading normalized Parquet from: {parquet_path}...")
    df = pl.read_parquet(parquet_path)
    print(f"[*] Loaded {len(df):,} trades. Fitting nonlinear impact models live...")

    model = NonlinearImpactModel()
    live_res = model.fit_impact_models(df, horizon_lag=horizon, sample_size=250_000)

    static_res = json.loads(static_path.read_text(encoding="utf-8"))

    # Compare key estimated parameters with tolerance 1e-6
    checks = []

    # 1. Linear Beta & R^2
    checks.append(("Linear Beta", live_res.get("linear_model", {}).get("beta"), static_res.get("linear_model", {}).get("beta")))
    checks.append(("Linear R^2", live_res.get("linear_model", {}).get("r_squared"), static_res.get("linear_model", {}).get("r_squared")))

    # 2. Logarithmic Beta & R^2
    checks.append(("Logarithmic Beta", live_res.get("logarithmic_model", {}).get("beta"), static_res.get("logarithmic_model", {}).get("beta")))
    checks.append(("Logarithmic R^2", live_res.get("logarithmic_model", {}).get("r_squared"), static_res.get("logarithmic_model", {}).get("r_squared")))

    # 3. Power Law OLS Gamma
    checks.append(("Power-Law OLS Gamma", live_res.get("power_law_model", {}).get("gamma"), static_res.get("power_law_model", {}).get("gamma")))

    # 4. Power Law WLS Gamma & R^2
    live_wls = live_res.get("power_law_model", {}).get("wls_fit", {})
    stat_wls = static_res.get("power_law_model", {}).get("wls_fit", {})
    checks.append(("Power-Law WLS Gamma", live_wls.get("gamma_wls"), stat_wls.get("gamma_wls")))
    checks.append(("Power-Law WLS R^2", live_wls.get("r_squared_wls"), stat_wls.get("r_squared_wls")))

    # 5. Trade-Level Fit Parameters & HAC Test Statistics
    live_tr = live_res.get("power_law_model", {}).get("trade_level_fit", {})
    stat_tr = static_res.get("power_law_model", {}).get("trade_level_fit", {})
    checks.append(("Trade-Level Gamma", live_tr.get("gamma_trade"), stat_tr.get("gamma_trade")))
    checks.append(("Trade-Level HAC SE", live_tr.get("gamma_trade_se"), stat_tr.get("gamma_trade_se")))
    checks.append(("Trade-Level t-stat", live_tr.get("t_statistic_trade"), stat_tr.get("t_statistic_trade")))
    checks.append(("Trade-Level p-value", live_tr.get("p_value_trade"), stat_tr.get("p_value_trade")))

    all_matched = True
    print(f"\n{'Parameter Metric':<24} | {'Live Recomputed':<16} | {'Static Fixture':<16} | {'Delta':<12} | Status")
    print("-" * 80)
    for name, live_val, stat_val in checks:
        if live_val is None and stat_val is None:
            print(f"{name:<24} | {'None':<16} | {'None':<16} | {'0.0':<12} | [MATCH]")
            continue
        if live_val is None or stat_val is None:
            print(f"{name:<24} | {str(live_val):<16} | {str(stat_val):<16} | {'N/A':<12} | [MISMATCH]")
            all_matched = False
            continue

        delta = abs(float(live_val) - float(stat_val))
        status = "[MATCH]" if delta < 1e-6 else "[MISMATCH]"
        if delta >= 1e-6:
            all_matched = False
        print(f"{name:<24} | {live_val:<16.8f} | {stat_val:<16.8f} | {delta:<12.2e} | {status}")

    if all_matched:
        print("\n[PASS] Live recomputation perfectly matches published static artifact within numerical tolerance (< 1e-6)!")
    else:
        print("\n[FAIL] Discrepancy observed between live recomputed values and published static artifacts.")

    return all_matched


def main():
    parser = argparse.ArgumentParser(description="End-to-End Data Provenance and Recomputation Verification Pipeline")
    parser.add_argument(
        "--mode",
        choices=["full", "manifest"],
        default="full",
        help="Audit mode: 'full' runs all 4 stages (including live recomputation benchmark); 'manifest' audits static fixtures & contract without heavy recomputation or external datasets."
    )
    parser.add_argument("--date", default="2026-07-01", help="Date for live recomputation benchmark (default: 2026-07-01)")
    parser.add_argument("--horizon", type=int, default=20, help="Horizon k for live recomputation benchmark (default: 20)")
    args = parser.parse_args()

    print("=" * 80)
    print(f"MARKET MICROSTRUCTURE LAB: DATA PROVENANCE AUDIT (MODE: {args.mode.upper()})")
    print("=" * 80)

    p1 = False
    p2 = False
    p3 = False
    p4 = False

    if args.mode == "manifest":
        print("[*] Running in Manifest Integrity Mode. Auditing static JSON fixtures and manifest...")
        p3 = audit_model_json_artifacts()
        print("\n" + "=" * 80)
        print("PIPELINE AUDIT SUMMARY (MANIFEST MODE)")
        print("=" * 80)
        print(f"Stage 3 (18 Model JSONs & Contract 1.3.0):     {'PASSED' if p3 else 'FAILED'}")
        if p3:
            print("\n[SUCCESS] Manifest and artifact integrity certified!")
            sys.exit(0)
        else:
            print("\n[ERROR] Manifest or artifact verification failed.")
            sys.exit(1)

    # Full Mode
    has_raw = all((RAW_DIR / f"BTCUSDT-trades-{d}.zip").exists() for d in DATES)
    has_norm = all((NORMALIZED_DIR / f"date={d}" / "trades.parquet").exists() for d in DATES)

    if has_raw:
        p1 = audit_raw_archives()
    else:
        print("\n[INFO] Stage 1 skipped: Raw Binance zip archives not in checkout.")
        p1 = None

    if has_norm:
        p2 = audit_normalized_parquets()
    else:
        print("\n[INFO] Stage 2 skipped: Normalized Parquet datasets not in checkout.")
        p2 = None

    p3 = audit_model_json_artifacts()

    target_parquet = NORMALIZED_DIR / f"date={args.date}" / "trades.parquet"
    if target_parquet.exists():
        p4 = audit_live_recomputation(date_str=args.date, horizon=args.horizon)
    else:
        print(f"\n[INFO] Stage 4 skipped: Normalized Parquet for {args.date} not in checkout.")
        p4 = None

    print("\n" + "=" * 80)
    print("PIPELINE AUDIT SUMMARY (FULL MODE)")
    print("=" * 80)
    print(f"Stage 1 (Raw Archive Integrity & Checksums):   {('PASSED' if p1 else 'FAILED') if p1 is not None else 'SKIPPED (Clean checkout)'}")
    print(f"Stage 2 (Normalized Parquet Schema & Hashes):  {('PASSED' if p2 else 'FAILED') if p2 is not None else 'SKIPPED (Clean checkout)'}")
    print(f"Stage 3 (18 Model JSONs & Contract 1.3.0):     {'PASSED' if p3 else 'FAILED'}")
    print(f"Stage 4 (Live Recomputation Benchmark <1e-6):  {('PASSED' if p4 else 'FAILED') if p4 is not None else 'SKIPPED (Clean checkout)'}")

    # Determine exit code
    critical_stages = [s for s in [p1, p2, p3, p4] if s is not None]
    if all(critical_stages) and p3:
        print("\n[SUCCESS] All available pipeline verification stages passed successfully!")
        sys.exit(0)
    else:
        print("\n[ERROR] One or more active audit stages failed.")
        sys.exit(1)


if __name__ == "__main__":
    main()
