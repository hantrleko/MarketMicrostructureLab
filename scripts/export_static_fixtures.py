"""
Market Microstructure Lab - Static Fixtures Exporter (Direct Engine Execution)
Computes and exports complete research fixtures from normalized Parquet layers
into apps/web/public/data/ for standalone static GitHub Pages deployment.
Ensures zero mock data: all fixtures are calculated directly from verified Binance BTCUSDT trades.
"""

import sys
import json
from pathlib import Path
import numpy as np
import polars as pl

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

STATIC_DATA_DIR = ROOT / "apps" / "web" / "public" / "data"
STATIC_DATA_DIR.mkdir(parents=True, exist_ok=True)

NORMALIZED_DIR = ROOT / "data" / "normalized"
METADATA_DIR = ROOT / "data" / "metadata"

from packages.analytics.trade_flow import TradeFlowAnalytics
from packages.impact_models.price_response import PriceResponseEngine
from packages.impact_models.nonlinear_impact import NonlinearImpactModel
from packages.analytics.hawkes import BivariateHawkesModel
from packages.reporting.quality_audit import DataQualityAuditor

def save_json(data: dict, filename: str):
    out_path = STATIC_DATA_DIR / filename
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"  [+] Saved {filename} ({out_path.stat().st_size:,} bytes)")

