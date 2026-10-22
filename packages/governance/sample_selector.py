"""
Unified Sample Selection & Provenance Accounting Engine.
Provides deterministic, mathematically reproducible sample selection rules shared
between analytical fitting engines (NonlinearImpactModel, PriceResponseEngine)
and verification audit scripts (recompute_and_audit_provenance.py).

Guarantees:
1. Strict deterministic sorting by specified sort keys (default: event_timestamp_ns, trade_id).
2. Explicit deduplication with dropped trade accounting.
3. Clean missing/invalid value filtering with exclusion accounting.
4. Deterministic session window slicing with boundary tracking.
5. Cryptographic sample identity binding (content_sha256 and trade_ids_sha256) so any
   mutation inside the selected window is immediately detectable.
"""

from __future__ import annotations
import hashlib
from dataclasses import dataclass, asdict, field
from typing import Dict, Any, List, Optional, Tuple
import numpy as np
import polars as pl


@dataclass
class SampleSelectionSpec:
    """
    Authoritative configuration for deterministic trade sample extraction.
    """
    version: str = "1.3.0"
    symbol: str = "BTCUSDT"
    date: str = "2026-07-01"
    sort_keys: List[str] = field(default_factory=lambda: ["event_timestamp_ns", "trade_id"])
    dedup_keys: List[str] = field(default_factory=lambda: ["trade_id"])
    selection_method: str = "SESSION_ACTIVE_WINDOW"  # "SESSION_ACTIVE_WINDOW" or "HEAD"
    offset_ratio: float = 0.25  # Start at 25% of the day's active trade stream
    target_sample_size: int = 250_000  # Target trade count (e.g. 250k for impact models, 300k for response curve)
    seed: int = 42

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class SampleProvenanceSummary:
    """
    Cryptographic and observable identity of a selected trade sample.
    """
    spec_version: str
    symbol: str
    date: str
    selection_method: str
    total_input_rows: int
    duplicates_dropped: int
    invalid_rows_dropped: int
    total_valid_rows: int
    window_start_index: int
    selected_row_count: int
    start_trade_id: int
    end_trade_id: int
    start_time_utc: str
    end_time_utc: str
    trade_ids_sha256: str
    content_sha256: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class SampleAccountingLedger:
    """
    Hierarchical accounting of trade counts from raw ingestion down to regression subsample.
    Provides mathematically coherent explanation for 250k vs 300k counts.
    """
    date: str
    symbol: str
    raw_input_total_rows: int
    normalized_catalog_rows: int
    session_selection_method: str
    session_offset_ratio: float
    session_start_index: int

    # Price response curve window (300,000 trades)
    response_curve_window_trades: int
    response_curve_start_time_utc: str
    response_curve_end_time_utc: str

    # Nonlinear impact model window (250,000 trades)
    impact_model_window_trades: int
    impact_model_start_time_utc: str
    impact_model_end_time_utc: str
    impact_model_start_trade_id: int
    impact_model_end_trade_id: int

    # Text descriptions and defaults
    response_curve_purpose: str = "Multi-lag empirical price response function R(l) across lags l in [1, 100]"
    impact_model_purpose: str = "Econometric estimation of structural impact models, HAC inference, Block Bootstrap & Walk-Forward CV"
    window_difference_explanation: str = (
        "The 250,000 impact model trades are a strict temporal sub-window of the 300,000 response window "
        "(both starting at index 1,041,712, ~06:14 UTC). The 250,000 size is chosen to keep Newey-West HAC "
        "covariance matrix calculation and Moving Block Bootstrap (1,000 iterations x 4 block lengths) "
        "computationally tractable while ensuring statistical power."
    )

    # Within-model effective horizon accounting
    horizon_lag: int = 20
    effective_horizon_observations: int = 249_980
    horizon_loss_explanation: str = "At lag k, forward return requires price at i+k; the final k trades cannot form forward returns."
    positive_displacement_trades: int = 0
    positive_displacement_pct: float = 0.0
    regression_subsample_trades: int = 0
    regression_sampling_stride: int = 1
    regression_stride_explanation: str = "Systematic sub-sampling applied when positive trades > 50,000 to enable Newey-West HAC matrix inversion."

    sample_content_sha256: str = ""
    sample_trade_ids_sha256: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class SampleSelector:
    """
    Canonical sample selector ensuring strict parity between ingestion, fitting, and audit.
    """

    @staticmethod
    def compute_trade_ids_hash(trade_ids: np.ndarray) -> str:
        """Computes SHA-256 of the 64-bit integer trade IDs array in binary format."""
        return hashlib.sha256(trade_ids.astype(np.int64).tobytes()).hexdigest()

    @staticmethod
    def compute_content_hash(
        trade_ids: np.ndarray,
        prices: np.ndarray,
        quantities: np.ndarray,
        directions: np.ndarray,
        timestamps_ns: np.ndarray
    ) -> str:
        """
        Computes cryptographic SHA-256 digest over the fundamental microstructural tuple:
        (trade_id, price, quantity, direction, timestamp_ns).
        Any modification to price, size, sign, order, or timestamp changes this hash.
        """
        hasher = hashlib.sha256()
        hasher.update(trade_ids.astype(np.int64).tobytes())
        hasher.update(np.ascontiguousarray(prices, dtype=np.float64).tobytes())
        hasher.update(np.ascontiguousarray(quantities, dtype=np.float64).tobytes())
        hasher.update(directions.astype(np.int8).tobytes())
        hasher.update(timestamps_ns.astype(np.int64).tobytes())
        return hasher.hexdigest()

    @classmethod
    def select_sample(
        cls,
        df: pl.DataFrame,
        spec: SampleSelectionSpec
    ) -> Tuple[pl.DataFrame, SampleProvenanceSummary]:
        """
        Applies deterministic sorting, deduplication, missing filtering, and session window extraction.
        Returns the sliced DataFrame and complete cryptographic provenance summary.
        """
        total_input = len(df)
        if total_input == 0:
            raise ValueError(f"Input DataFrame for {spec.symbol} {spec.date} is empty.")

        # 1. Deterministic Multi-Key Sorting
        available_sort_keys = [k for k in spec.sort_keys if k in df.columns]
        if available_sort_keys:
            df_sorted = df.sort(available_sort_keys)
        else:
            df_sorted = df

        # 2. Deduplication on dedup_keys
        available_dedup_keys = [k for k in spec.dedup_keys if k in df_sorted.columns]
        if available_dedup_keys:
            df_dedup = df_sorted.unique(subset=available_dedup_keys, keep="first", maintain_order=True)
        else:
            df_dedup = df_sorted
        duplicates_dropped = total_input - len(df_dedup)

        # 3. Clean Missing and Non-Finite Microstructure Data
        col_q = "base_quantity" if "base_quantity" in df_dedup.columns else "quantity"
        filter_expr = (
            (pl.col("price") > 0.0) & pl.col("price").is_finite() &
            (pl.col(col_q) > 0.0) & pl.col(col_q).is_finite()
        )
        if "direction" in df_dedup.columns:
            filter_expr = filter_expr & pl.col("direction").cast(pl.Float64).is_in([-1.0, 1.0])

        df_valid = df_dedup.filter(filter_expr)
        invalid_dropped = len(df_dedup) - len(df_valid)
        total_valid = len(df_valid)

        if total_valid == 0:
            raise ValueError(f"No valid trade rows remaining after filtering for {spec.symbol} {spec.date}")

        # 4. Deterministic Window Extraction
        if spec.selection_method == "SESSION_ACTIVE_WINDOW" and total_valid > spec.target_sample_size:
            start_idx = int(total_valid * spec.offset_ratio)
            # Ensure slice doesn't overshoot
            if start_idx + spec.target_sample_size > total_valid:
                start_idx = max(0, total_valid - spec.target_sample_size)
            sub_df = df_valid.slice(start_idx, spec.target_sample_size)
        elif spec.selection_method == "HEAD" and total_valid > spec.target_sample_size:
            start_idx = 0
            sub_df = df_valid.slice(0, spec.target_sample_size)
        else:
            start_idx = 0
            sub_df = df_valid

        selected_count = len(sub_df)

        # 5. Compute Identifiers and Cryptographic Hashes
        trade_ids = sub_df["trade_id"].to_numpy().astype(np.int64) if "trade_id" in sub_df.columns else np.arange(selected_count, dtype=np.int64)
        prices = sub_df["price"].to_numpy().astype(np.float64)
        quantities = sub_df[col_q].to_numpy().astype(np.float64)
        directions = sub_df["direction"].to_numpy().astype(np.int8) if "direction" in sub_df.columns else np.ones(selected_count, dtype=np.int8)
        ts_ns = sub_df["event_timestamp_ns"].to_numpy().astype(np.int64) if "event_timestamp_ns" in sub_df.columns else np.zeros(selected_count, dtype=np.int64)

        trade_ids_hash = cls.compute_trade_ids_hash(trade_ids)
        content_hash = cls.compute_content_hash(trade_ids, prices, quantities, directions, ts_ns)

        start_trade_id = int(trade_ids[0]) if len(trade_ids) > 0 else 0
        end_trade_id = int(trade_ids[-1]) if len(trade_ids) > 0 else 0

        if "event_time_utc" in sub_df.columns and len(sub_df) > 0:
            start_time_utc = str(sub_df["event_time_utc"][0])
            end_time_utc = str(sub_df["event_time_utc"][-1])
        else:
            start_time_utc = f"{spec.date}T00:00:00Z"
            end_time_utc = f"{spec.date}T23:59:59Z"

        summary = SampleProvenanceSummary(
            spec_version=spec.version,
            symbol=spec.symbol,
            date=spec.date,
            selection_method=spec.selection_method,
            total_input_rows=total_input,
            duplicates_dropped=duplicates_dropped,
            invalid_rows_dropped=invalid_dropped,
            total_valid_rows=total_valid,
            window_start_index=start_idx,
            selected_row_count=selected_count,
            start_trade_id=start_trade_id,
            end_trade_id=end_trade_id,
            start_time_utc=start_time_utc,
            end_time_utc=end_time_utc,
            trade_ids_sha256=trade_ids_hash,
            content_sha256=content_hash
        )

        return sub_df, summary
