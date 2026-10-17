"""
High-performance normalization pipeline using Polars.
Converts raw Binance trades CSV (inside ZIP) to schema-enforced partitioned Parquet.
Handles microsecond timestamps, buyer-maker aggressor mapping, and strict event sequencing.
"""

import os
import zipfile
import datetime
from pathlib import Path
from typing import Dict, Any, Optional
import polars as pl

from packages.schemas.trades import IngestionMetadata, TimestampUnit


class BinanceTradeNormalizer:
    def __init__(
        self,
        raw_dir: str | Path = "data/raw",
        normalized_dir: str | Path = "data/normalized",
        metadata_dir: str | Path = "data/metadata",
        version: str = "1.0.0"
    ):
        self.raw_dir = Path(raw_dir)
        self.normalized_dir = Path(normalized_dir)
        self.metadata_dir = Path(metadata_dir)
        self.version = version

        self.normalized_dir.mkdir(parents=True, exist_ok=True)
        self.metadata_dir.mkdir(parents=True, exist_ok=True)

    def normalize_date(
        self,
        symbol: str = "BTCUSDT",
        date_str: str = "2026-07-01",
        force_rebuild: bool = False
    ) -> Dict[str, Any]:
        raw_zip = self.raw_dir / f"{symbol}-trades-{date_str}.zip"
        if not raw_zip.exists():
            raise FileNotFoundError(f"Raw archive does not exist: {raw_zip}. Run downloader first.")

        # Partitioned target directory
        partition_dir = (
            self.normalized_dir
            / f"exchange=binance"
            / f"market=spot"
            / f"symbol={symbol}"
            / f"date={date_str}"
        )
        partition_dir.mkdir(parents=True, exist_ok=True)
        target_parquet = partition_dir / "trades.parquet"

        if target_parquet.exists() and not force_rebuild:
            print(f"[*] Target parquet already exists: {target_parquet}")
            metadata_file = self.metadata_dir / f"ingestion_{symbol}_{date_str}.json"
            if metadata_file.exists():
                import json
                with open(metadata_file, "r", encoding="utf-8") as f:
                    return json.load(f)

        print(f"[*] Reading and normalizing raw CSV from {raw_zip}...")
        with zipfile.ZipFile(raw_zip, "r") as zf:
            csv_names = [name for name in zf.namelist() if name.endswith(".csv")]
            if not csv_names:
                raise ValueError(f"No CSV file found in {raw_zip}")
            csv_filename = csv_names[0]
            
            # Read CSV schema
            # Columns in Binance Vision trades CSV:
            # 0: tradeId (int64)
            # 1: price (float64)
            # 2: qty (float64)
            # 3: quoteQty (float64)
            # 4: time (int64)
            # 5: isBuyerMaker (bool)
            # 6: isBestMatch (bool)
            with zf.open(csv_filename) as csv_file:
                df = pl.read_csv(
                    csv_file,
                    has_header=False,
                    new_columns=[
                        "trade_id",
                        "price",
                        "base_quantity",
                        "quote_quantity",
                        "original_timestamp",
                        "is_buyer_maker",
                        "is_best_match",
                    ],
                    schema_overrides={
                        "trade_id": pl.Int64,
                        "price": pl.Float64,
                        "base_quantity": pl.Float64,
                        "quote_quantity": pl.Float64,
                        "original_timestamp": pl.Int64,
                        "is_buyer_maker": pl.Boolean,
                        "is_best_match": pl.Boolean,
                    }
                )

        total_rows = len(df)
        print(f"[+] Read {total_rows:,} raw trade records.")

        # Determine timestamp unit:
        # Microseconds (16 digits e.g. 1782864000054233) vs Milliseconds (13 digits e.g. 1782864000054)
        sample_ts = df["original_timestamp"][0]
        if sample_ts > 10**14:
            ts_unit: TimestampUnit = "us"
            # original_timestamp is in microseconds
            # Convert to nanoseconds for high precision: ts * 1000
            # Datetime expression in UTC:
            df = df.with_columns([
                pl.lit("us").alias("timestamp_unit"),
                (pl.col("original_timestamp") * 1000).alias("event_timestamp_ns"),
                (pl.col("original_timestamp") * 1000).cast(pl.Datetime(time_unit="ns", time_zone="UTC")).alias("event_datetime_utc"),
            ])
        else:
            ts_unit = "ms"
            df = df.with_columns([
                pl.lit("ms").alias("timestamp_unit"),
                (pl.col("original_timestamp") * 1_000_000).alias("event_timestamp_ns"),
                (pl.col("original_timestamp") * 1_000_000).cast(pl.Datetime(time_unit="ns", time_zone="UTC")).alias("event_datetime_utc"),
            ])

        # Direction mapping:
        # is_buyer_maker == True -> Buyer was maker -> Taker was seller -> Aggressive SELL (-1)
        # is_buyer_maker == False -> Buyer was taker -> Aggressive BUY (+1)
        df = df.with_columns([
            pl.when(pl.col("is_buyer_maker"))
            .then(pl.lit("SELL"))
            .otherwise(pl.lit("BUY"))
            .alias("aggressor_side"),
            
            pl.when(pl.col("is_buyer_maker"))
            .then(pl.lit(-1))
            .otherwise(pl.lit(1))
            .cast(pl.Int8)
            .alias("direction"),

            pl.lit("binance").alias("exchange"),
            pl.lit("spot").alias("market_type"),
            pl.lit(symbol).alias("symbol"),
            pl.lit(csv_filename).alias("source_file"),
            pl.lit(self.version).alias("ingestion_version"),
            pl.col("event_datetime_utc").dt.to_string("%Y-%m-%dT%H:%M:%S.%6fZ").alias("event_time_utc"),
        ])

        # Strict chronological ordering: time first, then trade_id
        df = df.sort(["original_timestamp", "trade_id"])

        # Reorder columns
        ordered_cols = [
            "exchange",
            "market_type",
            "symbol",
            "trade_id",
            "event_time_utc",
            "event_timestamp_ns",
            "original_timestamp",
            "timestamp_unit",
            "price",
            "base_quantity",
            "quote_quantity",
            "is_buyer_maker",
            "aggressor_side",
            "direction",
            "source_file",
            "ingestion_version",
        ]
        df = df.select(ordered_cols)

        # Write Parquet with zstd compression
        print(f"[*] Writing normalized Parquet to {target_parquet}...")
        df.write_parquet(target_parquet, compression="zstd")

        # Compute summary metadata
        min_time = df["event_time_utc"][0]
        max_time = df["event_time_utc"][-1]
        min_price = float(df["price"].min())
        max_price = float(df["price"].max())
        total_base = float(df["base_quantity"].sum())
        total_quote = float(df["quote_quantity"].sum())
        buy_count = int((df["direction"] == 1).sum())
        sell_count = int((df["direction"] == -1).sum())

        checksum_file = self.raw_dir / f"{symbol}-trades-{date_str}.zip.CHECKSUM"
        official_sha256 = ""
        if checksum_file.exists():
            with open(checksum_file, "r", encoding="utf-8") as cf:
                official_sha256 = cf.read().split()[0].strip()

        meta = {
            "exchange": "binance",
            "market_type": "spot",
            "symbol": symbol,
            "date": date_str,
            "parquet_path": str(target_parquet),
            "parquet_bytes": target_parquet.stat().st_size,
            "raw_archive": str(raw_zip),
            "raw_bytes": raw_zip.stat().st_size,
            "official_sha256": official_sha256,
            "total_trades": total_rows,
            "timestamp_unit": ts_unit,
            "min_event_time_utc": min_time,
            "max_event_time_utc": max_time,
            "min_price": min_price,
            "max_price": max_price,
            "total_base_volume": total_base,
            "total_quote_volume": total_quote,
            "buy_trades_count": buy_count,
            "sell_trades_count": sell_count,
            "buy_ratio": buy_count / total_rows if total_rows > 0 else 0,
            "sell_ratio": sell_count / total_rows if total_rows > 0 else 0,
            "normalized_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "ingestion_version": self.version,
        }

        # Save metadata JSON
        meta_path = self.metadata_dir / f"ingestion_{symbol}_{date_str}.json"
        import json
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2)

        print(f"[+] Normalization finished successfully for {symbol} on {date_str}!")
        print(f"    Total Trades: {total_rows:,} | Buy: {buy_count:,} ({buy_count/total_rows*100:.1f}%) | Sell: {sell_count:,} ({sell_count/total_rows*100:.1f}%)")
        print(f"    Price Range: {min_price:,.2f} - {max_price:,.2f} | Volume: {total_base:,.2f} BTC (${total_quote:,.2f})")
        return meta