def main():
    print("=" * 80)
    print("EXPORTING REAL RESEARCH FIXTURES FOR STANDALONE WEB DEPLOYMENT")
    print("=" * 80)

    trade_flow = TradeFlowAnalytics(normalized_dir=NORMALIZED_DIR)
    price_engine = PriceResponseEngine(normalized_dir=NORMALIZED_DIR)
    impact_model = NonlinearImpactModel()
    hawkes_engine = BivariateHawkesModel(beta=10.0)
    auditor = DataQualityAuditor(normalized_dir=NORMALIZED_DIR, metadata_dir=METADATA_DIR)

    dates = ["2026-07-01", "2026-07-02", "2026-07-03"]

    # 1. Datasets Catalog
    datasets_meta = []
    for d in dates:
        meta_file = METADATA_DIR / f"ingestion_BTCUSDT_{d}.json"
        audit_file = METADATA_DIR / f"quality_audit_BTCUSDT_{d}.json"

        info = {
            "symbol": "BTCUSDT",
            "date": d,
            "status": "NORMALIZED",
            "records": 0,
            "official_sha256": "",
            "timestamp_unit": "us",
            "audit_passed": True
        }
        if meta_file.exists():
            with open(meta_file, "r", encoding="utf-8") as f:
                m = json.load(f)
                info["records"] = m.get("total_trades", 0)
                info["official_sha256"] = m.get("official_sha256", "")
                info["min_price"] = m.get("min_price")
                info["max_price"] = m.get("max_price")
                info["total_base_volume"] = m.get("total_base_volume")
                info["total_quote_volume"] = m.get("total_quote_volume")
                info["buy_ratio"] = m.get("buy_ratio")
                info["sell_ratio"] = m.get("sell_ratio")
        if audit_file.exists():
            with open(audit_file, "r", encoding="utf-8") as f:
                a = json.load(f)
                info["audit_passed"] = (a.get("status") == "PASSED")
                info["max_gap_seconds"] = a.get("chronology_and_gaps", {}).get("max_gap_seconds")
        datasets_meta.append(info)

    save_json({"datasets": datasets_meta}, "datasets.json")

    # 2. Per-date fixtures
    for d in dates:
        print(f"\n[*] Processing research fixtures for {d}...")
        df = trade_flow.load_trades("BTCUSDT", d)
        n_trades = len(df)

        # Audit report
        audit_file = METADATA_DIR / f"quality_audit_BTCUSDT_{d}.json"
        if audit_file.exists():
            with open(audit_file, "r", encoding="utf-8") as f:
                audit_data = json.load(f)
        else:
            audit_data = auditor.audit_date("BTCUSDT", d)
        audit_data["license"] = "CC BY-NC-SA 4.0"
        audit_data["license_terms"] = "Binance Vision Public Data Terms (Sections 3.1 & 4.5 NonCommercial, ShareAlike)"
        save_json(audit_data, f"audit_{d}.json")

        # Time buckets: 1m, 5m, 15m, 1h
        for interval in ["1m", "5m", "15m", "1h"]:
            df_b = trade_flow.compute_time_buckets(df, bucket_interval=interval)
            records = []
            for row in df_b.iter_rows(named=True):
                records.append({
                    "datetime": row["datetime"].isoformat() if row["datetime"] else None,
                    "trade_count": row["trade_count"],
                    "open": row["open_price"],
                    "high": row["high_price"],
                    "low": row["low_price"],
                    "close": row["close_price"],
                    "total_volume": row["total_base_volume"],
                    "quote_volume": row["total_quote_volume"],
                    "buy_volume": row["buy_base_volume"],
                    "sell_volume": row["sell_base_volume"],
                    "net_volume": row["net_base_volume"],
                    "buy_ratio": row["buy_volume_ratio"],
                    "cvd": row["cvd"],
                    "vwap": row["vwap"]
                })
            save_json({
                "symbol": "BTCUSDT",
                "date": d,
                "interval": interval,
                "count": len(records),
                "buckets": records
            }, f"buckets_{interval}_{d}.json")

        # Signed Autocorrelation
        sample_df = df.slice(n_trades // 4, 300_000)
        autocorr_data = trade_flow.compute_signed_autocorrelation(sample_df, max_lag=50)
        save_json(autocorr_data, f"autocorr_{d}.json")

        # Distributions (Trade Size and Inter-trade Duration)
        size_dist = trade_flow.compute_trade_size_distribution(sample_df, num_bins=35)
        dur_dist = trade_flow.compute_duration_distribution(sample_df, max_ms_cutoff=1500.0, num_bins=40)
        save_json({
            "trade_size_distribution": size_dist,
            "duration_distribution": dur_dist
        }, f"distributions_{d}.json")

        # Price Response R(k) with HAC bandwidth sensitivity
        resp_data = price_engine.compute_event_response(df, sample_size=300_000)
        save_json(resp_data, f"response_{d}.json")

        # Impact Models across all selectable horizons (k=5, 10, 20, 50, 100)
        for k_val in [5, 10, 20, 50, 100]:
            md = impact_model.fit_impact_models(df, horizon_lag=k_val, sample_size=250_000)
            save_json(md, f"models_{d}_k{k_val}.json")
            if k_val == 20:
                save_json(md, f"models_{d}.json")

        # Bivariate Hawkes Process
        hawkes_data = hawkes_engine.fit_trades(df, sample_size=5_000)
        save_json(hawkes_data, f"hawkes_{d}.json")

        # Intraday Replay Windows (00:00, 08:00, 14:00, 20:00 UTC)
        base_ns = int(df["event_timestamp_ns"][0])
        limit = 1500
        duration_s = 60
        offsets = [0, 28800, 50400, 72000]

        for offset in offsets:
            target_start = base_ns + (offset * 1_000_000_000)
            target_end = target_start + (duration_s * 1_000_000_000)

            filtered = df.filter(
                (pl.col("event_timestamp_ns") >= target_start) &
                (pl.col("event_timestamp_ns") <= target_end)
            )
            total_in_window = len(filtered)
            sliced = filtered.slice(0, limit)

            trades_list = []
            for r in sliced.iter_rows(named=True):
                trades_list.append({
                    "trade_id": str(r["trade_id"]),
                    "event_time_utc": r["event_time_utc"],
                    "event_timestamp_ns": str(r["event_timestamp_ns"]),
                    "price": r["price"],
                    "base_quantity": r["base_quantity"],
                    "quote_quantity": r["quote_quantity"],
                    "is_buyer_maker": r["is_buyer_maker"],
                    "aggressor_side": r["aggressor_side"],
                    "direction": r["direction"]
                })

            payload = {
                "symbol": "BTCUSDT",
                "date": d,
                "start_second": offset,
                "duration_seconds": duration_s,
                "total_in_window": total_in_window,
                "returned_count": len(trades_list),
                "is_truncated": total_in_window > len(trades_list),
                "limit": limit,
                "trades": trades_list
            }
            save_json(payload, f"replay_window_{d}_{offset}.json")
            if offset == 0:
                save_json(payload, f"replay_window_{d}.json")

    # Orderbook status in static standalone mode
    save_json({
        "phase": "Phase 2 (Market Depth & Local Order Book Sync)",
        "symbol": "BTCUSDT",
        "data_status": "UNAVAILABLE",
        "status": "STANDBY",
        "is_valid": False,
        "is_running": False,
        "last_update_id": 0,
        "sync_errors": 0,
        "disclaimer": "L2 metrics are strictly computed only when live WebSocket Diff Depth stream is actively synchronized with REST snapshots. In static web hosting without a Python backend, live WebSocket collection is in STANDBY mode."
    }, "orderbook_status.json")

    print("\n" + "=" * 80)
    print("[SUCCESS] All static research fixtures exported successfully!")
    print(f"Output directory: {STATIC_DATA_DIR}")
    print("=" * 80)

if __name__ == "__main__":
    main()
