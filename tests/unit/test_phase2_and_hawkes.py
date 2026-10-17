"""
Unit tests for Phase 2 Live Order Book Collector and Bivariate Hawkes Process.
"""

import pytest
import numpy as np
import polars as pl
from packages.orderbook.collector import LiveOrderBookCollector
from packages.analytics.hawkes import BivariateHawkesModel


def test_live_orderbook_collector_init_and_ofi():
    collector = LiveOrderBookCollector("BTCUSDT")
    assert collector.symbol == "BTCUSDT"
    assert collector.is_running is False

    # Simulate quote sequence to test OFI formula
    # Step 1: initial quotes: Bid 100 @ 1.0, Ask 101 @ 1.0
    ofi_0 = collector._calculate_ofi((100.0, 1.0), (101.0, 1.0))
    assert ofi_0 == 0.0

    # Step 2: Bid price rises to 100.5 @ 2.0 -> positive bid OFI = 2.0
    ofi_1 = collector._calculate_ofi((100.5, 2.0), (101.0, 1.0))
    assert ofi_1 == 2.0

    # Step 3: Ask price drops to 100.8 @ 3.0 -> negative ask OFI = -3.0
    ofi_2 = collector._calculate_ofi((100.5, 2.0), (100.8, 3.0))
    assert ofi_2 == -3.0


def test_bivariate_hawkes_estimation():
    hawkes = BivariateHawkesModel(beta=5.0)

    # Synthetic timestamp sequences
    # 200 events within 20 seconds
    times = np.sort(np.random.uniform(0, 20.0, 200))
    ts_ns = (times * 1e9).astype(np.int64)
    dirs = np.random.choice([1, -1], size=200)

    df = pl.DataFrame({
        "event_timestamp_ns": ts_ns,
        "direction": dirs
    })

    res = hawkes.fit_trades(df, sample_size=200)
    assert "parameters" in res
    assert "branching_ratios" in res
    assert "spectral_radius" in res["branching_ratios"]
    assert res["branching_ratios"]["spectral_radius"] >= 0.0
