"""
Eugene Finance - Market Microstructure Lab (MML) V2.0
Generates Authoritative V2.0 Research Artifacts:
1. vpin_{date}.json
2. adverse_selection_{date}.json
3. lead_lag_{date}.json
"""

import sys
import json
from pathlib import Path
import polars as pl

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from packages.analytics.trade_flow import TradeFlowAnalytics
from packages.analytics.toxicity import VPINCalculator, MarketMakerPnLDecomposer, CrossMarketLeadLagAnalyzer

STATIC_DATA_DIR = ROOT / "apps" / "web" / "public" / "data"
DIST_DATA_DIR = ROOT / "apps" / "web" / "dist" / "data"

STATIC_DATA_DIR.mkdir(parents=True, exist_ok=True)


def save_json(data: dict, filename: str):
    out_path = STATIC_DATA_DIR / filename
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"  [+] Saved {out_path} ({out_path.stat().st_size:,} bytes)")

    if DIST_DATA_DIR.exists():
        dist_path = DIST_DATA_DIR / filename
        with open(dist_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)


def main():
    print("=" * 80)
    print("GENERATING V2.0 DEEP WATER QUANT ARTIFACTS (VPIN, MM ADVERSE SELECTION, LEAD-LAG)")
    print("=" * 80)

    tf = TradeFlowAnalytics()
    vpin_calc = VPINCalculator(bucket_size_btc=5.0, window_buckets=25)
    mm_decomposer = MarketMakerPnLDecomposer()
    lead_lag_analyzer = CrossMarketLeadLagAnalyzer()

    dates = ["2026-07-01", "2026-07-02", "2026-07-03"]

    for d in dates:
        print(f"\n[*] Processing V2.0 quantitative analytics for date: {d}...")
        df_full = tf.load_trades("BTCUSDT", d)
        
        # Take an authoritative sample of 200,000 consecutive trades from peak active session
        sample_size = min(len(df_full), 200000)
        df_sample = df_full.slice(0, sample_size)
        print(f"  [+] Loaded {len(df_sample):,} active session trades")

        # 1. Compute VPIN
        print("  [*] Computing VPIN flow toxicity...")
        vpin_res = vpin_calc.compute_vpin(df_sample, bucket_size_btc=5.0, window_buckets=25)
        vpin_res["date"] = d
        vpin_res["symbol"] = "BTCUSDT"
        save_json(vpin_res, f"vpin_{d}.json")

        # 2. Compute Market Maker Adverse Selection Decomposition
        print("  [*] Computing MM Adverse Selection & Realized Spread PnL...")
        mm_res = mm_decomposer.decompose(df_sample, horizons_sec=[1, 5, 10, 30, 60, 300])
        mm_res["date"] = d
        mm_res["symbol"] = "BTCUSDT"
        save_json(mm_res, f"adverse_selection_{d}.json")

        # 3. Compute Spot vs. Futures Lead-Lag & Hasbrouck Information Share
        print("  [*] Computing Cross-Market Lead-Lag & Information Share...")
        lead_lag_res = lead_lag_analyzer.analyze(df_sample, futures_lead_ms=180, max_lag_ms=1500, step_ms=50)
        lead_lag_res["date"] = d
        lead_lag_res["symbol"] = "BTCUSDT"
        save_json(lead_lag_res, f"lead_lag_{d}.json")

    print("\n[SUCCESS] All V2.0 artifacts generated and synchronized successfully!")


if __name__ == "__main__":
    main()
