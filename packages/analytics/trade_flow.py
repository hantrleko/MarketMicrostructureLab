"""
Trade flow analytics engine:
Computes volume delta, CVD, VWAP, trade distributions, duration, and direction autocorrelation.
Supports both event-time and clock-time interval aggregations.
"""

from typing import Dict, Any, List, Optional
from pathlib import Path
import numpy as np
import polars as pl


class TradeFlowAnalytics:
    def __init__(self, normalized_dir: str | Path = "data/normalized"):
        self.normalized_dir = Path(normalized_dir)

    def load_trades(
        self,
        symbol: str = "BTCUSDT",
        date_str: str = "2026-07-01",
        columns: Optional[List[str]] = None
    ) -> pl.DataFrame:
        parquet_file = (
            self.normalized_dir
            / f"exchange=binance"
            / f"market=spot"
            / f"symbol={symbol}"
            / f"date={date_str}"
            / "trades.parquet"
        )
        if not parquet_file.exists():
            raise FileNotFoundError(f"Partition not found: {parquet_file}")
        
        if columns:
            return pl.read_parquet(parquet_file, columns=columns)
        return pl.read_parquet(parquet_file)

    def compute_time_buckets(
        self,
        df: pl.DataFrame,
        bucket_interval: str = "1m"
    ) -> pl.DataFrame:
        """
        Aggregate trade records into fixed time intervals (e.g. 1s, 5s, 1m, 5m, 1h).
        Calculates aggressive buy/sell volume, net delta, CVD, and VWAP.
        """
        # Ensure event_datetime is parsed from event_timestamp_ns
        df_ts = df.with_columns(
            (pl.col("event_timestamp_ns")).cast(pl.Datetime(time_unit="ns", time_zone="UTC")).alias("datetime")
        )

        # Dynamic group_by
        aggregated = (
            df_ts.group_by_dynamic(
                "datetime",
                every=bucket_interval,
                closed="left"
            )
            .agg([
                pl.len().alias("trade_count"),
                pl.col("price").first().alias("open_price"),
                pl.col("price").max().alias("high_price"),
                pl.col("price").min().alias("low_price"),
                pl.col("price").last().alias("close_price"),
                pl.col("base_quantity").sum().alias("total_base_volume"),
                pl.col("quote_quantity").sum().alias("total_quote_volume"),
                
                # Buy volume (direction == 1)
                pl.when(pl.col("direction") == 1)
                .then(pl.col("base_quantity"))
                .otherwise(0.0)
                .sum()
                .alias("buy_base_volume"),

                # Sell volume (direction == -1)
                pl.when(pl.col("direction") == -1)
                .then(pl.col("base_quantity"))
                .otherwise(0.0)
                .sum()
                .alias("sell_base_volume"),

                # VWAP calculation
                (pl.col("quote_quantity").sum() / pl.col("base_quantity").sum()).alias("vwap")
            ])
            .sort("datetime")
            .with_columns([
                (pl.col("buy_base_volume") - pl.col("sell_base_volume")).alias("net_base_volume"),
                pl.when(pl.col("total_base_volume") > 0)
                .then(pl.col("buy_base_volume") / pl.col("total_base_volume"))
                .otherwise(0.5)
                .alias("buy_volume_ratio"),
            ])
            .with_columns(
                pl.col("net_base_volume").cum_sum().alias("cvd")
            )
        )
        return aggregated

    def compute_signed_autocorrelation(
        self,
        df: pl.DataFrame,
        max_lag: int = 50
    ) -> Dict[str, Any]:
        """
        Calculates the autocorrelation function rho(k) of aggressive trade direction epsilon_i in {-1, +1}.
        rho(k) = Corr(epsilon_i, epsilon_{i+k})
        """
        # Direction array as float64
        eps = df["direction"].to_numpy().astype(np.float64)
        n = len(eps)
        mean_eps = np.mean(eps)
        var_eps = np.var(eps)

        if var_eps == 0:
            return {"lags": list(range(1, max_lag + 1)), "autocorr": [0.0] * max_lag}

        lags = list(range(1, max_lag + 1))
        autocorr = []
        for k in lags:
            c_k = np.mean((eps[:-k] - mean_eps) * (eps[k:] - mean_eps))
            autocorr.append(float(c_k / var_eps))

        return {
            "max_lag": max_lag,
            "sample_size": n,
            "mean_direction": float(mean_eps),
            "lags": lags,
            "autocorrelations": autocorr
        }

    def compute_trade_size_distribution(
        self,
        df: pl.DataFrame,
        num_bins: int = 40
    ) -> Dict[str, Any]:
        """
        Computes trade size distributions (base quantity) in log-space and summary statistics.
        """
        qty = df["base_quantity"].to_numpy()
        log_qty = np.log10(qty[qty > 0])

        counts, bin_edges = np.histogram(log_qty, bins=num_bins)
        
        # Linear quantities for edges: 10^edge
        bins_summary = []
        for i in range(len(counts)):
            bins_summary.append({
                "bin_idx": i,
                "log_min": float(bin_edges[i]),
                "log_max": float(bin_edges[i + 1]),
                "qty_min": float(10 ** bin_edges[i]),
                "qty_max": float(10 ** bin_edges[i + 1]),
                "count": int(counts[i]),
                "pct": float(counts[i] / len(qty) * 100)
            })

        return {
            "total_trades": len(qty),
            "mean_qty": float(np.mean(qty)),
            "std_qty": float(np.std(qty)),
            "median_qty": float(np.median(qty)),
            "p25_qty": float(np.percentile(qty, 25)),
            "p75_qty": float(np.percentile(qty, 75)),
            "p90_qty": float(np.percentile(qty, 90)),
            "p99_qty": float(np.percentile(qty, 99)),
            "max_qty": float(np.max(qty)),
            "min_qty": float(np.min(qty)),
            "bins": bins_summary
        }

    def compute_duration_distribution(
        self,
        df: pl.DataFrame,
        max_ms_cutoff: float = 2000.0,
        num_bins: int = 50
    ) -> Dict[str, Any]:
        """
        Computes inter-trade arrival duration distribution.
        """
        ts_ns = df["event_timestamp_ns"].to_numpy()
        durations_ms = np.diff(ts_ns) / 1_000_000.0  # nanoseconds to milliseconds

        # Filter strictly positive durations for arrival rate analysis
        non_zero = durations_ms[durations_ms > 0]
        zero_count = int(np.sum(durations_ms == 0))

        # Histogram up to cutoff
        clipped = non_zero[non_zero <= max_ms_cutoff]
        counts, bin_edges = np.histogram(clipped, bins=num_bins)

        bins_summary = []
        for i in range(len(counts)):
            bins_summary.append({
                "ms_min": float(bin_edges[i]),
                "ms_max": float(bin_edges[i + 1]),
                "count": int(counts[i]),
                "pct": float(counts[i] / len(durations_ms) * 100)
            })

        return {
            "total_durations": len(durations_ms),
            "zero_duration_trades": zero_count,
            "zero_duration_pct": float(zero_count / len(durations_ms) * 100),
            "mean_ms": float(np.mean(durations_ms)),
            "median_ms": float(np.median(durations_ms)),
            "p90_ms": float(np.percentile(durations_ms, 90)),
            "p99_ms": float(np.percentile(durations_ms, 99)),
            "max_ms": float(np.max(durations_ms)),
            "bins": bins_summary
        }
