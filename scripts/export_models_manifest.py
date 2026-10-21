"""
Exports complete impact models and walk-forward evaluations to static JSON fixtures
for GitHub Pages deployment, guaranteeing exact alignment with backend analytical engines.
"""

import sys
import json
from pathlib import Path
from datetime import datetime, timezone
import polars as pl

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from packages.impact_models.nonlinear_impact import NonlinearImpactModel
from packages.governance.manifest import DataManifestManager

STATIC_DATA_DIR = ROOT / "apps" / "web" / "public" / "data"
STATIC_DATA_DIR.mkdir(parents=True, exist_ok=True)

def main():
    print("=" * 80)
    print("EXPORTING IMPACT MODELS & WALK-FORWARD CROSS-VALIDATION ARTIFACTS")
    print("=" * 80)

    manifest_mgr = DataManifestManager(data_dir=ROOT / "data")
    impact_model = NonlinearImpactModel()
    dates = ["2026-07-01", "2026-07-02", "2026-07-03"]
    horizons = [5, 10, 20, 50, 100]

    for d in dates:
        print(f"\n[*] Processing date {d}...")
        df, entry = manifest_mgr.load_dataset(symbol="BTCUSDT", date_str=d, is_production=False, allow_fixtures=True)
        print(f"    Loaded {len(df):,} trades (Source: {entry.source_type}, SHA: {entry.sha256[:12]}...)")

        for k_val in horizons:
            res = impact_model.fit_impact_models(df, horizon_lag=k_val, sample_size=250_000)
            
            # Inject institutional artifact metadata and provenance
            res["artifact_metadata"] = {
                "schema_version": "1.1.2",
                "build_commit": "49b64ef",
                "generation_timestamp_utc": datetime.now(timezone.utc).isoformat(),
                "dataset_source": entry.source_type,
                "dataset_file": entry.file_path,
                "dataset_sha256": entry.sha256,
                "dataset_row_count": entry.row_count,
                "evaluation_protocol": "PURGED_WALK_FORWARD_EXPANDING_WINDOW",
                "purged_boundary_trades": k_val,
                "models_compared": ["Logarithmic (Full Sample)", "Power-Law (WLS Stratified)", "Power-Law (Trade-Level R>0)"]
            }

            filename = f"models_{d}_k{k_val}.json"
            out_path = STATIC_DATA_DIR / filename
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(res, f, indent=2)
            print(f"    [+] Saved {filename} ({out_path.stat().st_size:,} bytes)")

            if k_val == 20:
                base_filename = f"models_{d}.json"
                base_path = STATIC_DATA_DIR / base_filename
                with open(base_path, "w", encoding="utf-8") as f:
                    json.dump(res, f, indent=2)
                print(f"    [+] Saved {base_filename} ({base_path.stat().st_size:,} bytes)")

    print("\n[SUCCESS] All impact model fixtures exported successfully!")

if __name__ == "__main__":
    main()
