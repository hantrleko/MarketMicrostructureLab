"""
Comprehensive Data Quality & Integrity Auditor.
Performs rigorous structural, chronological, arithmetic, and gap validation
over normalized tick-level trade records.
"""

import json
import datetime
from pathlib import Path
from typing import Dict, Any, List
import polars as pl


class DataQualityAuditor:
    def __init__(
        self,
        normalized_dir: str | Path = "data/normalized",
        metadata_dir: str | Path = "data/metadata"
    ):
        self.normalized_dir = Path(normalized_dir)
        self.metadata_dir = Path(metadata_dir)
        self.metadata_dir.mkdir(parents=True, exist_ok=True)

    def audit_date(
        self,
        symbol: str = "BTCUSDT",
        date_str: str = "2026-07-01"
    ) -> Dict[str, Any]:
        parquet_file = (
            self.normalized_dir
            / f"exchange=binance"
            / f"market=spot"
            / f"symbol={symbol}"
            / f"date={date_str}"
            / "trades.parquet"
        )
        if not parquet_file.exists():
            raise FileNotFoundError(f"Parquet file not found: {parquet_file}")

        print(f"[*] Auditing {parquet_file}...")
        df = pl.read_parquet(parquet_file)
        total_records = len(df)

        # 1. Duplicate Trade IDs
        dup_count = total_records - df["trade_id"].n_unique()

        # 2. Price and Quantity Validity
        invalid_price = (df["price"] <= 0).sum()
        invalid_qty = (df["base_quantity"] <= 0).sum()
        invalid_quote = (df["quote_quantity"] <= 0).sum()

        # 3. Arithmetic consistency: |price * qty - quoteQty| / quoteQty > 1e-3
        arithmetic_diff = (
            (df["price"] * df["base_quantity"] - df["quote_quantity"]).abs()
            / df["quote_quantity"]
        )
        arithmetic_errors = (arithmetic_diff > 1e-3).sum()

        # 4. Time reversals
        ts_diff = df["event_timestamp_ns"].diff()
        # First row diff is null, ignore
        time_reversals = int((ts_diff.slice(1) < 0).sum())

        # 5. Inter-trade duration in milliseconds
        # ts_diff is in nanoseconds
        duration_ms = ts_diff.slice(1) / 1_000_000.0
        min_dur_ms = float(duration_ms.min()) if total_records > 1 else 0.0
        max_dur_ms = float(duration_ms.max()) if total_records > 1 else 0.0
        mean_dur_ms = float(duration_ms.mean()) if total_records > 1 else 0.0
        p50_dur_ms = float(duration_ms.quantile(0.50)) if total_records > 1 else 0.0
        p95_dur_ms = float(duration_ms.quantile(0.95)) if total_records > 1 else 0.0
        p99_dur_ms = float(duration_ms.quantile(0.99)) if total_records > 1 else 0.0

        # Simultaneous trades (duration == 0 ms, same timestamp)
        simultaneous_trades = int((duration_ms == 0).sum())

        # 6. Trade ID sequencing and gaps
        id_diff = df["trade_id"].diff()
        negative_id_steps = int((id_diff.slice(1) <= 0).sum())
        # Large jumps in trade ID (e.g. > 1000)
        large_id_jumps = int((id_diff.slice(1) > 1000).sum())

        # 7. Direction integrity
        buy_trades = int((df["aggressor_side"] == "BUY").sum())
        sell_trades = int((df["aggressor_side"] == "SELL").sum())
        unknown_side = int((~df["aggressor_side"].is_in(["BUY", "SELL"])).sum())

        # 8. Boundary times
        first_time = df["event_time_utc"][0]
        last_time = df["event_time_utc"][-1]

        passed = (
            dup_count == 0
            and invalid_price == 0
            and invalid_qty == 0
            and invalid_quote == 0
            and arithmetic_errors == 0
            and time_reversals == 0
            and unknown_side == 0
        )

        audit_result = {
            "symbol": symbol,
            "date": date_str,
            "audit_timestamp_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "status": "PASSED" if passed else "FAILED",
            "checks": {
                "total_records": total_records,
                "duplicate_trade_ids": int(dup_count),
                "invalid_price_count": int(invalid_price),
                "invalid_base_qty_count": int(invalid_qty),
                "invalid_quote_qty_count": int(invalid_quote),
                "arithmetic_mismatches": int(arithmetic_errors),
                "chronological_reversals": int(time_reversals),
                "invalid_aggressor_side": int(unknown_side),
                "negative_trade_id_steps": int(negative_id_steps),
                "large_trade_id_jumps": int(large_id_jumps),
            },
            "chronology_and_gaps": {
                "first_event_utc": first_time,
                "last_event_utc": last_time,
                "duration_min_ms": min_dur_ms,
                "duration_mean_ms": mean_dur_ms,
                "duration_median_ms": p50_dur_ms,
                "duration_p95_ms": p95_dur_ms,
                "duration_p99_ms": p99_dur_ms,
                "duration_max_ms": max_dur_ms,
                "max_gap_seconds": max_dur_ms / 1000.0,
                "simultaneous_trades_count": simultaneous_trades,
                "simultaneous_pct": (simultaneous_trades / total_records) * 100 if total_records > 0 else 0,
            },
            "volume_and_sides": {
                "buy_trades": buy_trades,
                "sell_trades": sell_trades,
                "buy_ratio": buy_trades / total_records if total_records > 0 else 0,
                "sell_ratio": sell_trades / total_records if total_records > 0 else 0,
                "min_price": float(df["price"].min()),
                "max_price": float(df["price"].max()),
                "mean_price": float(df["price"].mean()),
                "total_base_volume": float(df["base_quantity"].sum()),
                "total_quote_volume": float(df["quote_quantity"].sum()),
            },
            "license": "CC BY-NC-SA 4.0",
            "license_terms": "Binance Vision Public Data Terms (Sections 3.1 & 4.5 NonCommercial, ShareAlike)"
        }

        # Save to disk
        out_file = self.metadata_dir / f"quality_audit_{symbol}_{date_str}.json"
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(audit_result, f, indent=2)

        print(f"[+] Audit complete: Status = {audit_result['status']}")
        print(f"    Duplicates: {dup_count} | Time Reversals: {time_reversals} | Arithmetic Errors: {arithmetic_errors}")
        print(f"    Median Duration: {p50_dur_ms:.2f} ms | Max Gap: {max_dur_ms/1000:.2f}s | Simultaneous Trades: {simultaneous_trades:,}")
        return audit_result
